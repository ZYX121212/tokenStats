use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::Result;
use chrono::Datelike;
use chrono::Local;
use chrono::Timelike;
use rusqlite::{params, Connection, OptionalExtension};
use tracing::warn;

use crate::domain::entity::{
    HourlyStat, ModelSummary, RequestLog, SourceSummary, StatsSnapshot, TokenEvent, TokenUsage,
};
use crate::domain::repository::TokenRepository;
use crate::infrastructure::persistence::migration::SchemaMigrator;

#[derive(Clone)]
pub struct SqliteTokenStore {
    conn: Arc<Mutex<Connection>>,
    counting_mode: Arc<Mutex<String>>,
}

impl SqliteTokenStore {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA cache_size=-2000;
             PRAGMA busy_timeout=5000;
             PRAGMA foreign_keys=ON;
             PRAGMA temp_store=MEMORY;
             PRAGMA mmap_size=268435456;",
        )?;

        Self::check_integrity(&conn)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS token_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                provider TEXT NOT NULL,
                raw_model TEXT NOT NULL,
                model TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL,
                completion_tokens INTEGER NOT NULL,
                total_tokens INTEGER NOT NULL,
                cached_tokens INTEGER NOT NULL
            )",
            [],
        )?;

        // 索引优化：时间戳索引，用于快照查询、按时间范围过滤和清理旧数据
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_token_events_ts ON token_events(ts)",
            [],
        )?;
        // 索引优化：模型名称索引，用于模型使用统计分组查询
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_token_events_model ON token_events(model)",
            [],
        )?;
        // 索引优化：提供商索引，用于按供应商筛选和去重查询
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_token_events_provider ON token_events(provider)",
            [],
        )?;

        SchemaMigrator::run(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            counting_mode: Arc::new(Mutex::new("ai_tools".to_string())),
        })
    }

    fn check_integrity(conn: &Connection) -> Result<()> {
        let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;

        if result != "ok" {
            warn!("数据库完整性检查失败: {}", result);
            return Err(anyhow::anyhow!(
                "Database integrity check failed: {}",
                result
            ));
        }

        Ok(())
    }

    pub fn check_integrity_public(&self) -> Result<String> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let result: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|e| anyhow::anyhow!("{}", e))?;

        if result != "ok" {
            Ok(format!("integrity_check failed: {}", result))
        } else {
            Ok("ok".to_string())
        }
    }

    pub fn set_counting_mode(&self, mode: &str) {
        if let Ok(mut m) = self.counting_mode.lock() {
            *m = mode.to_string();
            tracing::info!("统计口径已切换为: {}", mode);
        }
    }

    /// Build a SQL WHERE fragment for source filtering based on counting_mode.
    /// Returns an empty string for "all" mode (no filter).
    fn source_where(&self) -> String {
        let mode = self
            .counting_mode
            .lock()
            .map(|m| m.clone())
            .unwrap_or_else(|_| "all".to_string());
        let clause = match mode.as_str() {
            "ai_tools" => " AND source IN ('claude-code', 'codex-cli')".to_string(),
            "api_keys" => " AND (source = 'proxy' OR source IS NULL)".to_string(),
            _ => String::new(),
        };
        tracing::info!("source_where: mode={} clause='{}'", mode, clause);
        clause
    }

    pub fn cleanup_old_events(&self, days: u32) -> Result<u32> {
        let conn = self.conn.lock().unwrap();
        // ts is stored as a Unix timestamp (REAL). Compute the cutoff in the same
        // unit to avoid the silent type-coercion bug with datetime() strings.
        let cutoff = chrono::Local::now().timestamp() as f64 - (days as f64 * 86400.0);
        conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<u32> {
            let deleted =
                conn.execute("DELETE FROM token_events WHERE ts < ?1", params![cutoff])?;
            conn.execute("DELETE FROM hourly_aggregated", [])?;
            conn.execute(
                "INSERT INTO hourly_aggregated (hour_start, total_tokens, request_count, prompt_tokens, completion_tokens, cached_tokens, reasoning_tokens)
                 SELECT
                     strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime')),
                     COALESCE(SUM(total_tokens), 0),
                     COUNT(*),
                     COALESCE(SUM(prompt_tokens), 0),
                     COALESCE(SUM(completion_tokens), 0),
                     COALESCE(SUM(cached_tokens), 0),
                     COALESCE(SUM(reasoning_tokens), 0)
                 FROM token_events
                 GROUP BY strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime'))",
                [],
            )?;
            Ok(deleted as u32)
        })();

        match result {
            Ok(deleted) => {
                conn.execute("COMMIT", [])?;
                Ok(deleted)
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    pub fn rebuild_aggregates(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM hourly_aggregated", [])?;
        conn.execute(
            "INSERT INTO hourly_aggregated (hour_start, total_tokens, request_count, prompt_tokens, completion_tokens, cached_tokens, reasoning_tokens)
             SELECT
                 strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime')),
                 COALESCE(SUM(total_tokens), 0),
                 COUNT(*),
                 COALESCE(SUM(prompt_tokens), 0),
                 COALESCE(SUM(completion_tokens), 0),
                 COALESCE(SUM(cached_tokens), 0),
                 COALESCE(SUM(reasoning_tokens), 0)
             FROM token_events
             GROUP BY strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime'))",
            [],
        )?;
        Ok(())
    }

    pub fn backup(&self, path: &Path) -> Result<()> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;
        }

        let src_conn = self.conn.lock().unwrap();
        let mut backup_conn = Connection::open(path)?;
        rusqlite::backup::Backup::new(&src_conn, &mut backup_conn)?.run_to_completion(
            -1,
            std::time::Duration::from_millis(100),
            None,
        )?;
        Ok(())
    }

    pub fn wal_checkpoint(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;
        Ok(())
    }

    pub fn default_backup_path() -> Result<PathBuf> {
        let backup_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".tokenstats")
            .join("backups");

        if !backup_dir.exists() {
            std::fs::create_dir_all(&backup_dir)?;
        }

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        Ok(backup_dir.join(format!("tokenstats_{}.db", timestamp)))
    }

    /// Check if a scanned record already exists (dedup by source + ts + total_tokens).
    pub fn source_exists(&self, source: &str, ts: f64, total_tokens: u64) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM token_events WHERE source = ?1 AND ts = ?2 AND total_tokens = ?3",
            params![source, ts, total_tokens as i64],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Batch-insert scanned records, replacing all existing data for the scanned sources.
    /// Scanners produce the complete picture on each run (e.g., daily aggregates from
    /// stats-cache.json).  Using source-level replace avoids double-counting when a
    /// source's totals grow between scans.
    pub fn batch_record_imports(&self, usages: &[TokenUsage]) -> Result<u32> {
        let conn = self.conn.lock().unwrap();

        // Collect unique sources in this batch
        let sources: std::collections::BTreeSet<&str> =
            usages.iter().filter_map(|u| u.source.as_deref()).collect();

        // Replace: delete all existing records for these sources…
        for source in &sources {
            conn.execute(
                "DELETE FROM token_events WHERE source = ?1",
                params![source],
            )?;
        }

        // …then insert fresh records
        let mut new_count = 0u32;
        for chunk in usages.chunks(500) {
            for usage in chunk {
                let ts = usage
                    .original_ts
                    .unwrap_or_else(|| chrono::Local::now().timestamp() as f64);
                let source = match &usage.source {
                    Some(s) => s.as_str(),
                    None => continue,
                };

                conn.execute(
                    "INSERT INTO token_events (
                        ts, provider, raw_model, model, prompt_tokens,
                        completion_tokens, total_tokens, cached_tokens, reasoning_tokens, latency_ms, source
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        ts,
                        usage.provider,
                        usage.raw_model,
                        usage.model,
                        usage.prompt_tokens as i64,
                        usage.completion_tokens as i64,
                        usage.total_tokens as i64,
                        usage.cached_tokens as i64,
                        usage.reasoning_tokens as i64,
                        usage.latency_ms.map(|v| v as i64),
                        source,
                    ],
                )?;

                new_count += 1;
            }
        }

        conn.execute("DELETE FROM hourly_aggregated", [])?;
        conn.execute(
            "INSERT INTO hourly_aggregated (hour_start, total_tokens, request_count, prompt_tokens, completion_tokens, cached_tokens, reasoning_tokens)
             SELECT
                 strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime')),
                 COALESCE(SUM(total_tokens), 0),
                 COUNT(*),
                 COALESCE(SUM(prompt_tokens), 0),
                 COALESCE(SUM(completion_tokens), 0),
                 COALESCE(SUM(cached_tokens), 0),
                 COALESCE(SUM(reasoning_tokens), 0)
             FROM token_events
             GROUP BY strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime'))",
            [],
        )?;

        Ok(new_count)
    }

    /// Record a scan operation in scan_history.
    pub fn record_scan_history(
        &self,
        platform: &str,
        files_scanned: u32,
        records_found: u32,
        records_new: u32,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO scan_history (platform, files_scanned, records_found, records_new) VALUES (?1, ?2, ?3, ?4)",
            params![platform, files_scanned, records_found, records_new],
        )?;
        Ok(())
    }

    /// Retrieve scan history.
    pub fn get_scan_history(&self) -> Result<Vec<crate::domain::entity::ScanHistory>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, platform, files_scanned, records_found, records_new, scanned_at FROM scan_history ORDER BY id DESC LIMIT 50",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(crate::domain::entity::ScanHistory {
                id: row.get(0)?,
                platform: row.get(1)?,
                files_scanned: row.get::<_, i64>(2)? as u32,
                records_found: row.get::<_, i64>(3)? as u32,
                records_new: row.get::<_, i64>(4)? as u32,
                scanned_at: row.get(5)?,
            })
        })?;
        let mut results = vec![];
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}

impl TokenRepository for SqliteTokenStore {
    fn record(&self, usage: &TokenUsage) -> Result<()> {
        let start = Instant::now();
        let conn = self.conn.lock().unwrap();
        let ts = usage
            .original_ts
            .unwrap_or_else(|| chrono::Local::now().timestamp() as f64);
        let hour_ts = if let Some(orig) = usage.original_ts {
            chrono::DateTime::from_timestamp(orig as i64, 0)
                .map(|dt| {
                    dt.with_timezone(&Local)
                        .format("%Y-%m-%d %H:00:00")
                        .to_string()
                })
                .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d %H:00:00").to_string())
        } else {
            chrono::Local::now().format("%Y-%m-%d %H:00:00").to_string()
        };

        // Wrap both writes in a single transaction so token_events and
        // hourly_aggregated stay consistent even if the second write fails.
        conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<()> {
            conn.execute(
                "INSERT INTO token_events (
                    ts, provider, raw_model, model, prompt_tokens,
                    completion_tokens, total_tokens, cached_tokens, reasoning_tokens, latency_ms, source
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    ts,
                    usage.provider,
                    usage.raw_model,
                    usage.model,
                    usage.prompt_tokens as i64,
                    usage.completion_tokens as i64,
                    usage.total_tokens as i64,
                    usage.cached_tokens as i64,
                    usage.reasoning_tokens as i64,
                    usage.latency_ms.map(|v| v as i64),
                    usage.source.as_deref(),
                ],
            )?;

            conn.execute(
                "INSERT INTO hourly_aggregated (hour_start, total_tokens, request_count, prompt_tokens, completion_tokens, cached_tokens, reasoning_tokens)
                 VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6)
                 ON CONFLICT(hour_start) DO UPDATE SET
                     total_tokens = total_tokens + ?2,
                     request_count = request_count + 1,
                     prompt_tokens = prompt_tokens + ?3,
                     completion_tokens = completion_tokens + ?4,
                     cached_tokens = cached_tokens + ?5,
                     reasoning_tokens = reasoning_tokens + ?6",
                params![
                    hour_ts,
                    usage.total_tokens as i64,
                    usage.prompt_tokens as i64,
                    usage.completion_tokens as i64,
                    usage.cached_tokens as i64,
                    usage.reasoning_tokens as i64,
                ],
            )?;

            Ok(())
        })();

        match result {
            Ok(()) => {
                conn.execute("COMMIT", [])?;
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                return Err(e);
            }
        }

        let elapsed = start.elapsed();
        if elapsed.as_millis() > 100 {
            warn!(
                "慢查询警告: insert_token_event 耗时 {}ms (模型: {})",
                elapsed.as_millis(),
                usage.model
            );
        }
        Ok(())
    }

    fn snapshot(&self) -> Result<StatsSnapshot> {
        let start = Instant::now();
        let conn = self.conn.lock().unwrap();
        let now = chrono::Local::now().timestamp() as f64;
        let five_min_ago = now - 300.0;
        let today_start = chrono::Local::now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(Local)
            .unwrap()
            .timestamp() as f64;

        let source_where = self.source_where();
        let sql = format!(
            "SELECT
                COALESCE(SUM(CASE WHEN ts >= ?1 THEN total_tokens ELSE 0 END), 0),
                COALESCE(SUM(total_tokens), 0),
                COALESCE(SUM(CASE WHEN ts >= ?2 THEN total_tokens ELSE 0 END), 0),
                (SELECT id FROM token_events WHERE 1=1 {} ORDER BY id DESC LIMIT 1)
             FROM token_events WHERE 1=1 {}",
            source_where, source_where
        );

        let mut stmt = conn.prepare(&sql)?;

        let row = stmt.query_row(params![five_min_ago, today_start], |row| {
            Ok((
                row.get::<_, i64>(0)? as u64,
                row.get::<_, i64>(1)? as u64,
                row.get::<_, i64>(2)? as u64,
                row.get::<_, Option<i64>>(3)?,
            ))
        })?;

        tracing::info!(
            "snapshot result: five_min={} total={} today={} last_id={:?} sql={}",
            row.0,
            row.1,
            row.2,
            row.3,
            sql
        );

        let last_event = if let Some(last_id) = row.3 {
            conn.query_row(
                "SELECT * FROM token_events WHERE id = ?1",
                params![last_id],
                |row| {
                    Ok(TokenEvent {
                        id: row.get(0)?,
                        ts: row.get(1)?,
                        provider: row.get(2)?,
                        raw_model: row.get(3)?,
                        model: row.get(4)?,
                        prompt_tokens: row.get::<_, i64>(5)? as u64,
                        completion_tokens: row.get::<_, i64>(6)? as u64,
                        total_tokens: row.get::<_, i64>(7)? as u64,
                        cached_tokens: row.get::<_, i64>(8)? as u64,
                        latency_ms: row.get::<_, Option<i64>>(9)?.map(|v| v as u64),
                        reasoning_tokens: row.get::<_, i64>(10)? as u64,
                        source: row.get::<_, Option<String>>(11)?,
                    })
                },
            )
            .optional()?
        } else {
            None
        };

        let elapsed = start.elapsed();
        if elapsed.as_millis() > 100 {
            warn!(
                "慢查询警告: snapshot 耗时 {}ms (SQL: SELECT ... FROM token_events)",
                elapsed.as_millis()
            );
        }

        Ok(StatsSnapshot {
            five_min_tokens: row.0,
            total_tokens: row.1,
            today_tokens: row.2,
            last_event,
        })
    }

    fn model_usage_summary(&self, since_ts: Option<f64>) -> Result<Vec<ModelSummary>> {
        let start = Instant::now();
        let conn = self.conn.lock().unwrap();
        let source_where = self.source_where();

        let (sql, params) = if let Some(ts) = since_ts {
            (
                format!(
                    "SELECT
                    MIN(raw_model) as raw_model,
                    model,
                    provider,
                    COALESCE(source, 'proxy') as source,
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt,
                    COALESCE(SUM(completion_tokens), 0) as completion,
                    COALESCE(SUM(total_tokens), 0) as total,
                    COALESCE(SUM(cached_tokens), 0) as cached,
                    COALESCE(SUM(reasoning_tokens), 0) as reasoning
                FROM token_events
                WHERE ts >= ?1{}
                GROUP BY model, provider, source
                ORDER BY total DESC",
                    source_where
                ),
                vec![ts],
            )
        } else {
            if source_where.is_empty() {
                (
                    "SELECT
                    MIN(raw_model) as raw_model,
                    model,
                    provider,
                    COALESCE(source, 'proxy') as source,
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt,
                    COALESCE(SUM(completion_tokens), 0) as completion,
                    COALESCE(SUM(total_tokens), 0) as total,
                    COALESCE(SUM(cached_tokens), 0) as cached,
                    COALESCE(SUM(reasoning_tokens), 0) as reasoning
                FROM token_events
                GROUP BY model, provider, source
                ORDER BY total DESC"
                        .to_string(),
                    vec![],
                )
            } else {
                (
                    format!(
                        "SELECT
                    MIN(raw_model) as raw_model,
                    model,
                    provider,
                    COALESCE(source, 'proxy') as source,
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt,
                    COALESCE(SUM(completion_tokens), 0) as completion,
                    COALESCE(SUM(total_tokens), 0) as total,
                    COALESCE(SUM(cached_tokens), 0) as cached,
                    COALESCE(SUM(reasoning_tokens), 0) as reasoning
                FROM token_events
                WHERE 1=1{}
                GROUP BY model, provider, source
                ORDER BY total DESC",
                        source_where
                    ),
                    vec![],
                )
            }
        };

        let mut stmt = conn.prepare(&sql)?;

        let ref_params: Vec<&dyn rusqlite::types::ToSql> = params
            .iter()
            .map(|p| p as &dyn rusqlite::types::ToSql)
            .collect();

        let rows = stmt.query_map(ref_params.as_slice(), |row| {
            Ok(ModelSummary {
                raw_model: row.get(0)?,
                model: row.get(1)?,
                provider: row.get(2)?,
                source: row.get(3)?,
                calls: row.get::<_, i64>(4)? as u64,
                prompt_tokens: row.get::<_, i64>(5)? as u64,
                completion_tokens: row.get::<_, i64>(6)? as u64,
                total_tokens: row.get::<_, i64>(7)? as u64,
                cached_tokens: row.get::<_, i64>(8)? as u64,
                reasoning_tokens: row.get::<_, i64>(9)? as u64,
            })
        })?;

        let mut results = vec![];
        for row in rows {
            results.push(row?);
        }

        let model_total: u64 = results.iter().map(|m| m.total_tokens).sum();
        let model_calls: u64 = results.iter().map(|m| m.calls).sum();
        tracing::info!(
            "model_usage_summary: rows={} total_tokens={} total_calls={}",
            results.len(),
            model_total,
            model_calls
        );

        let elapsed = start.elapsed();
        if elapsed.as_millis() > 100 {
            warn!(
                "慢查询警告: model_usage_summary 耗时 {}ms (SQL: SELECT ... GROUP BY model, provider)",
                elapsed.as_millis()
            );
        }

        Ok(results)
    }

    fn hourly_stats(&self, since_ts: Option<f64>) -> Result<Vec<HourlyStat>> {
        let start = Instant::now();
        let conn = self.conn.lock().unwrap();
        let source_where = self.source_where();

        // When filtering by source, query token_events directly because
        // hourly_aggregated does not track source per row.
        if !source_where.is_empty() {
            let (sql, params): (String, Vec<f64>) = if let Some(ts) = since_ts {
                (
                    format!(
                        "SELECT
                    strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime')) as hour,
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt,
                    COALESCE(SUM(completion_tokens), 0) as completion,
                    COALESCE(SUM(total_tokens), 0) as total,
                    COALESCE(SUM(cached_tokens), 0) as cached,
                    COALESCE(SUM(reasoning_tokens), 0) as reasoning
                FROM token_events
                WHERE ts >= ?1{}
                GROUP BY hour
                ORDER BY hour ASC
                LIMIT 168",
                        source_where
                    ),
                    vec![ts],
                )
            } else {
                (
                    format!(
                        "SELECT
                    strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime')) as hour,
                    COUNT(*) as calls,
                    COALESCE(SUM(prompt_tokens), 0) as prompt,
                    COALESCE(SUM(completion_tokens), 0) as completion,
                    COALESCE(SUM(total_tokens), 0) as total,
                    COALESCE(SUM(cached_tokens), 0) as cached,
                    COALESCE(SUM(reasoning_tokens), 0) as reasoning
                FROM token_events
                WHERE 1=1{}
                GROUP BY hour
                ORDER BY hour ASC
                LIMIT 168",
                        source_where
                    ),
                    vec![],
                )
            };

            let mut stmt = conn.prepare(&sql)?;
            let ref_params: Vec<&dyn rusqlite::types::ToSql> = params
                .iter()
                .map(|p| p as &dyn rusqlite::types::ToSql)
                .collect();

            let rows = stmt.query_map(ref_params.as_slice(), |row| {
                Ok(HourlyStat {
                    hour: row.get(0)?,
                    calls: row.get::<_, i64>(1)? as u64,
                    prompt_tokens: row.get::<_, i64>(2)? as u64,
                    completion_tokens: row.get::<_, i64>(3)? as u64,
                    total_tokens: row.get::<_, i64>(4)? as u64,
                    cached_tokens: row.get::<_, i64>(5)? as u64,
                    reasoning_tokens: row.get::<_, i64>(6)? as u64,
                })
            })?;

            let mut results = vec![];
            for row in rows {
                results.push(row?);
            }

            let hourly_total: u64 = results.iter().map(|h| h.total_tokens).sum();
            tracing::info!(
                "hourly_stats (filtered from token_events): rows={} total={}",
                results.len(),
                hourly_total
            );

            let elapsed = start.elapsed();
            if elapsed.as_millis() > 100 {
                warn!(
                    "慢查询警告: hourly_stats (filtered) 耗时 {}ms",
                    elapsed.as_millis()
                );
            }

            return Ok(results);
        }

        // Default fast path: use pre-aggregated hourly_aggregated table
        let (sql, params) = if let Some(ts) = since_ts {
            let since_dt = chrono::DateTime::from_timestamp(ts as i64, 0)
                .unwrap_or_default()
                .with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:00:00")
                .to_string();
            (
                "SELECT
                    hour_start as hour,
                    request_count as calls,
                    prompt_tokens as prompt,
                    completion_tokens as completion,
                    total_tokens as total,
                    COALESCE(cached_tokens, 0) as cached,
                    COALESCE(reasoning_tokens, 0) as reasoning
                FROM hourly_aggregated
                WHERE hour_start >= ?1
                ORDER BY hour_start ASC
                LIMIT 168"
                    .to_string(),
                vec![since_dt],
            )
        } else {
            (
                "SELECT
                    hour_start as hour,
                    request_count as calls,
                    prompt_tokens as prompt,
                    completion_tokens as completion,
                    total_tokens as total,
                    COALESCE(cached_tokens, 0) as cached,
                    COALESCE(reasoning_tokens, 0) as reasoning
                FROM hourly_aggregated
                ORDER BY hour_start ASC
                LIMIT 168"
                    .to_string(),
                vec![],
            )
        };

        let mut stmt = conn.prepare(&sql)?;

        let ref_params: Vec<&dyn rusqlite::types::ToSql> = params
            .iter()
            .map(|p| p as &dyn rusqlite::types::ToSql)
            .collect();

        let rows = stmt.query_map(ref_params.as_slice(), |row| {
            Ok(HourlyStat {
                hour: row.get(0)?,
                calls: row.get::<_, i64>(1)? as u64,
                prompt_tokens: row.get::<_, i64>(2)? as u64,
                completion_tokens: row.get::<_, i64>(3)? as u64,
                total_tokens: row.get::<_, i64>(4)? as u64,
                cached_tokens: row.get::<_, i64>(5)? as u64,
                reasoning_tokens: row.get::<_, i64>(6)? as u64,
            })
        })?;

        let mut results = vec![];
        for row in rows {
            results.push(row?);
        }

        let hourly_total: u64 = results.iter().map(|h| h.total_tokens).sum();
        tracing::info!(
            "hourly_stats (fast path from hourly_aggregated): rows={} total={}",
            results.len(),
            hourly_total
        );

        let elapsed = start.elapsed();
        if elapsed.as_millis() > 100 {
            warn!(
                "慢查询警告: hourly_stats 耗时 {}ms (SQL: SELECT ... GROUP BY hour)",
                elapsed.as_millis()
            );
        }

        Ok(results)
    }

    fn providers(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let source_where = self.source_where();
        let sql = if source_where.is_empty() {
            "SELECT DISTINCT provider FROM token_events ORDER BY provider".to_string()
        } else {
            format!(
                "SELECT DISTINCT provider FROM token_events WHERE 1=1{} ORDER BY provider",
                source_where
            )
        };
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

        let mut results = vec![];
        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    fn clear(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<()> {
            conn.execute("DELETE FROM token_events", [])?;
            conn.execute("DELETE FROM hourly_aggregated", [])?;
            Ok(())
        })();

        match result {
            Ok(()) => conn.execute("COMMIT", [])?,
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                return Err(e);
            }
        };
        Ok(())
    }

    fn clear_old_data(&self, days: u32) -> Result<u64> {
        let conn = self.conn.lock().unwrap();
        let cutoff = chrono::Local::now().timestamp() as f64 - (days as f64 * 86400.0);
        conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<u64> {
            let deleted =
                conn.execute("DELETE FROM token_events WHERE ts < ?1", params![cutoff])?;
            conn.execute("DELETE FROM hourly_aggregated", [])?;
            conn.execute(
                "INSERT INTO hourly_aggregated (hour_start, total_tokens, request_count, prompt_tokens, completion_tokens, cached_tokens, reasoning_tokens)
                 SELECT
                     strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime')),
                     COALESCE(SUM(total_tokens), 0),
                     COUNT(*),
                     COALESCE(SUM(prompt_tokens), 0),
                     COALESCE(SUM(completion_tokens), 0),
                     COALESCE(SUM(cached_tokens), 0),
                     COALESCE(SUM(reasoning_tokens), 0)
                 FROM token_events
                 GROUP BY strftime('%Y-%m-%d %H:00:00', datetime(ts, 'unixepoch', 'localtime'))",
                [],
            )?;
            Ok(deleted as u64)
        })();

        match result {
            Ok(deleted) => {
                conn.execute("COMMIT", [])?;
                Ok(deleted)
            }
            Err(e) => {
                let _ = conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    fn export_to_csv(&self, path: &str) -> Result<u64> {
        let start = Instant::now();
        let conn = self.conn.lock().unwrap();
        let source_where = self.source_where();
        let sql = format!(
            "SELECT ts, provider, model, prompt_tokens, completion_tokens, total_tokens, cached_tokens, reasoning_tokens
             FROM token_events
             WHERE 1=1{}
             ORDER BY ts DESC",
            source_where
        );
        let mut stmt = conn.prepare(&sql)?;

        let mut writer = csv::Writer::from_path(path)?;
        writer.write_record([
            "timestamp",
            "provider",
            "model",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "cached_tokens",
            "reasoning_tokens",
        ])?;

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, f64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? as u64,
                row.get::<_, i64>(4)? as u64,
                row.get::<_, i64>(5)? as u64,
                row.get::<_, i64>(6)? as u64,
                row.get::<_, i64>(7)? as u64,
            ))
        })?;

        let mut count = 0u64;
        for row in rows {
            let (ts, provider, model, prompt, completion, total, cached, reasoning) = row?;
            let datetime = chrono::DateTime::from_timestamp(ts as i64, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_else(|| ts.to_string());
            let prompt_s = prompt.to_string();
            let completion_s = completion.to_string();
            let total_s = total.to_string();
            let cached_s = cached.to_string();
            let reasoning_s = reasoning.to_string();
            writer.write_record([
                datetime.as_str(),
                provider.as_str(),
                model.as_str(),
                prompt_s.as_str(),
                completion_s.as_str(),
                total_s.as_str(),
                cached_s.as_str(),
                reasoning_s.as_str(),
            ])?;
            count += 1;
        }

        writer.flush()?;
        let elapsed = start.elapsed();
        if elapsed.as_millis() > 100 {
            warn!(
                "慢查询警告: export_to_csv 耗时 {}ms (SQL: SELECT ... FROM token_events ORDER BY ts DESC)",
                elapsed.as_millis()
            );
        }
        Ok(count)
    }

    fn request_logs(&self, limit: u32, offset: u32) -> Result<Vec<RequestLog>> {
        let start = Instant::now();
        let conn = self.conn.lock().unwrap();
        let source_where = self.source_where();
        let sql = format!(
            "SELECT id, ts, provider, model, raw_model, prompt_tokens, completion_tokens, total_tokens, cached_tokens, reasoning_tokens, latency_ms
             FROM token_events
             WHERE 1=1{}
             ORDER BY ts DESC
             LIMIT ?1 OFFSET ?2",
            source_where
        );
        let mut stmt = conn.prepare(&sql)?;

        let rows = stmt.query_map(params![limit as i64, offset as i64], |row| {
            let ts: f64 = row.get(1)?;
            let datetime = chrono::DateTime::from_timestamp(ts as i64, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_else(|| ts.to_string());
            Ok(RequestLog {
                id: row.get(0)?,
                ts: datetime,
                provider: row.get(2)?,
                model: row.get(3)?,
                prompt_tokens: row.get::<_, i64>(5)? as u64,
                completion_tokens: row.get::<_, i64>(6)? as u64,
                total_tokens: row.get::<_, i64>(7)? as u64,
                cached_tokens: row.get::<_, i64>(8)? as u64,
                reasoning_tokens: row.get::<_, i64>(9)? as u64,
                latency_ms: row.get::<_, Option<i64>>(10)?.map(|v| v as u64),
            })
        })?;

        let mut results = vec![];
        for row in rows {
            results.push(row?);
        }

        let elapsed = start.elapsed();
        if elapsed.as_millis() > 100 {
            warn!("慢查询警告: request_logs 耗时 {}ms", elapsed.as_millis());
        }
        Ok(results)
    }

    fn monthly_usage(&self) -> Result<u64> {
        let start = Instant::now();
        let conn = self.conn.lock().unwrap();

        let now = chrono::Local::now();
        let month_start = now
            .with_day(1)
            .unwrap()
            .with_hour(0)
            .unwrap()
            .with_minute(0)
            .unwrap()
            .with_second(0)
            .unwrap();
        let month_start_ts = month_start.timestamp() as f64;

        let source_where = self.source_where();
        let sql = format!(
            "SELECT COALESCE(SUM(total_tokens), 0) FROM token_events WHERE ts >= ?1{}",
            source_where
        );

        let total: i64 = conn.query_row(&sql, params![month_start_ts], |row| row.get(0))?;

        let elapsed = start.elapsed();
        if elapsed.as_millis() > 100 {
            warn!("慢查询警告: monthly_usage 耗时 {}ms", elapsed.as_millis());
        }
        Ok(total as u64)
    }

    fn source_summary(&self) -> Result<Vec<SourceSummary>> {
        let conn = self.conn.lock().unwrap();
        let source_where = self.source_where();
        let sql = format!(
            "SELECT COALESCE(source, 'proxy') as src, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as total
             FROM token_events
             WHERE 1=1{}
             GROUP BY src
             ORDER BY total DESC",
            source_where
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(SourceSummary {
                source: row.get(0)?,
                calls: row.get::<_, i64>(1)? as u64,
                total_tokens: row.get::<_, i64>(2)? as u64,
            })
        })?;
        let mut results = vec![];
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}
