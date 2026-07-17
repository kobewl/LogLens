pub mod schema;
pub mod engine;

use crate::models::{LogEntry, SearchResult};
use engine::IndexEngine;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct IndexManager {
    indexes: RwLock<HashMap<String, Arc<IndexEngine>>>,
}

impl IndexManager {
    pub fn new() -> Self {
        Self {
            indexes: RwLock::new(HashMap::new()),
        }
    }

    pub fn get_or_create(&self, file_path: &str) -> Result<Arc<IndexEngine>, String> {
        let id = crate::config::file_id(file_path);
        {
            let guard = self.indexes.read();
            if let Some(engine) = guard.get(&id) {
                return Ok(engine.clone());
            }
        }
        let engine = Arc::new(IndexEngine::open_or_create(&id, file_path)?);
        self.indexes.write().insert(id, engine.clone());
        Ok(engine)
    }

    pub fn index_file(
        &self,
        path: &Path,
        format: crate::models::LogFormat,
    ) -> Result<(u64, Arc<IndexEngine>), String> {
        let file_path = crate::config::normalize_path(&path.to_path_buf());
        let id = crate::config::file_id(&file_path);
        // Drop cached engine so rebuild picks up fresh index
        self.indexes.write().remove(&id);
        let engine = self.get_or_create(&file_path)?;
        let count = engine.build_index(path, format)?;
        Ok((count, engine))
    }

    pub fn search(
        &self,
        file_path: &str,
        query: &str,
        limit: u64,
        time_from: Option<&str>,
        time_to: Option<&str>,
    ) -> Result<SearchResult, String> {
        let engine = self.get_or_create(file_path)?;
        engine.search(query, limit, time_from, time_to)
    }

    pub fn get_entry(&self, file_path: &str, line_number: u64) -> Result<Option<LogEntry>, String> {
        let engine = self.get_or_create(file_path)?;
        engine.get_entry(line_number)
    }
}

impl Default for IndexManager {
    fn default() -> Self {
        Self::new()
    }
}

pub fn index_dir_for(id: &str) -> PathBuf {
    crate::paths::get_index_dir().join(id)
}
