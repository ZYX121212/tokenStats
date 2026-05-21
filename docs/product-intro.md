# TokenStats 产品介绍

## 一句话概述

TokenStats 是一款桌面级 LLM API Token 用量追踪工具，通过本地透明代理拦截 API 调用，实时统计 token 消耗与费用。

## 解决什么问题

使用大语言模型 API（如 OpenAI GPT-4、Anthropic Claude）时，开发者面临以下痛点：

- **用量不透明** — API 控制台的账单往往延迟数小时，无法实时掌握消耗
- **成本失控** — 缺乏即时告警，一次误操作可能产生高额费用
- **多 Provider 管理难** — 同时使用 OpenAI、Claude、DeepSeek 等多家服务时，缺少统一视图
- **数据分散** — 各平台仪表盘风格各异，难以横向对比

TokenStats 通过本地代理拦截所有 LLM API 请求，无需修改客户端代码，即可实现对 token 使用量的实时监控、费用估算和趋势分析。

## 核心功能

### 1. 实时 Token 统计

- 追踪每次 LLM API 调用的 `prompt_tokens`、`completion_tokens`、`total_tokens` 和 `cached_tokens`
- 提供「近 5 分钟」「今日」「累计」三个维度的快速统计
- 支持按模型、按 Provider 分组查看

### 2. 费用估算

- 内置主流模型定价（GPT-4o、Claude 3.5 Sonnet、DeepSeek 等）
- 支持自定义模型价格配置（按百万 token 计价）
- 支持 USD / CNY 双币种切换，实时汇率换算
- 公式：`费用 = (prompt_tokens / 1M × input_price) + (completion_tokens / 1M × output_price)`

### 3. 趋势图表

- **时序折线图** — 按小时展示近 7 天的 token 使用趋势
- **每日柱状图** — 按天汇总使用量，适合周/月维度分析
- **模型占比饼图** — 直观展示各模型的使用比例
- 支持时间范围筛选：全部 / 今日 / 近 7 天 / 近 30 天

### 4. 桌面悬浮窗

- 320×140 紧凑面板，始终置顶显示
- 实时 sparkline 迷你折线图，一眼看清趋势
- 5 分钟阈值告警（可自定义阈值）
- 半透明度可调，双击最大化/还原
- 快捷键 `Ctrl+Shift+H` 切换显隐

### 5. HTTP 透明代理

- 本地启动 HTTP 代理服务器（默认 `127.0.0.1:8765`）
- 支持 OpenAI 和 Anthropic 两种响应格式的 token 用量解析
- 同时支持 JSON 完整响应和 SSE 流式响应
- 内置重试、熔断、限流机制，保障代理稳定性
- 零侵入：只需将 API 地址指向代理即可

### 6. 多 Provider 支持

- 同时配置多个 LLM API Provider（OpenAI、Anthropic、DeepSeek、自定义兼容 API）
- 每个 Provider 独立配置 base_url 和 API key
- 支持加权轮询（同一 Provider 多实例负载均衡）

## 典型使用场景

### 场景一：个人开发者成本控制

> 小王在开发中使用 GPT-4o 和 Claude 3.5 Sonnet 两个模型。他配置 TokenStats 代理后，悬浮窗实时显示今日消耗。当 5 分钟内 token 消耗超过 20,000 时，系统发出通知提醒。

### 场景二：团队 API 使用审计

> 团队将 TokenStats 部署在开发机上，所有成员的 API 请求通过代理转发。在统计页面查看各模型的使用占比和费用分布，月底导出 CSV 报表用于报销。

### 场景三：调试 API 集成

> 在接入新的 LLM Provider 时，开启 debug_log 模式查看完整的请求/响应日志（敏感信息自动脱敏），快速定位 token 统计异常。

## 支持的 LLM Provider

| Provider | 状态 | 说明 |
|----------|------|------|
| OpenAI | 完整支持 | GPT-4/4o/3.5-turbo 全系列，含 cached_tokens |
| Anthropic | 完整支持 | Claude 3 Opus/Sonnet/Haiku，input/output_tokens 映射 |
| DeepSeek | 支持 | 兼容 OpenAI 格式 |
| 其他 OpenAI 兼容 API | 支持 | 只需配置 base_url |

## 技术亮点

- **Rust + Tauri 2.0** — 原生级性能，安装包 < 10MB，内存占用 < 50MB
- **SQLite WAL 模式** — 高并发写入不阻塞读取，聚合查询 < 100ms
- **智能轮询** — 前端自适应轮询频率（3s 活跃 → 30s 静止 → 可见性感知暂停）
- **小时级预聚合** — 插入时自动更新 hourly_aggregated 表，查询无需全表扫描
- **零依赖前端** — 纯 TypeScript + Canvas，不依赖 React/Vue 等框架

## 系统要求

| 平台 | 最低版本 |
|------|----------|
| macOS | 10.15 (Catalina) |
| Windows | 10 |
| Linux | Ubuntu 20.04+ |

需要 Rust ≥ 1.78、Node.js ≥ 20 仅用于开发构建。
