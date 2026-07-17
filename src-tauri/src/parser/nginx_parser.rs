use crate::models::LogEntry;

pub fn parse_line(line_number: u64, line: &str) -> LogEntry {
    let raw = line.to_string();
    // NGINX combined log format
    let re = regex::Regex::new(
        r#"^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+)"#,
    )
    .unwrap();

    let mut timestamp = None;
    let mut level = None;
    let mut service = None;
    let message = raw.clone();

    if let Some(caps) = re.captures(&raw) {
        service = Some(caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
        timestamp = caps.get(2).map(|m| m.as_str().to_string());
        let status: u16 = caps
            .get(4)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(200);
        level = Some(if status >= 500 {
            "ERROR".to_string()
        } else if status >= 400 {
            "WARN".to_string()
        } else {
            "INFO".to_string()
        });
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
