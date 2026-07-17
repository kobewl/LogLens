use crate::models::LogFormat;

pub fn detect(sample_lines: &[String], extension: Option<&str>) -> LogFormat {
    if sample_lines.is_empty() {
        return match extension {
            Some("json") | Some("jsonl") => LogFormat::JsonLines,
            Some("csv") => LogFormat::Csv,
            _ => LogFormat::PlainText,
        };
    }

    let json_count = sample_lines
        .iter()
        .filter(|l| {
            let t = l.trim();
            t.starts_with('{') && serde_json::from_str::<serde_json::Value>(t).is_ok()
        })
        .count();

    if json_count > sample_lines.len() / 2 {
        return LogFormat::JsonLines;
    }

    if sample_lines.iter().any(|l| l.contains(" - - [") && l.contains("] \"")) {
        return LogFormat::Nginx;
    }

    let syslog_re = regex::Regex::new(r"^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}").unwrap();
    if sample_lines.iter().filter(|l| syslog_re.is_match(l)).count() > sample_lines.len() / 2 {
        return LogFormat::Syslog;
    }

    if extension == Some("csv") || (sample_lines.first().map(|l| l.contains(',')).unwrap_or(false)
        && sample_lines.first().map(|l| l.to_lowercase().contains("level")).unwrap_or(false))
    {
        return LogFormat::Csv;
    }

    LogFormat::PlainText
}
