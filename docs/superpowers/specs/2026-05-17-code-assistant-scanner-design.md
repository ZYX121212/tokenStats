# AI Coding Assistant Scanner — Design Spec

**Date**: 2026-05-17
**Status**: Approved

## Overview

Add passive file-scanning capability to TokenStats to import token usage data from AI coding assistants (Claude Code, Codex CLI, etc.) without requiring the HTTP proxy. The scanner reads local data files, parses usage, deduplicates against existing data, and stores in the same SQLite database.

## Architecture

New infrastructure module `scanner/` with trait-based platform adapters:

```
src-tauri/src/infrastructure/scanner/
├── mod.rs              # PlatformScanner trait + ScannedUsage struct
├── orchestrator.rs     # ScanOrchestrator — parallel dispatch via rayon
├── adapters/
│   ├── mod.rs
│   ├── claude_code.rs  # Claude Code adapter
│   └── codex.rs        # Codex CLI adapter
└── dedup.rs            # Dedup logic
```

## Data Model Changes

### Schema Migration v4
- Add `source` TEXT column to `token_events` (NULL = proxy, named = imported)
- Add index on `source`
- Add `scan_history` table for tracking scans

### TokenUsage Entity
- Add `source: Option<String>` — source identifier
- Add `original_ts: Option<f64>` — preserve original timestamp from file

### Record Logic
- `ts` defaults to `original_ts` when present, otherwise current time
- Dedup check: `(source, ts, total_tokens)` before insert
- Batch insert: 500 records per transaction

## PlatformScanner Trait

```rust
pub trait PlatformScanner: Send + Sync {
    fn name(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn candidate_paths(&self) -> Vec<PathBuf>;
    fn scan(&self, path: &Path) -> Result<Vec<ScannedUsage>>;
}
```

### Claude Code Adapter
- Paths: `~/.claude/projects/*/` conversation JSON files
- Parse `usage.input_tokens` / `usage.output_tokens`

### Codex CLI Adapter
- Paths: `~/.codex/` session data
- Parse OpenAI-compatible usage format

## Dedup Strategy
- Before insert, check `token_events` for existing `(source, ts, total_tokens)`
- Skip duplicates, insert only new records
- Batch insert with transactions

## Tauri Commands
- `scan_all_platforms` — trigger scan, return per-platform stats
- `get_scan_history` — query scan history table

## Frontend
- SettingsTab: "从 AI 工具导入" section
- Platform badges showing import counts
- "重新扫描" button with progress feedback

## New Dependencies
- `rayon` — parallel iterator for concurrent platform scanning
- `walkdir` — recursive directory traversal

## Future Platforms
Cursor, Windsurf, Aider, Continue.dev, Cline, Copilot CLI, Gemini CLI, etc.
Each added as a new adapter implementing PlatformScanner.
