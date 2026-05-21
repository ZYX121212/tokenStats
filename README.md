# TokenStats

🖥️ 桌面级 LLM API Token 用量追踪代理

![Rust](https://img.shields.io/badge/rust-stable-orange)
![Tauri](https://img.shields.io/badge/tauri-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 功能

- 📊 **实时统计** — 追踪每个 LLM API 调用的 token 使用量
- 💰 **费用估算** — 自动计算各模型的 API 费用
- 📈 **趋势图表** — 按小时/天查看使用趋势
- 🪟 **悬浮窗** — 桌面全局悬浮窗，实时显示关键指标
- 🔌 **透明代理** — 作为 HTTP 代理转发请求，无需修改客户端代码
- ⚙️ **多 Provider 支持** — OpenAI / Anthropic Claude / 兼容 API

## 🚀 快速开始

### 前置要求

- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.78
- [Node.js](https://nodejs.org/) ≥ 20 (用于前端构建)
- macOS ≥ 10.15 / Windows 10 / Ubuntu 20.04

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/your-user/tokenstats.git
cd tokenstats

# 安装前端依赖
npm install

# 开发模式运行
cargo tauri dev

# 生产构建
cargo tauri build
```

## 🔧 配置

首次运行后会生成配置文件 `~/.tokenstats/config.json`：

```json
{
  "proxy_host": "127.0.0.1",
  "proxy_port": 8765,
  "providers": [
    {
      "name": "openai",
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-your-key-here"
    }
  ]
}
```

然后将你的 LLM 客户端的 API 地址指向 `http://127.0.0.1:8765` 即可开始追踪。

## 🏗️ 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | [Tauri 2.0](https://tauri.app/) (Rust + WebView) |
| 前端 | TypeScript + Vite 6 + 原生 Canvas |
| 后端 | Rust + SQLite + reqwest + hyper |
| 构建工具 | cargo tauri |

## 📁 项目结构

```
tokenStats/
├── src/                  # 前端源码 (TypeScript/CSS)
│   ├── scripts/         # JS/TS 逻辑
│   │   ├── lib/         # 共享模块
│   │   └── __tests__/   # 测试
│   ├── styles/           # CSS 样式
│   ├── index.html       # 主窗口
│   └── floating.html    # 悬浮窗
├── src-tauri/           # Tauri 后端 (Rust)
│   ├── src/             # Rust 源码
│   │   ├── domain/      # 领域层
│   │   ├── application/ # 应用层
│   │   └── infrastructure/
│   ├── icons/           # 应用图标
│   └── tauri.conf.json  # Tauri 配置
└── package.json         # 前端依赖
```

## 📄 License

MIT
