# 开发指南

## 环境搭建

### 前置依赖

| 依赖 | 最低版本 | 安装方式 |
|------|----------|----------|
| Rust | 1.78+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js | 20+ | `brew install node` 或 [nvm](https://github.com/nvm-sh/nvm) |
| macOS SDK | 10.15+ | Xcode Command Line Tools |

### 项目初始化

```bash
# 克隆仓库
git clone https://github.com/your-user/tokenstats.git
cd tokenstats

# 安装前端依赖
npm install

# 开发模式运行（启动 Tauri + Vite 前端热更新）
cargo tauri dev

# 生产构建
cargo tauri build
```

## 开发命令

### 前端开发

```bash
# 仅启动 Vite 开发服务器（端口 1420，Tauri strictPort 要求）
npm run dev

# 前端构建
npm run build

# 运行前端测试
npm test

# 运行单个测试文件
npx vitest run src/scripts/__tests__/utils.test.ts

# 监听模式运行测试
npx vitest src/scripts/__tests__/utils.test.ts
```

### Rust 开发

```bash
# 运行所有 Rust 测试
cd src-tauri && cargo test

# 运行特定模块测试
cd src-tauri && cargo test -- domain::service
cd src-tauri && cargo test -- infrastructure::persistence

# 检查编译（不生成产物，速度更快）
cd src-tauri && cargo check

# 格式化代码
cd src-tauri && cargo fmt

# Lint 检查
cd src-tauri && cargo clippy
```

### 完整开发流程

```bash
# 同时开发前后端
cargo tauri dev    # 一个终端运行 Tauri（包含 Rust 后端 + Vite 前端热更新）

# 另一个终端运行 Rust 测试
cd src-tauri && cargo test -- --watch
```

## 项目结构

```
tokenStats/
├── src/                          # 前端源码
│   ├── index.html                # 主窗口 HTML
│   ├── floating.html             # 悬浮窗 HTML
│   ├── styles/
│   │   ├── main.css              # 主窗口样式
│   │   └── floating.css          # 悬浮窗样式
│   └── scripts/
│       ├── main.ts               # 主窗口逻辑 (~700行)
│       ├── floating.ts           # 悬浮窗逻辑 (~780行)
│       ├── lib/
│       │   ├── api.ts            # Tauri invoke 封装
│       │   ├── polling.ts        # 智能轮询系统
│       │   ├── utils.ts          # 工具函数
│       │   └── toast.ts          # Toast 通知
│       └── __tests__/
│           └── utils.test.ts     # 前端测试
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 应用配置
│   ├── build.rs                  # 构建脚本
│   ├── icons/                    # 应用图标
│   └── src/
│       ├── main.rs               # 入口：AppState、16个 Commands、窗口初始化、托盘
│       ├── domain/               # 领域层
│       │   ├── entity.rs         # 实体：TokenUsage, TokenEvent, AppSettings 等
│       │   ├── repository.rs     # 仓库 trait：TokenRepository
│       │   └── service.rs        # 领域服务：StatsService, PricingService
│       ├── application/          # 应用层
│       │   ├── usecase.rs        # 用例：StatsUsecase (缓存+DTO组装)
│       │   ├── dto.rs            # DTO：StatsDto, DiagnosticsDto
│       │   └── port.rs           # 端口 trait：ConfigPort, NotificationPort
│       └── infrastructure/       # 基础设施层
│           ├── proxy/
│           │   └── http_proxy.rs # HTTP 代理服务器
│           ├── parser/
│           │   └── usage_parser.rs # Token 用量解析器
│           ├── persistence/
│           │   ├── sqlite_store.rs # SQLite 实现
│           │   └── migration.rs   # Schema 迁移
│           ├── config/
│           │   └── file_config.rs # JSON 配置
│           └── notification.rs    # 系统通知
├── package.json                  # 前端依赖 & NPM 脚本
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 构建配置
└── CLAUDE.md                     # Claude Code 开发指引
```

## 架构约定

### 后端分层

```
domain/      → 不依赖任何外部 crate，纯业务逻辑
application/ → 依赖 domain/，不依赖 infrastructure/
infrastructure/ → 实现领域层定义的 trait，依赖外部 crate
main.rs      → 组装所有层，创建 Tauri 应用
```

**依赖方向**：`main.rs` → `infrastructure/` → `application/` → `domain/`

### Rust 测试

所有 Rust 测试内联在模块的 `#[cfg(test)] mod tests` 中，使用 Mock 实现 `TokenRepository` trait：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    struct MockRepository { /* ... */ }
    impl TokenRepository for MockRepository { /* ... */ }

    #[test]
    fn test_something() {
        let repo = MockRepository::new();
        // ...
    }
}
```

### 前端约定

- **无框架**：不使用 React/Vue/Svelte，纯 TypeScript + DOM 操作 + Canvas 绑定
- **通信方式**：通过 `window.__TAURI__.core.invoke()` 调用后端命令
- **API 封装**：所有后端调用集中在 `scripts/lib/api.ts`
- **样式**：原生 CSS，不使用 CSS-in-JS 或预处理器
- **图表**：Canvas 2D 手动绑制，不依赖图表库

### Vite 配置要点

```typescript
// vite.config.ts 关键配置
export default defineConfig({
  root: 'src',                    // 前端源码在 src/ 下
  plugins: [react()],             // （当前项目无 React，使用原生 TS）
  build: {
    outDir: '../dist',            // 输出到项目根目录的 dist/
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        floating: resolve(__dirname, 'src/floating.html'),
      },
    },
  },
  server: {
    port: 1420,                   // 固定端口，Tauri strictPort 要求
    strictPort: true,
  },
});
```

## 添加新功能流程

### 添加新的 Tauri Command

1. **领域层**：如需新实体，在 `domain/entity.rs` 添加
2. **仓库层**：如需新查询，在 `domain/repository.rs` 的 `TokenRepository` trait 添加方法
3. **基础设施层**：在 `sqlite_store.rs` 实现新方法
4. **应用层**：在 `usecase.rs` 添加业务逻辑（如有），在 `dto.rs` 添加 DTO（如有）
5. **主入口**：在 `main.rs` 添加 `#[tauri::command]` 函数并注册到 `invoke_handler`
6. **前端 API**：在 `scripts/lib/api.ts` 添加调用封装
7. **前端 UI**：在 `main.ts` 或 `floating.ts` 中调用并渲染

### 添加新 Provider 支持

1. 在 `usage_parser.rs` 的 `UsageParser` 中添加新 Provider 的响应格式解析
2. 在 `service.rs` 的 `PricingService::normalize_model_name()` 中添加新模型的标准化规则
3. 在 `config.json` 的 `model_prices` 中添加默认定价

### 添加数据库迁移

1. 在 `migration.rs` 的 `migrations` Vec 中添加新的 `(version, sql)` 元组
2. 版本号递增（v3, v4, ...）
3. 迁移会在下次启动时自动执行

## 调试技巧

### 查看 Rust 日志

```bash
# 开发模式下，Rust 日志输出到终端
RUST_LOG=debug cargo tauri dev
RUST_LOG=tokenstats=trace cargo tauri dev  # 只看项目日志
```

### 代理调试

在 `config.json` 中设置：

```json
{
  "debug_log": true,
  "mock_mode": true
}
```

- `debug_log`：记录请求/响应细节（敏感信息脱敏）
- `mock_mode`：不转发到上游，返回模拟响应

### 数据库调试

```bash
# 直接查看数据库
sqlite3 ~/.tokenstats/tokenstats.db

# 常用查询
SELECT COUNT(*) FROM token_events;
SELECT * FROM token_events ORDER BY ts DESC LIMIT 10;
SELECT * FROM hourly_aggregated ORDER BY hour_start DESC LIMIT 24;
PRAGMA integrity_check;
```

### 前端调试

- 在开发模式下使用浏览器 DevTools（Tauri WebView 支持）
- Vite 热更新：修改 `src/` 下的文件后自动刷新
- Console 中可调用 `window.__TAURI__` 直接与后端交互

## 依赖版本

### Rust (Cargo.toml)

| 依赖 | 版本 | 用途 |
|------|------|------|
| tauri | 2 | 桌面应用框架 |
| tauri-plugin-shell | 2 | Shell 操作插件 |
| tokio | 1 (full) | 异步运行时 |
| hyper | 1 | HTTP 服务器 |
| hyper-util | 0.1 | hyper 工具 |
| reqwest | 0.12 | HTTP 客户端 |
| rusqlite | 0.30 (bundled + backup) | SQLite 绑定 |
| serde / serde_json | 1 | 序列化 |
| chrono | 0.4 | 时间处理 |
| tracing | 0.1 | 结构化日志 |
| anyhow | 1 | 错误处理 |
| csv | 1.3 | CSV 导出 |
| regex | 1 | 正则匹配 |
| dirs | 5 | 系统目录 |
| notify-rust | 4 | 系统通知 |

### TypeScript (package.json)

| 依赖 | 用途 |
|------|------|
| @tauri-apps/api | Tauri 前端 API |
| vite | 构建工具 |
| vitest | 测试框架 |
| typescript | 类型检查 |
