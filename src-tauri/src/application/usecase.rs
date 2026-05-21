use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::application::dto::{CostBreakdown, StatsDto, StatsSnapshotDto};
use crate::domain::entity::{AppSettings, ModelPrice, StatsSnapshot};
use crate::domain::repository::TokenRepository;
use anyhow::Result;

const DEFAULT_PRICE_PER_1M: f64 = 3.0; // fallback rate: $3 per 1M tokens

#[derive(Clone)]
pub struct StatsUsecase<R: TokenRepository> {
    repository: R,
    snapshot: Arc<Mutex<StatsSnapshot>>,
    currency: String,
    usd_to_cny: f64,
    model_prices: HashMap<String, ModelPrice>,
    cache: Arc<Mutex<Option<(StatsSnapshotDto, Instant)>>>,
    cache_ttl: Duration,
    cache_hits: Arc<AtomicU64>,
}

impl<R: TokenRepository> StatsUsecase<R> {
    pub fn new(
        repository: R,
        currency: String,
        usd_to_cny: f64,
        model_prices: HashMap<String, ModelPrice>,
    ) -> Self {
        let snapshot = repository.snapshot().unwrap_or(StatsSnapshot {
            five_min_tokens: 0,
            total_tokens: 0,
            today_tokens: 0,
            last_event: None,
        });

        Self {
            repository,
            snapshot: Arc::new(Mutex::new(snapshot)),
            currency,
            usd_to_cny,
            model_prices,
            cache: Arc::new(Mutex::new(None)),
            cache_ttl: Duration::from_secs(5),
            cache_hits: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn update_prices(&mut self, prices: HashMap<String, ModelPrice>) {
        self.model_prices = prices;
    }

    /// Apply runtime settings changes without restart.
    /// Keeps cost estimates in sync with currency/rate/price changes.
    pub fn update_settings(&mut self, settings: &AppSettings) {
        self.currency = settings.currency.clone();
        self.usd_to_cny = settings.usd_to_cny;
        self.model_prices = settings.model_prices.clone();
        self.repository.set_counting_mode(&settings.counting_mode);
        // Bust the cache so the next get_stats_cached call rebuilds with new settings
        if let Ok(mut cache) = self.cache.lock() {
            *cache = None;
        }
    }

    pub fn refresh(&self) {
        if let Ok(new_snapshot) = self.repository.snapshot() {
            if let Ok(mut snapshot) = self.snapshot.lock() {
                *snapshot = new_snapshot;
            }
        }
    }

    pub fn get_stats_dto(&self) -> StatsDto {
        let snapshot = match self.repository.snapshot() {
            Ok(s) => {
                tracing::info!(
                    "get_stats_dto: snapshot Ok total={} five_min={} today={}",
                    s.total_tokens,
                    s.five_min_tokens,
                    s.today_tokens
                );
                if let Ok(mut cached) = self.snapshot.lock() {
                    *cached = s.clone();
                }
                s
            }
            Err(e) => {
                tracing::warn!("get_stats_dto: snapshot Err: {:?}", e);
                let fallback =
                    self.snapshot
                        .lock()
                        .ok()
                        .map(|s| s.clone())
                        .unwrap_or(StatsSnapshot {
                            five_min_tokens: 0,
                            total_tokens: 0,
                            today_tokens: 0,
                            last_event: None,
                        });
                tracing::info!(
                    "get_stats_dto: using fallback total={}",
                    fallback.total_tokens
                );
                fallback
            }
        };
        let summaries = self
            .repository
            .model_usage_summary(None)
            .unwrap_or_default();
        let (cost_str, currency, breakdown) = self.estimate_cost(
            snapshot.last_event.as_ref(),
            snapshot.total_tokens,
            &summaries,
        );
        StatsDto {
            five_min_tokens: snapshot.five_min_tokens,
            today_tokens: snapshot.today_tokens,
            total_tokens: snapshot.total_tokens,
            current_model: snapshot
                .last_event
                .as_ref()
                .map(|e| e.model.clone())
                .unwrap_or_else(|| "无".to_string()),
            estimated_cost: cost_str,
            cost_currency: currency,
            cost_breakdown: Some(breakdown),
        }
    }

    pub fn get_stats_cached(&self) -> Result<StatsSnapshotDto> {
        let now = Instant::now();
        {
            let cache = self.cache.lock().unwrap();
            if let Some((ref snapshot, ref ts)) = *cache {
                if now.duration_since(*ts) < self.cache_ttl {
                    self.cache_hits.fetch_add(1, Ordering::Relaxed);
                    return Ok(snapshot.clone());
                }
            }
        }

        let snapshot = self.build_stats_snapshot_dto()?;

        {
            let mut cache = self.cache.lock().unwrap();
            *cache = Some((snapshot.clone(), now));
        }

        Ok(snapshot)
    }

    fn build_stats_snapshot_dto(&self) -> Result<StatsSnapshotDto> {
        let dto = self.get_stats_dto();
        Ok(StatsSnapshotDto {
            five_min_tokens: dto.five_min_tokens,
            today_tokens: dto.today_tokens,
            total_tokens: dto.total_tokens,
            current_model: dto.current_model,
            estimated_cost: dto.estimated_cost,
            cost_currency: dto.cost_currency,
            cost_breakdown: dto.cost_breakdown,
        })
    }

    fn estimate_cost(
        &self,
        last_event: Option<&crate::domain::entity::TokenEvent>,
        total_tokens: u64,
        summaries: &[crate::domain::entity::ModelSummary],
    ) -> (String, String, CostBreakdown) {
        let currency = if self.currency == "CNY" || self.currency == "¥" || self.currency == "RMB"
        {
            "CNY"
        } else {
            "USD"
        };

        let fmt = |usd: f64| -> String {
            if currency == "CNY" {
                format!("¥{:.2}", usd * self.usd_to_cny)
            } else {
                format!("${:.2}", usd)
            }
        };

        if !summaries.is_empty() {
            let mut input_usd = 0.0;
            let mut output_usd = 0.0;
            let mut cache_usd = 0.0;
            let mut reasoning_usd = 0.0;
            let pm = 1_000_000.0;

            for summary in summaries {
                if let Some(p) = self.lookup_price(&summary.raw_model, &summary.model) {
                    let non_cached_input =
                        summary.prompt_tokens.saturating_sub(summary.cached_tokens);
                    let standard_output = summary
                        .completion_tokens
                        .saturating_sub(summary.reasoning_tokens);

                    input_usd += non_cached_input as f64 * p.input / pm;
                    output_usd += standard_output as f64 * p.output / pm;
                    cache_usd += summary.cached_tokens as f64 * p.cache_read / pm;
                    reasoning_usd += summary.reasoning_tokens as f64 * p.reasoning / pm;
                } else {
                    input_usd += summary.total_tokens as f64 * DEFAULT_PRICE_PER_1M / pm;
                }
            }

            let total_usd = input_usd + output_usd + cache_usd + reasoning_usd;
            return (
                fmt(total_usd),
                currency.to_string(),
                CostBreakdown {
                    total: fmt(total_usd),
                    input_cost: fmt(input_usd),
                    output_cost: fmt(output_usd),
                    cache_cost: fmt(cache_usd),
                    reasoning_cost: fmt(reasoning_usd),
                    currency: currency.to_string(),
                },
            );
        }

        let price = last_event.and_then(|e| self.lookup_price(&e.raw_model, &e.model));

        if let Some(ref p) = price {
            // Use per-model pricing with token-type breakdown.
            // cached_tokens ⊆ prompt_tokens, reasoning_tokens ⊆ completion_tokens.
            // Subtract subsets to avoid double-counting.
            let event = last_event.unwrap();
            let pm = 1_000_000.0;

            let non_cached_input = event.prompt_tokens.saturating_sub(event.cached_tokens);
            let standard_output = event
                .completion_tokens
                .saturating_sub(event.reasoning_tokens);

            let input_usd = non_cached_input as f64 * p.input / pm;
            let output_usd = standard_output as f64 * p.output / pm;
            let cache_usd = event.cached_tokens as f64 * p.cache_read / pm;
            let reasoning_usd = event.reasoning_tokens as f64 * p.reasoning / pm;
            let total_usd = input_usd + output_usd + cache_usd + reasoning_usd;

            (
                fmt(total_usd),
                currency.to_string(),
                CostBreakdown {
                    total: fmt(total_usd),
                    input_cost: fmt(input_usd),
                    output_cost: fmt(output_usd),
                    cache_cost: fmt(cache_usd),
                    reasoning_cost: fmt(reasoning_usd),
                    currency: currency.to_string(),
                },
            )
        } else {
            // Fallback: generic rate
            let cost_usd = total_tokens as f64 * DEFAULT_PRICE_PER_1M / 1_000_000.0;
            let total_str = if currency == "CNY" {
                format!("¥{:.2}", cost_usd * self.usd_to_cny)
            } else {
                format!("${:.2}", cost_usd)
            };
            let zero = if currency == "CNY" {
                "¥0.00".to_string()
            } else {
                "$0.00".to_string()
            };

            (
                total_str.clone(),
                currency.to_string(),
                CostBreakdown {
                    total: total_str,
                    input_cost: zero.clone(),
                    output_cost: zero.clone(),
                    cache_cost: zero.clone(),
                    reasoning_cost: zero,
                    currency: currency.to_string(),
                },
            )
        }
    }

    /// Look up a model price by trying raw_model first (with date-suffix stripping),
    /// then falling back to the normalized model name.
    fn lookup_price(&self, raw_model: &str, normalized_model: &str) -> Option<ModelPrice> {
        // Try raw_model first (exact, then iterative date-suffix stripping)
        if let Some(p) = self.try_match(raw_model) {
            return Some(p);
        }
        // Fall back to normalized model
        if normalized_model != raw_model {
            if let Some(p) = self.try_match(normalized_model) {
                return Some(p);
            }
        }
        None
    }

    /// Try exact match, then iteratively strip trailing dash-segments
    /// (e.g., "gpt-4-turbo-2024-04-09" → "gpt-4-turbo-2024-04" → "gpt-4-turbo")
    fn try_match(&self, name: &str) -> Option<ModelPrice> {
        let mut candidate = name.to_string();
        loop {
            if let Some(p) = self.model_prices.get(&candidate) {
                return Some(p.clone());
            }
            match candidate.rfind('-') {
                Some(pos) if pos > 0 => {
                    candidate.truncate(pos);
                }
                _ => break,
            }
        }
        None
    }

    pub fn get_model_summaries(&self) -> Vec<crate::domain::entity::ModelSummary> {
        self.repository
            .model_usage_summary(None)
            .unwrap_or_default()
    }

    pub fn get_model_summaries_with_filter(
        &self,
        since_ts: Option<f64>,
    ) -> Vec<crate::domain::entity::ModelSummary> {
        self.repository
            .model_usage_summary(since_ts)
            .unwrap_or_default()
    }

    pub fn export_csv(&self, path: &str) -> Result<u64, anyhow::Error> {
        self.repository.export_to_csv(path)
    }

    pub fn repository(&self) -> &R {
        &self.repository
    }

    pub fn replace_repository(&mut self, new_repository: R) {
        self.repository = new_repository;
        if let Ok(new_snapshot) = self.repository.snapshot() {
            if let Ok(mut snapshot) = self.snapshot.lock() {
                *snapshot = new_snapshot;
            }
        }
        let mut cache = self.cache.lock().unwrap();
        *cache = None;
    }

    pub fn get_cache_hits(&self) -> u64 {
        self.cache_hits.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entity::{HourlyStat, ModelSummary, StatsSnapshot, TokenEvent, TokenUsage};
    use anyhow::Result;
    use std::sync::{Arc, Mutex};

    #[derive(Clone)]
    struct MockRepository {
        snapshot: Arc<Mutex<StatsSnapshot>>,
        summaries: Arc<Mutex<Vec<ModelSummary>>>,
    }

    impl MockRepository {
        fn new(total_tokens: u64) -> Self {
            Self {
                snapshot: Arc::new(Mutex::new(StatsSnapshot {
                    five_min_tokens: total_tokens / 10,
                    total_tokens,
                    today_tokens: total_tokens / 2,
                    last_event: Some(TokenEvent {
                        id: 1,
                        ts: 1705312800.0,
                        provider: "openai".to_string(),
                        raw_model: "gpt-4o".to_string(),
                        model: "gpt-4o".to_string(),
                        prompt_tokens: 1000,
                        completion_tokens: 500,
                        total_tokens: 1500,
                        cached_tokens: 0,
                        reasoning_tokens: 0,
                        latency_ms: None,
                        source: None,
                    }),
                })),
                summaries: Arc::new(Mutex::new(vec![])),
            }
        }

        fn with_summaries(total_tokens: u64, summaries: Vec<ModelSummary>) -> Self {
            let repo = Self::new(total_tokens);
            *repo.summaries.lock().unwrap() = summaries;
            repo
        }
    }

    impl TokenRepository for MockRepository {
        fn record(&self, _usage: &TokenUsage) -> Result<()> {
            Ok(())
        }

        fn snapshot(&self) -> Result<StatsSnapshot> {
            Ok(self.snapshot.lock().unwrap().clone())
        }

        fn model_usage_summary(&self, _since_ts: Option<f64>) -> Result<Vec<ModelSummary>> {
            Ok(self.summaries.lock().unwrap().clone())
        }

        fn hourly_stats(&self, _since_ts: Option<f64>) -> Result<Vec<HourlyStat>> {
            Ok(vec![])
        }

        fn providers(&self) -> Result<Vec<String>> {
            Ok(vec![])
        }

        fn clear(&self) -> Result<()> {
            Ok(())
        }

        fn clear_old_data(&self, _days: u32) -> Result<u64> {
            Ok(0)
        }

        fn export_to_csv(&self, _path: &str) -> Result<u64> {
            Ok(0)
        }

        fn request_logs(
            &self,
            _limit: u32,
            _offset: u32,
        ) -> Result<Vec<crate::domain::entity::RequestLog>> {
            Ok(vec![])
        }

        fn monthly_usage(&self) -> Result<u64> {
            Ok(0)
        }

        fn source_summary(&self) -> Result<Vec<crate::domain::entity::SourceSummary>> {
            Ok(vec![])
        }
    }

    #[test]
    fn test_estimate_cost_usd() {
        let repo = MockRepository::new(1000000);
        let usecase = StatsUsecase::new(repo, "USD".to_string(), 7.25, HashMap::new());
        let dto = usecase.get_stats_dto();

        assert_eq!(dto.cost_currency, "USD");
        assert!(dto.estimated_cost.contains("$3.00"));
    }

    #[test]
    fn test_estimate_cost_cny() {
        let repo = MockRepository::new(1000000);
        let usecase = StatsUsecase::new(repo, "CNY".to_string(), 7.25, HashMap::new());
        let dto = usecase.get_stats_dto();

        assert_eq!(dto.cost_currency, "CNY");
        assert!(dto.estimated_cost.contains("¥21.75"));
    }

    #[test]
    fn test_estimate_cost_zero_tokens() {
        let repo = MockRepository::new(0);
        let usecase = StatsUsecase::new(repo, "USD".to_string(), 7.25, HashMap::new());
        let dto = usecase.get_stats_dto();

        assert_eq!(dto.cost_currency, "USD");
        assert!(dto.estimated_cost.contains("$0.00"));
    }

    #[test]
    fn test_estimate_cost_uses_model_breakdown_not_last_event() {
        let repo = MockRepository::with_summaries(
            3_000_000,
            vec![
                ModelSummary {
                    model: "cheap".to_string(),
                    raw_model: "cheap".to_string(),
                    provider: "test".to_string(),
                    source: "proxy".to_string(),
                    calls: 1,
                    prompt_tokens: 1_000_000,
                    completion_tokens: 0,
                    total_tokens: 1_000_000,
                    cached_tokens: 0,
                    reasoning_tokens: 0,
                },
                ModelSummary {
                    model: "expensive".to_string(),
                    raw_model: "expensive".to_string(),
                    provider: "test".to_string(),
                    source: "proxy".to_string(),
                    calls: 1,
                    prompt_tokens: 0,
                    completion_tokens: 2_000_000,
                    total_tokens: 2_000_000,
                    cached_tokens: 0,
                    reasoning_tokens: 0,
                },
            ],
        );
        let mut prices = HashMap::new();
        prices.insert(
            "cheap".to_string(),
            ModelPrice {
                input: 1.0,
                output: 1.0,
                cache_read: 0.0,
                reasoning: 0.0,
            },
        );
        prices.insert(
            "expensive".to_string(),
            ModelPrice {
                input: 10.0,
                output: 20.0,
                cache_read: 0.0,
                reasoning: 0.0,
            },
        );

        let usecase = StatsUsecase::new(repo, "USD".to_string(), 7.25, prices);
        let dto = usecase.get_stats_dto();

        assert_eq!(dto.estimated_cost, "$41.00");
    }
}
