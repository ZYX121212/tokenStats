use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{interval, sleep, Duration};

use crate::domain::entity::ScanResultDto;
use crate::infrastructure::scanner::adapters::claude_code::ClaudeCodeScanner;
use crate::infrastructure::scanner::adapters::codex::CodexScanner;
use crate::infrastructure::scanner::orchestrator::{process_scan_results, ScanOrchestrator};
use crate::infrastructure::scanner::PlatformScanner;
use crate::AppState;

/// Default interval between auto-scans in minutes.
const DEFAULT_SCAN_INTERVAL_MINUTES: u64 = 30;
/// Delay before first scan on startup (seconds).
const INITIAL_SCAN_DELAY_SECS: u64 = 5;

pub struct AutoScanner {
    running: Arc<AtomicBool>,
}

impl AutoScanner {
    /// Start background periodic scanning. Runs an initial scan after a short delay,
    /// then repeats at the configured interval. Emits `auto-scan-complete` events
    /// so the frontend can react to new data.
    pub fn start(app_handle: AppHandle) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        tauri::async_runtime::spawn(async move {
            // Wait for app to fully initialize before first scan
            sleep(Duration::from_secs(INITIAL_SCAN_DELAY_SECS)).await;

            if !running_clone.load(Ordering::Relaxed) {
                return;
            }

            run_auto_scan(&app_handle).await;

            let mut ticker = interval(Duration::from_secs(DEFAULT_SCAN_INTERVAL_MINUTES * 60));
            loop {
                ticker.tick().await;
                if !running_clone.load(Ordering::Relaxed) {
                    break;
                }
                run_auto_scan(&app_handle).await;
            }
        });

        Self { running }
    }

    /// Signal the background scanner to stop.
    #[allow(dead_code)]
    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

async fn run_auto_scan(app_handle: &AppHandle) {
    if let Err(e) = try_run_auto_scan(app_handle) {
        tracing::warn!("auto-scan failed: {}", e);
    }
}

fn try_run_auto_scan(app_handle: &AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();

    let scanners: Vec<Box<dyn PlatformScanner>> = vec![
        Box::new(ClaudeCodeScanner::new()),
        Box::new(CodexScanner::new()),
    ];
    let orchestrator = ScanOrchestrator::new(scanners);
    let results = orchestrator.scan_all();

    let summaries: Vec<ScanResultDto> = {
        let usecase = state.usecase.lock().map_err(|e| e.to_string())?;
        let store = usecase.repository();
        process_scan_results(results, store).map_err(|e| e.to_string())?
    };

    let total_new: u32 = summaries.iter().map(|s| s.records_new).sum();

    app_handle
        .emit("auto-scan-complete", &summaries)
        .map_err(|e| e.to_string())?;

    if total_new > 0 {
        tracing::info!(
            "auto-scan: imported {} new records from {} platforms",
            total_new,
            summaries.len()
        );
    }

    Ok(())
}
