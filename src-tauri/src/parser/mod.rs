pub mod detector;
pub mod json_parser;
pub mod nginx_parser;
pub mod custom_parser;

use crate::models::{LogEntry, LogFormat};
use std::io::{BufRead, BufReader};
use std::path::Path;

pub fn detect_format(path: &Path, sample_lines: &[String]) -> LogFormat {
    detector::detect(sample_lines, path.extension().and_then(|e| e.to_str()))
}

pub fn parse_line(format: LogFormat, line_number: u64, line: &str) -> LogEntry {
    match format {
        LogFormat::JsonLines => json_parser::parse_line(line_number, line),
        LogFormat::Nginx => nginx_parser::parse_line(line_number, line),
        LogFormat::Syslog => custom_parser::parse_syslog(line_number, line),
        LogFormat::Csv => custom_parser::parse_csv(line_number, line),
        LogFormat::PlainText => custom_parser::parse_plain(line_number, line),
    }
}

pub fn count_lines(path: &Path) -> std::io::Result<u64> {
    let file = std::fs::File::open(path)?;
    let reader = BufReader::new(file);
    Ok(reader.lines().count() as u64)
}

pub fn read_sample_lines(path: &Path, max: usize) -> std::io::Result<Vec<String>> {
    let file = std::fs::File::open(path)?;
    let reader = BufReader::new(file);
    Ok(reader
        .lines()
        .take(max)
        .filter_map(|l| l.ok())
        .collect())
}

pub fn iterate_lines(
    path: &Path,
    format: LogFormat,
    offset: u64,
    limit: u64,
) -> std::io::Result<Vec<LogEntry>> {
    let file = std::fs::File::open(path)?;
    let reader = BufReader::new(file);
    let entries: Vec<LogEntry> = reader
        .lines()
        .enumerate()
        .skip(offset as usize)
        .take(limit as usize)
        .filter_map(|(idx, line)| line.ok().map(|l| parse_line(format, idx as u64 + 1, &l)))
        .collect();
    Ok(entries)
}

pub fn get_context(
    path: &Path,
    format: LogFormat,
    line_number: u64,
    before: u64,
    after: u64,
) -> std::io::Result<Vec<LogEntry>> {
    let start = line_number.saturating_sub(before).max(1);
    let end = line_number + after;
    let file = std::fs::File::open(path)?;
    let reader = BufReader::new(file);
    let entries: Vec<LogEntry> = reader
        .lines()
        .enumerate()
        .filter_map(|(idx, line)| {
            let ln = idx as u64 + 1;
            if ln >= start && ln <= end {
                line.ok().map(|l| parse_line(format, ln, &l))
            } else {
                None
            }
        })
        .collect();
    Ok(entries)
}
