use crate::ai::AiClient;
use crate::cloud::CloudConnector;
use crate::config::{
    load_config, save_api_key, save_cloud_secret, save_config, save_session, AiConfig, AppConfig,
    CloudCredentials, LogFileSession,
};
use crate::index::IndexManager;
use crate::models::*;
use crate::parser;
use crate::stats;
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

pub struct AppState {
    pub index_manager: Arc<IndexManager>,
    pub db: sqlx::SqlitePool,
}

#[tauri::command]
pub async fn open_log_file(
    path: String,
    state: State<'_, AppState>,
) -> Result<LogFileInfo, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }

    let sample = parser::read_sample_lines(&path_buf, 20).map_err(|e| e.to_string())?;
    let format = parser::detect_format(&path_buf, &sample);
    let (line_count, _) = state
        .index_manager
        .index_file(&path_buf, format)
        .map_err(|e| e.to_string())?;

    let normalized = crate::config::normalize_path(&path_buf);
    let session = LogFileSession {
        id: crate::config::file_id(&normalized),
        path: normalized.clone(),
        format: format.to_string(),
        line_count,
        indexed_at: Utc::now().to_rfc3339(),
    };
    save_session(&state.db, &session)
        .await
        .map_err(|e| e.to_string())?;

    get_file_info_internal(&normalized).await
}

pub async fn get_file_info_internal(path: &str) -> Result<LogFileInfo, String> {
    let path_buf = PathBuf::from(path);
    let metadata = std::fs::metadata(&path_buf).map_err(|e| e.to_string())?;
    let sample = parser::read_sample_lines(&path_buf, 20).map_err(|e| e.to_string())?;
    let format = parser::detect_format(&path_buf, &sample);
    let line_count = parser::count_lines(&path_buf).map_err(|e| e.to_string())?;

    let entries = parser::iterate_lines(&path_buf, format, 0, 1000).map_err(|e| e.to_string())?;
    let time_from = entries.first().and_then(|e| e.timestamp.clone());
    let time_to = entries.last().and_then(|e| e.timestamp.clone());

    Ok(LogFileInfo {
        path: path.to_string(),
        format: format.to_string(),
        line_count,
        size_bytes: metadata.len(),
        time_from,
        time_to,
    })
}

#[tauri::command]
pub async fn get_log_file_info(path: String) -> Result<LogFileInfo, String> {
    get_file_info_internal(&path).await
}

#[tauri::command]
pub async fn search_logs(
    path: String,
    query: String,
    limit: Option<u64>,
    time_from: Option<String>,
    time_to: Option<String>,
    state: State<'_, AppState>,
) -> Result<SearchResult, String> {
    state
        .index_manager
        .search(
            &path,
            &query,
            limit.unwrap_or(500),
            time_from.as_deref(),
            time_to.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_log_lines(
    path: String,
    offset: u64,
    limit: u64,
) -> Result<Vec<LogEntry>, String> {
    let path_buf = PathBuf::from(&path);
    let sample = parser::read_sample_lines(&path_buf, 5).map_err(|e| e.to_string())?;
    let format = parser::detect_format(&path_buf, &sample);
    parser::iterate_lines(&path_buf, format, offset, limit).map_err(|e| e.to_string())
}

pub async fn get_stats_internal(path: &str) -> Result<LogStats, String> {
    let path_buf = PathBuf::from(path);
    let sample = parser::read_sample_lines(&path_buf, 5).map_err(|e| e.to_string())?;
    let format = parser::detect_format(&path_buf, &sample);
    stats::compute_stats(&path_buf, format)
}

#[tauri::command]
pub async fn get_log_stats(path: String) -> Result<LogStats, String> {
    get_stats_internal(&path).await
}

pub async fn get_context_internal(
    path: &str,
    line_number: u64,
    before: u64,
    after: u64,
) -> Result<Vec<LogEntry>, String> {
    let path_buf = PathBuf::from(path);
    let sample = parser::read_sample_lines(&path_buf, 5).map_err(|e| e.to_string())?;
    let format = parser::detect_format(&path_buf, &sample);
    parser::get_context(&path_buf, format, line_number, before, after).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_log_context(
    path: String,
    line_number: u64,
    before: Option<u64>,
    after: Option<u64>,
) -> Result<Vec<LogEntry>, String> {
    get_context_internal(
        &path,
        line_number,
        before.unwrap_or(10),
        after.unwrap_or(10),
    )
    .await
}

#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<LogFileSession>, String> {
    crate::config::list_sessions(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config() -> AppConfig {
    load_config()
}

#[tauri::command]
pub fn save_app_config(mut config: AppConfig) -> Result<(), String> {
    let api_key = config.ai.api_key.clone();
    if !api_key.is_empty() {
        save_api_key(&config.ai.provider, &api_key)?;
        config.ai.api_key = String::new();
    }
    for cred in &config.cloud_credentials {
        if !cred.access_key_secret.is_empty() {
            save_cloud_secret(&cred.provider, &cred.access_key_secret)?;
        }
    }
    for cred in &mut config.cloud_credentials {
        cred.access_key_secret = String::new();
    }
    save_config(&config)
}

#[tauri::command]
pub async fn test_ai_connection(config: AiConfig) -> Result<String, String> {
    let client = AiClient::new(config);
    client.test_connection().await
}

#[tauri::command]
pub async fn ai_analyze_logs(
    path: String,
    query: Option<String>,
    limit: Option<u64>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let config = load_config();
    let client = AiClient::new(config.ai);
    let search = state
        .index_manager
        .search(&path, &query.unwrap_or_default(), limit.unwrap_or(200), None, None)
        .map_err(|e| e.to_string())?;
    let logs: String = search
        .entries
        .iter()
        .map(|e| e.raw.clone())
        .collect::<Vec<_>>()
        .join("\n");
    client.analyze_anomalies(&logs).await
}

#[tauri::command]
pub async fn ai_summarize_logs(
    path: String,
    limit: Option<u64>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let config = load_config();
    let client = AiClient::new(config.ai);
    let search = state
        .index_manager
        .search(&path, "", limit.unwrap_or(500), None, None)
        .map_err(|e| e.to_string())?;
    let logs: String = search
        .entries
        .iter()
        .map(|e| e.raw.clone())
        .collect::<Vec<_>>()
        .join("\n");
    client.summarize(&logs).await
}

#[tauri::command]
pub async fn ai_natural_query(nl_query: String) -> Result<String, String> {
    let config = load_config();
    let client = AiClient::new(config.ai);
    client.natural_language_query(&nl_query).await
}

#[tauri::command]
pub async fn test_cloud_connection(creds: CloudCredentials) -> Result<CloudTestResult, String> {
    Ok(CloudConnector::test_connection(&creds).await)
}

#[tauri::command]
pub async fn cloud_query_logs(
    provider: String,
    tool: String,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let config = load_config();
    let creds = crate::cloud::connector::find_credentials(&config.cloud_credentials, &provider)
        .ok_or_else(|| format!("No credentials for provider: {}", provider))?;
    CloudConnector::query(creds, &tool, arguments).await
}

#[tauri::command]
pub async fn save_cloud_credentials(creds: CloudCredentials) -> Result<(), String> {
    let mut config = load_config();
    if !creds.access_key_secret.is_empty() {
        save_cloud_secret(&creds.provider, &creds.access_key_secret)?;
    }
    let mut stored = creds.clone();
    stored.access_key_secret = String::new();
    if let Some(existing) = config
        .cloud_credentials
        .iter_mut()
        .find(|c| c.provider == stored.provider)
    {
        *existing = stored;
    } else {
        config.cloud_credentials.push(stored);
    }
    save_config(&config)
}

#[tauri::command]
pub fn get_ai_providers() -> Vec<serde_json::Value> {
    use crate::config::AiProvider;
    vec![
        serde_json::json!({
            "id": "deepseek",
            "name": "DeepSeek",
            "baseUrl": AiProvider::DeepSeek.default_base_url(),
            "models": AiProvider::DeepSeek.models(),
            "defaultModel": AiProvider::DeepSeek.default_model(),
        }),
        serde_json::json!({
            "id": "ollama",
            "name": "Ollama",
            "baseUrl": AiProvider::Ollama.default_base_url(),
            "models": AiProvider::Ollama.models(),
            "defaultModel": AiProvider::Ollama.default_model(),
        }),
        serde_json::json!({
            "id": "openai",
            "name": "OpenAI",
            "baseUrl": AiProvider::OpenAI.default_base_url(),
            "models": AiProvider::OpenAI.models(),
            "defaultModel": AiProvider::OpenAI.default_model(),
        }),
    ]
}

#[tauri::command]
pub fn get_cloud_providers() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "id": "aliyun",
            "name": "阿里云 SLS",
            "tools": ["list_projects", "list_logstores", "query_logs", "query_logs_sql", "get_log_histogram", "get_context_logs"]
        }),
        serde_json::json!({
            "id": "tencent",
            "name": "腾讯云 CLS",
            "tools": ["SearchLog", "DescribeLogContext", "TextToSearchLogQuery", "DescribeLogHistogram", "DescribeIndex"]
        }),
        serde_json::json!({
            "id": "huawei",
            "name": "华为云 LTS",
            "tools": ["list_log_groups", "list_log_streams", "query_logs"]
        }),
    ]
}

// ========================
// 云配置导入命令
// ========================

/// 导入 config.json 文件中的所有云项目
#[tauri::command]
pub async fn import_cloud_config(
    path: String,
    state: State<'_, AppState>,
) -> Result<Vec<CloudProjectSummary>, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    let config: ImportConfig =
        serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {}", e))?;

    for project in &config.projects {
        crate::config::import_cloud_project(&state.db, project)
            .await
            .map_err(|e| format!("保存项目 {} 失败: {}", project.name, e))?;
    }

    // 返回导入后的摘要列表
    crate::config::list_cloud_projects(&state.db)
        .await
        .map_err(|e| e.to_string())
}

/// 列出所有已导入的云项目
#[tauri::command]
pub async fn list_imported_projects(
    state: State<'_, AppState>,
) -> Result<Vec<CloudProjectSummary>, String> {
    crate::config::list_cloud_projects(&state.db)
        .await
        .map_err(|e| e.to_string())
}

/// 获取项目的别名列表
#[tauri::command]
pub async fn get_project_aliases(
    project_name: String,
    state: State<'_, AppState>,
) -> Result<Vec<ImportAlias>, String> {
    crate::config::get_project_aliases(&state.db, &project_name)
        .await
        .map_err(|e| e.to_string())
}

/// 获取项目的 credentials
#[tauri::command]
pub async fn get_project_credentials(
    project_name: String,
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, String> {
    crate::config::get_project_credentials(&state.db, &project_name)
        .await
        .map_err(|e| e.to_string())
}

/// 更新项目的 project_id（华为云手动填入）
#[tauri::command]
pub async fn save_project_id(
    project_name: String,
    project_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::config::update_project_id(&state.db, &project_name, &project_id)
        .await
        .map_err(|e| e.to_string())
}

/// 删除云项目（同时删除其别名）
#[tauri::command]
pub async fn delete_cloud_project(
    project_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM cloud_aliases WHERE project_name = ?")
        .bind(&project_name)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM cloud_projects WHERE name = ?")
        .bind(&project_name)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 手动新增云项目（不通过 config.json 文件）
#[tauri::command]
pub async fn create_cloud_project(
    name: String,
    provider: String,
    description: Option<String>,
    credentials: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let project = crate::models::ImportProject {
        name,
        provider,
        description,
        credentials,
        aliases: vec![],
    };
    crate::config::import_cloud_project(&state.db, &project)
        .await
        .map_err(|e| e.to_string())
}

/// 编辑项目 credentials（前端弹窗修改 AK/SK 等）
#[tauri::command]
pub async fn update_project_credentials(
    project_name: String,
    credentials: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::config::update_project_credentials(&state.db, &project_name, &credentials)
        .await
        .map_err(|e| e.to_string())
}

/// 华为云 LTS 查询日志（直连 REST API）
#[tauri::command]
pub async fn huawei_query_logs(
    creds: CloudCredentials,
    log_group_id: String,
    log_stream_id: String,
    keywords: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<i32>,
) -> Result<serde_json::Value, String> {
    let secret = crate::config::load_cloud_secret(&creds.provider)
        .unwrap_or_else(|| creds.access_key_secret.clone());

    let now_ms = chrono::Utc::now().timestamp_millis();
    let params = crate::cloud::huawei::LtsQueryParams {
        start_time: start_time.unwrap_or_else(|| (now_ms - 3600000).to_string()),
        end_time: end_time.unwrap_or_else(|| now_ms.to_string()),
        keywords,
        limit: Some(limit.unwrap_or(100)),
        is_desc: Some(true),
        is_count: Some(false),
    };

    crate::cloud::huawei::query_logs(&creds, &secret, &log_group_id, &log_stream_id, &params).await
}

/// 统一云日志搜索 — 根据导入的项目+别名执行查询
#[tauri::command]
/// 云日志查询核心逻辑（不依赖 Tauri State，MCP 子进程也可调用）
pub async fn cloud_search_with_pool(
    pool: &sqlx::SqlitePool,
    provider: String,
    project_name: String,
    alias_name: String,
    keywords: Option<String>,
    time_from: Option<String>,
    time_to: Option<String>,
    limit: Option<i32>,
) -> Result<serde_json::Value, String> {
    // 1. 获取项目的 credentials
    let creds_json = crate::config::get_project_credentials(pool, &project_name)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("项目 {} 的凭据不存在", project_name))?;

    // 2. 获取别名详情
    let aliases = crate::config::get_project_aliases(pool, &project_name)
        .await
        .map_err(|e| e.to_string())?;
    let alias = aliases
        .iter()
        .find(|a| a.alias == alias_name)
        .ok_or_else(|| format!("别名 {} 不存在，可用别名：{}", alias_name, aliases.iter().map(|a| a.alias.as_str()).collect::<Vec<_>>().join(", ")))?;

    let logstore = alias.logstore.as_deref().unwrap_or("");
    let stream_id = alias.stream_id.as_deref().unwrap_or("");
    let limit = limit.unwrap_or(100);

    let now_ms = chrono::Utc::now().timestamp_millis();
    let from = time_from.unwrap_or_else(|| (now_ms - 3600000).to_string()); // 默认最近1小时
    let to = time_to.unwrap_or_else(|| now_ms.to_string());

    match provider.as_str() {
        "aliyun" => {
            let endpoint = creds_json["endpoint"].as_str().unwrap_or("cn-hangzhou.log.aliyuncs.com").to_string();
            let sls_project = creds_json["project"].as_str().unwrap_or("").to_string();
            let ak = creds_json["ak"].as_str().unwrap_or("").to_string();
            let sk = creds_json["sk"].as_str().unwrap_or("").to_string();

            if ak.is_empty() || sk.is_empty() {
                return Err("阿里云 AK/SK 未配置".to_string());
            }

            // SLS_REGIONS 需要 region code（如 cn-hangzhou），不能是 endpoint 域名
            // 优先用显式 region 字段；否则从 endpoint 提取第一段（cn-hangzhou.log... → cn-hangzhou）
            let region_code = creds_json["region"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    endpoint.split('.').next().unwrap_or("cn-hangzhou").to_string()
                });

            let query_str = keywords.as_deref().unwrap_or("*").to_string();
            let from_sec = from.parse::<i64>().unwrap_or(now_ms - 3600000) / 1000;
            let to_sec = to.parse::<i64>().unwrap_or(now_ms) / 1000;
            let max_logs = limit.max(1).min(500);

            let env = vec![
                ("ALIBABA_CLOUD_ACCESS_KEY_ID", ak.clone()),
                ("ALIBABA_CLOUD_ACCESS_KEY_SECRET", sk.clone()),
                ("SLS_REGIONS", region_code.clone()),
            ];
            let args = serde_json::json!({
                "project": sls_project,
                "logstore": logstore,
                "query": query_str,
                "from": from_sec,
                "to": to_sec,
                "max_logs": max_logs,
                "region": region_code,
            });

            // spawn_blocking 包含 spawn + call_tool，避免阻塞异步线程；timeout 覆盖全程 I/O
            // SLS API 实测需 15-20s，加上 npx 启动开销，给 60s 余量
            tokio::time::timeout(
                std::time::Duration::from_secs(60),
                tokio::task::spawn_blocking(move || {
                    let env_refs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (&k[..], &v[..])).collect();
                    let client = crate::cloud::connector::McpClient::spawn("npx", &["-y", "aliyun-sls-mcp"], &env_refs)?;
                    client.call_tool("query_logs", args)
                }),
            )
            .await
            .map_err(|_| "阿里云查询超时（60秒），SLS API 响应过慢，请稍后重试".to_string())?
            .map_err(|e| format!("线程错误: {}", e))?
        }
        "tencent" => {
            let secret_id = creds_json["secret_id"].as_str().unwrap_or("").to_string();
            let secret_key = creds_json["secret_key"].as_str().unwrap_or("").to_string();

            if secret_id.is_empty() || secret_key.is_empty() {
                return Err("腾讯云 SecretId/SecretKey 未配置".to_string());
            }

            let query_str = keywords.as_deref().unwrap_or("*").to_string();
            let from_ms = from.parse::<i64>().unwrap_or(now_ms - 3600000);
            let to_ms   = to.parse::<i64>().unwrap_or(now_ms);
            let topic_id = if !stream_id.is_empty() { stream_id.to_string() } else { logstore.to_string() };
            let limit_cls = limit.max(1).min(100);

            let env = vec![
                ("TENCENTCLOUD_SECRET_ID", secret_id.clone()),
                ("TENCENTCLOUD_SECRET_KEY", secret_key.clone()),
                ("TZ", "Asia/Shanghai".to_string()),
            ];
            let args = serde_json::json!({
                "TopicId": topic_id,
                "Query": query_str,
                "From": from_ms,
                "To": to_ms,
                "Limit": limit_cls,
                "SyntaxRule": 1,
                "Sort": "desc",
                "UseNewAnalysis": true,
            });

            tokio::time::timeout(
                std::time::Duration::from_secs(30),
                tokio::task::spawn_blocking(move || {
                    let env_refs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (&k[..], &v[..])).collect();
                    let client = crate::cloud::connector::McpClient::spawn("npx", &["-y", "cls-mcp-server@latest"], &env_refs)?;
                    client.call_tool("SearchLog", args)
                }),
            )
            .await
            .map_err(|_| "腾讯云查询超时（30秒），请检查网络连通性或 npx 环境".to_string())?
            .map_err(|e| format!("线程错误: {}", e))?
        }
        "huawei" => {
            // 华为云 LTS — 使用 REST API
            let ak = creds_json["ak"].as_str().unwrap_or("");
            let sk = creds_json["sk"].as_str().unwrap_or("");
            let region = creds_json["region"].as_str().unwrap_or("cn-east-3");
            let log_group_id = creds_json["log_group_id"].as_str().unwrap_or("");

            if ak.is_empty() || sk.is_empty() {
                return Err("华为云 AK/SK 未配置".to_string());
            }
            if log_group_id.is_empty() {
                return Err("华为云配置缺少 log_group_id，请在 config.json credentials 中添加".to_string());
            }
            if stream_id.is_empty() {
                return Err("别名缺少 stream_id（华为云日志流ID），请在 config.json aliases 中添加".to_string());
            }

            // project_id 可从 credentials 读取，若无则通过 IAM API 自动发现
            let project_id_hw = creds_json
                .get("project_id")
                .and_then(|v| v.as_str())
                .or_else(|| creds_json.get("projectId").and_then(|v| v.as_str()))
                .unwrap_or("")
                .to_string();

            let creds = CloudCredentials {
                provider: crate::config::CloudProvider::Huawei,
                access_key_id: ak.to_string(),
                access_key_secret: String::new(),
                region: region.to_string(),
                project_id: project_id_hw,
            };

            let params = crate::cloud::huawei::LtsQueryParams {
                start_time: from,
                end_time: to,
                keywords,
                limit: Some(limit),
                is_desc: Some(true),
                is_count: Some(false),
            };

            // query_logs will auto-discover project_id via IAM if creds.project_id is empty
            crate::cloud::huawei::query_logs(
                &creds,
                sk,
                log_group_id,
                stream_id,
                &params,
            ).await
        }
        _ => Err(format!("不支持的云服务商: {}", provider)),
    }
}

/// Tauri command 薄包装，委托给 cloud_search_with_pool
#[tauri::command]
pub async fn cloud_search_logs(
    provider: String,
    project_name: String,
    alias_name: String,
    keywords: Option<String>,
    time_from: Option<String>,
    time_to: Option<String>,
    limit: Option<i32>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    cloud_search_with_pool(
        &state.db, provider, project_name, alias_name,
        keywords, time_from, time_to, limit,
    ).await
}

/// 检查 MCP server 进程是否正在运行
#[tauri::command]
pub async fn get_mcp_running_status() -> serde_json::Value {
    let pid_path = crate::paths::get_app_data_dir().join("mcp_server.pid");
    if !pid_path.exists() {
        return serde_json::json!({ "running": false });
    }
    let pid_str = match std::fs::read_to_string(&pid_path) {
        Ok(s) => s,
        Err(_) => return serde_json::json!({ "running": false }),
    };
    let pid: u32 = match pid_str.trim().parse() {
        Ok(p) => p,
        Err(_) => return serde_json::json!({ "running": false }),
    };
    // kill -0：不发信号，仅检测进程是否存在（Unix）
    let alive = std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !alive {
        let _ = std::fs::remove_file(&pid_path); // 清理过期 PID 文件
    }
    // 如果进程存活，也返回最近一次调用的客户端和时间
    let last_event = crate::mcp::activity::read_all().into_iter().last();
    serde_json::json!({
        "running": alive,
        "pid": if alive { Some(pid) } else { None },
        "last_active": last_event.as_ref().map(|e| &e.timestamp),
        "last_client": last_event.as_ref().and_then(|e| e.client_hint.as_ref()),
    })
}

/// 查询 MCP 调用历史（最多返回 200 条，newest-first）
#[tauri::command]
pub async fn get_mcp_activity(
    tool_filter: Option<String>,
    status_filter: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<crate::mcp::activity::McpCallEvent>, String> {
    let mut events = crate::mcp::activity::read_all();
    if let Some(tool) = &tool_filter {
        events.retain(|e| &e.tool == tool);
    }
    if let Some(status) = &status_filter {
        events.retain(|e| &e.status == status);
    }
    events.reverse();
    events.truncate(limit.unwrap_or(200));
    Ok(events)
}

/// 清空 MCP 调用历史
#[tauri::command]
pub async fn clear_mcp_activity() -> Result<(), String> {
    crate::mcp::activity::clear().map_err(|e| e.to_string())
}
