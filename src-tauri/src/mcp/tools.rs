use crate::index::IndexManager;
use crate::mcp::protocol::*;
use serde_json::{json, Value};
use std::path::PathBuf;

// ── 工具列表 ──────────────────────────────────────────────────────────────────

pub fn list_tools() -> Vec<Tool> {
    vec![
        // ─── 本地日志工具（核心能力）──────────────────────────────────────────
        Tool {
            name: "search_local_logs".to_string(),
            description: Some(
                "🔍 Search LOCAL log files on this machine with full-text and field-level filtering.\n\
                This is the PRIMARY tool for debugging — use it whenever you need to check application logs.\n\
                \n\
                SEARCH SYNTAX:\n\
                  - \"ERROR\"                     — full-text search for \"ERROR\"\n\
                  - \"level=ERROR\"               — field filter: only ERROR level\n\
                  - \"level=ERROR AND service=api\"— combined filters\n\
                  - \"Connection timeout\"         — phrase search\n\
                  - \"\" (empty string)            — return all lines\n\
                \n\
                TIP: If you don't know which log files exist, call list_log_sessions first.\n\
                TIP: Use get_log_context to see lines around a specific result.\n\
                \n\
                RETURNS: { total, entries: [{line_number, timestamp, level, service, message, raw}] }".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path to the log file (e.g. /var/log/app.log, /home/user/logs/server.log). REQUIRED."
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query. Examples: \"ERROR\", \"level=ERROR\", \"level=ERROR AND service=payment\", \"timeout\". Empty = return all lines."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (default: 50, max: 500).",
                        "default": 50
                    }
                },
                "required": ["file_path"]
            }),
        },
        Tool {
            name: "get_log_context".to_string(),
            description: Some(
                "📋 Get context lines around a specific log line to understand what happened before/after.\n\
                \n\
                USE THIS when you find an error and need to see surrounding events.\n\
                \n\
                RETURNS: Array of log entries with line_number, timestamp, level, message.\n\
                Line numbers are sequential — you can call search_local_logs again to explore further.".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path to the log file."
                    },
                    "line_number": {
                        "type": "integer",
                        "description": "The line number to get context around."
                    },
                    "before": {
                        "type": "integer",
                        "description": "Number of lines BEFORE the target line (default: 10, max: 100).",
                        "default": 10
                    },
                    "after": {
                        "type": "integer",
                        "description": "Number of lines AFTER the target line (default: 10, max: 100).",
                        "default": 10
                    }
                },
                "required": ["file_path", "line_number"]
            }),
        },
        Tool {
            name: "list_log_sessions".to_string(),
            description: Some(
                "📂 List log files recently opened in LogLens. Call this FIRST if you don't know where the log files are.\n\
                \n\
                This returns files that were previously opened in the LogLens GUI, which typically represent\n\
                the application's log output locations. The AI should then use search_local_logs on these files.\n\
                \n\
                RETURNS: [{id, path, format, line_count, indexed_at}] — use 'path' with search_local_logs.\n\
                \n\
                TIP: If the list is empty, ask the user where their application log files are located.".to_string(),
            ),
            input_schema: json!({ "type": "object", "properties": {} }),
        },
        Tool {
            name: "get_log_stats".to_string(),
            description: Some(
                "📊 Get statistics and overview for a local log file.\n\
                \n\
                USE THIS to quickly understand a log file: how many errors, time range, top services, etc.\n\
                This gives the AI agent a high-level picture before diving into specific searches.\n\
                \n\
                RETURNS: {\n\
                  total_lines, time_range, level_distribution: {ERROR: N, WARN: N, ...},\n\
                  top_errors: [{message, count}], size_bytes\n\
                }".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path to the log file."
                    }
                },
                "required": ["file_path"]
            }),
        },
        // ─── 云日志工具 ───────────────────────────────────────────────────────
        Tool {
            name: "list_cloud_projects".to_string(),
            description: Some(
                "☁️ List all cloud log projects configured in LogLens (Huawei LTS / Aliyun SLS / Tencent CLS).\n\
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
                "☁️ Search logs in a cloud project (Huawei LTS / Aliyun SLS / Tencent CLS).\n\
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
    index_mgr: &IndexManager,
) -> Result<Value, JsonRpcError> {
    let args = args.ok_or(JsonRpcError {
        code: -32602,
        message: "Missing arguments".to_string(),
        data: None,
    })?;

    match name {
        // ─── 本地日志 ─────────────────────────────────────────────────────────
        "search_local_logs" => {
            let file_path = get_str(args, "file_path")?;
            let query     = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let limit     = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50).min(500);

            search_local_logs_impl(&file_path, query, limit, index_mgr)
                .map(|r| tool_json_result(&r))
                .map_err(|e| tool_error(&e))
        }
        "get_log_context" => {
            let file_path   = get_str(args, "file_path")?;
            let line_number = args.get("line_number").and_then(|v| v.as_u64()).unwrap_or(0);
            let before      = args.get("before").and_then(|v| v.as_u64()).unwrap_or(10).min(100);
            let after       = args.get("after").and_then(|v| v.as_u64()).unwrap_or(10).min(100);

            let lines = get_log_context_impl(&file_path, line_number, before, after)
                .map_err(|e| tool_error(&e))?;
            Ok(tool_json_result(&serde_json::json!({
                "center_line": line_number,
                "before": before,
                "after": after,
                "lines": lines,
            })))
        }
        "list_log_sessions" => {
            let sessions = list_log_sessions_impl().await;
            Ok(tool_json_result(&serde_json::json!({
                "sessions": sessions,
                "tip": "Use 'path' from any session as file_path in search_local_logs, get_log_context, or get_log_stats."
            })))
        }
        "get_log_stats" => {
            let file_path = get_str(args, "file_path")?;
            let stats = get_log_stats_impl(&file_path)
                .map_err(|e| tool_error(&e))?;
            Ok(tool_json_result(&stats))
        }

        // ─── 云日志 ───────────────────────────────────────────────────────────
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
                "Tool '{}' not found. Available tools: search_local_logs, get_log_context, list_log_sessions, get_log_stats, list_cloud_projects, search_cloud_logs.",
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

// ── 本地日志工具实现 ──────────────────────────────────────────────────────────

/// 搜索本地日志文件（优先用 tantivy 索引，若未索引则降级为逐行扫描）
fn search_local_logs_impl(
    file_path: &str,
    query: &str,
    limit: u64,
    index_mgr: &IndexManager,
) -> Result<Value, String> {
    let path_buf = PathBuf::from(file_path);
    if !path_buf.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    if !path_buf.is_file() {
        return Err(format!("路径不是文件: {}", file_path));
    }

    // 尝试用索引搜索
    let result = index_mgr.search(file_path, query, limit, None, None);
    match result {
        Ok(search_result) => {
            let entries: Vec<Value> = search_result.entries.iter().map(|e| {
                json!({
                    "line_number": e.line_number,
                    "timestamp": e.timestamp,
                    "level": e.level,
                    "service": e.service,
                    "message": e.message,
                    "raw": e.raw,
                })
            }).collect();

            Ok(json!({
                "file_path": file_path,
                "query": query,
                "total_matches": search_result.total,
                "returned": entries.len(),
                "method": "indexed_search",
                "entries": entries,
            }))
        }
        Err(_) => {
            // 索引搜索失败，降级为逐行扫描
            fallback_grep(file_path, query, limit)
        }
    }
}

/// 降级方案：逐行扫描搜索（不依赖索引）
fn fallback_grep(file_path: &str, query: &str, limit: u64) -> Result<Value, String> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(file_path).map_err(|e| format!("无法打开文件: {}", e))?;
    let reader = BufReader::new(file);
    let mut entries = Vec::new();
    let query_lower = query.to_lowercase();
    let is_empty_query = query.is_empty();

    for (idx, line) in reader.lines().enumerate() {
        let line = line.map_err(|e| format!("读取行失败: {}", e))?;
        if is_empty_query || line.to_lowercase().contains(&query_lower) {
            entries.push(json!({
                "line_number": (idx + 1) as u64,
                "raw": line,
                "timestamp": Value::Null,
                "level": Value::Null,
                "service": Value::Null,
                "message": Value::Null,
            }));
            if entries.len() >= limit as usize {
                break;
            }
        }
    }

    Ok(json!({
        "file_path": file_path,
        "query": query,
        "total_matches": entries.len() as u64,
        "returned": entries.len(),
        "method": "line_by_line_fallback",
        "hint": "文件未建立索引，使用逐行扫描。建议在 LogLens GUI 中打开此文件以获得更快的搜索体验。",
        "entries": entries,
    }))
}

/// 获取指定行附近的上下文行
fn get_log_context_impl(
    file_path: &str,
    line_number: u64,
    before: u64,
    after: u64,
) -> Result<Vec<Value>, String> {
    use std::io::{BufRead, BufReader};
    let path_buf = PathBuf::from(file_path);
    if !path_buf.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    // 先尝试用命令函数获取上下文（会使用 parser 格式化）
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    match rt.block_on(crate::commands::get_context_internal(file_path, line_number, before, after)) {
        Ok(entries) => {
            let result: Vec<Value> = entries.iter().map(|e| {
                json!({
                    "line_number": e.line_number,
                    "timestamp": e.timestamp,
                    "level": e.level,
                    "service": e.service,
                    "message": e.message,
                    "raw": e.raw,
                })
            }).collect();
            if !result.is_empty() {
                return Ok(result);
            }
        }
        Err(_) => { /* 降级为手动读取 */ }
    }

    // 降级：直接从文件读取行
    let file = std::fs::File::open(&path_buf).map_err(|e| format!("无法打开文件: {}", e))?;
    let reader = BufReader::new(file);
    let start = if line_number > before { line_number - before } else { 1 };
    let end = line_number + after;
    let mut result = Vec::new();

    for (idx, line) in reader.lines().enumerate() {
        let ln = (idx + 1) as u64;
        if ln >= start && ln <= end {
            let raw = line.map_err(|e| format!("读取行失败: {}", e))?;
            result.push(json!({
                "line_number": ln,
                "raw": raw,
                "timestamp": Value::Null,
                "level": Value::Null,
                "service": Value::Null,
                "message": Value::Null,
                "is_center": ln == line_number,
            }));
        }
        if ln > end {
            break;
        }
    }
    Ok(result)
}

/// 列出最近打开过的日志文件（从数据库读取 session）
async fn list_log_sessions_impl() -> Vec<Value> {
    let pool = match open_db_pool().await {
        Ok(p) => p,
        Err(_) => return vec![],
    };

    #[derive(sqlx::FromRow)]
    struct SessionRow {
        id: String,
        path: String,
        format: String,
        line_count: Option<i64>,
        indexed_at: Option<String>,
    }

    let rows = sqlx::query_as::<_, SessionRow>(
        "SELECT id, path, format, line_count, indexed_at FROM log_sessions ORDER BY indexed_at DESC LIMIT 50"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    rows.iter().map(|r| {
        json!({
            "id": r.id,
            "path": r.path,
            "format": r.format,
            "line_count": r.line_count.unwrap_or(0),
            "indexed_at": r.indexed_at,
        })
    }).collect()
}

/// 获取日志文件的统计信息
fn get_log_stats_impl(file_path: &str) -> Result<Value, String> {
    let path_buf = PathBuf::from(file_path);
    if !path_buf.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    match rt.block_on(crate::commands::get_stats_internal(file_path)) {
        Ok(stats) => {
            // 从 timeline 推导时间范围
            let time_from = stats.timeline.first().map(|t| &t.bucket);
            let time_to = stats.timeline.last().map(|t| &t.bucket);
            Ok(json!({
                "file_path": file_path,
                "total_lines": stats.total_lines,
                "time_range": {
                    "from": time_from,
                    "to": time_to,
                },
                "time_buckets": stats.timeline.len(),
                "level_distribution": stats.by_level.iter().map(|lc| json!({
                    "level": lc.level,
                    "count": lc.count,
                })).collect::<Vec<_>>(),
                "service_distribution": stats.by_service.iter().map(|sc| json!({
                    "service": sc.service,
                    "count": sc.count,
                })).collect::<Vec<_>>(),
                "timeline_summary": stats.timeline.iter().map(|tb| json!({
                    "time": tb.bucket,
                    "total": tb.count,
                    "errors": tb.errors,
                })).collect::<Vec<_>>(),
            }))
        }
        Err(e) => {
            // 降级：返回基本信息
            let metadata = std::fs::metadata(&path_buf).map_err(|err| format!("无法读取文件元数据: {}", err))?;
            let line_count = crate::parser::count_lines(&path_buf).unwrap_or(0);
            Ok(json!({
                "file_path": file_path,
                "total_lines": line_count,
                "size_bytes": metadata.len(),
                "time_range": Value::Null,
                "level_distribution": [],
                "service_distribution": [],
                "timeline_summary": [],
                "hint": format!("无法获取详细统计: {}。在 LogLens GUI 中打开此文件可获得完整统计。", e)
            }))
        }
    }
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
                    "version": "0.2.0",
                    "status": "running",
                    "tools": [
                        "search_local_logs",
                        "get_log_context",
                        "list_log_sessions",
                        "get_log_stats",
                        "list_cloud_projects",
                        "search_cloud_logs"
                    ]
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
