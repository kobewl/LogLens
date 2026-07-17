//! MCP 调用历史审计日志
//! 与 tabularis AI Activity 设计对齐：append-only JSONL，按条数轮转。
//! MCP 子进程只写，主进程（Tauri commands）只读。

use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

const MAX_ENTRIES: usize = 5000;
const MAX_ROTATED: usize = 5;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct McpCallEvent {
    /// 唯一 ID（UUID v4 简写）
    pub id: String,
    /// ISO8601 时间戳
    pub timestamp: String,
    /// 工具名
    pub tool: String,
    /// 参数摘要（已脱敏：sk/secret 等字段替换为 ***）
    pub args_preview: String,
    /// 执行耗时（毫秒）
    pub duration_ms: u64,
    /// "success" | "error"
    pub status: String,
    /// 错误信息（status=error 时有值）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// MCP 客户端名（来自 initialize 的 clientInfo.name）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_hint: Option<String>,
    /// 返回结果前 300 字符
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_preview: Option<String>,
}

// ── 路径工具 ──────────────────────────────────────────────────────────────────

fn activity_path() -> PathBuf {
    crate::paths::get_app_data_dir().join("mcp_activity.jsonl")
}

fn rotated_path(n: usize) -> PathBuf {
    crate::paths::get_app_data_dir().join(format!("mcp_activity.{}.jsonl", n))
}

// ── 写入 ──────────────────────────────────────────────────────────────────────

/// 生成简单 ID（时间戳 + 随机后缀）
fn gen_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    // 用进程时间做简单唯一性，不引入 uuid 依赖
    format!("{:x}-{:x}", ts, (ts ^ (ts >> 17)) & 0xffff)
}

/// 当前 ISO8601 时间戳
fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// 对 args JSON 做脱敏处理
pub fn sanitize_args(args: &serde_json::Value) -> String {
    let sensitive = ["sk", "secret", "secret_key", "password", "token", "access_key_secret"];
    if let Some(obj) = args.as_object() {
        let mut m = obj.clone();
        for k in sensitive {
            if m.contains_key(k) {
                m.insert(k.to_string(), serde_json::Value::String("***".to_string()));
            }
        }
        serde_json::to_string(&m).unwrap_or_default()
    } else {
        args.to_string()
    }
}

pub struct EventBuilder {
    pub tool: String,
    pub args_preview: String,
    pub client_hint: Option<String>,
    pub start: std::time::Instant,
}

impl EventBuilder {
    pub fn start(tool: &str, args: &serde_json::Value, client_hint: Option<String>) -> Self {
        Self {
            tool: tool.to_string(),
            args_preview: sanitize_args(args),
            client_hint,
            start: std::time::Instant::now(),
        }
    }

    pub fn finish_ok(self, result_text: &str) {
        // 按字符边界安全截断，最多保留 50000 字符
        let preview = if result_text.chars().count() > 50_000 {
            let cut: String = result_text.chars().take(50_000).collect();
            format!("{}…", cut)
        } else {
            result_text.to_string()
        };
        let event = McpCallEvent {
            id: gen_id(),
            timestamp: now_iso(),
            tool: self.tool,
            args_preview: self.args_preview,
            duration_ms: self.start.elapsed().as_millis() as u64,
            status: "success".to_string(),
            error: None,
            client_hint: self.client_hint,
            result_preview: Some(preview),
        };
        append(&event);
    }

    pub fn finish_err(self, err: &str) {
        let event = McpCallEvent {
            id: gen_id(),
            timestamp: now_iso(),
            tool: self.tool,
            args_preview: self.args_preview,
            duration_ms: self.start.elapsed().as_millis() as u64,
            status: "error".to_string(),
            error: Some(err.to_string()),
            client_hint: self.client_hint,
            result_preview: None,
        };
        append(&event);
    }
}

pub fn append(event: &McpCallEvent) {
    if let Err(e) = append_inner(event) {
        eprintln!("[LogLens MCP] Failed to write activity: {}", e);
    }
}

fn append_inner(event: &McpCallEvent) -> std::io::Result<()> {
    let path = activity_path();
    if path.exists() {
        let count = count_lines(&path)?;
        if count >= MAX_ENTRIES {
            rotate()?;
        }
    }
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    let line = serde_json::to_string(event).unwrap_or_default();
    writeln!(file, "{}", line)
}

fn count_lines(path: &PathBuf) -> std::io::Result<usize> {
    Ok(BufReader::new(File::open(path)?).lines().count())
}

fn rotate() -> std::io::Result<()> {
    let _ = std::fs::remove_file(rotated_path(MAX_ROTATED));
    for i in (1..MAX_ROTATED).rev() {
        let from = rotated_path(i);
        if from.exists() {
            std::fs::rename(&from, rotated_path(i + 1))?;
        }
    }
    if activity_path().exists() {
        std::fs::rename(activity_path(), rotated_path(1))?;
    }
    Ok(())
}

// ── 读取 ──────────────────────────────────────────────────────────────────────

pub fn read_all() -> Vec<McpCallEvent> {
    let mut events = Vec::new();
    // 从最旧的轮转文件读到最新
    for i in (1..=MAX_ROTATED).rev() {
        events.extend(read_file(&rotated_path(i)));
    }
    events.extend(read_file(&activity_path()));
    events
}

fn read_file(path: &PathBuf) -> Vec<McpCallEvent> {
    if !path.exists() {
        return vec![];
    }
    let Ok(file) = File::open(path) else { return vec![] };
    BufReader::new(file)
        .lines()
        .filter_map(|l| l.ok())
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(&l).ok())
        .collect()
}

// ── 清除 ──────────────────────────────────────────────────────────────────────

pub fn clear() -> std::io::Result<()> {
    let _ = std::fs::remove_file(activity_path());
    for i in 1..=MAX_ROTATED {
        let _ = std::fs::remove_file(rotated_path(i));
    }
    Ok(())
}
