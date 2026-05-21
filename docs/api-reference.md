# API 参考

TokenStats 后端通过 Tauri Commands 暴露 API，前端通过 `window.__TAURI__.core.invoke()` 调用。

## 调用方式

```typescript
import { invoke } from '@tauri-apps/api/core';

// 获取统计数据
const stats = await invoke<StatsDto>('get_stats');

// 保存设置
await invoke('save_settings', { settings: newSettings });
```

项目中封装了 `scripts/lib/api.ts`，提供类型安全的调用接口。

## 命令列表

### get_stats

获取统计快照（含缓存，TTL 5 秒）。

```typescript
invoke<StatsDto>('get_stats')
```

**返回 StatsDto**：

```typescript
interface StatsDto {
  five_min_tokens: string;    // 格式化数字，如 "1.2K"
  total_tokens: string;       // 格式化数字，如 "125.3K"
  today_tokens: string;       // 格式化数字，如 "8.5K"
  cost: string;               // 费用字符串，如 "$1.23" 或 "¥8.92" 或 "无单价"
  five_min_raw: number;       // 原始值
  total_raw: number;
  today_raw: number;
  last_event: {
    model: string;
    ts: number;
    provider: string;
  } | null;
  model_count: number;        // 已使用的模型数
  provider_count: number;     // 已使用的 Provider 数
}
```

### get_models

获取所有模型的用量汇总。

```typescript
invoke<ModelSummary[]>('get_models')
```

**返回 ModelSummary[]**：

```typescript
interface ModelSummary {
  model: string;            // 标准化模型名
  provider: string;         // Provider 名称
  calls: number;            // 调用次数
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

### get_models_since

获取指定时间范围内的模型用量汇总。

```typescript
invoke<ModelSummary[]>('get_models_since', { hours: 24 })
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hours` | number | 否 | 回溯小时数。不传则返回全部 |

### get_hourly_stats

获取按小时聚合的统计数据，默认返回近 7 天（168 小时）。

```typescript
invoke<HourlyStat[]>('get_hourly_stats', { hours: 168 })
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hours` | number | 否 | 回溯小时数。不传则返回全部 |

**返回 HourlyStat[]**：

```typescript
interface HourlyStat {
  hour: string;           // "2024-01-15 10:00"
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

### get_providers

获取已记录数据的 Provider 列表。

```typescript
invoke<string[]>('get_providers')
```

**返回**：`string[]` — Provider 名称数组，如 `["openai", "anthropic"]`

### get_settings

获取当前应用设置。

```typescript
invoke<AppSettings>('get_settings')
```

返回完整的 `AppSettings` 对象，详见 [配置指南](configuration-guide.md)。

### save_settings

保存应用设置。会同时更新内存中的设置和写入配置文件。

```typescript
invoke('save_settings', { settings: appSettings })
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `settings` | AppSettings | 是 | 完整的设置对象 |

**注意**：传入的是完整设置，非增量更新。需先 `get_settings` 获取当前值，修改后再传入。

### refresh_data

强制刷新统计数据缓存。

```typescript
invoke('refresh_data')
```

使 5 秒缓存立即失效，下次 `get_stats` 调用将重新查询数据库。

### show_main_window

显示主窗口并聚焦。

```typescript
invoke('show_main_window', { tab: 'settings' })
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tab` | string | 否 | 打开后切换到指定标签页：`overview`/`statistics`/`settings`/`diagnostics` |

### export_csv

导出统计数据为 CSV 文件。

```typescript
invoke<string>('export_csv')
```

**返回**：成功信息字符串，如 `"已导出 1234 条记录到 /Users/nova/Downloads/tokenstats_20240115_143000.csv"`

文件保存到 `~/Downloads/` 目录，文件名格式：`tokenstats_YYYYMMDD_HHMMSS.csv`

### clear_all_data

清空全部统计数据。**不可逆操作**。

```typescript
invoke<string>('clear_all_data')
```

**返回**：`"已清空全部统计数据"`

### cleanup_old_data

清理指定天数之前的数据。

```typescript
invoke<number>('cleanup_old_data', { days: 30 })
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `days` | number | 是 | 保留最近 N 天的数据，删除更早的记录 |

**返回**：删除的记录数

### backup_db

备份数据库文件。

```typescript
invoke<string>('backup_db', { path: '/custom/path/backup.db' })
// 或使用默认路径
invoke<string>('backup_db')
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 否 | 自定义备份路径。不传则使用默认路径 `~/.tokenstats/backups/` |

**返回**：`"备份已保存到: /path/to/backup.db"`

### restore_db

从备份文件恢复数据库。

```typescript
invoke<string>('restore_db', { path: '/path/to/backup.db' })
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 备份文件路径 |

恢复流程：
1. 执行 WAL checkpoint
2. 用备份文件覆盖当前数据库
3. 重新初始化 SqliteTokenStore
4. 替换 Usecase 中的 Repository 实例

### get_diagnostics

获取诊断信息。

```typescript
invoke<DiagnosticsDto>('get_diagnostics')
```

**返回 DiagnosticsDto**：

```typescript
interface DiagnosticsDto {
  db_size_bytes: number;          // 数据库文件大小（字节）
  db_row_count: number;           // 事件总数（按 calls 汇总）
  db_last_event_time: string | null;  // 最后事件时间
  proxy_uptime_secs: number;      // 代理运行时间（秒）
  proxy_total_requests: number;   // 代理总请求数
  proxy_active_connections: number;  // 当前活跃连接
  proxy_error_rate_pct: number;   // 错误率百分比
  config_file_exists: boolean;    // 配置文件是否存在
  config_file_path: string;       // 配置文件路径
  config_port_valid: boolean;     // 端口配置是否有效
  config_api_key_configured: boolean;  // 是否至少配置了一个 API key
}
```

### check_db_integrity

检查数据库完整性。

```typescript
invoke<string>('check_db_integrity')
```

**返回**：SQLite `PRAGMA integrity_check` 的结果，如 `"ok"` 或错误详情。

## 前端 API 封装

`scripts/lib/api.ts` 封装了所有命令调用：

```typescript
// api.ts 提供的方法
export const api = {
  getStats: () => invoke<StatsDto>('get_stats'),
  getModels: () => invoke<ModelSummary[]>('get_models'),
  getModelsSince: (hours?: number) => invoke<ModelSummary[]>('get_models_since', { hours }),
  getHourlyStats: (hours?: number) => invoke<HourlyStat[]>('get_hourly_stats', { hours }),
  getProviders: () => invoke<string[]>('get_providers'),
  getSettings: () => invoke<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings) => invoke('save_settings', { settings }),
  refreshData: () => invoke('refresh_data'),
  showMainWindow: (tab?: string) => invoke('show_main_window', { tab }),
  exportCsv: () => invoke<string>('export_csv'),
  clearAllData: () => invoke<string>('clear_all_data'),
  cleanupOldData: (days: number) => invoke<number>('cleanup_old_data', { days }),
  backupDb: (path?: string) => invoke<string>('backup_db', { path }),
  restoreDb: (path: string) => invoke<string>('restore_db', { path }),
  getDiagnostics: () => invoke<DiagnosticsDto>('get_diagnostics'),
  checkDbIntegrity: () => invoke<string>('check_db_integrity'),
};
```
