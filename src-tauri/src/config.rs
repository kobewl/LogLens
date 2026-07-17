use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use crate::models::{ImportAlias, ImportProject, CloudProjectSummary};

pub const DEFAULT_DEEPSEEK_BASE: &str = "https://api.deepseek.com";
pub const DEFAULT_OLLAMA_BASE: &str = "http://localhost:11434/v1";
pub const DEFAULT_OPENAI_BASE: &str = "https://api.openai.com/v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    DeepSeek,
    Ollama,
    OpenAI,
}

impl Default for AiProvider {
    fn default() -> Self {
        Self::DeepSeek
    }
}

impl AiProvider {
    pub fn default_base_url(&self) -> &'static str {
        match self {
            Self::DeepSeek => DEFAULT_DEEPSEEK_BASE,
            Self::Ollama => DEFAULT_OLLAMA_BASE,
            Self::OpenAI => DEFAULT_OPENAI_BASE,
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            Self::DeepSeek => "deepseek-chat",
            Self::Ollama => "llama3.2",
            Self::OpenAI => "gpt-4o-mini",
        }
    }

    pub fn models(&self) -> Vec<&'static str> {
        match self {
            Self::DeepSeek => vec!["deepseek-chat", "deepseek-reasoner"],
            Self::Ollama => vec!["llama3.2", "qwen2.5", "mistral"],
            Self::OpenAI => vec!["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub provider: AiProvider,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        let provider = AiProvider::DeepSeek;
        Self {
            provider: provider.clone(),
            api_key: String::new(),
            base_url: provider.default_base_url().to_string(),
            model: provider.default_model().to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CloudProvider {
    Aliyun,
    Tencent,
    Huawei,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudCredentials {
    pub provider: CloudProvider,
    pub access_key_id: String,
    pub access_key_secret: String,
    pub region: String,
    #[serde(default)]
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub cloud_credentials: Vec<CloudCredentials>,
    #[serde(default)]
    pub language: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ai: AiConfig::default(),
            cloud_credentials: Vec::new(),
            language: "zh".to_string(),
        }
    }
}

pub fn load_config() -> AppConfig {
    let path = crate::paths::get_config_path();
    if !path.exists() {
        return AppConfig::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    crate::paths::ensure_dirs().map_err(|e| e.to_string())?;
    let path = crate::paths::get_config_path();
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

// ========================
// 密钥存储 — 使用本地文件替代 keyring（避免 macOS 钥匙串弹窗）
// ========================

/// 读取所有密钥
fn load_secrets() -> std::collections::HashMap<String, String> {
    let path = crate::paths::get_secrets_path();
    if !path.exists() {
        return std::collections::HashMap::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// 保存所有密钥
fn save_secrets(secrets: &std::collections::HashMap<String, String>) -> Result<(), String> {
    crate::paths::ensure_dirs().map_err(|e| e.to_string())?;
    let path = crate::paths::get_secrets_path();
    let content = serde_json::to_string_pretty(secrets).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub fn save_api_key(provider: &AiProvider, key: &str) -> Result<(), String> {
    let mut secrets = load_secrets();
    let k = format!("ai-{:?}", provider);
    if key.is_empty() {
        secrets.remove(&k);
    } else {
        secrets.insert(k, key.to_string());
    }
    save_secrets(&secrets)
}

pub fn load_api_key(provider: &AiProvider) -> Option<String> {
    let secrets = load_secrets();
    secrets.get(&format!("ai-{:?}", provider)).cloned()
}

pub fn save_cloud_secret(provider: &CloudProvider, secret: &str) -> Result<(), String> {
    let mut secrets = load_secrets();
    let k = format!("cloud-{:?}", provider);
    if secret.is_empty() {
        secrets.remove(&k);
    } else {
        secrets.insert(k, secret.to_string());
    }
    save_secrets(&secrets)
}

pub fn load_cloud_secret(provider: &CloudProvider) -> Option<String> {
    let secrets = load_secrets();
    secrets.get(&format!("cloud-{:?}", provider)).cloned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFileSession {
    pub id: String,
    pub path: String,
    pub format: String,
    pub line_count: u64,
    pub indexed_at: String,
}

pub async fn init_db() -> Result<sqlx::SqlitePool, sqlx::Error> {
    crate::paths::ensure_dirs().map_err(|e| sqlx::Error::Configuration(e.to_string().into()))?;
    let db_path = crate::paths::get_db_path();
    let url = format!("sqlite:{}?mode=rwc", db_path.display());
    let pool = sqlx::SqlitePool::connect(&url).await?;
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS log_sessions (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL,
            format TEXT NOT NULL,
            line_count INTEGER NOT NULL DEFAULT 0,
            indexed_at TEXT NOT NULL
        )
        "#,
    )
    .execute(&pool)
    .await?;

    // 云项目导入表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS cloud_projects (
            name TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            credentials TEXT NOT NULL,
            imported_at TEXT NOT NULL
        )
        "#,
    )
    .execute(&pool)
    .await?;

    // 云项目别名表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS cloud_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_name TEXT NOT NULL,
            alias TEXT NOT NULL,
            stream_id TEXT NOT NULL DEFAULT '',
            logstore TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            log_stream_name TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (project_name) REFERENCES cloud_projects(name) ON DELETE CASCADE
        )
        "#,
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}

pub async fn save_session(pool: &sqlx::SqlitePool, session: &LogFileSession) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT OR REPLACE INTO log_sessions (id, path, format, line_count, indexed_at)
        VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(&session.id)
    .bind(&session.path)
    .bind(&session.format)
    .bind(session.line_count as i64)
    .bind(&session.indexed_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_sessions(pool: &sqlx::SqlitePool) -> Result<Vec<LogFileSession>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, String, String, i64, String)>(
        "SELECT id, path, format, line_count, indexed_at FROM log_sessions ORDER BY indexed_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, path, format, line_count, indexed_at)| LogFileSession {
            id,
            path,
            format,
            line_count: line_count as u64,
            indexed_at,
        })
        .collect())
}

pub fn file_id(path: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}

pub fn normalize_path(path: &PathBuf) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.clone())
        .to_string_lossy()
        .to_string()
}

// ========================
// 云项目导入 / 查询
// ========================

/// 导入单个云项目及其别名（替换同名项目）
pub async fn import_cloud_project(
    pool: &sqlx::SqlitePool,
    project: &ImportProject,
) -> Result<(), sqlx::Error> {
    let creds_json = serde_json::to_string(&project.credentials).unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    // 先删除旧数据（替换逻辑）
    sqlx::query("DELETE FROM cloud_aliases WHERE project_name = ?")
        .bind(&project.name)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM cloud_projects WHERE name = ?")
        .bind(&project.name)
        .execute(pool)
        .await?;

    // 插入项目
    sqlx::query(
        "INSERT INTO cloud_projects (name, provider, description, credentials, imported_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&project.name)
    .bind(&project.provider)
    .bind(project.description.as_deref().unwrap_or(""))
    .bind(&creds_json)
    .bind(&now)
    .execute(pool)
    .await?;

    // 插入别名
    for alias in &project.aliases {
        sqlx::query(
            "INSERT INTO cloud_aliases (project_name, alias, stream_id, logstore, description, log_stream_name) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&project.name)
        .bind(&alias.alias)
        .bind(alias.stream_id.as_deref().unwrap_or(""))
        .bind(alias.logstore.as_deref().unwrap_or(""))
        .bind(alias.description.as_deref().unwrap_or(""))
        .bind(alias.log_stream_name.as_deref().unwrap_or(""))
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// 列出所有已导入的云项目摘要
pub async fn list_cloud_projects(
    pool: &sqlx::SqlitePool,
) -> Result<Vec<CloudProjectSummary>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, String, String)>(
        "SELECT name, provider, description FROM cloud_projects ORDER BY imported_at DESC",
    )
    .fetch_all(pool)
    .await?;

    let mut summaries = Vec::new();
    for (name, provider, description) in rows {
        let alias_count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM cloud_aliases WHERE project_name = ?",
        )
        .bind(&name)
        .fetch_one(pool)
        .await?;

        summaries.push(CloudProjectSummary {
            name,
            provider,
            description,
            alias_count: alias_count.0 as usize,
        });
    }

    Ok(summaries)
}

/// 获取某个项目的所有别名
pub async fn get_project_aliases(
    pool: &sqlx::SqlitePool,
    project_name: &str,
) -> Result<Vec<ImportAlias>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT alias, stream_id, logstore, description, log_stream_name FROM cloud_aliases WHERE project_name = ?",
    )
    .bind(project_name)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(alias, stream_id, logstore, description, log_stream_name)| ImportAlias {
            alias,
            stream_id: if stream_id.is_empty() { None } else { Some(stream_id) },
            logstore: if logstore.is_empty() { None } else { Some(logstore) },
            description: if description.is_empty() { None } else { Some(description) },
            log_stream_name: if log_stream_name.is_empty() { None } else { Some(log_stream_name) },
        })
        .collect())
}

/// 获取某个项目的 credentials（JSON Value）
pub async fn get_project_credentials(
    pool: &sqlx::SqlitePool,
    project_name: &str,
) -> Result<Option<serde_json::Value>, sqlx::Error> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT credentials FROM cloud_projects WHERE name = ?")
            .bind(project_name)
            .fetch_optional(pool)
            .await?;

    Ok(row.and_then(|(json_str,)| serde_json::from_str(&json_str).ok()))
}

/// 更新项目的完整 credentials（前端编辑后回写）
pub async fn update_project_credentials(
    pool: &sqlx::SqlitePool,
    project_name: &str,
    credentials: &serde_json::Value,
) -> Result<(), sqlx::Error> {
    let json_str = serde_json::to_string(credentials).unwrap_or_default();
    sqlx::query("UPDATE cloud_projects SET credentials = ? WHERE name = ?")
        .bind(&json_str)
        .bind(project_name)
        .execute(pool)
        .await?;
    Ok(())
}
pub async fn update_project_id(
    pool: &sqlx::SqlitePool,
    project_name: &str,
    project_id: &str,
) -> Result<(), sqlx::Error> {
    // 读取现有 credentials
    let row: Option<(String,)> =
        sqlx::query_as("SELECT credentials FROM cloud_projects WHERE name = ?")
            .bind(project_name)
            .fetch_optional(pool)
            .await?;

    let mut creds: serde_json::Value = row
        .and_then(|(json_str,)| serde_json::from_str(&json_str).ok())
        .unwrap_or(serde_json::json!({}));

    // 更新 project_id 字段
    if let Some(obj) = creds.as_object_mut() {
        obj.insert(
            "project_id".to_string(),
            serde_json::Value::String(project_id.to_string()),
        );
    }

    let updated = serde_json::to_string(&creds).unwrap_or_default();
    sqlx::query("UPDATE cloud_projects SET credentials = ? WHERE name = ?")
        .bind(&updated)
        .bind(project_name)
        .execute(pool)
        .await?;

    Ok(())
}
