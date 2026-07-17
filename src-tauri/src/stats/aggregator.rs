use crate::models::{LevelCount, LogEntry, LogFormat, LogStats, ServiceCount, TimelineBucket};
use crate::parser;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::Path;

pub fn compute_stats(path: &Path, format: LogFormat) -> Result<LogStats, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut level_counts: HashMap<String, u64> = HashMap::new();
    let mut service_counts: HashMap<String, u64> = HashMap::new();
    let mut timeline: HashMap<String, (u64, u64)> = HashMap::new();
    let mut total = 0u64;

    for (idx, line) in reader.lines().enumerate() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let entry = parser::parse_line(format, idx as u64 + 1, &line);
        total += 1;

        let level = entry.level.clone().unwrap_or_else(|| "UNKNOWN".to_string());
        *level_counts.entry(level.clone()).or_insert(0) += 1;

        if let Some(ref svc) = entry.service {
            *service_counts.entry(svc.clone()).or_insert(0) += 1;
        }

        let bucket = entry
            .timestamp
            .as_ref()
            .map(|t| t.chars().take(13).collect::<String>())
            .unwrap_or_else(|| "unknown".to_string());
        let slot = timeline.entry(bucket).or_insert((0, 0));
        slot.0 += 1;
        if level == "ERROR" || level == "FATAL" {
            slot.1 += 1;
        }
    }

    let mut by_level: Vec<LevelCount> = level_counts
        .into_iter()
        .map(|(level, count)| LevelCount { level, count })
        .collect();
    by_level.sort_by(|a, b| b.count.cmp(&a.count));

    let mut by_service: Vec<ServiceCount> = service_counts
        .into_iter()
        .map(|(service, count)| ServiceCount { service, count })
        .collect();
    by_service.sort_by(|a, b| b.count.cmp(&a.count));

    let mut timeline_vec: Vec<TimelineBucket> = timeline
        .into_iter()
        .map(|(bucket, (count, errors))| TimelineBucket {
            bucket,
            count,
            errors,
        })
        .collect();
    timeline_vec.sort_by(|a, b| a.bucket.cmp(&b.bucket));

    Ok(LogStats {
        total_lines: total,
        by_level,
        by_service,
        timeline: timeline_vec,
    })
}

pub fn compute_timeline(entries: &[LogEntry]) -> Vec<TimelineBucket> {
    let mut timeline: HashMap<String, (u64, u64)> = HashMap::new();
    for entry in entries {
        let bucket = entry
            .timestamp
            .as_ref()
            .map(|t| t.chars().take(13).collect::<String>())
            .unwrap_or_else(|| "unknown".to_string());
        let slot = timeline.entry(bucket).or_insert((0, 0));
        slot.0 += 1;
        if entry.level.as_deref() == Some("ERROR") || entry.level.as_deref() == Some("FATAL") {
            slot.1 += 1;
        }
    }
    let mut result: Vec<TimelineBucket> = timeline
        .into_iter()
        .map(|(bucket, (count, errors))| TimelineBucket {
            bucket,
            count,
            errors,
        })
        .collect();
    result.sort_by(|a, b| a.bucket.cmp(&b.bucket));
    result
}
