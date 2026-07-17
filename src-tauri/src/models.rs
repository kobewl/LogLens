use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogFormat {
    JsonLines,
    Csv,
    Nginx,
    Syslog,
    PlainText,
}

impl LogFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::JsonLines => "json_lines",
            Self::Csv => "csv",
            Self::Nginx => "nginx",
            Self::Syslog => "syslog",
            Self::PlainText => "plain_text",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "json_lines" => Self::JsonLines,
            "csv" => Self::Csv,
            "nginx" => Self::Nginx,
            "syslog" => Self::Syslog,
            _ => Self::PlainText,
        }
    }
}

impl std::fmt::Display for LogFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub line_number: u64,
    pub timestamp: Option<String>,
    pub level: Option<String>,
    pub service: Option<String>,
    pub message: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFileInfo {
    pub path: String,
    pub format: String,
    pub line_count: u64,
    pub size_bytes: u64,
    pub time_from: Option<String>,
    pub time_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LevelCount {
    pub level: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceCount {
    pub service: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogStats {
    pub total_lines: u64,
    pub by_level: Vec<LevelCount>,
    pub by_service: Vec<ServiceCount>,
    pub timeline: Vec<TimelineBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineBucket {
    pub bucket: String,
    pub count: u64,
    pub errors: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub entries: Vec<LogEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudQueryRequest {
    pub provider: String,
    pub tool: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudTestResult {
    pub success: bool,
    pub message: String,
    pub tools: Vec<String>,
}

// ========================
// 导入云厂商配置的数据模型
// ========================

/// config.json 的顶层结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportConfig {
    pub version: i32,
    #[serde(default)]
    pub default_project: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub projects: Vec<ImportProject>,
}

/// 单个云项目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProject {
    pub name: String,
    pub provider: String,
    #[serde(default)]
    pub description: Option<String>,
    pub credentials: serde_json::Value,
    pub aliases: Vec<ImportAlias>,
}

/// 日志别名（映射到具体的 logstore/stream）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportAlias {
    pub alias: String,
    #[serde(default)]
    pub stream_id: Option<String>,
    #[serde(default)]
    pub logstore: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub log_stream_name: Option<String>,
}

/// 存储到数据库的项目摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudProjectSummary {
    pub name: String,
    pub provider: String,
    pub description: String,
    pub alias_count: usize,
}
