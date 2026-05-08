# TokenStats v2.0

TokenStats 是一个轻量级桌面悬浮窗，用本地代理模式统计大模型 API 的 token 消耗。数据只写入本机 SQLite。

## 功能

### 核心功能
- 桌面悬浮窗：5 分钟滚动 token、最近一次调用、累计总量、活跃模型队列
- 紧凑悬浮窗：只显示当前模型、5 分钟 token、累计 token
- 系统托盘：显示悬浮窗、打开详细统计、设置、退出
- 详细统计：按时间和 provider 过滤，查看不同模型 token、占比和估算成本
- 完整设置页：代理监听地址、端口、悬浮窗置顶/锁定/启动显示、Provider 启用、API Key、成本币种、汇率、模型单价
- 本地 HTTP 代理：转发 OpenAI / Anthropic / Gemini / OpenAI 兼容网关请求
- 自动解析 usage：`usage`、`usage.input_tokens/output_tokens`、`usageMetadata`
- 模型别名归一化：如 `gpt-4o-2024-11-20` 显示为 `GPT-4o`
- 阈值预警、透明度调节、主题切换、拖拽移动
- SQLite 本地存储

### v2.0 新增功能

#### 多主题系统
- 6 种预设主题：现代简约、深色科技、专业商务、森林绿、海洋蓝、日落橙
- 实时主题切换，全局生效
- 主题颜色自动适配悬浮窗、对话框、图表

#### 数据可视化
- 趋势图：折线图显示 Token 消耗时间趋势
- 对比图：柱状图展示各模型/Provider 消耗对比
- 分布图：饼图展示模型消耗占比分布
- 实时数据更新，支持多模型同时显示

#### 交互优化
- 全局快捷键：
  - `Ctrl+Shift+T`：显示/隐藏悬浮窗
  - `Ctrl+Shift+S`：打开详细统计
  - `Ctrl+Shift+Q`：退出应用
- 系统通知：阈值预警、每日报告、异常提醒
- 自动备份：每日自动备份数据库，保留 30 天

## 安装

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## 启动

```bash
python -m tokenstats
```

首次启动后，在悬浮窗或系统托盘右键菜单打开"设置"，填写 API Key 和上游地址。右键悬浮窗或托盘可打开"详细统计"。

## SDK 接入示例

OpenAI 兼容接口：

```python
from openai import OpenAI

client = OpenAI(
    api_key="任意值，真实 key 在 TokenStats 设置中保存",
    base_url="http://127.0.0.1:8765/openai/v1",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "hello"}],
)
```

DeepSeek / OpenRouter / OneAPI 等 OpenAI 兼容网关：

```python
client = OpenAI(
    api_key="任意值",
    base_url="http://127.0.0.1:8765/compatible/v1",
)
```

在设置中把 `compatible` 的上游地址改为你的网关地址，例如 `https://openrouter.ai/api` 或 `https://api.deepseek.com`。

中转站 / 聚合网关：

TokenStats 预置了 `relay1`、`relay2`、`relay3` 三个中转站槽位。在设置页启用其中一个，填写中转站的上游地址，例如：

```text
https://relay.example.com/v1
```

如果 SDK 侧也使用 `/v1` 路径，TokenStats 会自动避免转发成 `/v1/v1`。

```python
client = OpenAI(
    api_key="任意值",
    base_url="http://127.0.0.1:8765/relay1/v1",
)
```

常见鉴权方式：

- `bearer`：TokenStats 使用设置里的 API Key 写入 `Authorization: Bearer ...`
- `pass_through`：透传 SDK 请求自带的鉴权头
- `x-api-key`：使用 `x-api-key`
- `none`：不注入鉴权头

Anthropic：

```python
from anthropic import Anthropic

client = Anthropic(
    api_key="任意值",
    base_url="http://127.0.0.1:8765/anthropic",
)
```

Gemini REST：

```text
http://127.0.0.1:8765/gemini/v1beta/models/gemini-1.5-pro:generateContent
```

## 数据位置

默认数据库：

```text
~/.tokenstats/tokenstats.sqlite3
```

默认配置：

```text
~/.tokenstats/config.json
```

备份目录：

```text
~/.tokenstats/backups/
```

## 主题列表

| 主题名称 | 风格描述 |
|---------|---------|
| 现代简约 | 浅灰背景，蓝色强调（默认） |
| 深色科技 | 深蓝灰背景，青色强调 |
| 专业商务 | 白色背景，深蓝强调 |
| 森林绿 | 浅绿背景，深绿强调 |
| 海洋蓝 | 浅蓝背景，海蓝强调 |
| 日落橙 | 浅橙背景，橙红强调 |

## 快捷键

| 快捷键 | 功能 |
|-------|------|
| `Ctrl+Shift+T` | 显示/隐藏悬浮窗 |
| `Ctrl+Shift+S` | 打开详细统计 |
| `Ctrl+Shift+Q` | 退出应用 |

快捷键可在设置中自定义。

## 说明

TokenStats 不做 HTTPS MITM。它作为显式本地代理使用：把 SDK 的 `base_url` 指向 TokenStats，再由 TokenStats 转发到真实 API。

## 更新日志

### v2.0
- 新增多主题系统（6种预设主题）
- 新增数据可视化功能（折线图、柱状图、饼图）
- 新增全局快捷键支持
- 新增系统通知功能
- 新增自动备份功能
- 重构 UI 模块，提高可维护性
- 优化悬浮窗视觉效果

### v1.0
- 初始版本发布
