use crate::models::LogEntry;

pub fn filter_entries(entries: &[LogEntry], query: &crate::filter::ParsedQuery) -> Vec<LogEntry> {
    entries
        .iter()
        .filter(|e| matches_entry(e, query))
        .cloned()
        .collect()
}

fn matches_entry(entry: &LogEntry, query: &crate::filter::ParsedQuery) -> bool {
    for (field, value) in &query.filters {
        let matched = match field.as_str() {
            "level" => entry.level.as_ref().map(|l| l.eq_ignore_ascii_case(value)).unwrap_or(false),
            "service" => entry.service.as_ref().map(|s| s.eq_ignore_ascii_case(value)).unwrap_or(false),
            _ => true,
        };
        if !matched {
            return false;
        }
    }
    if !query.text.is_empty() {
        let haystack = format!(
            "{} {} {} {}",
            entry.message,
            entry.raw,
            entry.level.as_deref().unwrap_or(""),
            entry.service.as_deref().unwrap_or("")
        )
        .to_lowercase();
        for token in query.text.split_whitespace() {
            if !haystack.contains(&token.to_lowercase()) {
                return false;
            }
        }
    }
    true
}
