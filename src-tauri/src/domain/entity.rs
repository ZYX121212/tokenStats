use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Token 使用事件（输入用）
///
/// 用于接收和传递单次 LLM 调用的 token 使用数据。
#[derive(Debug, Clone)]
pub struct TokenUsage {
    pub provider: String,
    pub raw_model: String,
    pub model: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    pub latency_ms: Option<u64>,
    pub source: Option<String>,
    pub original_ts: Option<f64>,
}

/// Token 使用事件（持久化用）
///
/// 包含数据库主键和时间戳的完整记录。
#[derive(Debug, Clone)]
pub struct TokenEvent {
    pub id: i64,
    pub ts: f64,
    pub provider: String,
    pub raw_model: String,
    pub model: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    pub latency_ms: Option<u64>,
    pub source: Option<String>,
}

/// 请求日志条目
///
/// 用于展示详细的 API 请求记录。
#[derive(Debug, Clone, Serialize)]
pub struct RequestLog {
    pub id: i64,
    pub ts: String,
    pub provider: String,
    pub model: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    pub latency_ms: Option<u64>,
}

/// 统计快照
///
/// 包含不同时间维度的 token 使用总量和最近一次事件。
#[derive(Debug, Clone)]
pub struct StatsSnapshot {
    pub five_min_tokens: u64,
    pub total_tokens: u64,
    pub today_tokens: u64,
    pub last_event: Option<TokenEvent>,
}

/// 模型使用量汇总
///
/// 按模型维度聚合的统计数据。
#[derive(Debug, Clone, Serialize)]
pub struct ModelSummary {
    pub model: String,
    pub raw_model: String,
    pub provider: String,
    pub source: String,
    pub calls: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
}

/// 来源分布汇总
#[derive(Debug, Clone, Serialize)]
pub struct SourceSummary {
    pub source: String,
    pub calls: u64,
    pub total_tokens: u64,
}

/// 按小时统计
///
/// 用于时间序列图表展示。
#[derive(Debug, Clone, Serialize)]
pub struct HourlyStat {
    pub hour: String,
    pub calls: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
}

/// 扫描历史记录
#[derive(Debug, Clone, Serialize)]
pub struct ScanHistory {
    pub id: i64,
    pub platform: String,
    pub files_scanned: u32,
    pub records_found: u32,
    pub records_new: u32,
    pub scanned_at: String,
}

/// 扫描结果DTO
#[derive(Debug, Clone, Serialize)]
pub struct ScanResultDto {
    pub platform: String,
    pub display_name: String,
    pub files_scanned: u32,
    pub records_found: u32,
    pub records_new: u32,
}

/// Provider 配置信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    #[serde(default = "default_weight")]
    pub weight: u32,
}

fn default_weight() -> u32 {
    1
}

/// 模型价格配置（每百万 token 的 USD 价格）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPrice {
    pub input: f64,
    pub output: f64,
    #[serde(default)]
    pub cache_read: f64,
    #[serde(default)]
    pub reasoning: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub alert_type: String,
    pub enabled: bool,
    pub threshold: u64,
    pub model: Option<String>,
    pub window_minutes: Option<u32>,
}

/// 应用全局设置
///
/// 包含代理服务器、UI 显示、通知、数据保留等所有可配置项。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub proxy_host: String,
    pub proxy_port: u16,
    pub alert_threshold_5m: u64,
    pub opacity: f64,
    pub theme: String,
    pub always_on_top: bool,
    pub lock_position: bool,
    pub show_on_start: bool,
    pub window_x: i32,
    pub window_y: i32,
    pub currency: String,
    pub usd_to_cny: f64,
    pub floating_width: u32,
    pub floating_height: u32,
    pub enable_notifications: bool,
    pub data_retention_days: u32,
    pub auto_cleanup: bool,
    pub retention_days: u32,
    pub model_prices: HashMap<String, ModelPrice>,
    pub providers: Vec<ProviderConfig>,
    pub config_version: u32,
    #[serde(default)]
    pub debug_log: bool,
    #[serde(default)]
    pub mock_mode: bool,
    #[serde(default)]
    pub budget_enabled: bool,
    #[serde(default = "default_budget_limit")]
    pub budget_monthly_limit: u64,
    #[serde(default = "default_budget_alert")]
    pub budget_alert_threshold: u64,
    #[serde(default = "default_counting_mode")]
    pub counting_mode: String,
    #[serde(default)]
    pub alert_rules: Vec<AlertRule>,
}

fn default_budget_limit() -> u64 {
    10000000
}

fn default_budget_alert() -> u64 {
    80
}

fn default_counting_mode() -> String {
    "ai_tools".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            proxy_host: "127.0.0.1".to_string(),
            proxy_port: 8765,
            alert_threshold_5m: 20000,
            opacity: 0.48,
            theme: "dark".to_string(),
            always_on_top: true,
            lock_position: false,
            show_on_start: true,
            window_x: 40,
            window_y: 80,
            currency: "USD".to_string(),
            usd_to_cny: 7.25,
            floating_width: 320,
            floating_height: 140,
            enable_notifications: true,
            data_retention_days: 365,
            auto_cleanup: true,
            retention_days: 30,
            model_prices: HashMap::new(),
            providers: vec![],
            config_version: 1,
            debug_log: false,
            mock_mode: false,
            budget_enabled: false,
            budget_monthly_limit: 10000000,
            budget_alert_threshold: 80,
            counting_mode: "ai_tools".to_string(),
            alert_rules: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = AppSettings::default();
        assert_eq!(settings.proxy_host, "127.0.0.1");
        assert_eq!(settings.proxy_port, 8765);
        assert_eq!(settings.alert_threshold_5m, 20000);
        assert!(settings.always_on_top);
        assert!(settings.show_on_start);
        assert!(!settings.lock_position);
    }

    #[test]
    fn test_settings_serialization_roundtrip() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.proxy_host, settings.proxy_host);
        assert_eq!(deserialized.proxy_port, settings.proxy_port);
        assert_eq!(deserialized.model_prices.len(), 0);
        assert_eq!(deserialized.providers.len(), 0);
    }

    #[test]
    fn test_model_summary_serialize() {
        let summary = ModelSummary {
            model: "gpt-4o".to_string(),
            raw_model: "gpt-4o".to_string(),
            provider: "openai".to_string(),
            source: "proxy".to_string(),
            calls: 42,
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
            cached_tokens: 0,
            reasoning_tokens: 0,
        };
        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("gpt-4o"));
        assert!(json.contains("42"));
    }

    #[test]
    fn test_hourly_stat_serialize() {
        let stat = HourlyStat {
            hour: "2024-01-15T10:00".to_string(),
            calls: 5,
            prompt_tokens: 2000,
            completion_tokens: 800,
            total_tokens: 2800,
            cached_tokens: 0,
            reasoning_tokens: 0,
        };
        let json = serde_json::to_string(&stat).unwrap();
        assert!(json.contains("2024-01-15T10:00"));
    }
}
