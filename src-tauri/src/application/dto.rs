#[derive(Debug, Clone, serde::Serialize)]
pub struct CostBreakdown {
    pub total: String,
    pub input_cost: String,
    pub output_cost: String,
    pub cache_cost: String,
    pub reasoning_cost: String,
    pub currency: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PriceInfoDto {
    pub model_count: usize,
    pub last_fetched: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StatsDto {
    pub five_min_tokens: u64,
    pub today_tokens: u64,
    pub total_tokens: u64,
    pub current_model: String,
    pub estimated_cost: String,
    pub cost_currency: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_breakdown: Option<CostBreakdown>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiagnosticsDto {
    pub db_size_bytes: u64,
    pub db_row_count: u64,
    pub db_last_event_time: Option<String>,
    pub proxy_uptime_secs: u64,
    pub proxy_total_requests: u64,
    pub proxy_active_connections: u32,
    pub proxy_error_rate_pct: f64,
    pub config_file_exists: bool,
    pub config_file_path: String,
    pub config_port_valid: bool,
    pub config_api_key_configured: bool,
}

#[derive(Debug, Clone)]
pub struct StatsSnapshotDto {
    pub five_min_tokens: u64,
    pub today_tokens: u64,
    pub total_tokens: u64,
    pub current_model: String,
    pub estimated_cost: String,
    pub cost_currency: String,
    pub cost_breakdown: Option<CostBreakdown>,
}

impl Default for StatsDto {
    fn default() -> Self {
        Self {
            five_min_tokens: 0,
            today_tokens: 0,
            total_tokens: 0,
            current_model: "无".to_string(),
            estimated_cost: "$0.00".to_string(),
            cost_currency: "USD".to_string(),
            cost_breakdown: None,
        }
    }
}
