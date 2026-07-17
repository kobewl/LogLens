use crate::models::LogEntry;

pub fn parse_line(line_number: u64, line: &str) -> LogEntry {
    let raw = line.to_string();
    let mut timestamp = None;
    let mut level = None;
    let mut service = None;
    let mut message = raw.clone();

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
        if let Some(obj) = v.as_object() {
            timestamp = obj
                .get("timestamp")
                .or_else(|| obj.get("time"))
                .or_else(|| obj.get("@timestamp"))
                .and_then(|t| t.as_str())
                .map(String::from);
            level = obj
                .get("level")
                .or_else(|| obj.get("severity"))
                .or_else(|| obj.get("log_level"))
                .and_then(|l| l.as_str())
                .map(|s| s.to_uppercase());
            service = obj
                .get("service")
                .or_else(|| obj.get("serviceName"))
                .or_else(|| obj.get("app"))
                .and_then(|s| s.as_str())
                .map(String::from);
            message = obj
                .get("message")
                .or_else(|| obj.get("msg"))
                .and_then(|m| m.as_str())
                .unwrap_or(&raw)
                .to_string();
        }
    }

    LogEntry {
        line_number,
        timestamp,
        level,
        service,
        message,
        raw,
    }
}
