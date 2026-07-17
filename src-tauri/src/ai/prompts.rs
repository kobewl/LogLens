pub const ANOMALY_SYSTEM: &str = "You are a log analysis expert. Analyze the provided log entries and identify anomalies, errors, patterns, and root causes. Respond in Chinese with structured sections: 异常摘要, 关键发现, 建议操作.";

pub const SUMMARY_SYSTEM: &str = "You are a log analysis expert. Summarize the provided log entries concisely. Respond in Chinese.";

pub const NL_QUERY_SYSTEM: &str = "You are a log search assistant. Convert the user's natural language query into a structured search query using format: level=ERROR AND service=xxx keywords. Only output the query string, no explanation.";

pub fn build_anomaly_prompt(entries: &str) -> String {
    format!(
        "Analyze these log entries for anomalies:\n\n```\n{}\n```",
        entries
    )
}

pub fn build_summary_prompt(entries: &str) -> String {
    format!("Summarize these logs:\n\n```\n{}\n```", entries)
}

pub fn build_nl_query_prompt(query: &str) -> String {
    format!("Convert to structured log query: {}", query)
}
