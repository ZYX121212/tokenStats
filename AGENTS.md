# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# 开发模式（启动 Tauri + Vite 前端热更新）
cargo tauri dev

# 生产构建
cargo tauri build

# 仅前端开发服务器
npm run dev

# 前端构建
npm run build

# 前端测试
npm test                    # 运行所有测试
npx vitest run src/scripts/__tests__/utils.test.ts  # 单个测试文件

# Rust 测试
cd src-tauri && cargo test  # 运行所有 Rust 测试
cd src-tauri && cargo test -- domain::service  # 运行特定模块测试
```

## Architecture

TokenStats 是一个 Tauri 2.0 桌面应用，作为 HTTP 透明代理拦截 LLM API 请求，追踪 token 使用量。

### Rust 后端（src-tauri/src/）— 分层架构

- **domain/** — 领域层：实体定义（`entity.rs`：TokenUsage/TokenEvent/AppSettings 等）、仓库 trait（`repository.rs`：TokenRepository）、领域服务（`service.rs`：StatsService/PricingService 模型名标准化）
- **application/** — 应用层：用例（`usecase.rs`：StatsUsecase 含缓存和费用估算）、DTO（`dto.rs`）、端口 trait（`port.rs`：ConfigPort/NotificationPort）
- **infrastructure/** — 基础设施层：
  - `proxy/http_proxy.rs` — hyper 实现的 HTTP 代理服务器（含重试、熔断、限流）
  - `parser/usage_parser.rs` — 解析 OpenAI/Anthropic 响应中的 token 使用量（支持 JSON 和 SSE 流式）
  - `persistence/sqlite_store.rs` — SQLite 实现 TokenRepository（WAL 模式，慢查询告警 >100ms）
  - `persistence/migration.rs` — 数据库 schema 迁移（版本化，当前 v2）
  - `config/file_config.rs` — JSON 文件配置加载（含 deep merge 兼容旧配置）
  - `notification.rs` — 系统通知

Rust 测试内联在各模块的 `#[cfg(test)] mod tests` 中，使用 Mock 实现 TokenRepository trait。

### TypeScript 前端（src/）— 双窗口

- **主窗口**（`index.html` + `scripts/main.ts`）— 仪表盘、统计图表、设置页
- **悬浮窗**（`floating.html` + `scripts/floating.ts`）— 始终置顶的小窗口，Canvas sparkline 图表、智能轮询
- **共享库**（`scripts/lib/`）：
  - `api.ts` — Tauri invoke 封装所有后端命令
  - `polling.ts` — 智能轮询（fast→slow 自动降频，visibility 感知）
  - `utils.ts` — 格式化、DOM helper、模型颜色哈希
  - `toast.ts` — Toast 通知

前端无框架，使用原生 TypeScript + Canvas 绑定 + CSS，通过 `window.__TAURI__.core.invoke` 调用后端。

### 关键数据流

1. LLM 客户端 → HTTP 代理（`ProxyServer`）→ 转发到 Provider API
2. 代理拦截响应 → `UsageParser` 提取 token 用量 → `TokenRepository::record()` 写入 SQLite
3. 前端通过 Tauri commands（`get_stats`/`get_models`/`get_hourly_stats`）轮询后端
4. 悬浮窗使用 `createSmartPolling` 实现自适应轮询频率

### 配置与数据路径

- 配置文件：`~/.tokenstats/config.json`（Unix 权限 0o600）
- 数据库：`~/.tokenstats/tokenstats.db`（SQLite WAL 模式）
- 备份：`~/.tokenstats/backups/`
- 崩溃日志：`~/Library/Application Support/TokenStats/crash.log`（macOS）

### Tauri Commands

所有后端 API 通过 `#[tauri::command]` 暴露，在 `main.rs` 中注册：`get_stats`、`get_models`、`get_models_since`、`get_settings`、`save_settings`、`show_main_window`、`export_csv`、`clear_all_data`、`cleanup_old_data`、`backup_db`、`restore_db`、`get_hourly_stats`、`get_providers`、`get_diagnostics`、`check_db_integrity`。

### Vite 配置要点

- `root: 'src'`，多入口打包（main + floating）
- Vite dev server 端口固定 1420（Tauri 要求 `strictPort: true`）
- 构建产物输出到 `dist/`，生产环境 drop console/debugger
