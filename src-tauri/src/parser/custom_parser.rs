use crate::models::LogEntry;

pub fn parse_syslog(line_number: u64, line: &str) -> LogEntry {
    let raw = line.to_string();
    let re = regex::Regex::new(
        r"^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)$",
    )
    .unwrap();

    let (timestamp, service, level, message) = if let Some(caps) = re.captures(&raw) {
        (
            caps.get(1).map(|m| m.as_str().to_string()),
            caps.get(3).map(|m| m.as_str().to_string()),
            infer_level(caps.get(4).map(|m| m.as_str()).unwrap_or("")),
            caps.get(5).map(|m| m.as_str().to_string()).unwrap_or(raw.clone()),
        )
    } else {
        (None, None, None, raw.clone())
    };

    LogEntry {
        line_number,
        timestamp,
        level,
        service,
        message,
        raw,
    }
}

pub fn parse_csv(line_number: u64, line: &str) -> LogEntry {
    let raw = line.to_string();
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    let mut timestamp = None;
    let mut level = None;
    let mut service = None;
    let message = raw.clone();

    if parts.len() >= 3 {
        timestamp = Some(parts[0].to_string());
        level = Some(parts[1].to_uppercase());
        service = parts.get(2).map(|s| s.to_string());
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

pub fn parse_plain(line_number: u64, line: &str) -> LogEntry {
    let raw = line.to_string();
    let level = infer_level(&raw);
    LogEntry {
        line_number,
        timestamp: extract_timestamp(&raw),
        level,
        service: None,
        message: raw.clone(),
        raw,
    }
}

fn infer_level(text: &str) -> Option<String> {
    let upper = text.to_uppercase();
    for lvl in ["FATAL", "ERROR", "WARN", "WARNING", "INFO", "DEBUG", "TRACE"] {
        if upper.contains(lvl) {
            return Some(if lvl == "WARNING" {
                "WARN".to_string()
            } else {
                lvl.to_string()
            });
        }
    }
    None
}

fn extract_timestamp(text: &str) -> Option<String> {
    let re = regex::Regex::new(
        r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?",
    )
    .unwrap();
    re.find(text).map(|m| m.as_str().to_string())
}
