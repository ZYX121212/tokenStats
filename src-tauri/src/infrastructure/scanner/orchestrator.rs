use anyhow::Result;
use rayon::prelude::*;

use crate::domain::entity::{ScanResultDto, TokenUsage};
use crate::infrastructure::scanner::PlatformScanner;

pub struct ScanOrchestrator {
    scanners: Vec<Box<dyn PlatformScanner>>,
}

impl ScanOrchestrator {
    pub fn new(scanners: Vec<Box<dyn PlatformScanner>>) -> Self {
        Self { scanners }
    }

    /// Run all scanners in parallel and collect results.
    /// Each scanner returns (platform, display_name, files_scanned, usages).
    pub fn scan_all(&self) -> Vec<(String, String, u32, Vec<TokenUsage>)> {
        self.scanners
            .par_iter()
            .map(|scanner| {
                let paths = scanner.candidate_paths();
                if paths.is_empty() {
                    return (
                        scanner.name().to_string(),
                        scanner.display_name().to_string(),
                        0u32,
                        Vec::new(),
                    );
                }

                let mut all_usages = Vec::new();
                let mut files_scanned = 0u32;

                for path in &paths {
                    if let Ok(usages) = scanner.scan(path) {
                        files_scanned += 1;
                        all_usages.extend(usages);
                    }
                }

                (
                    scanner.name().to_string(),
                    scanner.display_name().to_string(),
                    files_scanned,
                    all_usages,
                )
            })
            .collect()
    }
}

/// Process scan results: dedup and batch-insert into the store.
/// Returns per-platform ScanResultDto summaries.
pub fn process_scan_results(
    results: Vec<(String, String, u32, Vec<TokenUsage>)>,
    store: &crate::infrastructure::persistence::sqlite_store::SqliteTokenStore,
) -> Result<Vec<ScanResultDto>> {
    let mut summaries = Vec::new();

    for (platform, display_name, files_scanned, usages) in results {
        let records_found = usages.len() as u32;
        let records_new = store.batch_record_imports(&usages)?;

        store.record_scan_history(&platform, files_scanned, records_found, records_new)?;

        summaries.push(ScanResultDto {
            platform,
            display_name,
            files_scanned,
            records_found,
            records_new,
        });
    }

    // Rebuild hourly aggregates so scanned data appears in time-series charts
    if summaries.iter().any(|s| s.records_new > 0) {
        store.rebuild_aggregates()?;
    }

    Ok(summaries)
}
