export interface HourlyDataPoint {
  hour: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
}

export interface ModelStat {
  model: string;
  raw_model: string;
  provider: string;
  source: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
}

export interface SourceSummary {
  source: string;
  calls: number;
  total_tokens: number;
}

export interface CostBreakdown {
  total: string;
  input_cost: string;
  output_cost: string;
  cache_cost: string;
  reasoning_cost: string;
  currency: string;
}

export interface StatsDto {
  five_min_tokens: number;
  today_tokens: number;
  total_tokens: number;
  current_model: string;
  estimated_cost: string;
  cost_currency: string;
  cost_breakdown?: CostBreakdown;
}

export interface ProviderConfig {
  name: string;
  base_url: string;
  api_key: string;
  weight: number;
}

export interface ModelPrice {
  input: number;
  output: number;
  cache_read: number;
  reasoning: number;
}

export interface PriceInfoDto {
  model_count: number;
  last_fetched: number | null;
}

export interface AlertRule {
  id: string;
  name: string;
  type: 'model' | 'time_window' | 'cost';
  enabled: boolean;
  threshold: number;
  model?: string;
  window_minutes?: number;
}

export interface AppSettings {
  proxy_host: string;
  proxy_port: number;
  alert_threshold_5m: number;
  opacity: number;
  theme: string;
  always_on_top: boolean;
  lock_position: boolean;
  show_on_start: boolean;
  window_x: number;
  window_y: number;
  currency: string;
  usd_to_cny: number;
  floating_width: number;
  floating_height: number;
  enable_notifications: boolean;
  data_retention_days: number;
  auto_cleanup: boolean;
  retention_days: number;
  model_prices: Record<string, ModelPrice>;
  providers: ProviderConfig[];
  config_version: number;
  debug_log: boolean;
  mock_mode: boolean;
  budget_enabled: boolean;
  budget_monthly_limit: number;
  budget_alert_threshold: number;
  counting_mode: string;
  alert_rules: AlertRule[];
}

export interface DiagnosticsData {
  db_size_bytes: number;
  db_row_count: number;
  db_last_event_time: string | null;
  proxy_uptime_secs: number;
  proxy_total_requests: number;
  proxy_active_connections: number;
  proxy_error_rate_pct: number;
  config_file_exists: boolean;
  config_file_path: string;
  config_port_valid: boolean;
  config_api_key_configured: boolean;
}

export interface ToastMessage {
  id: number;
  text: string;
  type: 'info' | 'warning';
  duration: number;
}

export interface FloatingData {
  today_tokens: number;
  five_min: number;
  total_tokens: number;
  sparkline: number[];
}

export interface ScanHistory {
  id: number;
  platform: string;
  files_scanned: number;
  records_found: number;
  records_new: number;
  scanned_at: string;
}

export interface ScanResult {
  platform: string;
  display_name: string;
  files_scanned: number;
  records_found: number;
  records_new: number;
}
