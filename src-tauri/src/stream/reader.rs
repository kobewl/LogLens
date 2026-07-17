use crate::models::{LogEntry, LogFormat};
use crate::parser;
use std::io::{BufRead, BufReader};
use std::path::Path;

const CHUNK_SIZE: usize = 1000;

pub fn stream_lines(
    path: &Path,
    format: LogFormat,
    offset: u64,
    limit: u64,
) -> Result<Vec<LogEntry>, String> {
    parser::iterate_lines(path, format, offset, limit).map_err(|e| e.to_string())
}

pub fn read_chunk(path: &Path, start_line: u64) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    Ok(reader
        .lines()
        .skip(start_line as usize)
        .take(CHUNK_SIZE)
        .filter_map(|l| l.ok())
        .collect())
}
