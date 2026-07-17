use crate::index::schema::LogSchema;
use crate::models::{LogEntry, LogFormat, SearchResult};
use crate::parser;
use parking_lot::RwLock;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tantivy::collector::TopDocs;
use tantivy::query::{BooleanQuery, Occur, QueryParser, TermQuery};
use tantivy::schema::*;
use tantivy::{Index, IndexWriter, ReloadPolicy, Term};

pub struct IndexEngine {
    index: Arc<RwLock<Index>>,
    schema: LogSchema,
    #[allow(dead_code)]
    file_path: String,
    index_path: PathBuf,
}

impl IndexEngine {
    pub fn open_or_create(id: &str, file_path: &str) -> Result<Self, String> {
        let index_path = crate::index::index_dir_for(id);
        std::fs::create_dir_all(&index_path).map_err(|e| e.to_string())?;
        let schema = LogSchema::new();
        let index = Index::open_or_create(
            tantivy::directory::MmapDirectory::open(&index_path).map_err(|e| e.to_string())?,
            schema.schema.clone(),
        )
        .map_err(|e| e.to_string())?;

        Ok(Self {
            index: Arc::new(RwLock::new(index)),
            schema,
            file_path: file_path.to_string(),
            index_path,
        })
    }

    pub fn build_index(&self, path: &Path, format: LogFormat) -> Result<u64, String> {
        if self.index_path.exists() {
            let _ = std::fs::remove_dir_all(&self.index_path);
            std::fs::create_dir_all(&self.index_path).map_err(|e| e.to_string())?;
        }

        let schema = LogSchema::new();
        let index = Index::create_in_dir(&self.index_path, schema.schema.clone())
            .map_err(|e| e.to_string())?;
        let mut writer: IndexWriter = index
            .writer(50_000_000)
            .map_err(|e| e.to_string())?;

        let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);
        let mut count = 0u64;

        for (idx, line) in reader.lines().enumerate() {
            let line = line.map_err(|e| e.to_string())?;
            if line.trim().is_empty() {
                continue;
            }
            let entry = parser::parse_line(format, idx as u64 + 1, &line);
            let mut doc = tantivy::TantivyDocument::default();
            doc.add_u64(schema.line_number, entry.line_number);
            if let Some(ref ts) = entry.timestamp {
                doc.add_text(schema.timestamp, ts);
            }
            if let Some(ref lvl) = entry.level {
                doc.add_text(schema.level, lvl);
            }
            if let Some(ref svc) = entry.service {
                doc.add_text(schema.service, svc);
            }
            doc.add_text(schema.message, &entry.message);
            doc.add_text(schema.raw, &entry.raw);
            writer.add_document(doc).map_err(|e| e.to_string())?;
            count += 1;
        }

        writer.commit().map_err(|e| e.to_string())?;

        let new_index = Index::open(
            tantivy::directory::MmapDirectory::open(&self.index_path).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        *self.index.write() = new_index;

        Ok(count)
    }

    pub fn search(
        &self,
        query_str: &str,
        limit: u64,
        time_from: Option<&str>,
        time_to: Option<&str>,
    ) -> Result<SearchResult, String> {
        let index = self.index.read();
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| e.to_string())?;
        let searcher = reader.searcher();

        let parsed = crate::filter::parse_query(query_str);
        let mut subqueries: Vec<(Occur, Box<dyn tantivy::query::Query>)> = Vec::new();

        if !parsed.text.is_empty() {
            let parser = QueryParser::for_index(
                &index,
                vec![
                    self.schema.message,
                    self.schema.raw,
                    self.schema.service,
                ],
            );
            if let Ok(q) = parser.parse_query(&parsed.text) {
                subqueries.push((Occur::Must, q));
            }
        }

        for (field, value) in &parsed.filters {
            let field = match field.as_str() {
                "level" => self.schema.level,
                "service" => self.schema.service,
                _ => continue,
            };
            let term = TermQuery::new(
                Term::from_field_text(field, &value.to_uppercase()),
                IndexRecordOption::Basic,
            );
            subqueries.push((Occur::Must, Box::new(term)));
        }

        let query: Box<dyn tantivy::query::Query> = if subqueries.is_empty() {
            Box::new(tantivy::query::AllQuery)
        } else if subqueries.len() == 1 {
            subqueries.remove(0).1
        } else {
            Box::new(BooleanQuery::new(subqueries))
        };

        let top_docs = searcher
            .search(
                &query,
                &TopDocs::with_limit((limit as usize).min(10_000)),
            )
            .map_err(|e| e.to_string())?;

        let mut entries = Vec::new();
        for (_score, addr) in top_docs {
            let doc: tantivy::TantivyDocument = searcher.doc(addr).map_err(|e| e.to_string())?;
            let entry = doc_to_entry(&self.schema, &doc);
            if let Some(tf) = time_from {
                if entry.timestamp.as_ref().map(|t| t.as_str() < tf).unwrap_or(false) {
                    continue;
                }
            }
            if let Some(tt) = time_to {
                if entry.timestamp.as_ref().map(|t| t.as_str() > tt).unwrap_or(false) {
                    continue;
                }
            }
            entries.push(entry);
        }

        Ok(SearchResult {
            total: entries.len() as u64,
            entries,
        })
    }

    pub fn get_entry(&self, line_number: u64) -> Result<Option<LogEntry>, String> {
        let index = self.index.read();
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| e.to_string())?;
        let searcher = reader.searcher();
        let term = TermQuery::new(
            Term::from_field_u64(self.schema.line_number, line_number),
            IndexRecordOption::Basic,
        );
        let top = searcher
            .search(&term, &TopDocs::with_limit(1))
            .map_err(|e| e.to_string())?;
        if let Some((_, addr)) = top.first() {
            let doc = searcher.doc(*addr).map_err(|e| e.to_string())?;
            return Ok(Some(doc_to_entry(&self.schema, &doc)));
        }
        Ok(None)
    }
}

fn doc_to_entry(schema: &LogSchema, doc: &tantivy::TantivyDocument) -> LogEntry {
    let line_number = doc
        .get_first(schema.line_number)
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let timestamp = doc
        .get_first(schema.timestamp)
        .and_then(|v| v.as_str())
        .map(String::from);
    let level = doc
        .get_first(schema.level)
        .and_then(|v| v.as_str())
        .map(String::from);
    let service = doc
        .get_first(schema.service)
        .and_then(|v| v.as_str())
        .map(String::from);
    let message = doc
        .get_first(schema.message)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let raw = doc
        .get_first(schema.raw)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    LogEntry {
        line_number,
        timestamp,
        level,
        service,
        message,
        raw,
    }
}
