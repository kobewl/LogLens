use tantivy::schema::*;

pub fn build_schema() -> Schema {
    let mut builder = Schema::builder();
    builder.add_u64_field("line_number", INDEXED | STORED | FAST);
    builder.add_text_field("timestamp", TEXT | STORED);
    builder.add_text_field("level", STRING | STORED | FAST);
    builder.add_text_field("service", STRING | STORED | FAST);
    builder.add_text_field("message", TEXT | STORED);
    builder.add_text_field("raw", TEXT | STORED);
    builder.build()
}

pub struct LogSchema {
    pub schema: Schema,
    pub line_number: Field,
    pub timestamp: Field,
    pub level: Field,
    pub service: Field,
    pub message: Field,
    pub raw: Field,
}

impl LogSchema {
    pub fn new() -> Self {
        let schema = build_schema();
        Self {
            line_number: schema.get_field("line_number").unwrap(),
            timestamp: schema.get_field("timestamp").unwrap(),
            level: schema.get_field("level").unwrap(),
            service: schema.get_field("service").unwrap(),
            message: schema.get_field("message").unwrap(),
            raw: schema.get_field("raw").unwrap(),
            schema,
        }
    }
}

impl Default for LogSchema {
    fn default() -> Self {
        Self::new()
    }
}
