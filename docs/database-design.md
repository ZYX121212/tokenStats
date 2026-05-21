# 数据库设计

## 概述

TokenStats 使用 SQLite 作为本地持久化存储，数据库文件位于 `~/.tokenstats/tokenstats.db`。

## 存储配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 日志模式 | WAL (Write-Ahead Logging) | 读写不互斥，适合代理并发写入 + 前端轮询读取 |
| 同步模式 | NORMAL | 比 FULL 更快，在电源正常的桌面环境下足够安全 |
| 缓存大小 | -2000 (2MB) | 负数表示 KB 为单位 |
| 忙碌超时 | 5000ms | 并发写入冲突时等待 5 秒而非立即报错 |
| 临时存储 | MEMORY | 临时表和中间结果在内存中处理 |
| 内存映射 | 256MB | 大数据量下减少 read 系统调用 |

## Schema

### token_events 表

存储每次 LLM API 调用的 token 使用记录。

```sql
CREATE TABLE token_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL NOT NULL,           -- Unix 时间戳（浮点秒）
    provider   TEXT NOT NULL,           -- Provider 名称，如 "openai"
    raw_model  TEXT NOT NULL,           -- 原始模型名，如 "gpt-4-turbo-2024-04-09"
    model      TEXT NOT NULL,           -- 标准化模型名，如 "gpt-4-turbo"
    prompt_tokens     INTEGER NOT NULL, -- 输入 token 数
    completion_tokens INTEGER NOT NULL, -- 输出 token 数
    total_tokens      INTEGER NOT NULL, -- 总 token 数
    cached_tokens     INTEGER NOT NULL  -- 缓存命中 token 数（OpenAI prompt caching）
);

-- 索引
CREATE INDEX idx_token_events_ts       ON token_events(ts);
CREATE INDEX idx_token_events_model    ON token_events(model);
CREATE INDEX idx_token_events_provider ON token_events(provider);
```

**字段说明**：

| 字段 | 说明 |
|------|------|
| `id` | 自增主键 |
| `ts` | 事件时间戳，Unix 纪元浮点秒（如 `1705320000.123`），支持毫秒精度 |
| `provider` | 请求路由到的 Provider 名称 |
| `raw_model` | API 响应中的原始模型名，保留完整信息供调试 |
| `model` | 经过 `PricingService::normalize_model_name()` 标准化后的模型名，用于聚合和价格匹配 |
| `prompt_tokens` | 输入 token（OpenAI: prompt_tokens, Anthropic: input_tokens） |
| `completion_tokens` | 输出 token（OpenAI: completion_tokens, Anthropic: output_tokens） |
| `total_tokens` | 总 token 数 |
| `cached_tokens` | 缓存命中的 token 数（OpenAI prompt caching 特有） |

**为什么同时存 `raw_model` 和 `model`？**
- `raw_model` 保留原始信息，便于调试和审计（知道具体用了哪个版本）
- `model` 标准化后用于聚合，避免同一模型的不同版本被分开统计

### hourly_aggregated 表

按小时预聚合的统计数据，加速时间序列查询。

```sql
CREATE TABLE hourly_aggregated (
    hour_start        TEXT PRIMARY KEY,     -- "YYYY-MM-DD HH:00:00"
    total_tokens      INTEGER DEFAULT 0,
    request_count     INTEGER DEFAULT 0,
    prompt_tokens     INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0
);
```

**设计目的**：
- 插入 `token_events` 时同步更新此表（`ON CONFLICT ... DO UPDATE`）
- 小时级图表查询直接读此表，无需对 `token_events` 做 `GROUP BY`
- 7 天的小时级数据 = 最多 168 行，查询极快

### schema_versions 表

追踪已应用的数据库迁移版本。

```sql
CREATE TABLE schema_versions (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL              -- SQL datetime 格式
);
```

## 迁移历史

### v1 — 初始 Schema

创建 `token_events` 表及三个索引（ts、model、provider）。

### v2 — 小时聚合表

创建 `hourly_aggregated` 表，为时间序列查询提供预聚合数据。

## 关键查询

### 统计快照 (snapshot)

单条 SQL 计算多维度统计：

```sql
SELECT
    SUM(CASE WHEN ts >= :five_min_ago   THEN total_tokens ELSE 0 END) AS five_min_tokens,
    SUM(total_tokens)                    AS total_tokens,
    SUM(CASE WHEN ts >= :today_start    THEN total_tokens ELSE 0 END) AS today_tokens
FROM token_events
```

一次扫描计算三个维度，避免三次查询。

### 模型汇总 (model_usage_summary)

```sql
SELECT model, provider,
       COUNT(*) AS calls,
       SUM(prompt_tokens)     AS prompt_tokens,
       SUM(completion_tokens) AS completion_tokens,
       SUM(total_tokens)      AS total_tokens
FROM token_events
WHERE ts >= :since_ts   -- 可选时间过滤
GROUP BY model, provider
ORDER BY total_tokens DESC
```

### 小时统计 (hourly_stats)

```sql
SELECT hour_start AS hour,
       request_count     AS calls,
       prompt_tokens,
       completion_tokens,
       total_tokens
FROM hourly_aggregated
WHERE hour_start >= :since_hour
ORDER BY hour_start ASC
LIMIT 168   -- 最多 7 天
```

直接查预聚合表，无需全表扫描。

### 插入 + 更新聚合 (record)

```sql
-- 1. 插入事件
INSERT INTO token_events (ts, provider, raw_model, model, prompt_tokens, completion_tokens, total_tokens, cached_tokens)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- 2. 更新小时聚合（原子操作）
INSERT INTO hourly_aggregated (hour_start, total_tokens, request_count, prompt_tokens, completion_tokens)
VALUES (:hour, :tokens, 1, :prompt, :completion)
ON CONFLICT(hour_start) DO UPDATE SET
    total_tokens      = total_tokens      + :tokens,
    request_count     = request_count     + 1,
    prompt_tokens     = prompt_tokens     + :prompt,
    completion_tokens = completion_tokens + :completion;
```

## 数据生命周期

```
写入 ──→ token_events (逐条插入)
      ──→ hourly_aggregated (同步 upsert)

读取 ──→ snapshot: 直接查 token_events (CASE WHEN 聚合)
      ──→ model_usage_summary: GROUP BY token_events
      ──→ hourly_stats: 查 hourly_aggregated

清理 ──→ DELETE FROM token_events WHERE ts < :cutoff
      ──→ DELETE FROM hourly_aggregated WHERE hour_start < :cutoff
```

### 自动清理

启动时若 `auto_cleanup=true` 且 `data_retention_days > 0`，自动删除超期记录：

```rust
let cutoff = now - data_retention_days * 86400;
DELETE FROM token_events WHERE ts < cutoff;
DELETE FROM hourly_aggregated WHERE hour_start < cutoff_hour;
```

### 备份与恢复

- **备份**：调用 SQLite backup API 将数据库文件复制到 `~/.tokenstats/backups/`
- **恢复**：执行 WAL checkpoint → 用备份文件覆盖 → 重新初始化数据库连接
- **完整性检查**：`PRAGMA integrity_check`，返回 `ok` 或具体错误

## TokenRepository Trait

数据库操作通过 trait 抽象，`SqliteTokenStore` 是 SQLite 实现：

```rust
pub trait TokenRepository: Send + Sync + Clone {
    fn record(&self, usage: &TokenUsage) -> Result<()>;           // 插入事件 + 更新聚合
    fn snapshot(&self) -> Result<StatsSnapshot>;                  // 多维度统计
    fn model_usage_summary(&self, since_ts: Option<f64>) -> Result<Vec<ModelSummary>>;
    fn hourly_stats(&self, since_ts: Option<f64>) -> Result<Vec<HourlyStat>>;
    fn providers(&self) -> Result<Vec<String>>;                   // 去重 Provider 列表
    fn clear(&self) -> Result<()>;                                // 清空所有数据
    fn clear_old_data(&self, days: u32) -> Result<u64>;           // 清理旧数据
    fn export_to_csv(&self, path: &str) -> Result<u64>;           // 导出 CSV
    fn backup(&self, path: &Path) -> Result<()>;                  // 备份数据库
    fn wal_checkpoint(&self) -> Result<()>;                       // WAL 检查点
    fn check_integrity_public(&self) -> Result<String>;           // 完整性检查
    fn cleanup_old_events(&self, days: u32) -> Result<u32>;       // 清理旧事件
}
```

这种设计使得测试时可以使用 Mock 实现，无需真实数据库。
