import { invoke } from "@tauri-apps/api/core";
import type {
  StatsDto,
  ModelStat,
  AppSettings,
  HourlyDataPoint,
  DiagnosticsData,
  ScanHistory,
  ScanResult,
  SourceSummary,
} from "../../types";

type RequestLogDto = {
  id: number;
  ts: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  latency_ms: number | null;
};

const now = Date.now();

const previewStats: StatsDto = {
  five_min_tokens: 18420,
  today_tokens: 386240,
  total_tokens: 12864200,
  current_model: "claude-sonnet-4",
  estimated_cost: "$27.84",
  cost_currency: "USD",
  cost_breakdown: {
    total: "$27.84",
    input_cost: "$8.92",
    output_cost: "$17.48",
    cache_cost: "$0.46",
    reasoning_cost: "$0.98",
    currency: "USD",
  },
};

const previewModels: ModelStat[] = [
  {
    model: "claude-sonnet-4",
    raw_model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    source: "claude-code",
    calls: 142,
    prompt_tokens: 2154000,
    completion_tokens: 738000,
    total_tokens: 2892000,
    cached_tokens: 412000,
    reasoning_tokens: 62000,
  },
  {
    model: "gpt-4.1",
    raw_model: "gpt-4.1",
    provider: "openai",
    source: "proxy",
    calls: 86,
    prompt_tokens: 1380000,
    completion_tokens: 492000,
    total_tokens: 1872000,
    cached_tokens: 188000,
    reasoning_tokens: 0,
  },
  {
    model: "deepseek-chat",
    raw_model: "deepseek-chat",
    provider: "deepseek",
    source: "codex-cli",
    calls: 64,
    prompt_tokens: 940000,
    completion_tokens: 326000,
    total_tokens: 1266000,
    cached_tokens: 0,
    reasoning_tokens: 0,
  },
];

const previewHourly: HourlyDataPoint[] = Array.from({ length: 24 }, (_, index) => {
  const hour = new Date(now - (23 - index) * 3600_000);
  const prompt = 4200 + index * 520 + (index % 5) * 1800;
  const completion = 1800 + index * 260 + (index % 4) * 900;
  return {
    hour: hour.toISOString().slice(0, 13).replace("T", " ") + ":00:00",
    calls: 8 + (index % 7) * 3,
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    cached_tokens: index % 3 === 0 ? Math.round(prompt * 0.18) : 0,
    reasoning_tokens: index % 6 === 0 ? Math.round(completion * 0.12) : 0,
  };
});

const previewSources: SourceSummary[] = [
  { source: "claude-code", calls: 142, total_tokens: 2892000 },
  { source: "proxy", calls: 86, total_tokens: 1872000 },
  { source: "codex-cli", calls: 64, total_tokens: 1266000 },
];

const previewSettings: AppSettings = {
  proxy_host: "127.0.0.1",
  proxy_port: 8765,
  alert_threshold_5m: 20000,
  opacity: 0.48,
  theme: "dark",
  always_on_top: true,
  lock_position: false,
  show_on_start: true,
  window_x: 40,
  window_y: 80,
  currency: "USD",
  usd_to_cny: 7.25,
  floating_width: 320,
  floating_height: 140,
  enable_notifications: true,
  data_retention_days: 365,
  auto_cleanup: true,
  retention_days: 30,
  model_prices: {},
  providers: [
    { name: "openai", base_url: "https://api.openai.com/v1", api_key: "", weight: 1 },
  ],
  config_version: 1,
  debug_log: false,
  mock_mode: false,
  budget_enabled: true,
  budget_monthly_limit: 10_000_000,
  budget_alert_threshold: 80,
  counting_mode: "all",
  alert_rules: [],
};

const previewDiagnostics: DiagnosticsData = {
  db_size_bytes: 2_842_624,
  db_row_count: 292,
  db_last_event_time: new Date(now - 180_000).toISOString(),
  proxy_uptime_secs: 42_360,
  proxy_total_requests: 292,
  proxy_active_connections: 2,
  proxy_error_rate_pct: 0.4,
  config_file_exists: true,
  config_file_path: "~/.tokenstats/config.json",
  config_port_valid: true,
  config_api_key_configured: false,
};

const previewLogs: RequestLogDto[] = previewHourly
  .slice(-12)
  .reverse()
  .map((point, index) => ({
    id: index + 1,
    ts: new Date(now - index * 420_000).toISOString(),
    provider: previewModels[index % previewModels.length].provider,
    model: previewModels[index % previewModels.length].model,
    prompt_tokens: point.prompt_tokens,
    completion_tokens: point.completion_tokens,
    total_tokens: point.total_tokens,
    cached_tokens: point.cached_tokens,
    reasoning_tokens: point.reasoning_tokens,
    latency_ms: 420 + (index % 5) * 360,
  }));

function isTauriRuntime(): boolean {
  const target = globalThis as typeof globalThis & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(target.__TAURI_INTERNALS__ || target.__TAURI__);
}

function previewValue<T>(value: T): T {
  if (value === undefined) return value;
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function usePreviewData(): boolean {
  return import.meta.env.DEV && !isTauriRuntime();
}

export function isPreviewMode(): boolean {
  return usePreviewData();
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
  fallback?: T,
): Promise<T> {
  if (usePreviewData() && arguments.length >= 3) {
    return previewValue(fallback);
  }
  return invoke<T>(command, args);
}

export async function getStats(): Promise<StatsDto> {
  return call<StatsDto>("get_stats", undefined, previewStats);
}

export async function getModels(): Promise<ModelStat[]> {
  return call<ModelStat[]>("get_models", undefined, previewModels);
}

export async function getModelsSince(hours?: number): Promise<ModelStat[]> {
  return call<ModelStat[]>("get_models_since", { hours }, previewModels);
}

export async function getSettings(): Promise<AppSettings> {
  return call<AppSettings>("get_settings", undefined, previewSettings);
}

export async function saveSettings(
  settings: Partial<AppSettings>,
): Promise<void> {
  return call<void>("save_settings", { settings }, undefined);
}

export async function clearAllData(): Promise<string> {
  return call<string>("clear_all_data", undefined, "预览模式不会清空真实数据");
}

export async function cleanupOldData(days: number): Promise<number> {
  return call<number>("cleanup_old_data", { days }, 0);
}

export async function exportCsv(): Promise<string> {
  return call<string>("export_csv", undefined, "预览模式未生成 CSV 文件");
}

export async function getHourlyStats(
  hours?: number,
): Promise<HourlyDataPoint[]> {
  return call<HourlyDataPoint[]>("get_hourly_stats", { hours }, previewHourly);
}

export async function getProviders(): Promise<string[]> {
  return call<string[]>("get_providers", undefined, ["anthropic", "openai", "deepseek"]);
}

export async function getRequestLogs(
  limit?: number,
  offset?: number,
): Promise<any[]> {
  return call<RequestLogDto[]>("get_request_logs", { limit, offset }, previewLogs);
}

export async function getMonthlyUsage(): Promise<number> {
  return call<number>("get_monthly_usage", undefined, previewStats.today_tokens * 12);
}

export async function showMainWindow(tab?: string): Promise<void> {
  if (usePreviewData()) return;
  try {
    return await invoke("show_main_window", { tab });
  } catch (err) {
    console.error("[api] showMainWindow error:", err);
    throw err;
  }
}

export async function getDiagnostics(): Promise<DiagnosticsData> {
  return call<DiagnosticsData>("get_diagnostics", undefined, previewDiagnostics);
}

export async function checkDbIntegrity(): Promise<string> {
  return call<string>("check_db_integrity", undefined, "ok");
}

export async function startDrag(): Promise<void> {
  return call<void>("start_drag", undefined, undefined);
}

export async function refreshPrices(): Promise<number> {
  return call<number>("refresh_prices", undefined, 3);
}

export async function getPriceInfo(): Promise<{
  model_count: number;
  last_fetched: number | null;
}> {
  return call("get_price_info", undefined, {
    model_count: 3,
    last_fetched: Math.floor(now / 1000),
  });
}

export async function scanAllPlatforms(): Promise<ScanResult[]> {
  return call<ScanResult[]>("scan_all_platforms", undefined, [
    {
      platform: "claude-code",
      display_name: "Claude Code",
      files_scanned: 18,
      records_found: 142,
      records_new: 0,
    },
  ]);
}

export async function getScanHistory(): Promise<ScanHistory[]> {
  return call<ScanHistory[]>("get_scan_history", undefined, [
    {
      id: 1,
      platform: "claude-code",
      files_scanned: 18,
      records_found: 142,
      records_new: 0,
      scanned_at: new Date(now - 900_000).toISOString(),
    },
  ]);
}

export async function getSourceSummary(): Promise<SourceSummary[]> {
  return call<SourceSummary[]>("get_source_summary", undefined, previewSources);
}
