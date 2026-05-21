use serde_json::Value;

use crate::domain::entity::TokenUsage;
use crate::domain::service::PricingService;

#[derive(Clone)]
pub struct UsageParser {
    pricing_service: PricingService,
}

impl UsageParser {
    pub fn new() -> Self {
        Self {
            pricing_service: PricingService::new(),
        }
    }

    pub fn parse_usage(
        &self,
        provider: &str,
        request_body: Option<&Value>,
        response_body: &Value,
    ) -> Option<TokenUsage> {
        let raw_model = self.extract_model(request_body, response_body)?;
        let model = self.pricing_service.normalize_model_name(&raw_model);

        let usage = response_body.get("usage")?;
        let token_counts = self.extract_token_counts(usage)?;

        Some(TokenUsage {
            provider: provider.to_string(),
            raw_model,
            model,
            prompt_tokens: token_counts.prompt_tokens,
            completion_tokens: token_counts.completion_tokens,
            total_tokens: token_counts.total_tokens,
            cached_tokens: token_counts.cached_tokens,
            reasoning_tokens: token_counts.reasoning_tokens,
            latency_ms: None,
            source: None,
            original_ts: None,
        })
    }

    pub fn parse_stream_chunk(&self, chunk: &str) -> Vec<Value> {
        let mut results = vec![];

        for line in chunk.lines() {
            let line = line.trim();
            if line.is_empty() || line == "data: [DONE]" {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    results.push(json);
                }
            }
        }

        results
    }

    pub fn extract_usage_from_stream(&self, chunks: &[Value]) -> Option<TokenUsage> {
        for chunk in chunks.iter().rev() {
            if let Some(usage) = chunk.get("usage") {
                let token_counts = self.extract_token_counts(usage)?;
                let model = chunk
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                return Some(TokenUsage {
                    provider: "unknown".to_string(),
                    raw_model: model.clone(),
                    model: self.pricing_service.normalize_model_name(&model),
                    prompt_tokens: token_counts.prompt_tokens,
                    completion_tokens: token_counts.completion_tokens,
                    total_tokens: token_counts.total_tokens,
                    cached_tokens: token_counts.cached_tokens,
                    reasoning_tokens: token_counts.reasoning_tokens,
                    latency_ms: None,
                    source: None,
                    original_ts: None,
                });
            }
        }

        None
    }

    fn extract_token_counts(&self, usage: &Value) -> Option<TokenCounts> {
        let prompt_tokens = usage
            .get("prompt_tokens")
            .and_then(|v| v.as_u64())
            .or_else(|| usage.get("input_tokens").and_then(|v| v.as_u64()))
            .unwrap_or(0);

        let completion_tokens = usage
            .get("completion_tokens")
            .and_then(|v| v.as_u64())
            .or_else(|| usage.get("output_tokens").and_then(|v| v.as_u64()))
            .unwrap_or(0);

        let total_tokens = usage
            .get("total_tokens")
            .and_then(|v| v.as_u64())
            .or_else(|| usage.get("total").and_then(|v| v.as_u64()))
            .unwrap_or(prompt_tokens + completion_tokens);

        if prompt_tokens == 0 && completion_tokens == 0 && total_tokens == 0 {
            return None;
        }

        let cached_tokens = usage
            .get("cached_tokens")
            .and_then(|v| v.as_u64())
            .or_else(|| self.nested_u64(usage, "prompt_tokens_details", "cached_tokens"))
            .or_else(|| self.nested_u64(usage, "input_tokens_details", "cached_tokens"))
            .or_else(|| {
                usage
                    .get("cache_read_input_tokens")
                    .and_then(|v| v.as_u64())
            })
            .or_else(|| {
                usage
                    .get("cache_creation_input_tokens")
                    .and_then(|v| v.as_u64())
            })
            .unwrap_or(0);

        let reasoning_tokens = usage
            .get("reasoning_tokens")
            .and_then(|v| v.as_u64())
            .or_else(|| self.nested_u64(usage, "completion_tokens_details", "reasoning_tokens"))
            .or_else(|| self.nested_u64(usage, "output_tokens_details", "reasoning_tokens"))
            .unwrap_or(0);

        Some(TokenCounts {
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cached_tokens: cached_tokens.min(prompt_tokens),
            reasoning_tokens: reasoning_tokens.min(completion_tokens),
        })
    }

    fn nested_u64(&self, value: &Value, parent: &str, child: &str) -> Option<u64> {
        value
            .get(parent)
            .and_then(|d| d.get(child))
            .and_then(|v| v.as_u64())
    }

    fn extract_model(&self, request_body: Option<&Value>, response_body: &Value) -> Option<String> {
        if let Some(model) = response_body.get("model").and_then(|v| v.as_str()) {
            return Some(model.to_string());
        }

        if let Some(req) = request_body {
            if let Some(model) = req.get("model").and_then(|v| v.as_str()) {
                return Some(model.to_string());
            }
        }

        None
    }
}

struct TokenCounts {
    prompt_tokens: u64,
    completion_tokens: u64,
    total_tokens: u64,
    cached_tokens: u64,
    reasoning_tokens: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_openai_format() {
        let parser = UsageParser::new();

        let response: Value = serde_json::from_str(
            r#"{
                "model": "gpt-4o",
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "total_tokens": 150
                }
            }"#,
        )
        .unwrap();

        let result = parser.parse_usage("openai", None, &response);
        assert!(result.is_some());

        let usage = result.unwrap();
        assert_eq!(usage.provider, "openai");
        assert_eq!(usage.raw_model, "gpt-4o");
        assert_eq!(usage.prompt_tokens, 100);
        assert_eq!(usage.completion_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn test_parse_anthropic_claude_format() {
        let parser = UsageParser::new();

        let response: Value = serde_json::from_str(
            r#"{
                "model": "claude-3-5-sonnet-20241022",
                "usage": {
                    "input_tokens": 200,
                    "output_tokens": 80
                }
            }"#,
        )
        .unwrap();

        let result = parser.parse_usage("anthropic", None, &response);
        assert!(result.is_some());

        let usage = result.unwrap();
        assert_eq!(usage.provider, "anthropic");
        assert_eq!(usage.raw_model, "claude-3-5-sonnet-20241022");
        assert_eq!(usage.prompt_tokens, 200);
        assert_eq!(usage.completion_tokens, 80);
        assert_eq!(usage.total_tokens, 280);
    }

    #[test]
    fn test_parse_with_cached_tokens() {
        let parser = UsageParser::new();

        let response: Value = serde_json::from_str(
            r#"{
                "model": "gpt-4o",
                "usage": {
                    "prompt_tokens": 500,
                    "completion_tokens": 100,
                    "cached_tokens": 300
                }
            }"#,
        )
        .unwrap();

        let result = parser.parse_usage("openai", None, &response);
        assert!(result.is_some());

        let usage = result.unwrap();
        assert_eq!(usage.cached_tokens, 300);
    }

    #[test]
    fn test_parse_openai_responses_format() {
        let parser = UsageParser::new();

        let response: Value = serde_json::from_str(
            r#"{
                "model": "gpt-4.1",
                "usage": {
                    "input_tokens": 1200,
                    "input_tokens_details": { "cached_tokens": 800 },
                    "output_tokens": 300,
                    "output_tokens_details": { "reasoning_tokens": 120 },
                    "total_tokens": 1500
                }
            }"#,
        )
        .unwrap();

        let usage = parser.parse_usage("openai", None, &response).unwrap();
        assert_eq!(usage.prompt_tokens, 1200);
        assert_eq!(usage.completion_tokens, 300);
        assert_eq!(usage.cached_tokens, 800);
        assert_eq!(usage.reasoning_tokens, 120);
        assert_eq!(usage.total_tokens, 1500);
    }

    #[test]
    fn test_parse_anthropic_cache_tokens() {
        let parser = UsageParser::new();

        let response: Value = serde_json::from_str(
            r#"{
                "model": "claude-sonnet-4-20250514",
                "usage": {
                    "input_tokens": 1000,
                    "cache_read_input_tokens": 600,
                    "output_tokens": 200
                }
            }"#,
        )
        .unwrap();

        let usage = parser.parse_usage("anthropic", None, &response).unwrap();
        assert_eq!(usage.prompt_tokens, 1000);
        assert_eq!(usage.completion_tokens, 200);
        assert_eq!(usage.cached_tokens, 600);
        assert_eq!(usage.total_tokens, 1200);
    }

    #[test]
    fn test_extract_usage_from_stream_accepts_input_output_tokens() {
        let parser = UsageParser::new();

        let chunks: Vec<Value> = vec![serde_json::from_str(
            r#"{
                "model": "gpt-4.1",
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15
                }
            }"#,
        )
        .unwrap()];

        let usage = parser.extract_usage_from_stream(&chunks).unwrap();
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 5);
        assert_eq!(usage.total_tokens, 15);
    }

    #[test]
    fn test_parse_empty_response() {
        let parser = UsageParser::new();

        let response: Value = serde_json::from_str(r#"{}"#).unwrap();
        let result = parser.parse_usage("openai", None, &response);

        assert!(result.is_none());
    }

    #[test]
    fn test_parse_missing_usage_field() {
        let parser = UsageParser::new();

        let response: Value = serde_json::from_str(
            r#"{
                "model": "gpt-4o"
            }"#,
        )
        .unwrap();

        let result = parser.parse_usage("openai", None, &response);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_model_from_request() {
        let parser = UsageParser::new();

        let request: Value = serde_json::from_str(
            r#"{
                "model": "gpt-4-turbo"
            }"#,
        )
        .unwrap();

        let response: Value = serde_json::from_str(
            r#"{
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "total_tokens": 150
                }
            }"#,
        )
        .unwrap();

        let result = parser.parse_usage("openai", Some(&request), &response);
        assert!(result.is_some());

        let usage = result.unwrap();
        assert_eq!(usage.raw_model, "gpt-4-turbo");
    }

    #[test]
    fn test_parse_stream_chunk() {
        let parser = UsageParser::new();

        let chunk = r#"
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" World"}}]}
data: [DONE]
"#;

        let results = parser.parse_stream_chunk(chunk);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_parse_stream_chunk_empty() {
        let parser = UsageParser::new();

        let chunk = "";
        let results = parser.parse_stream_chunk(chunk);
        assert!(results.is_empty());
    }

    #[test]
    fn test_parse_stream_chunk_invalid_json() {
        let parser = UsageParser::new();

        let chunk = "data: {invalid json}\ndata: {\"valid\": true}";
        let results = parser.parse_stream_chunk(chunk);
        assert_eq!(results.len(), 1);
    }
}
