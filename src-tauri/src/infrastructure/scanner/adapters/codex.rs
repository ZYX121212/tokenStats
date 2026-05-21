use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;

use crate::domain::entity::TokenUsage;
use crate::domain::service::PricingService;
use crate::infrastructure::scanner::PlatformScanner;

pub struct CodexScanner {
    pricing: PricingService,
}

impl CodexScanner {
    pub fn new() -> Self {
        Self {
            pricing: PricingService::new(),
        }
    }

    fn scan_state_db(&self, db_path: &PathBuf) -> Result<Vec<TokenUsage>> {
        let conn = Connection::open(db_path)?;

        let mut stmt = conn.prepare(
            "SELECT tokens_used, model, model_provider, created_at
             FROM threads
             WHERE tokens_used > 0 AND archived = 0
             ORDER BY created_at DESC",
        )?;

        let usages: Vec<TokenUsage> = stmt
            .query_map([], |row| {
                let tokens: i64 = row.get(0)?;
                let model: String = row.get(1).unwrap_or_else(|_| "unknown".to_string());
                let provider: String = row.get(2).unwrap_or_else(|_| "codex".to_string());
                let created_at: i64 = row.get(3)?;
                Ok((tokens as u64, model, provider, created_at))
            })?
            .filter_map(|r| r.ok())
            .map(|(tokens, model, provider, created_at)| {
                let normalized = self.pricing.normalize_model_name(&model);
                // Codex only stores total tokens_used, without prompt/completion breakdown.
                // Use the total as prompt_tokens and leave completion at 0 — conservative
                // for cost estimation (output tokens typically cost more than input).
                TokenUsage {
                    provider,
                    raw_model: model,
                    model: normalized,
                    prompt_tokens: tokens,
                    completion_tokens: 0,
                    total_tokens: tokens,
                    cached_tokens: 0,
                    reasoning_tokens: 0,
                    latency_ms: None,
                    source: Some("codex-cli".to_string()),
                    original_ts: Some(created_at as f64),
                }
            })
            .collect();

        Ok(usages)
    }
}

impl PlatformScanner for CodexScanner {
    fn name(&self) -> &'static str {
        "codex-cli"
    }

    fn display_name(&self) -> &'static str {
        "Codex CLI"
    }

    fn candidate_paths(&self) -> Vec<PathBuf> {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let codex_dir = home.join(".codex");
        if codex_dir.exists() {
            vec![codex_dir]
        } else {
            vec![]
        }
    }

    fn scan(&self, path: &PathBuf) -> Result<Vec<TokenUsage>> {
        // Find state_*.sqlite (e.g., state_5.sqlite)
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("state_") && name_str.ends_with(".sqlite") {
                    return self.scan_state_db(&entry.path());
                }
            }
        }

        Ok(Vec::new())
    }
}
