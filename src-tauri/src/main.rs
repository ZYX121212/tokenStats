//! TokenStats Tauri Application
//!
//! 主入口文件，负责初始化应用状态、配置、数据库、代理服务器和 Tauri 窗口。

mod application;
mod domain;
mod infrastructure;

use std::sync::{Arc, Mutex};

use tauri::Emitter;
use tauri::Listener;
use tauri::Manager;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    WebviewWindow,
};

use application::dto::DiagnosticsDto;
use application::port::ConfigPort;
use application::usecase::StatsUsecase;
use domain::entity::AppSettings;
use domain::repository::TokenRepository;
use infrastructure::config::file_config::FileConfigProvider;
use infrastructure::litellm::LiteLLMPriceFetcher;
use infrastructure::persistence::sqlite_store::SqliteTokenStore;
use infrastructure::proxy::http_proxy::{run_proxy, ProxyServer};
use infrastructure::scanner::adapters::claude_code::ClaudeCodeScanner;
use infrastructure::scanner::adapters::codex::CodexScanner;
use infrastructure::scanner::auto_scanner::AutoScanner;
use infrastructure::scanner::orchestrator::{process_scan_results, ScanOrchestrator};

pub struct AppState {
    pub usecase: Mutex<StatsUsecase<SqliteTokenStore>>,
    pub settings: Mutex<AppSettings>,
    pub proxy_server: Mutex<Option<Arc<ProxyServer<SqliteTokenStore>>>>,
    pub price_fetcher: LiteLLMPriceFetcher,
}

#[tauri::command]
fn get_stats(state: tauri::State<'_, AppState>) -> Result<application::dto::StatsDto, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let dto = usecase.get_stats_dto();
    tracing::info!(
        "get_stats: total={} today={} five_min={} model={} cost={}",
        dto.total_tokens,
        dto.today_tokens,
        dto.five_min_tokens,
        dto.current_model,
        dto.estimated_cost
    );
    Ok(dto)
}

#[tauri::command]
fn get_models(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<domain::entity::ModelSummary>, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    Ok(usecase.get_model_summaries())
}

#[tauri::command]
fn get_models_since(
    state: tauri::State<'_, AppState>,
    hours: Option<u32>,
) -> Result<Vec<domain::entity::ModelSummary>, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let since_ts = hours.map(|h| chrono::Local::now().timestamp() as f64 - (h as f64 * 3600.0));
    Ok(usecase.get_model_summaries_with_filter(since_ts))
}

#[tauri::command]
fn refresh_data(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase.refresh();
    Ok(())
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
fn save_settings(state: tauri::State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    let mut s = state.settings.lock().map_err(|e| e.to_string())?;
    *s = settings.clone();
    let config_path = FileConfigProvider::default_path().map_err(|e| e.to_string())?;
    let provider = FileConfigProvider::new(&config_path.to_string_lossy());
    provider.save(&settings).map_err(|e| e.to_string())?;

    // Update usecase so cost estimates reflect currency/rate/price changes immediately
    if let Ok(mut usecase) = state.usecase.lock() {
        usecase.update_settings(&settings);
    }

    Ok(())
}

#[tauri::command]
async fn show_main_window(app: tauri::AppHandle, tab: Option<String>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }

    if let Some(ref tab_name) = tab {
        app.emit("tab-switch", tab_name)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn export_csv(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("tokenstats_{}.csv", timestamp);
    let path = dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default())
        .join(&filename);

    match usecase.export_csv(path.to_str().unwrap_or("export.csv")) {
        Ok(count) => Ok(format!("已导出 {} 条记录到 {}", count, path.display())),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_hourly_stats(
    state: tauri::State<'_, AppState>,
    hours: Option<u32>,
) -> Result<Vec<domain::entity::HourlyStat>, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let since_ts = hours.map(|h| chrono::Local::now().timestamp() as f64 - (h as f64 * 3600.0));
    usecase
        .repository()
        .hourly_stats(since_ts)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_providers(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase.repository().providers().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_request_logs(
    state: tauri::State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<domain::entity::RequestLog>, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase
        .repository()
        .request_logs(limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_monthly_usage(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase
        .repository()
        .monthly_usage()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_all_data(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    match usecase.repository().clear() {
        Ok(()) => Ok("已清空全部统计数据".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_diagnostics(state: tauri::State<'_, AppState>) -> Result<DiagnosticsDto, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let settings = state.settings.lock().map_err(|e| e.to_string())?;

    let db_path = FileConfigProvider::default_db_path().map_err(|e| e.to_string())?;
    let db_size = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    let snapshot = usecase.repository().snapshot().map_err(|e| e.to_string())?;
    let row_count = usecase
        .repository()
        .model_usage_summary(None)
        .map(|models| models.iter().map(|m| m.calls).sum::<u64>())
        .unwrap_or(0);
    let last_event_time = snapshot.last_event.map(|e| {
        chrono::DateTime::from_timestamp(e.ts as i64, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| e.ts.to_string())
    });

    let config_path = FileConfigProvider::default_path().map_err(|e| e.to_string())?;
    let config_file_exists = config_path.exists();
    let config_file_path = config_path.display().to_string();

    let port_valid = settings.proxy_port >= 1;
    let api_key_configured = settings.providers.iter().any(|p| !p.api_key.is_empty());

    // Read real-time proxy metrics from the shared ProxyServer handle.
    let (proxy_uptime_secs, proxy_total_requests, proxy_active_connections, proxy_error_rate_pct) = {
        let lock = state.proxy_server.lock().map_err(|e| e.to_string())?;
        lock.as_ref()
            .map(|server| {
                (
                    server.uptime_secs(),
                    server.total_requests(),
                    server.active_connections() as u32,
                    server.error_rate_pct(),
                )
            })
            .unwrap_or((0, 0, 0, 0.0))
    };

    Ok(DiagnosticsDto {
        db_size_bytes: db_size,
        db_row_count: row_count,
        db_last_event_time: last_event_time,
        proxy_uptime_secs,
        proxy_total_requests,
        proxy_active_connections,
        proxy_error_rate_pct,
        config_file_exists,
        config_file_path,
        config_port_valid: port_valid,
        config_api_key_configured: api_key_configured,
    })
}

#[tauri::command]
fn cleanup_old_data(state: tauri::State<'_, AppState>, days: u32) -> Result<u32, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase
        .repository()
        .cleanup_old_events(days)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn backup_db(state: tauri::State<'_, AppState>, path: Option<String>) -> Result<String, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let backup_path = if let Some(backup_path_str) = path {
        std::path::PathBuf::from(backup_path_str)
    } else {
        SqliteTokenStore::default_backup_path().map_err(|e| e.to_string())?
    };
    usecase
        .repository()
        .backup(&backup_path)
        .map_err(|e| e.to_string())?;
    Ok(format!("备份已保存到: {}", backup_path.display()))
}

#[tauri::command]
fn restore_db(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
    let source = std::path::PathBuf::from(&path);
    if !source.exists() {
        return Err(format!("备份文件不存在: {}", path));
    }

    let db_path = FileConfigProvider::default_db_path().map_err(|e| e.to_string())?;

    {
        let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
        usecase
            .repository()
            .wal_checkpoint()
            .map_err(|e| e.to_string())?;
    }

    std::fs::copy(&source, &db_path).map_err(|e| e.to_string())?;

    let new_store = SqliteTokenStore::new(&db_path.to_string_lossy())
        .map_err(|e| format!("恢复后重新打开数据库失败: {}", e))?;

    {
        let mut app_state = state.usecase.lock().map_err(|e| e.to_string())?;
        app_state.replace_repository(new_store);
    }

    Ok(format!("数据库已从 {} 恢复", path))
}

#[tauri::command]
async fn refresh_prices(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let prices = state
        .price_fetcher
        .refresh()
        .await
        .map_err(|e| e.to_string())?;
    let count = prices.len();

    let mut usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    let mut updated_settings = settings.clone();
    updated_settings.model_prices = prices;
    usecase.update_prices(updated_settings.model_prices.clone());

    let config_path = FileConfigProvider::default_path().map_err(|e| e.to_string())?;
    let provider = FileConfigProvider::new(&config_path.to_string_lossy());
    provider
        .save(&updated_settings)
        .map_err(|e| e.to_string())?;

    let mut settings_lock = state.settings.lock().map_err(|e| e.to_string())?;
    *settings_lock = updated_settings;

    Ok(count)
}

#[tauri::command]
fn get_price_info(state: tauri::State<'_, AppState>) -> application::dto::PriceInfoDto {
    let (model_count, last_fetched) = state.price_fetcher.cache_info();
    application::dto::PriceInfoDto {
        model_count,
        last_fetched,
    }
}

#[tauri::command]
fn check_db_integrity(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase
        .repository()
        .check_integrity_public()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_all_platforms(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<domain::entity::ScanResultDto>, String> {
    let scanners: Vec<Box<dyn infrastructure::scanner::PlatformScanner>> = vec![
        Box::new(ClaudeCodeScanner::new()),
        Box::new(CodexScanner::new()),
    ];
    let orchestrator = ScanOrchestrator::new(scanners);
    let results = orchestrator.scan_all();

    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    let store = usecase.repository();

    process_scan_results(results, store).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_scan_history(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<domain::entity::ScanHistory>, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase
        .repository()
        .get_scan_history()
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(dead_code)]
fn get_source_summary(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<domain::entity::SourceSummary>, String> {
    let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
    usecase
        .repository()
        .source_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// 初始化窗口位置和焦点
fn setup_windows(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(floating_window) = app.get_webview_window("floating") {
        floating_window.set_focus()?;
        #[cfg(debug_assertions)]
        floating_window.open_devtools();
    }
    Ok(())
}

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let location = info
            .location()
            .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let message = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic message".to_string()
        };

        let report = format!(
            "=== TokenStats Crash Report ===\nTime: {}\nLocation: {}\nMessage: {}\n==============================",
            timestamp, location, message
        );

        if let Some(app_dir) = dirs::config_dir() {
            let crash_log_path = app_dir.join("TokenStats").join("crash.log");
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&crash_log_path)
            {
                use std::io::Write;
                let _ = writeln!(file, "\n{}\n", report);
            }
            tracing::error!("Panic detected! Crash log written to: {:?}", crash_log_path);
        }

        eprintln!("{}", report);
    }));
}

fn main() {
    tracing_subscriber::fmt::init();

    setup_panic_hook();

    let config_path = FileConfigProvider::default_path().expect("无法确定配置文件路径");
    let db_path = FileConfigProvider::default_db_path().expect("无法确定数据库路径");

    tracing::info!("配置路径: {}", config_path.display());
    tracing::info!("数据库路径: {}", db_path.display());

    let config_provider = FileConfigProvider::new(&config_path.to_string_lossy());
    let settings = config_provider
        .load()
        .expect("加载配置失败，请检查配置文件是否存在且格式正确");

    let repository = match SqliteTokenStore::new(&db_path.to_string_lossy()) {
        Ok(repo) => repo,
        Err(e) => {
            if e.to_string().contains("integrity_check") || e.to_string().contains("integrity") {
                tracing::error!("数据库损坏: {}", e);
                std::process::exit(1);
            }
            panic!(
                "初始化 SQLite 存储失败，请检查数据库路径是否有权限访问: {}",
                e
            );
        }
    };

    // Apply counting mode setting to repository before anything starts reading data
    repository.set_counting_mode(&settings.counting_mode);

    // Rebuild hourly aggregates to fix any historical inconsistency between
    // token_events and hourly_aggregated caused by the old non-transactional record().
    // This is idempotent and cheap — just a GROUP BY over token_events.
    match repository.snapshot() {
        Ok(snap) => {
            tracing::info!(
                "启动时数据状态: total_events={} today={} five_min={}",
                snap.total_tokens,
                snap.today_tokens,
                snap.five_min_tokens
            );
            // Count hourly_aggregated rows for diagnostics
            if let Ok(hourly) = repository.hourly_stats(None) {
                let hourly_total: u64 = hourly.iter().map(|h| h.total_tokens).sum();
                tracing::info!(
                    "hourly_aggregated 总计: {} ({} 行), token_events 总计: {}",
                    hourly_total,
                    hourly.len(),
                    snap.total_tokens
                );
                // Rebuild if the two tables diverge by more than 1%
                if snap.total_tokens > 0 {
                    let divergence = if hourly_total > snap.total_tokens {
                        hourly_total - snap.total_tokens
                    } else {
                        snap.total_tokens - hourly_total
                    };
                    let pct = (divergence as f64 / snap.total_tokens as f64) * 100.0;
                    if pct > 1.0 {
                        tracing::info!("检测到数据差异 {:.1}%，重建 hourly_aggregated...", pct);
                        if let Err(e) = repository.rebuild_aggregates() {
                            tracing::error!("重建 hourly_aggregated 失败: {}", e);
                        } else {
                            tracing::info!("hourly_aggregated 重建完成");
                        }
                    }
                }
            }
        }
        Err(e) => tracing::error!("启动时读取 snapshot 失败: {}", e),
    }

    // Create the ProxyServer before spawning the thread so we can keep a handle
    // for exposing runtime metrics (request count, error rate, uptime, etc.).
    let proxy_server = Arc::new(ProxyServer::new(
        settings.clone(),
        repository.clone(),
        db_path.to_string_lossy().to_string(),
    ));
    let proxy_for_thread = proxy_server.clone();

    std::thread::Builder::new()
        .name("proxy-server".to_string())
        .spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("创建 Tokio 运行时失败");
            rt.block_on(async {
                if let Err(e) = run_proxy(proxy_for_thread).await {
                    tracing::error!("代理服务器错误: {}", e);
                }
            });
        })
        .expect("Failed to spawn proxy thread");

    let usecase = StatsUsecase::new(
        repository,
        settings.currency.clone(),
        settings.usd_to_cny,
        settings.model_prices.clone(),
    );
    let price_fetcher = LiteLLMPriceFetcher::new();
    let app_state = AppState {
        usecase: Mutex::new(usecase),
        settings: Mutex::new(settings.clone()),
        proxy_server: Mutex::new(Some(proxy_server)),
        price_fetcher,
    };

    if settings.auto_cleanup && settings.data_retention_days > 0 {
        match app_state
            .usecase
            .lock()
            .unwrap()
            .repository()
            .clear_old_data(settings.data_retention_days)
        {
            Ok(count) if count > 0 => {
                tracing::info!(
                    "自动清理了 {} 条过期记录 (保留 {} 天)",
                    count,
                    settings.data_retention_days
                );
            }
            Ok(_) => {
                tracing::info!(
                    "自动清理检查完成，无需清理 (保留 {} 天)",
                    settings.data_retention_days
                );
            }
            Err(e) => {
                tracing::warn!("自动清理失败: {}", e);
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
        get_stats,
        get_models,
        get_models_since,
        refresh_data,
        get_settings,
        save_settings,
        show_main_window,
        export_csv,
        clear_all_data,
        cleanup_old_data,
        backup_db,
        restore_db,
        get_hourly_stats,
        get_providers,
        get_request_logs,
        get_monthly_usage,
        get_diagnostics,
        check_db_integrity,
        scan_all_platforms,
        get_scan_history,
        get_source_summary,
        refresh_prices,
        get_price_info,
        start_drag,
    ])
        .setup(|app| {
            setup_windows(app)?;

            let app_state_inner = app.state::<AppState>();
            if let Ok(settings) = app_state_inner.settings.lock() {
                if settings.proxy_host != "127.0.0.1"
                    && settings.proxy_host != "::1"
                    && settings.proxy_host != "localhost" {
                    tracing::warn!(
                        "⚠️ 安全警告: 代理服务器绑定在 {}，非 localhost 地址可能导致公网可访问您的代理！",
                        settings.proxy_host
                    );
                }
            }

            // B1i: auto-populate LiteLLM prices on first launch
            let prices_empty = app_state_inner
                .settings
                .lock()
                .map(|s| s.model_prices.is_empty())
                .unwrap_or(false);
            if prices_empty {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<AppState>();
                    match state.price_fetcher.refresh().await {
                        Ok(prices) if !prices.is_empty() => {
                            let count = prices.len();
                            if let Ok(mut usecase) = state.usecase.lock() {
                                usecase.update_prices(prices.clone());
                            }
                            if let Ok(mut settings) = state.settings.lock() {
                                settings.model_prices = prices;
                                let updated = settings.clone();
                                drop(settings);
                                if let Ok(config_path) = FileConfigProvider::default_path() {
                                    let provider = FileConfigProvider::new(&config_path.to_string_lossy());
                                    let _ = provider.save(&updated);
                                }
                            }
                            tracing::info!(
                                "auto-populated {} LiteLLM model prices on first launch",
                                count
                            );
                        }
                        Ok(_) => {}
                        Err(e) => {
                            tracing::warn!("failed to auto-populate LiteLLM prices: {}", e);
                        }
                    }
                });
            }

            // Start background auto-scanner for AI coding assistant tools
            AutoScanner::start(app.handle().clone());

            let app_handle = app.handle().clone();
            app.listen("tauri://close-requested", move |_event| {
                tracing::info!("收到关闭请求，正在清理...");
                app_handle.exit(0);
            });

            let show_main = MenuItem::with_id(app, "show_main", "显示主窗口", true, None::<&str>)?;
            let toggle_float = MenuItem::with_id(app, "toggle_float", "悬浮窗", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_main, &toggle_float, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_main" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle_float" => {
                        if let Some(window) = app.get_webview_window("floating") {
                            if let Ok(visible) = window.is_visible() {
                                if visible { let _ = window.hide(); } else { let _ = window.show(); }
                            }
                        }
                    }
                    "quit" => { app.exit(0); }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
