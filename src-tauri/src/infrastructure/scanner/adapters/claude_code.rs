use anyhow::Result;
use chrono::TimeZone;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::domain::entity::TokenUsage;
use crate::domain::service::PricingService;
use crate::infrastructure::scanner::PlatformScanner;

#[derive(Deserialize)]
struct StatsCache {
    #[serde(default)]
    #[allow(dead_code)]
    version: u32,
    #[allow(dead_code)]
    #[serde(rename = "lastComputedDate")]
    last_computed_date: Option<String>,
    #[serde(rename = "modelUsage", default)]
    model_usage: HashMap<String, ModelUsageEntry>,
    #[serde(rename = "dailyModelTokens", default)]
    #[allow(dead_code)]
    daily_model_tokens: Vec<serde_json::Value>,
    #[serde(rename = "dailyActivity", default)]
    #[allow(dead_code)]
    daily_activity: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct ModelUsageEntry {
    #[serde(rename = "inputTokens", default)]
    input_tokens: u64,
    #[serde(rename = "outputTokens", default)]
    output_tokens: u64,
    #[serde(rename = "cacheReadInputTokens", default)]
    cache_read_input_tokens: u64,
}

pub struct ClaudeCodeScanner {
    pricing: PricingService,
}

impl ClaudeCodeScanner {
    pub fn new() -> Self {
        Self {
            pricing: PricingService::new(),
        }
    }

    fn parse_stats_cache(&self, path: &PathBuf) -> Result<Vec<TokenUsage>> {
        let content = std::fs::read_to_string(path)?;
        let cache: StatsCache = serde_json::from_str(&content)?;

        let mut usages = Vec::new();
        // Use lastComputedDate as timestamp so repeated scans don't duplicate.
        // Interpret the date in LOCAL timezone (not UTC) so that date-based
        // filtering in snapshot() / hourly_stats() works consistently for
        // users in all timezones.
        let ts = cache
            .last_computed_date
            .as_ref()
            .and_then(|d| {
                chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
                    .ok()
                    .and_then(|nd| {
                        nd.and_hms_opt(0, 0, 0)
                            .and_then(|ndt| chrono::Local.from_local_datetime(&ndt).single())
                    })
                    .map(|dt| dt.timestamp() as f64)
            })
            .unwrap_or_else(|| chrono::Local::now().timestamp() as f64);

        for (model, entry) in &cache.model_usage {
            let input_tokens = entry.input_tokens;
            let output_tokens = entry.output_tokens;
            let total_tokens = input_tokens + output_tokens;
            let cached_tokens = entry.cache_read_input_tokens;

            if total_tokens == 0 {
                continue;
            }

            let normalized = self.pricing.normalize_model_name(model);

            usages.push(TokenUsage {
                provider: self.infer_provider(model),
                raw_model: model.clone(),
                model: normalized,
                prompt_tokens: input_tokens,
                completion_tokens: output_tokens,
                total_tokens,
                cached_tokens,
                // stats-cache.json doesn't track reasoning tokens separately
                reasoning_tokens: 0,
                latency_ms: None,
                source: Some("claude-code".to_string()),
                original_ts: Some(ts),
            });
        }

        Ok(usages)
    }

    fn infer_provider(&self, model: &str) -> String {
        if model.contains("claude")
            || model.contains("sonnet")
            || model.contains("opus")
            || model.contains("haiku")
        {
            "anthropic".to_string()
        } else if model.contains("gpt")
            || model.contains("o1")
            || model.contains("o3")
            || model.contains("o4")
        {
            "openai".to_string()
        } else if model.contains("deepseek") {
            "deepseek".to_string()
        } else if model.contains("doubao") || model.contains("seed") {
            "bytedance".to_string()
        } else if model.contains("glm") || model.contains("kimi") || model.contains("minimax") {
            "third-party".to_string()
        } else {
            "unknown".to_string()
        }
    }
}

impl PlatformScanner for ClaudeCodeScanner {
    fn name(&self) -> &'static str {
        "claude-code"
    }

    fn display_name(&self) -> &'static str {
        "Claude Code"
    }

    fn candidate_paths(&self) -> Vec<PathBuf> {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let claude_dir = home.join(".claude");
        if claude_dir.exists() {
            vec![claude_dir]
        } else {
            vec![]
        }
    }

    fn scan(&self, path: &PathBuf) -> Result<Vec<TokenUsage>> {
        // Primary source: stats-cache.json has aggregated model usage
        let stats_cache = path.join("stats-cache.json");
        if stats_cache.exists() {
            return self.parse_stats_cache(&stats_cache);
        }

        Ok(Vec::new())
    }
}
