pub mod adapters;
pub mod auto_scanner;
pub mod dedup;
pub mod orchestrator;

use anyhow::Result;
use std::path::PathBuf;

use crate::domain::entity::TokenUsage;

/// Trait for platform-specific scanners that read local AI coding assistant data.
pub trait PlatformScanner: Send + Sync {
    /// Unique identifier (e.g., "claude-code")
    fn name(&self) -> &'static str;
    /// Human-readable display name (e.g., "Claude Code")
    fn display_name(&self) -> &'static str;
    /// Candidate directories to scan for this platform
    fn candidate_paths(&self) -> Vec<PathBuf>;
    /// Scan a directory and return parsed token usage records
    fn scan(&self, path: &PathBuf) -> Result<Vec<TokenUsage>>;
}
