# TokenStats v2.0 设计文档

## 项目概述

TokenStats 是一个轻量级桌面悬浮窗应用，用本地代理模式统计大模型 API 的 token 消耗。v2.0 版本将进行全面的 UI/UX 升级和功能增强。

## 设计目标

1. **视觉升级**：现代简约风格，支持 6+ 预设主题
2. **数据可视化**：集成 PyQtGraph，支持折线图、柱状图、饼图
3. **交互优化**：全局快捷键、系统通知、悬浮窗缩放
4. **代码架构**：模块化重构，提高可维护性

## 阶段规划

### 阶段一：UI 视觉升级

#### 1.1 多主题系统

**主题配置结构：**

```python
@dataclass
class Theme:
    name: str
    # 悬浮窗颜色
    floating_bg: str
    floating_fg: str
    floating_border: str
    floating_alert_bg: str
    floating_alert_border: str
    # 对话框颜色
    dialog_bg: str
    dialog_fg: str
    card_bg: str
    card_border: str
    # 强调色
    primary: str
    secondary: str
    accent: str
    # 图表颜色
    chart_colors: List[str]
```

**预设主题（6个）：**

1. **现代简约**（默认）- 浅灰背景，蓝色强调
2. **深色科技** - 深蓝灰背景，青色强调
3. **专业商务** - 白色背景，深蓝强调
4. **森林绿** - 浅绿背景，深绿强调
5. **海洋蓝** - 浅蓝背景，海蓝强调
6. **日落橙** - 浅橙背景，橙红强调

#### 1.2 悬浮窗重构

**视觉改进：**
- 圆角边框（radius: 12px）
- 柔和阴影效果
- 渐变背景（主题色到透明）
- 平滑过渡动画（透明度、位置变化）
- 毛玻璃效果（可选）

**布局优化：**
- 更紧凑的信息展示
- 图标+文字组合显示
- 实时状态指示器（小圆点）

### 阶段二：图表功能

#### 2.1 PyQtGraph 集成

**依赖：**
```
pyqtgraph>=0.13
numpy>=1.24
```

**图表类型：**

1. **折线图（Line Chart）**
   - X轴：时间（小时/天/周）
   - Y轴：Token 数量
   - 多条线：不同模型/Provider
   - 实时更新：新数据点时自动滚动

2. **柱状图（Bar Chart）**
   - 模型对比：各模型总消耗
   - Provider 对比：各提供商总消耗
   - 时间对比：不同时间段消耗

3. **饼图（Pie Chart）**
   - 模型占比：各模型消耗占比
   - Provider 占比：各提供商消耗占比

#### 2.2 统计对话框增强

**新增标签页：**
- "趋势"：折线图展示时间趋势
- "对比"：柱状图展示模型/Provider 对比
- "分布"：饼图展示占比分布

**时间范围选择：**
- 实时（最近1小时，每分钟更新）
- 今天（按小时）
- 最近7天（按天）
- 最近30天（按天）
- 自定义范围

### 阶段三：交互优化

#### 3.1 全局快捷键

**默认快捷键：**
- `Ctrl+Shift+T`：显示/隐藏悬浮窗
- `Ctrl+Shift+S`：打开详细统计
- `Ctrl+Shift+Q`：退出应用

**可配置：** 在设置中自定义快捷键

#### 3.2 系统通知

**通知场景：**
- 阈值预警：5分钟消耗超过设定值
- 每日报告：每日首次使用时显示昨日统计
- 异常提醒：代理启动失败、API 错误等

**通知样式：**
- 使用系统原生通知（macOS Notification Center）
- 点击通知打开详细统计

#### 3.3 悬浮窗缩放

**功能：**
- 鼠标滚轮缩放悬浮窗大小
- 最小 150px，最大 400px
- 缩放后字体自适应
- 位置记忆：记录缩放后的位置和大小

**边缘吸附：**
- 靠近屏幕边缘时自动吸附
- 吸附后显示小箭头指示
- 鼠标悬停时展开完整悬浮窗

#### 3.4 数据导出增强

**导出格式：**
- CSV（已有）
- JSON（新增）
- Excel（新增，需要 openpyxl）

**导出内容：**
- 当前筛选数据
- 汇总统计
- 图表截图

**自动备份：**
- 每日自动备份数据库
- 保留最近 30 天备份
- 备份路径：`~/.tokenstats/backups/`

## 代码架构

### 目录结构

```
tokenstats/
├── __init__.py
├── __main__.py
├── app.py                 # 应用入口
├── config.py              # 配置管理
├── parsers.py             # API 响应解析
├── model_aliases.py       # 模型别名
├── proxy.py               # HTTP 代理
├── storage.py             # 数据存储
├── themes/                # 新增：主题模块
│   ├── __init__.py
│   ├── base.py            # 主题基类
│   ├── presets.py         # 预设主题
│   └── manager.py         # 主题管理器
├── charts/                # 新增：图表模块
│   ├── __init__.py
│   ├── base.py            # 图表基类
│   ├── line_chart.py      # 折线图
│   ├── bar_chart.py       # 柱状图
│   ├── pie_chart.py       # 饼图
│   └── manager.py         # 图表管理器
├── ui/                    # 重构：UI 模块
│   ├── __init__.py
│   ├── floating.py        # 悬浮窗
│   ├── stats.py           # 统计对话框
│   ├── settings.py        # 设置对话框
│   └── components.py      # 可复用组件
└── utils/                 # 新增：工具模块
    ├── __init__.py
    ├── shortcuts.py       # 快捷键管理
    ├── notifications.py   # 系统通知
    └── backup.py          # 数据备份
```

### 模块职责

**themes/**：
- `base.py`：定义 Theme 数据类和主题接口
- `presets.py`：定义 6 个预设主题
- `manager.py`：主题切换、自定义主题保存/加载

**charts/**：
- `base.py`：定义 ChartBase 基类，统一接口
- `line_chart.py`：折线图实现
- `bar_chart.py`：柱状图实现
- `pie_chart.py`：饼图实现
- `manager.py`：图表创建、数据更新、布局管理

**ui/**：
- `floating.py`：悬浮窗，支持主题、缩放、拖拽
- `stats.py`：统计对话框，包含图表标签页
- `settings.py`：设置对话框，新增主题、快捷键设置
- `components.py`：卡片、按钮、输入框等可复用组件

**utils/**：
- `shortcuts.py`：全局快捷键注册、管理
- `notifications.py`：系统通知发送
- `backup.py`：数据库备份、恢复

## 数据流

```
API 请求 -> proxy.py -> parsers.py -> storage.py (SQLite)
                                    |
                                    v
                              charts/manager.py (查询数据)
                                    |
                                    v
                              ui/stats.py (显示图表)
```

## 配置更新

**新增配置项：**

```python
@dataclass
class AppConfig:
    # 已有配置...
    
    # 新增：主题配置
    theme: str = "modern_light"  # 主题名称
    custom_themes: Dict[str, Dict] = field(default_factory=dict)
    
    # 新增：快捷键配置
    shortcut_toggle: str = "Ctrl+Shift+T"
    shortcut_stats: str = "Ctrl+Shift+S"
    shortcut_quit: str = "Ctrl+Shift+Q"
    
    # 新增：悬浮窗配置
    floating_width: int = 220
    floating_height: int = 150
    floating_scale: float = 1.0
    snap_to_edge: bool = True
    
    # 新增：通知配置
    enable_notifications: bool = True
    daily_report: bool = True
    
    # 新增：备份配置
    auto_backup: bool = True
    backup_retention_days: int = 30
```

## 依赖更新

```txt
PyQt5>=5.15
httpx>=0.27
pyqtgraph>=0.13
numpy>=1.24
openpyxl>=3.1      # Excel 导出（可选）
```

## 实现顺序

### 第一轮迭代：基础架构
1. 创建目录结构
2. 实现 themes/base.py 和 presets.py
3. 重构 ui.py 为 ui/ 包
4. 更新 config.py 添加新配置项

### 第二轮迭代：主题系统
1. 实现 ThemeManager
2. 更新悬浮窗支持主题
3. 更新设置对话框添加主题选择
4. 测试主题切换

### 第三轮迭代：图表功能
1. 安装 pyqtgraph
2. 实现 ChartBase 和 LineChart
3. 在统计对话框添加"趋势"标签页
4. 实现 BarChart 和 PieChart
5. 添加"对比"和"分布"标签页

### 第四轮迭代：交互优化
1. 实现全局快捷键
2. 实现系统通知
3. 实现悬浮窗缩放
4. 实现数据导出增强
5. 实现自动备份

## 测试计划

1. **主题测试**：切换所有主题，验证颜色正确
2. **图表测试**：生成测试数据，验证图表显示
3. **快捷键测试**：测试所有快捷键功能
4. **通知测试**：触发阈值，验证通知显示
5. **导出测试**：导出各种格式，验证文件内容
6. **备份测试**：验证自动备份和恢复

## 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| PyQtGraph 与 PyQt5 版本冲突 | 高 | 使用虚拟环境，测试兼容性 |
| 系统通知权限问题 | 中 | 提供手动授权指引 |
| 性能问题（图表实时更新） | 中 | 限制数据点数量，使用采样 |
| 主题切换闪烁 | 低 | 使用双缓冲，平滑过渡 |
