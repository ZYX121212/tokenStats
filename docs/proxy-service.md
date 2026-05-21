# 代理服务详解

## 概述

TokenStats 的核心是一个本地 HTTP 反向代理服务器，运行在 `127.0.0.1:8765`（可配置）。它拦截 LLM API 请求，转发到上游 Provider，在响应中提取 token 使用量，然后记录到本地数据库。

## 工作原理

```
                    ┌────────────────────────────┐
                    │     TokenStats Proxy        │
                    │                            │
  LLM 客户端 ──►   │  ① 解析请求路径              │
  POST /openai/    │  ② 匹配 Provider 配置       │
  v1/chat/         │  ③ 构建上游 URL              │
  completions      │  ④ 转发请求 + 认证头         │
                    │                            │
                    │  ⑤ 接收上游响应              │
                    │  ⑥ UsageParser 解析用量      │
                    │  ⑦ TokenRepository 记录      │
                    │  ⑧ 原样返回响应给客户端      │
                    └──────────┬─────────────────┘
                               │
                               ▼
                    Provider API (上游)
```

## 请求路由

代理使用 URL 路径的第一段作为 Provider 名称进行路由匹配：

```
请求路径: /openai/v1/chat/completions
         ↑
      provider name

匹配规则:
1. 在 providers 配置中查找 name 匹配（不区分大小写）
2. 支持「前缀匹配」— 如果 providers 中有 "openai"，则 "/OpenAI/v1/..." 也能匹配
3. 匹配成功后，去掉路径中的 provider 前缀，拼接到 base_url 形成上游 URL

上游 URL = base_url + "/v1/chat/completions"
         = "https://api.openai.com/v1" + "/v1/chat/completions"
         = "https://api.openai.com/v1/chat/completions"
```

### 多实例负载均衡

同名 Provider 可配置多个实例，通过 `weight` 字段实现加权轮询：

```json
{
  "providers": [
    { "name": "openai", "base_url": "https://api.openai.com/v1", "api_key": "sk-key1", "weight": 3 },
    { "name": "openai", "base_url": "https://custom-proxy.example.com/v1", "api_key": "sk-key2", "weight": 1 }
  ]
}
```

此配置下，约 75% 的 openai 请求走官方 API，25% 走自定义代理。

## 认证头转发

代理会自动转发以下认证头到上游：

| 请求头 | 用途 |
|--------|------|
| `authorization` | OpenAI 使用的 Bearer Token |
| `x-api-key` | Anthropic 使用的 API Key |
| `bearer` | 部分 OpenAI 兼容 API 使用 |

如果请求中未携带认证头，但 Provider 配置了 `api_key`，代理会自动附加。

## Token 用量解析

### UsageParser 工作流程

代理支持两种响应格式的 token 用量提取：

#### JSON 完整响应（非流式）

```json
{
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

OpenAI 格式直接读取 `usage` 对象；Anthropic 格式映射 `input_tokens` → `prompt_tokens`，`output_tokens` → `completion_tokens`。

#### SSE 流式响应

```
data: {"choices": [...], "usage": null}
data: {"choices": [...], "usage": null}
data: {"choices": [...], "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}}
data: [DONE]
```

流式响应中，`usage` 通常在最后一个 `data:` 行中出现。UsageParser 逐行解析 SSE，提取最后一个包含 `usage` 字段的 chunk。

> OpenAI 在流式请求中需要设置 `stream_options: { include_usage: true }` 才会在最后一个 chunk 返回 usage。

### Token 字段映射

| OpenAI 字段 | Anthropic 字段 | TokenStats 字段 |
|-------------|----------------|-----------------|
| `prompt_tokens` | `input_tokens` | `prompt_tokens` |
| `completion_tokens` | `output_tokens` | `completion_tokens` |
| `total_tokens` | (计算值) | `total_tokens` |
| `cached_tokens` | — | `cached_tokens` |
| `prompt_tokens_details.cached_tokens` | — | `cached_tokens`（备选路径） |

### 模型名标准化

原始模型名会被 `PricingService::normalize_model_name()` 标准化，用于统计聚合和价格匹配：

| 原始名 | 标准化后 |
|--------|----------|
| `gpt-4-turbo-2024-04-09` | `gpt-4-turbo` |
| `gpt-4o-2024-05-13` | `gpt-4o` |
| `gpt-3.5-turbo-0125` | `gpt-3.5-turbo` |
| `claude-3-sonnet-20240229` | `claude-3-sonnet` |
| `claude-3-opus-20240229` | `claude-3-opus` |
| `openai:gpt-4` | `gpt-4` |
| `provider@model-name` | `model-name` |

标准化规则：
1. 去除 `provider:` 或 `provider@` 前缀
2. 去除日期版本后缀（如 `-20240229`、`-2024-04-09`、`-0125`）
3. 匹配已知模型族，应用族级归一化

## 容错机制

### 重试策略

| 触发状态码 | 最大重试次数 | 退避策略 |
|------------|-------------|----------|
| 429 (Too Many Requests) | 3 | 指数退避 + 随机抖动 |
| 502 (Bad Gateway) | 3 | 指数退避 |
| 503 (Service Unavailable) | 3 | 指数退避 |
| 504 (Gateway Timeout) | 3 | 指数退避 |

### 熔断器 (Circuit Breaker)

```
状态机:
  CLOSED (正常) → 连续 10 次错误 → OPEN (熔断)
  OPEN (熔断) → 等待 30 秒 → HALF_OPEN (半开)
  HALF_OPEN → 请求成功 → CLOSED
  HALF_OPEN → 请求失败 → OPEN
```

### 并发控制

| 参数 | 值 | 说明 |
|------|-----|------|
| 最大并发连接 | 100 | hyper 服务端连接数上限 |
| 最大在飞请求 | 50 | Semaphore 许可证数 |
| 在飞超时 | 5 秒 | 获取 Semaphore 许可的超时 |
| 请求体限制 | 10 MB | 超过此大小拒绝请求 |

## 特殊端点

代理提供以下内置端点，不转发到上游：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查，返回 `{"status": "ok"}` |
| `/metrics` | GET | 代理指标（请求数、错误率等） |
| `/status` | GET | 代理运行状态详情 |

## 调试模式

开启 `debug_log: true` 后，代理会记录：

- 请求方法和路径
- 请求体（API key 等敏感字段自动替换为 `***`）
- 响应状态码
- 响应体前 1000 字符
- Token 用量解析结果

日志输出到标准错误（stderr），可通过 `cargo tauri dev` 的终端查看。

## Mock 模式

开启 `mock_mode: true` 后，代理不转发请求到上游，而是返回模拟的 OpenAI 格式响应：

```json
{
  "id": "mock-...",
  "object": "chat.completion",
  "model": "mock-model",
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  },
  "choices": [...]
}
```

用途：前端开发和代理功能测试，无需真实 API key。

## 数据库交互

代理在独立线程中运行，通过 `Arc<SqliteTokenStore>` 与主线程共享数据库连接：

```
代理线程                              主线程
  │                                    │
  ├── record(usage) ──┐               ├── get_stats()
  │                   │               ├── get_models()
  │            Mutex<Connection>       │
  │                   │               └── get_hourly_stats()
  └── hourly upsert ──┘
```

- `record()` 插入 `token_events` 表并更新 `hourly_aggregated` 表（原子操作）
- SQLite WAL 模式确保写入不阻塞主线程的读取查询
