use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

use anyhow::Result;
use serde::Deserialize;
use tracing::{info, warn};

use crate::domain::entity::ModelPrice;

const LITELLM_PRICES_URL: &str =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_TTL_SECS: u64 = 86400; // 24 hours

/// LiteLLM raw model price entry from the upstream JSON.
#[derive(Debug, Clone, Deserialize)]
struct LiteLLMModelPrice {
    #[serde(default)]
    input_cost_per_token: Option<f64>,
    #[serde(default)]
    output_cost_per_token: Option<f64>,
    #[serde(default)]
    cache_read_input_token_cost: Option<f64>,
    #[serde(default)]
    reasoning_cost_per_token: Option<f64>,
}

/// Cached price data with timestamp.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct PriceCache {
    fetched_at: u64,
    models: HashMap<String, ModelPrice>,
}

/// Fetches and caches LiteLLM pricing data.
pub struct LiteLLMPriceFetcher {
    cache_path: PathBuf,
    client: reqwest::Client,
}

impl LiteLLMPriceFetcher {
    pub fn new() -> Self {
        let cache_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".tokenstats")
            .join("litellm_prices.json");

        Self {
            cache_path,
            client: reqwest::Client::new(),
        }
    }

    /// Get prices, using cache if fresh enough, otherwise fetch from GitHub.
    pub async fn get_prices(&self) -> Result<HashMap<String, ModelPrice>> {
        if let Some(cached) = self.load_cache() {
            let age = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                - cached.fetched_at;
            if age < CACHE_TTL_SECS {
                info!(
                    "使用缓存的 LiteLLM 价格数据 ({} 个模型, {} 秒前)",
                    cached.models.len(),
                    age
                );
                return Ok(cached.models);
            }
        }

        self.fetch_and_cache().await
    }

    /// Look up a single model price by model name.
    /// Tries exact match, then common variant normalization.
    pub async fn get_price(&self, model: &str) -> Option<ModelPrice> {
        let prices = self.get_prices().await.ok()?;

        // Exact match
        if let Some(price) = prices.get(model) {
            return Some(price.clone());
        }

        // Try common suffixes
        let variants = [format!("{}-latest", model), model.to_string()];

        for variant in &variants {
            if let Some(price) = prices.get(variant) {
                return Some(price.clone());
            }
        }

        // Try matching without date suffix (e.g., "gpt-4o-2024-08-06" -> "gpt-4o")
        if let Some(last_dash) = model.rfind('-') {
            let candidate = &model[..last_dash];
            if candidate.len() >= 4 {
                if let Some(price) = prices.get(candidate) {
                    return Some(price.clone());
                }
            }
        }

        None
    }

    /// Force refresh prices from GitHub, ignoring cache.
    pub async fn refresh(&self) -> Result<HashMap<String, ModelPrice>> {
        self.fetch_and_cache().await
    }

    /// Return cache metadata: (model_count, last_fetched_unix_ts)
    pub fn cache_info(&self) -> (usize, Option<u64>) {
        if let Some(cached) = self.load_cache() {
            (cached.models.len(), Some(cached.fetched_at))
        } else {
            (0, None)
        }
    }

    // ── private helpers ──

    fn load_cache(&self) -> Option<PriceCache> {
        let data = fs::read_to_string(&self.cache_path).ok()?;
        serde_json::from_str::<PriceCache>(&data).ok()
    }

    fn save_cache(&self, cache: &PriceCache) {
        if let Some(parent) = self.cache_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(cache) {
            if let Err(e) = fs::write(&self.cache_path, json) {
                warn!("Failed to write LiteLLM price cache: {}", e);
            }
        }
    }

    async fn fetch_and_cache(&self) -> Result<HashMap<String, ModelPrice>> {
        info!("Fetching LiteLLM prices from GitHub...");
        let response = self
            .client
            .get(LITELLM_PRICES_URL)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await?;

        let raw: HashMap<String, LiteLLMModelPrice> = response.json().await?;

        let mut models = HashMap::new();
        for (model_id, litellm_price) in &raw {
            let input = litellm_price
                .input_cost_per_token
                .map(|c| c * 1_000_000.0)
                .unwrap_or(0.0);
            let output = litellm_price
                .output_cost_per_token
                .map(|c| c * 1_000_000.0)
                .unwrap_or(0.0);
            let cache_read = litellm_price
                .cache_read_input_token_cost
                .map(|c| c * 1_000_000.0)
                .unwrap_or(0.0);
            let reasoning = litellm_price
                .reasoning_cost_per_token
                .map(|c| c * 1_000_000.0)
                .unwrap_or(0.0);

            // Skip models with zero pricing (likely not LLM models)
            if input == 0.0 && output == 0.0 {
                continue;
            }

            models.insert(
                model_id.clone(),
                ModelPrice {
                    input,
                    output,
                    cache_read,
                    reasoning,
                },
            );
        }

        info!("Fetched {} model prices from LiteLLM", models.len());

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let cache = PriceCache {
            fetched_at: now,
            models: models.clone(),
        };
        self.save_cache(&cache);

        Ok(models)
    }
}
