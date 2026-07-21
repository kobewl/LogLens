use crate::index::IndexManager;
use crate::mcp::activity::EventBuilder;
use crate::mcp::protocol::*;
use crate::mcp::tools;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};

fn pid_path() -> std::path::PathBuf {
    crate::paths::get_app_data_dir().join("mcp_server.pid")
}

pub async fn run_mcp_server() {
    eprintln!("[LogLens MCP] Starting MCP Server on stdio...");

    // 写 PID 文件，主进程通过它判断 MCP 是否在运行
    let _ = crate::paths::ensure_dirs();
    let _ = std::fs::write(pid_path(), std::process::id().to_string());

    let index_mgr = Arc::new(IndexManager::new());
    // 保存来自 initialize 的 MCP 客户端名称（Cursor / Claude Desktop / ...）
    let client_hint: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut iterator = stdin.lock().lines();

    while let Some(line_result) = iterator.next() {
        match line_result {
            Ok(line) => {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<JsonRpcRequest>(&line) {
                    Ok(request) => {
                        let hint_clone = client_hint.clone();
                        let response = handle_request(request, &index_mgr, hint_clone).await;
                        if let Some(resp) = response {
                            let json_str = serde_json::to_string(&resp).expect("serialize response");
                            if let Err(e) = stdout
                                .write_all(json_str.as_bytes())
                                .and_then(|_| stdout.write_all(b"\n"))
                                .and_then(|_| stdout.flush())
                            {
                                eprintln!("[LogLens MCP] Write failed: {}", e);
                                break;
                            }
                        }
                    }
                    Err(e) => eprintln!("[LogLens MCP] Parse error: {}", e),
                }
            }
            Err(e) => {
                eprintln!("[LogLens MCP] Read error: {}", e);
                break;
            }
        }
    }

    // stdin 关闭（AI 客户端断开），清理 PID 文件
    let _ = std::fs::remove_file(pid_path());
    eprintln!("[LogLens MCP] Server exiting.");
}

async fn handle_request(
    req: JsonRpcRequest,
    index_mgr: &IndexManager,
    client_hint: Arc<Mutex<Option<String>>>,
) -> Option<JsonRpcResponse> {
    // 通知类消息（无 id）不需要响应
    if req.id.is_none() {
        if req.method == "notifications/initialized" {
            eprintln!("[LogLens MCP] Client initialized");
        }
        return None;
    }

    let id = req.id.clone();
    let (res, err) = match req.method.as_str() {
        "initialize" => {
            // 记录客户端名称（用于历史追溯）
            if let Some(params) = &req.params {
                if let Some(name) = params
                    .get("clientInfo")
                    .and_then(|c| c.get("name"))
                    .and_then(|n| n.as_str())
                {
                    *client_hint.lock().unwrap() = Some(name.to_string());
                    eprintln!("[LogLens MCP] Client: {}", name);
                }
            }
            match handle_initialize() {
                Ok(v) => (Some(v), None),
                Err(e) => (None, Some(e)),
            }
        }
        "resources/list" => (Some(json!({ "resources": tools::list_resources() })), None),
        "resources/read" => {
            let uri = match req.params.as_ref().and_then(|p| p.get("uri")).and_then(|v| v.as_str()) {
                Some(u) => u,
                None => {
                    return Some(error_response(id, JsonRpcError {
                        code: -32602,
                        message: "Missing uri".to_string(),
                        data: None,
                    }));
                }
            };
            match tools::read_resource(uri) {
                Ok(v) => (Some(v), None),
                Err(e) => (None, Some(e)),
            }
        }
        "tools/list" => (Some(json!({ "tools": tools::list_tools() })), None),
        "tools/call" => {
            let params = match req.params.as_ref() {
                Some(p) => p,
                None => {
                    return Some(error_response(id, JsonRpcError {
                        code: -32602,
                        message: "Missing params".to_string(),
                        data: None,
                    }));
                }
            };
            let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args_val = params.get("arguments").cloned().unwrap_or(json!({}));
            let args_map = args_val.as_object();
            let hint = client_hint.lock().unwrap().clone();

            // 开始计时 + 记录调用
            let builder = EventBuilder::start(name, &args_val, hint);
            match tools::call_tool(name, args_map, index_mgr).await {
                Ok(v) => {
                    // 记录成功
                    let preview = v.get("content")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("text"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("");
                    builder.finish_ok(preview);
                    (Some(v), None)
                }
                Err(e) => {
                    builder.finish_err(&e.message);
                    (None, Some(e))
                }
            }
        }
        _ => (
            None,
            Some(JsonRpcError {
                code: -32601,
                message: format!("Method not found: {}", req.method),
                data: None,
            }),
        ),
    };

    Some(JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: res,
        error: err,
    })
}

fn error_response(id: Option<Value>, error: JsonRpcError) -> JsonRpcResponse {
    JsonRpcResponse { jsonrpc: "2.0".to_string(), id, result: None, error: Some(error) }
}

fn handle_initialize() -> Result<Value, JsonRpcError> {
    let result = InitializeResult {
        protocol_version: "2024-11-05".to_string(),
        capabilities: ServerCapabilities {
            resources: Some(json!({ "listChanged": false })),
            tools: Some(json!({ "listChanged": false })),
        },
        server_info: ServerInfo {
            name: "loglens-mcp".to_string(),
            version: "0.4.0".to_string(),
        },
    };
    Ok(serde_json::to_value(result).unwrap())
}
