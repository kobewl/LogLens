use crate::cloud::{aliyun, huawei, tencent};
use crate::config::{load_cloud_secret, CloudCredentials, CloudProvider};
use crate::mcp::protocol::{JsonRpcRequest, JsonRpcResponse};
use crate::models::CloudTestResult;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::atomic::AtomicI64;
use parking_lot::Mutex;
use std::sync::Arc;

static REQUEST_ID: AtomicI64 = AtomicI64::new(1);

pub struct McpClient {
    child: Mutex<Child>,
    /// Tracks whether MCP initialize handshake has been completed.
    /// Prevents double-initialization when call_tool is called after explicit initialize().
    initialized: AtomicBool,
    /// 收集子进程 stderr 输出，用于诊断 npx 启动失败等问题
    stderr_buffer: Arc<Mutex<String>>,
}

impl McpClient {
    pub fn spawn(command: &str, args: &[&str], env: &[(&str, &str)]) -> Result<Self, String> {
        let start = std::time::Instant::now();
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped()); // ← 改为 piped，不再丢弃 stderr

        // 🔧 修复：Cursor 等 Electron 应用会把自带的 Node.js 放到 PATH 最前面，
        // 还设置 npm_config_prefix 指向 App Bundle 内部路径。
        // 这导致 npx 找到 Cursor 的 Node → 读取 Cursor 的 npmrc → 路径不存在 → 崩溃。
        //
        // 解决：1) 清除 npm_ 环境变量  2) 从 PATH 中移除 Cursor/Electron 路径
        //       3) 确保系统 Node.js (nvm/brew) 优先
        for (key, _) in std::env::vars() {
            if key.starts_with("npm_") {
                cmd.env_remove(&key);
            }
        }
        // 清理 PATH，移除已知的 Electron App Bundle 路径
        // 只移除确认导致问题的路径，避免误伤
        if let Ok(path) = std::env::var("PATH") {
            let cleaned: Vec<&str> = path
                .split(':')
                .filter(|p| {
                    // 仅移除明确来自 Electron 应用的路径（含 .app/ 的 Applications 路径）
                    // 保留 /usr/local/bin、/opt/homebrew/bin 等系统路径
                    if p.contains(".app/") {
                        return false;
                    }
                    true
                })
                .collect();
            if !cleaned.is_empty() {
                // 确保 nvm 路径在最前面
                let home = std::env::var("HOME").unwrap_or_default();
                // 找已安装的 nvm node 版本
                let mut new_path = cleaned.join(":");
                // 把常见的 node 安装路径前置
                let preferred = [
                    format!("{}/.nvm/current/bin", home),       // nvm current
                    format!("{}/.nvm/versions/node/v20.19.0/bin", home), // nvm v20
                    "/usr/local/bin".to_string(),
                    "/opt/homebrew/bin".to_string(),
                ];
                let mut prefixes: Vec<String> = preferred
                    .iter()
                    .filter(|p| std::path::Path::new(p).exists())
                    .cloned()
                    .collect();
                if !prefixes.is_empty() {
                    prefixes.push(new_path);
                    new_path = prefixes.join(":");
                }
                cmd.env("PATH", &new_path);
            }
        }
        // 确保 HOME 指向用户真实目录
        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", &home);
        }

        for (k, v) in env {
            cmd.env(k, v);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    format!(
                        "找不到命令 '{}'，请确认是否已安装（PATH: {:?}）",
                        command,
                        std::env::var("PATH").unwrap_or_default()
                    )
                } else {
                    format!("启动 {} 失败: {} (耗时 {:?})", command, e, start.elapsed())
                }
            })?;

        // 启动后台线程读取 stderr，收集诊断信息
        let stderr_buffer: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        if let Some(stderr) = child.stderr.take() {
            let buf = stderr_buffer.clone();
            let cmd_name = command.to_string();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        if !line.is_empty() {
                            eprintln!("[McpClient] {} stderr: {}", cmd_name, line);
                            let mut guard = buf.lock();
                            guard.push_str(&line);
                            guard.push('\n');
                        }
                    }
                }
            });
        }

        eprintln!(
            "[McpClient] 子进程 {} {} 已启动 (耗时 {:?})",
            command,
            args.join(" "),
            start.elapsed()
        );

        Ok(Self {
            child: Mutex::new(child),
            initialized: AtomicBool::new(false),
            stderr_buffer,
        })
    }

    /// 获取子进程 stderr 输出快照（用于错误诊断）
    pub fn stderr_snapshot(&self) -> String {
        self.stderr_buffer.lock().clone()
    }

    /// Send a JSON-RPC request and read the response line.
    pub fn request(&self, method: &str, params: Option<Value>) -> Result<Value, String> {
        let start = std::time::Instant::now();
        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
            id: Some(json!(id)),
        };
        let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;

        let mut guard = self.child.lock();
        let stdin = guard.stdin.as_mut().ok_or("子进程 stdin 不可用（可能已退出）")?;
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("写入子进程失败: {} (子进程可能已退出)", e))?;

        let stdout = guard.stdout.as_mut().ok_or("子进程 stdout 不可用（可能已退出）")?;
        let mut reader = BufReader::new(stdout);
        let mut response_line = String::new();

        // Skip any server-initiated notifications (lines without "id") before reading the response.
        // MCP servers can send notifications at any time.
        loop {
            response_line.clear();
            reader.read_line(&mut response_line).map_err(|e| {
                // 读取失败时提供更多上下文
                let stderr_info = self.stderr_snapshot();
                if stderr_info.is_empty() {
                    format!(
                        "[McpClient] 读取 {} 响应失败 (耗时 {:?}): {}。子进程可能已崩溃。",
                        method, start.elapsed(), e
                    )
                } else {
                    format!(
                        "[McpClient] 读取 {} 响应失败 (耗时 {:?}): {}\n子进程 stderr 输出:\n{}",
                        method, start.elapsed(), e, stderr_info
                    )
                }
            })?;
            if response_line.trim().is_empty() {
                continue;
            }
            // Check if this line has an "id" field matching ours (response) or no "id" (notification)
            if let Ok(v) = serde_json::from_str::<Value>(&response_line) {
                if v.get("id").is_some() {
                    // This is a response to our request
                    eprintln!(
                        "[McpClient] {} 响应成功 (耗时 {:?})",
                        method,
                        start.elapsed()
                    );
                    break;
                }
                // Otherwise it's a server-initiated notification, skip and read next line
                eprintln!("[McpClient] 跳过通知消息: {}", response_line.trim());
            } else {
                // Parse error, still break to avoid infinite loop
                eprintln!("[McpClient] 无法解析响应: {}", response_line.trim());
                break;
            }
        }

        let resp: JsonRpcResponse =
            serde_json::from_str(&response_line).map_err(|e| format!("Invalid response: {}", e))?;
        if let Some(err) = resp.error {
            return Err(format!("{} 返回错误: {} (code: {})", method, err.message, err.code));
        }
        resp.result.ok_or_else(|| "Empty response".to_string())
    }

    /// Send a JSON-RPC notification (no response expected).
    /// Per MCP spec: notifications must NOT have an "id" field.
    pub fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(json!({}))
        });
        let line = serde_json::to_string(&notification).map_err(|e| e.to_string())?;

        let mut guard = self.child.lock();
        let stdin = guard.stdin.as_mut().ok_or("No stdin")?;
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| e.to_string())
    }

    /// Perform MCP initialization handshake (idempotent — safe to call multiple times).
    pub fn initialize(&self) -> Result<Value, String> {
        // Atomic swap: if already true → skip, otherwise proceed
        if self.initialized.swap(true, Ordering::SeqCst) {
            return Ok(json!({}));
        }
        let t0 = std::time::Instant::now();
        eprintln!("[McpClient] 开始 MCP initialize 握手...");

        // Step 1: send initialize request and wait for InitializeResult
        let result = self.request(
            "initialize",
            Some(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "loglens", "version": "0.1.0" }
            })),
        ).map_err(|e| {
            let stderr = self.stderr_snapshot();
            if !stderr.is_empty() {
                format!("MCP initialize 失败 (耗时 {:?}): {}\n子进程 stderr:\n{}", t0.elapsed(), e, stderr)
            } else {
                format!("MCP initialize 失败 (耗时 {:?}): {}", t0.elapsed(), e)
            }
        })?;

        eprintln!("[McpClient] ✅ MCP initialize 成功 (耗时 {:?})", t0.elapsed());

        // Step 2: send notifications/initialized (notification, no response expected)
        self.send_notification("notifications/initialized", Some(json!({})))?;

        Ok(result)
    }

    pub fn list_tools(&self) -> Result<Vec<String>, String> {
        self.initialize()?;
        let result = self.request("tools/list", Some(json!({})))?;
        let tools = result
            .get("tools")
            .and_then(|t| t.as_array())
            .ok_or("No tools in response")?;
        Ok(tools
            .iter()
            .filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(String::from))
            .collect())
    }

    pub fn call_tool(&self, name: &str, arguments: Value) -> Result<Value, String> {
        self.initialize()?;
        self.request(
            "tools/call",
            Some(json!({
                "name": name,
                "arguments": arguments
            })),
        )
    }
}

pub struct CloudConnector;

impl CloudConnector {
    pub fn client_for(creds: &CloudCredentials) -> Result<McpClient, String> {
        let secret = load_cloud_secret(&creds.provider).unwrap_or_else(|| creds.access_key_secret.clone());
        match creds.provider {
            CloudProvider::Aliyun => aliyun::spawn_client(creds, &secret),
            CloudProvider::Tencent => tencent::spawn_client(creds, &secret),
            CloudProvider::Huawei => Err("华为云 LTS 不使用 MCP Server，请使用 huawei_query_logs 命令".to_string()),
        }
    }

    pub async fn test_connection(creds: &CloudCredentials) -> CloudTestResult {
        match creds.provider {
            CloudProvider::Huawei => {
                let secret = load_cloud_secret(&creds.provider).unwrap_or_else(|| creds.access_key_secret.clone());
                match huawei::test_connection(creds, &secret).await {
                    Ok(msg) => CloudTestResult {
                        success: true,
                        message: msg,
                        tools: vec!["query_logs".to_string()],
                    },
                    Err(e) => CloudTestResult {
                        success: false,
                        message: e,
                        tools: vec![],
                    },
                }
            }
            _ => {
                match Self::client_for(creds) {
                    Ok(client) => match client.list_tools() {
                        Ok(tools) => CloudTestResult {
                            success: true,
                            message: format!("连接成功，{} 个工具可用", tools.len()),
                            tools,
                        },
                        Err(e) => CloudTestResult {
                            success: false,
                            message: e,
                            tools: vec![],
                        },
                    },
                    Err(e) => CloudTestResult {
                        success: false,
                        message: e,
                        tools: vec![],
                    },
                }
            }
        }
    }

    pub async fn query(
        creds: &CloudCredentials,
        tool: &str,
        arguments: Value,
    ) -> Result<Value, String> {
        let client = Self::client_for(creds)?;
        client.call_tool(tool, arguments)
    }
}

pub fn find_credentials<'a>(
    creds: &'a [CloudCredentials],
    provider: &str,
) -> Option<&'a CloudCredentials> {
    creds.iter().find(|c| match (provider, &c.provider) {
        ("aliyun", CloudProvider::Aliyun) => true,
        ("tencent", CloudProvider::Tencent) => true,
        ("huawei", CloudProvider::Huawei) => true,
        _ => false,
    })
}
