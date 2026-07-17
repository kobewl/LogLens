#[derive(Debug, Clone, Default)]
pub struct ParsedQuery {
    pub text: String,
    pub filters: Vec<(String, String)>,
}

pub fn parse_query(input: &str) -> ParsedQuery {
    let mut text_parts = Vec::new();
    let mut filters = Vec::new();

    let re = regex::Regex::new(r"(\w+)\s*=\s*(\S+)").unwrap();
    let mut remaining = input.to_string();

    for cap in re.captures_iter(input) {
        let full = cap.get(0).unwrap().as_str();
        let field = cap.get(1).unwrap().as_str().to_lowercase();
        let value = cap.get(2).unwrap().as_str().trim_matches('"').to_string();
        filters.push((field, value));
        remaining = remaining.replace(full, "");
    }

    for token in remaining.split_whitespace() {
        let upper = token.to_uppercase();
        if upper != "AND" && upper != "OR" && upper != "NOT" && !token.is_empty() {
            text_parts.push(token.to_string());
        }
    }

    ParsedQuery {
        text: text_parts.join(" "),
        filters,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_structured_filter() {
        let q = parse_query("level=ERROR AND service=payment timeout");
        assert_eq!(q.filters.len(), 2);
        assert!(q.text.contains("timeout"));
    }
}
