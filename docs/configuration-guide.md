# 配置指南

## 配置文件位置

| 平台 | 路径 |
|------|------|
| macOS | `~/.tokenstats/config.json` |
| Linux | `~/.tokenstats/config.json` |
| Windows | `%USERPROFILE%\.tokenstats\config.json` |

首次运行时自动生成默认配置。文件权限为 `0o600`（仅所有者可读写），保护 API key 安全。

## 完整配置项

```json
{
  "proxy_host": "127.0.0.1",
  "proxy_port": 8765,
  "providers": [],
  "alert_threshold_5m": 20000,
  "opacity": 0.48,
  "theme": "dark",
  "always_on_top": true,
  "lock_position": false,
  "show_on_start": true,
  "window_x": 40,
  "window_y": 80,
  "currency": "USD",
  "usd_to_cny": 7.25,
  "floating_width": 320,
  "floating_height": 140,
  "enable_notifications": true,
  "data_retention_days": 365,
  "auto_cleanup": true,
  "retention_days": 30,
  "model_prices": {},
  "config_version": 1,
  "debug_log": false,
  "mock_mode": false
}
```

## 配置项详解

### 代理服务器

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `proxy_host` | string | `"127.0.0.1"` | 代理监听地址。**建议保持 127.0.0.1**，非 localhost 地址会导致公网可访问 |
| `proxy_port` | u16 | `8765` | 代理监听端口，范围 1-65535 |

> **安全警告**：将 `proxy_host` 设为 `0.0.0.0` 等非 localhost 地址时，启动日志会输出警告。这意味着代理对公网可见，可能暴露 API key。

### Provider 配置

`providers` 数组，每个元素为一个 Provider 配置：

```json
{
  "providers": [
    {
      "name": "openai",
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-your-key-here",
      "weight": 1
    },
    {
      "name": "anthropic",
      "base_url": "https://api.anthropic.com",
      "api_key": "sk-ant-your-key-here",
      "weight": 1
    },
    {
      "name": "deepseek",
      "base_url": "https://api.deepseek.com/v1",
      "api_key": "sk-your-deepseek-key",
      "weight": 1
    }
  ]
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | string | — | Provider 名称，用于 URL 路由。客户端请求 `http://proxy:port/{name}/...` |
| `base_url` | string | — | 上游 API 基础地址 |
| `api_key` | string | — | API 密钥，转发时附加到请求头 |
| `weight` | u32 | `1` | 负载均衡权重。同名的多个 Provider 配置按权重轮询 |

**请求路由示例**：
```
客户端请求: http://127.0.0.1:8765/openai/v1/chat/completions
路由匹配:   provider = "openai"
上游请求:   https://api.openai.com/v1/chat/completions
```

### 告警与通知

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `alert_threshold_5m` | u64 | `20000` | 5 分钟内 token 消耗超过此阈值时发出通知 |
| `enable_notifications` | bool | `true` | 是否启用系统桌面通知 |

### UI 设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `opacity` | f64 | `0.48` | 悬浮窗透明度，范围 0.0-1.0 |
| `theme` | string | `"dark"` | 主题，当前支持 `"dark"` |
| `always_on_top` | bool | `true` | 悬浮窗是否始终置顶 |
| `lock_position` | bool | `false` | 是否锁定悬浮窗位置 |
| `show_on_start` | bool | `true` | 启动时是否显示悬浮窗 |
| `window_x` | i32 | `40` | 悬浮窗初始 X 坐标 |
| `window_y` | i32 | `80` | 悬浮窗初始 Y 坐标 |
| `floating_width` | u32 | `320` | 悬浮窗宽度 |
| `floating_height` | u32 | `140` | 悬浮窗高度 |

### 费用与货币

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `currency` | string | `"USD"` | 显示货币，支持 `"USD"` 或 `"CNY"` |
| `usd_to_cny` | f64 | `7.25` | USD 转 CNY 汇率，仅当 currency 为 CNY 时使用 |

### 模型定价

`model_prices` 对象，key 为标准化模型名，value 为每百万 token 的 USD 价格：

```json
{
  "model_prices": {
    "gpt-4o": { "input": 2.5, "output": 10.0 },
    "gpt-4-turbo": { "input": 10.0, "output": 30.0 },
    "gpt-3.5-turbo": { "input": 0.5, "output": 1.5 },
    "claude-3-opus": { "input": 15.0, "output": 75.0 },
    "claude-3-sonnet": { "input": 3.0, "output": 15.0 },
    "claude-3-haiku": { "input": 0.25, "output": 1.25 },
    "deepseek-chat": { "input": 0.14, "output": 0.28 },
    "deepseek-coder": { "input": 0.14, "output": 0.28 }
  }
}
```

> **注意**：模型名使用标准化后的名称（如 `claude-3-sonnet` 而非 `claude-3-sonnet-20240229`）。系统会自动将带版本号的模型名标准化。

未配置价格的模型使用默认费率：$0.003 / 1K tokens。

### 数据保留

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data_retention_days` | u32 | `365` | 数据保留天数，启动时自动清理超期记录 |
| `auto_cleanup` | bool | `true` | 是否在启动时自动清理 |
| `retention_days` | u32 | `30` | 手动清理时使用的保留天数（cleanup_old_data 命令） |

### 调试

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `debug_log` | bool | `false` | 启用后，代理会记录请求/响应体（敏感信息脱敏） |
| `mock_mode` | bool | `false` | 启用后，代理返回模拟响应，不调用上游 API（用于测试） |

## 配置迁移

`config_version` 字段用于版本化配置格式。当新增配置项时，系统会自动将旧配置与新默认值深度合并（deep merge），无需手动更新。

当前版本：`1`

## 客户端配置

将 LLM 客户端的 API Base URL 指向 TokenStats 代理即可：

| 客户端 | 配置方式 |
|--------|----------|
| OpenAI SDK | `OPENAI_BASE_URL=http://127.0.0.1:8765/openai/v1` |
| Anthropic SDK | `ANTHROPIC_BASE_URL=http://127.0.0.1:8765/anthropic` |
| Cursor | Settings → API Base URL → `http://127.0.0.1:8765/openai/v1` |
| Continue | 修改 `config.json` 中的 `apiBase` |
| 其他 OpenAI 兼容客户端 | 设置 base URL 为 `http://127.0.0.1:8765/{provider_name}/...` |

> **提示**：URL 路径中的第一段需匹配 providers 配置中的 `name` 字段（不区分大小写）。
