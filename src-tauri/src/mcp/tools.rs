use crate::index::IndexManager;
use crate::mcp::protocol::*;
use serde_json::{json, Value};

// ── 工具列表 ──────────────────────────────────────────────────────────────────

pub fn list_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "list_cloud_projects".to_string(),
            description: Some(
                "List all cloud log projects configured in LogLens (Huawei LTS / Aliyun SLS / Tencent CLS).\n\
                \n\
                Call this FIRST to discover available projects and their log stream aliases.\n\
                \n\
                RETURNS: Array of {\n\
                  name: string      — use as project_name in search_cloud_logs,\n\
                  provider: \"huawei\" | \"aliyun\" | \"tencent\",\n\
                  description: string,\n\
                  aliases: [{alias: string, description: string}] — use alias as alias_name\n\
                }\n\
                \n\
                WORKFLOW: list_cloud_projects → search_cloud_logs".to_string(),
            ),
            input_schema: json!({ "type": "object", "properties": {} }),
        },
        Tool {
            name: "search_cloud_logs".to_string(),
            description: Some(
                "Search logs in a cloud project (Huawei LTS / Aliyun SLS / Tencent CLS).\n\
                No file paths needed — just use project_name and alias_name from list_cloud_projects.\n\
                \n\
                QUERY EXAMPLES:\n\
                  - \"ERROR\" or \"level=ERROR\"  — find error logs\n\
                  - \"payment timeout\"           — full-text search\n\
                  - \"userId=12345 AND ERROR\"    — combined filter\n\
                  - (empty)                      — return all recent logs\n\
                \n\
                TIME RANGE: \"15m\" | \"1h\" | \"3h\" | \"24h\" | \"7d\"  (default: \"1h\")\n\
                \n\
                RETURNS: Raw API response from the cloud provider containing log entries with timestamps and content.\n\
                \n\
                WORKFLOW EXAMPLE:\n\
                  1. list_cloud_projects  →  find project_name=\"p30-test\", alias_name=\"P30 测试日志\"\n\
                  2. search_cloud_logs(project_name=\"p30-test\", alias_name=\"P30 测试日志\", query=\"ERROR\", time_range=\"15m\")".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project_name": {
                        "type": "string",
                        "description": "Cloud project name, as returned by list_cloud_projects (e.g. \"p30-test\", \"k30-prod\")."
                    },
                    "alias_name": {
                        "type": "string",
                        "description": "Log stream alias, exactly as returned by list_cloud_projects. Must belong to the specified project."
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query. Examples: \"ERROR\", \"payment timeout\", \"userId=123 AND ERROR\". Leave empty to return all logs."
                    },
                    "time_range": {
                        "type": "string",
                        "description": "Relative time window. \"15m\"=15 minutes, \"1h\"=1 hour, \"3h\", \"24h\", \"7d\". Default: \"1h\".",
                        "enum": ["15m", "1h", "3h", "24h", "7d"],
                        "default": "1h"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of log entries to return. Default: 100.",
                        "default": 100
                    }
                },
                "required": ["project_name", "alias_name"]
            }),
        },
    ]
}

// ── 工具执行 ──────────────────────────────────────────────────────────────────

pub async fn call_tool(
    name: &str,
    args: Option<&serde_json::Map<String, Value>>,
    _index_mgr: &IndexManager,
) -> Result<Value, JsonRpcError> {
    tokio::time::timeout(
        std::time::Duration::from_secs(90),
        call_tool_inner(name, args, _index_mgr),
    )
    .await
    .unwrap_or_else(|_| Err(JsonRpcError {
        code: -32000,
        message: format!("工具 '{}' 执行超时（90秒）", name),
        data: None,
    }))
}

async fn call_tool_inner(
    name: &str,
    args: Option<&serde_json::Map<String, Value>>,
    _index_mgr: &IndexManager,
) -> Result<Value, JsonRpcError> {
    let args = args.ok_or(JsonRpcError {
        code: -32602,
        message: "Missing arguments".to_string(),
        data: None,
    })?;

    match name {
        "list_cloud_projects" => {
            let result = list_cloud_projects_impl().await;
            Ok(tool_json_result(&result))
        }
        "search_cloud_logs" => {
            let project_name = get_str(args, "project_name")?;
            let alias_name   = get_str(args, "alias_name")?;
            let query        = args.get("query").and_then(|v| v.as_str()).map(String::from);
            let time_range   = args.get("time_range").and_then(|v| v.as_str()).unwrap_or("1h");
            let limit        = args.get("limit").and_then(|v| v.as_i64()).map(|v| v as i32);

            let now_ms = chrono::Utc::now().timestamp_millis();
            let range_ms: i64 = match time_range {
                "15m" => 15 * 60 * 1000,
                "3h"  => 3 * 3600 * 1000,
                "24h" => 24 * 3600 * 1000,
                "7d"  => 7 * 86400 * 1000,
                _     => 3600 * 1000,
            };
            let time_from = Some((now_ms - range_ms).to_string());
            let time_to   = Some(now_ms.to_string());

            let provider = get_project_provider(&project_name).await
                .map_err(|e| tool_error(&e))?;

            let pool = open_db_pool().await.map_err(|e| tool_error(&e))?;
            let result = crate::commands::cloud_search_with_pool(
                &pool, provider, project_name, alias_name,
                query, time_from, time_to, limit,
            ).await.map_err(|e| tool_error(&e))?;

            Ok(tool_json_result(&result))
        }
        _ => Err(JsonRpcError {
            code: -32601,
            message: format!(
                "Tool '{}' not found. Available tools: list_cloud_projects, search_cloud_logs.",
                name
            ),
            data: None,
        }),
    }
}

// ── DB 辅助 ───────────────────────────────────────────────────────────────────

async fn open_db_pool() -> Result<sqlx::SqlitePool, String> {
    let db_path = crate::paths::get_db_path();
    if !db_path.exists() {
        return Err("LogLens 数据库不存在，请先打开 LogLens 并导入云项目配置。".to_string());
    }
    let url = format!("sqlite://{}?mode=ro", db_path.display());
    sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .map_err(|e| format!("无法打开数据库: {}", e))
}

// ── list_cloud_projects ────────────────────────────────────────────────────────

async fn list_cloud_projects_impl() -> Value {
    let pool = match open_db_pool().await {
        Ok(p) => p,
        Err(e) => return json!({ "error": e, "projects": [] }),
    };

    #[derive(sqlx::FromRow)]
    struct ProjectRow { name: String, provider: String, description: Option<String> }
    #[derive(sqlx::FromRow)]
    struct AliasRow   { alias: String, description: Option<String>, stream_id: Option<String> }

    let projects = match sqlx::query_as::<_, ProjectRow>(
        "SELECT name, provider, description FROM cloud_projects ORDER BY name",
    ).fetch_all(&pool).await {
        Ok(rows) => rows,
        Err(e) => return json!({ "error": e.to_string(), "projects": [] }),
    };

    let mut result = Vec::new();
    for p in &projects {
        let aliases = sqlx::query_as::<_, AliasRow>(
            "SELECT alias, description, stream_id FROM cloud_aliases WHERE project_name = ? ORDER BY alias",
        ).bind(&p.name).fetch_all(&pool).await.unwrap_or_default();

        result.push(json!({
            "name": p.name,
            "provider": p.provider,
            "description": p.description,
            "aliases": aliases.iter().map(|a| json!({
                "alias": a.alias,
                "description": a.description,
                "ready": a.stream_id.as_deref().map(|s| !s.is_empty()).unwrap_or(false),
            })).collect::<Vec<_>>(),
        }));
    }

    json!({
        "projects": result,
        "usage": "Pass 'name' as project_name and 'alias' as alias_name to search_cloud_logs."
    })
}

async fn get_project_provider(project_name: &str) -> Result<String, String> {
    let pool = open_db_pool().await?;
    sqlx::query_scalar::<_, String>("SELECT provider FROM cloud_projects WHERE name = ?")
        .bind(project_name)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!(
            "项目 '{}' 不存在，请先调用 list_cloud_projects 确认项目名称。",
            project_name
        ))
}

// ── Resources ─────────────────────────────────────────────────────────────────

pub fn list_resources() -> Vec<Resource> {
    vec![Resource {
        uri: "loglens://status".to_string(),
        name: "LogLens Status".to_string(),
        description: Some("Current LogLens MCP server status".to_string()),
        mime_type: Some("application/json".to_string()),
    }]
}

pub fn read_resource(uri: &str) -> Result<Value, JsonRpcError> {
    if uri == "loglens://status" {
        Ok(json!({
            "contents": [{
                "uri": uri,
                "mimeType": "application/json",
                "text": serde_json::to_string_pretty(&json!({
                    "name": "LogLens MCP Server",
                    "version": "0.1.0",
                    "status": "running",
                    "tools": ["list_cloud_projects", "search_cloud_logs"]
                })).unwrap()
            }]
        }))
    } else {
        Err(JsonRpcError { code: -32602, message: "Resource not found".to_string(), data: None })
    }
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

fn get_str(args: &serde_json::Map<String, Value>, key: &str) -> Result<String, JsonRpcError> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| JsonRpcError {
            code: -32602,
            message: format!("Missing required parameter: '{}'", key),
            data: None,
        })
}

fn tool_error(msg: &str) -> JsonRpcError {
    JsonRpcError { code: -32000, message: msg.to_string(), data: None }
}

pub fn tool_json_result<T: serde::Serialize>(value: &T) -> Value {
    json!({
        "content": [{ "type": "text", "text": serde_json::to_string_pretty(value).unwrap_or_default() }]
    })
}

pub fn tool_text_result(text: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": text }] })
}
