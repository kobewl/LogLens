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

static REQUEST_ID: AtomicI64 = AtomicI64::new(1);

pub struct McpClient {
    child: Mutex<Child>,
    /// Tracks whether MCP initialize handshake has been completed.
    /// Prevents double-initialization when call_tool is called after explicit initialize().
    initialized: AtomicBool,
}

impl McpClient {
    pub fn spawn(command: &str, args: &[&str], env: &[(&str, &str)]) -> Result<Self, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        for (k, v) in env {
            cmd.env(k, v);
        }
        let child = cmd.spawn().map_err(|e| format!("Failed to spawn {}: {}", command, e))?;
        Ok(Self {
            child: Mutex::new(child),
            initialized: AtomicBool::new(false),
        })
    }

    /// Send a JSON-RPC request and read the response line.
    pub fn request(&self, method: &str, params: Option<Value>) -> Result<Value, String> {
        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
            id: Some(json!(id)),
        };
        let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;

        let mut guard = self.child.lock();
        let stdin = guard.stdin.as_mut().ok_or("No stdin")?;
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| e.to_string())?;

        let stdout = guard.stdout.as_mut().ok_or("No stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut response_line = String::new();

        // Skip any server-initiated notifications (lines without "id") before reading the response.
        // MCP servers can send notifications at any time.
        loop {
            response_line.clear();
            reader.read_line(&mut response_line).map_err(|e| e.to_string())?;
            if response_line.trim().is_empty() {
                continue;
            }
            // Check if this line has an "id" field matching ours (response) or no "id" (notification)
            if let Ok(v) = serde_json::from_str::<Value>(&response_line) {
                if v.get("id").is_some() {
                    // This is a response to our request
                    break;
                }
                // Otherwise it's a server-initiated notification, skip and read next line
            } else {
                // Parse error, still break to avoid infinite loop
                break;
            }
        }

        let resp: JsonRpcResponse =
            serde_json::from_str(&response_line).map_err(|e| format!("Invalid response: {}", e))?;
        if let Some(err) = resp.error {
            return Err(err.message);
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
        // Step 1: send initialize request and wait for InitializeResult
        self.request(
            "initialize",
            Some(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "loglens", "version": "0.1.0" }
            })),
        )?;
        // Step 2: send notifications/initialized (notification, no response expected)
        self.send_notification("notifications/initialized", Some(json!({})))?;
        Ok(json!({}))
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
