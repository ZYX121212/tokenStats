use anyhow::Result;
use rusqlite::Connection;

pub struct SchemaMigrator {
    migrations: Vec<(u32, &'static str)>,
}

impl SchemaMigrator {
    pub fn new() -> Self {
        Self {
            migrations: vec![
                (1, "CREATE TABLE IF NOT EXISTS token_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    provider TEXT NOT NULL,
                    raw_model TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_tokens INTEGER NOT NULL,
                    completion_tokens INTEGER NOT NULL,
                    total_tokens INTEGER NOT NULL,
                    cached_tokens INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_token_events_ts ON token_events(ts);
                CREATE INDEX IF NOT EXISTS idx_token_events_model ON token_events(model);
                CREATE INDEX IF NOT EXISTS idx_token_events_provider ON token_events(provider);"),
                (2, "CREATE TABLE IF NOT EXISTS hourly_aggregated (
                    hour_start TEXT PRIMARY KEY,
                    total_tokens INTEGER DEFAULT 0,
                    request_count INTEGER DEFAULT 0,
                    prompt_tokens INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0
                );"),
                (3, "ALTER TABLE token_events ADD COLUMN latency_ms INTEGER;
                    CREATE INDEX IF NOT EXISTS idx_token_events_latency ON token_events(latency_ms);"),
                (4, "ALTER TABLE token_events ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;
                    ALTER TABLE hourly_aggregated ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0;
                    ALTER TABLE hourly_aggregated ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;"),
                (5, "ALTER TABLE token_events ADD COLUMN source TEXT;
                    CREATE INDEX IF NOT EXISTS idx_token_events_source ON token_events(source);
                    CREATE TABLE IF NOT EXISTS scan_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        platform TEXT NOT NULL,
                        files_scanned INTEGER NOT NULL,
                        records_found INTEGER NOT NULL,
                        records_new INTEGER NOT NULL,
                        scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
                    );"),
            ],
        }
    }

    pub fn run(conn: &Connection) -> Result<()> {
        let migrator = Self::new();

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_versions (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )?;

        let current_version: u32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_versions",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        for (version, sql) in &migrator.migrations {
            if *version > current_version {
                tracing::info!("正在执行数据库迁移 v{}...", version);
                conn.execute_batch(sql)?;
                conn.execute(
                    "INSERT INTO schema_versions (version, applied_at) VALUES (?1, datetime('now'))",
                    rusqlite::params![version],
                )?;
                tracing::info!("数据库迁移 v{} 完成", version);
            }
        }

        Ok(())
    }
}
