use crate::config::{load_api_key, AiConfig, AiProvider};
use crate::models::AiMessage;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

pub struct AiClient {
    config: AiConfig,
}

impl AiClient {
    pub fn new(config: AiConfig) -> Self {
        Self { config }
    }

    fn api_key(&self) -> Result<String, String> {
        if !self.config.api_key.is_empty() {
            return Ok(self.config.api_key.clone());
        }
        load_api_key(&self.config.provider).ok_or_else(|| "API key not configured".to_string())
    }

    fn base_url(&self) -> String {
        let url = if self.config.base_url.is_empty() {
            self.config.provider.default_base_url().to_string()
        } else {
            self.config.base_url.clone()
        };
        let url = url.trim_end_matches('/').to_string();
        if url.ends_with("/v1") {
            url
        } else if self.config.provider == AiProvider::Ollama {
            format!("{}/v1", url)
        } else if url.contains("api.deepseek.com") || url.contains("api.openai.com") {
            format!("{}/v1", url)
        } else {
            url
        }
    }

    pub async fn chat(&self, system: &str, user: &str) -> Result<String, String> {
        let api_key = self.api_key()?;
        let url = format!("{}/chat/completions", self.base_url());

        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: system.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user.to_string(),
            },
        ];

        let body = ChatRequest {
            model: if self.config.model.is_empty() {
                self.config.provider.default_model().to_string()
            } else {
                self.config.model.clone()
            },
            messages,
            temperature: Some(0.3),
        };

        let client = reqwest::Client::new();
        let mut req = client.post(&url).json(&body);
        if self.config.provider != AiProvider::Ollama || !api_key.is_empty() {
            req = req.bearer_auth(&api_key);
        }

        let resp = req.send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("AI API error {}: {}", status, text));
        }

        let data: ChatResponse = resp.json().await.map_err(|e| e.to_string())?;
        data.choices
            .first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| "Empty AI response".to_string())
    }

    pub async fn test_connection(&self) -> Result<String, String> {
        self.chat("You are a helpful assistant.", "Reply with exactly: OK")
            .await
    }

    pub async fn analyze_anomalies(&self, logs: &str) -> Result<String, String> {
        self.chat(
            crate::ai::prompts::ANOMALY_SYSTEM,
            &crate::ai::prompts::build_anomaly_prompt(logs),
        )
        .await
    }

    pub async fn summarize(&self, logs: &str) -> Result<String, String> {
        self.chat(
            crate::ai::prompts::SUMMARY_SYSTEM,
            &crate::ai::prompts::build_summary_prompt(logs),
        )
        .await
    }

    pub async fn natural_language_query(&self, query: &str) -> Result<String, String> {
        self.chat(
            crate::ai::prompts::NL_QUERY_SYSTEM,
            &crate::ai::prompts::build_nl_query_prompt(query),
        )
        .await
    }
}

pub fn messages_to_log_text(messages: &[AiMessage]) -> String {
    messages
        .iter()
        .map(|m| format!("[{}] {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n")
}
