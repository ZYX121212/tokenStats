# 架构设计

## 整体架构

TokenStats 采用 **Tauri 2.0 双层架构**：Rust 后端负责代理和数据持久化，TypeScript 前端负责 UI 展示。后端内部遵循 **领域驱动设计（DDD）分层架构**。

```
┌─────────────────────────────────────────────────────┐
│                    LLM 客户端                        │
│              (Cursor, Claude Code, 等)               │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP 请求
                       ▼
┌─────────────────────────────────────────────────────┐
│              HTTP 代理 (hyper + reqwest)              │
│         ┌─────────────────────────────────┐         │
│         │  请求解析 → Provider 路由       │         │
│         │  响应拦截 → UsageParser         │         │
│         │  用量记录 → TokenRepository     │         │
│         │  响应回传 → 原样返回客户端      │         │
│         └─────────────────────────────────┘         │
└──────────────────────┬──────────────────────────────┘
                       │ 转发请求
                       ▼
┌─────────────────────────────────────────────────────┐
│                Provider API (上游)                    │
│         OpenAI / Anthropic / 自定义 API              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   Tauri 桥接层                       │
│              #[tauri::command] 暴露                   │
│         16 个命令 → AppState (Mutex 互斥)            │
└──────────┬───────────────────────┬──────────────────┘
           │                       │
     ┌─────▼─────┐          ┌─────▼─────┐
     │  主窗口    │          │  悬浮窗    │
     │  900×650   │          │  320×140   │
     │  4 标签页   │          │  Sparkline │
     └───────────┘          └───────────┘
```

## 后端分层架构

Rust 后端严格遵循 DDD 分层：领域层 → 应用层 → 基础设施层，依赖方向为外层依赖内层。

### 领域层 (domain/)

核心业务逻辑，不依赖任何外部框架。

| 模块 | 职责 |
|------|------|
| `entity.rs` | 领域实体：`TokenUsage`、`TokenEvent`、`StatsSnapshot`、`ModelSummary`、`HourlyStat`、`AppSettings` |
| `repository.rs` | 仓库 trait：`TokenRepository` — 定义持久化接口，不涉及具体实现 |
| `service.rs` | 领域服务：`StatsService`（费用估算）、`PricingService`（模型名标准化） |

**关键设计决策**：
- `TokenUsage` 与 `TokenEvent` 分离 — 使用时传入 `TokenUsage`（无 ID、无时间戳），持久化时附加 `id` 和 `ts` 生成 `TokenEvent`
- `TokenRepository` 是 trait 而非 struct — 便于测试时 Mock，也支持未来更换存储后端
- 模型名标准化独立为 `PricingService` — 同一模型可能有多种写法（`gpt-4-turbo-2024-04-09` → `gpt-4-turbo`），标准化确保统计聚合准确

### 应用层 (application/)

编排领域对象，实现业务用例。

| 模块 | 职责 |
|------|------|
| `usecase.rs` | `StatsUsecase<R>` — 所有业务用例的入口，包含 5 秒缓存、DTO 组装 |
| `dto.rs` | 数据传输对象：`StatsDto`、`DiagnosticsDto` 等，面向前端的数据结构 |
| `port.rs` | 端口 trait：`ConfigPort`（配置读写）、`NotificationPort`（通知发送） |

**关键设计决策**：
- `StatsUsecase` 泛型参数 `R: TokenRepository` — 通过泛型持有仓库实现，而非具体类型
- 5 秒缓存 TTL — `snapshot()` 结果缓存，避免高频轮询下重复查询数据库
- DTO 与 Entity 分离 — 前端需要的数据格式（如格式化数字、费用字符串）与领域实体不同

### 基础设施层 (infrastructure/)

具体技术实现，依赖外部 crate。

| 模块 | 职责 | 关键依赖 |
|------|------|----------|
| `proxy/http_proxy.rs` | HTTP 反向代理服务器 | hyper 1, reqwest 0.12, tokio |
| `parser/usage_parser.rs` | 解析 API 响应中的 token 用量 | serde_json, regex |
| `persistence/sqlite_store.rs` | SQLite 实现 TokenRepository | rusqlite 0.30 |
| `persistence/migration.rs` | 数据库 schema 版本迁移 | rusqlite |
| `config/file_config.rs` | JSON 文件配置加载/保存 | serde_json, dirs |
| `notification.rs` | 系统桌面通知 | notify-rust |

## 数据流

### 请求拦截流程

```
1. LLM 客户端 → http://127.0.0.1:8765/openai/v1/chat/completions
2. 代理提取 provider = "openai"，匹配 ProviderConfig
3. 构建上游 URL = "https://api.openai.com/v1/chat/completions"
4. 转发请求（保留 authorization / x-api-key 头）
5. 接收上游响应
6. UsageParser 解析响应体：
   - JSON: 解析 response.usage 字段
   - SSE: 逐行解析 data: {...}，取最终 chunk 的 usage
7. TokenRepository::record() 写入 SQLite + 更新 hourly_aggregated
8. 原样返回响应给客户端
```

### 前端轮询流程

```
1. createSmartPolling() 启动，初始 3s 间隔（fast 模式）
2. 每次 poll 调用 get_stats → StatsUsecase::get_stats_dto()
3. 若连续 3 次数据无变化 → 切换到 30s 间隔（slow 模式）
4. 若数据有变化 → 重置为 3s 间隔
5. 页面不可见时 → 停止轮询
6. 页面恢复可见时 → 立即 fetch 一次，重启轮询
```

## 并发模型

```
主线程 (Tauri 事件循环)
  ├── UI 渲染 (WebView)
  ├── Tauri Commands (Mutex<AppState>)
  └── 系统托盘

代理线程 (独立 Tokio Runtime)
  ├── hyper HTTP Server
  ├── reqwest 客户端连接池
  ├── Semaphore 限流 (max 50 in-flight)
  └── Circuit Breaker 熔断器
```

- `AppState` 通过 `Mutex` 保护，确保 Tauri Commands 串行访问
- 代理运行在独立线程的 Tokio Runtime 上，不阻塞 UI
- 代理内部通过 `Arc<SqliteTokenStore>` 共享数据库连接（`SqliteTokenStore` 内部使用 `Mutex<Connection>`）

## 错误处理策略

| 层级 | 策略 |
|------|------|
| 领域层 | 返回 `anyhow::Result`，不捕获上下文 |
| 应用层 | `anyhow::Result`，添加业务语义 |
| 基础设施层 | 具体错误类型（rusqlite::Error、hyper::Error），转换为 anyhow |
| Tauri Commands | `Result<T, String>` — 将 anyhow 错误转为字符串返回前端 |
| 前端 | try/catch，Toast 显示错误信息 |

## 性能优化

| 优化点 | 策略 | 效果 |
|--------|------|------|
| 数据库读取 | WAL 模式 + 预聚合表 | 写入不阻塞读取，聚合查询 < 100ms |
| 缓存 | StatsUsecase 5s TTL | 高频轮询下避免重复查询 |
| 轮询 | 前端智能降频 | 闲置时从 3s 降至 30s，减少 90% 请求 |
| 索引 | ts/model/provider 三索引 | 时间范围查询和分组聚合走索引 |
| 连接池 | SQLite busy_timeout=5000 | 并发写入时排队等待而非失败 |
| 内存映射 | mmap_size=256MB | 大数据量下减少系统调用 |
