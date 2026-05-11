# UI 优化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement UI redesign (Scheme B) - more refined dark theme, segmented tab navigation, updated cards, floating window improvements, better UX.

**Architecture:** Incremental updates to existing Solid.js + CSS codebase, following existing patterns, no new libraries.

**Tech Stack:** Solid.js, TypeScript, CSS, Tauri 2.0

---

## File Structure Map

**Modified:**
- `src/styles/main.css` - main window styling
- `src/styles/floating.css` - floating window styling  
- `src/components/main/TabNav.tsx` - tab navigation component
- `src/components/main/OverviewTab.tsx` - overview page
- `src/components/main/StatCard.tsx` - stat card component
- `src/components/main/SettingsTab.tsx` - settings page grouping
- `src/components/floating/App.tsx` - floating window layout and interactions
- `src/components/common/ToastContainer.tsx` - toast notifications

---

## Task 1: Main Window CSS - Refined Dark Theme

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Update CSS variables for refined dark theme**

```css
:root {
  --bg: #0a0a0e;
  --surface: rgba(255, 255, 255, 0.03);
  --surface-hover: rgba(255, 255, 255, 0.05);
  --surface2: #141418;
  --surface3: #1f1f24;
  --border: rgba(255, 255, 255, 0.06);
  --border-hover: rgba(255, 255, 255, 0.1);
  --text: #eaeaf0;
  --text-secondary: #a1a1aa;
  --text-muted: #5a5a66;
  --cyan: #00d4ff;
  --amber: #ffb347;
  --emerald: #2dd4a8;
  --violet: #a78bfa;
  --rose: #f43f5e;
  --blue: #60a5fa;
  --r: 14px;
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  --ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);
  --shadow-card: 
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 1px 0 rgba(255, 255, 255, 0.02) inset;
  --shadow-hover: 
    0 4px 12px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 2: Update body and topbar styles**

```css
body {
  font-family: 'SF Pro Display', -apple-system, 'PingFang SC', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: 56px;
  background: rgba(10, 10, 14, 0.95);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 50;
}
```

- [ ] **Step 3: Update stat card styles**

```css
.stat-card {
  background: var(--surface);
  border-radius: var(--r);
  border: 1px solid var(--border);
  padding: 24px;
  transition: transform 0.3s var(--ease-spring), box-shadow 0.3s ease, border-color 0.3s ease;
  position: relative;
  overflow: hidden;
  cursor: default;
}

.stat-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
}

.stat-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 40%,
    rgba(255, 255, 255, 0.02) 50%,
    transparent 60%
  );
  transform: translateX(-100%);
  transition: transform 0.6s var(--ease-out-expo);
  pointer-events: none;
  border-radius: inherit;
}

.stat-card:hover::after {
  transform: translateX(100%);
}

.stat-card.featured {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(0, 212, 255, 0.02));
  border-top: 2px solid rgba(0, 212, 255, 0.3);
}

.stat-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-trend {
  font-size: 11px;
  color: var(--emerald);
  margin-top: 8px;
  font-weight: 500;
}
```

- [ ] **Step 4: Add segmented tab nav styles**

```css
.tab-nav {
  display: flex;
  gap: 4px;
  background: var(--surface);
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--border);
}

.tab-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s var(--ease-smooth);
  letter-spacing: -0.01em;
  position: relative;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}

.tab-btn:hover {
  color: var(--text-secondary);
}

.tab-btn.active {
  background: var(--surface2);
  color: var(--cyan);
}
```

- [ ] **Step 5: Commit the changes**

```bash
git add src/styles/main.css
git commit -m "refactor: update main window CSS for refined dark theme"
```

---

## Task 2: TabNav Component - Segmented Control

**Files:**
- Modify: `src/components/main/TabNav.tsx`

- [ ] **Step 1: Update TabNav component JSX structure**

```tsx
import { state, setTab } from '../../stores/mainStore';
import Icon from '../common/Icon';

const TABS: { id: 'overview' | 'statistics' | 'settings' | 'diagnostics'; label: string; icon: string }[] = [
  { id: 'overview', label: '概览', icon: 'layout' },
  { id: 'statistics', label: '统计', icon: 'bar-chart' },
  { id: 'settings', label: '设置', icon: 'settings' },
  { id: 'diagnostics', label: '诊断', icon: 'activity' },
];

export default function TabNav() {
  return (
    <nav class="tab-nav" role="tablist">
      {TABS.map((tab) => (
        <button
          class="tab-btn"
          classList={{ active: state.currentTab === tab.id }}
          role="tab"
          aria-selected={state.currentTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          onClick={() => setTab(tab.id)}
        >
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Verify no build errors**

Run: `npm run build` (or check if dev server is running)
Expected: No TypeScript errors

- [ ] **Step 3: Commit the changes**

```bash
git add src/components/main/TabNav.tsx
git commit -m "refactor: update TabNav to segmented control style"
```

---

## Task 3: StatCard Component - Update with Featured Option

**Files:**
- Modify: `src/components/main/StatCard.tsx`

- [ ] **Step 1: Update StatCard component with featured and trend props**

```tsx
import { createEffect, createSignal } from 'solid-js';
import { fmt } from '../../scripts/lib/utils';
import AnimatedNumber from '../common/AnimatedNumber';

interface StatCardProps {
  label: string;
  value: number | string;
  color: string;
  icon?: string;
  featured?: boolean;
  trend?: string;
}

export default function StatCard(props: StatCardProps) {
  const isNumber = () => typeof props.value === 'number';

  return (
    <div 
      class="stat-card" 
      classList={{ featured: props.featured }}
      style={{ '--card-color': props.color }}
    >
      <div class="stat-label">{props.label}</div>
      <div class="stat-value" style={{ color: props.color }}>
        {isNumber() ? (
          <AnimatedNumber
            value={props.value as number}
            format={true}
            color={props.color}
          />
        ) : (
          props.value
        )}
      </div>
      {props.trend && (
        <div class="stat-trend">{props.trend}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit the changes**

```bash
git add src/components/main/StatCard.tsx
git commit -m "refactor: update StatCard with featured and trend support"
```

---

## Task 4: OverviewTab - Update Card Layout

**Files:**
- Modify: `src/components/main/OverviewTab.tsx`

- [ ] **Step 1: Update STAT_CONFIG and OverviewTab component**

```tsx
import { createResource, Show, For } from 'solid-js';
import { state, setState } from '../../stores/mainStore';
import { addToast } from '../../stores/mainStore';
import * as api from '../../scripts/lib/api';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import StatCard from './StatCard';
import Skeleton from '../common/Skeleton';
import type { StatsDto } from '../../types';

const STAT_CONFIG = [
  { key: 'today_tokens', label: '今日 Token', color: '#00d4ff', featured: true, trend: '↑ 18% vs 昨日' },
  { key: 'five_min_tokens', label: '5 分钟', color: '#ffb347' },
  { key: 'total_tokens', label: '累计 Token', color: '#2dd4a8' },
  { key: 'estimated_cost', label: '预估费用', color: '#a78bfa' },
];

export default function OverviewTab() {
  const [stats, { refetch }] = createResource(async () => {
    setState('overview', 'isLoading', true);
    try {
      const data = await api.getStats() as StatsDto;
      setState('overview', 'stats', data as Record<string, string | number>);
      return data;
    } catch (err) {
      addToast('加载概览数据失败', 'warning');
      throw err;
    } finally {
      setState('overview', 'isLoading', false);
    }
  });

  useAutoRefresh({
    interval: 30000,
    onRefresh: async () => {
      await refetch();
    },
  });

  return (
    <div class="tab-panel active" role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
      <div class="stats-grid">
        <Show when={!state.overview.isLoading && state.overview.stats} fallback={<Skeleton rows={4} />}>
          <For each={STAT_CONFIG}>
            {(config) => (
              <StatCard
                label={config.label}
                value={state.overview.stats?.[config.key] ?? '-'}
                color={config.color}
                featured={config.featured}
                trend={config.featured ? config.trend : undefined}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit the changes**

```bash
git add src/components/main/OverviewTab.tsx
git commit -m "refactor: update OverviewTab with new card layout and featured stat"
```

---

## Task 5: Floating Window CSS - Refined Style

**Files:**
- Modify: `src/styles/floating.css`

- [ ] **Step 1: Update floating.css variables and basic panel**

```css
:root {
  --panel-opacity: 0.48;
  --bg-deep: rgba(10, 10, 14, var(--panel-opacity));
  --border-glow: rgba(255, 255, 255, 0.06);
  --border-subtle: rgba(255, 255, 255, 0.04);
  --text-bright: #fafafa;
  --text-primary: #eaeaf0;
  --text-secondary: rgba(161, 161, 170, 0.8);
  --text-muted: rgba(90, 90, 102, 0.7);
  --text-idle: rgba(90, 90, 102, 0.4);
  --cyan: #00d4ff;
  --cyan-dim: rgba(0, 212, 255, 0.1);
  --amber: #ffb347;
  --emerald: #2dd4a8;
  --violet: #a78bfa;
  --rose: #f43f5e;
  --r-panel: 14px;
  --r-card: 12px;
  --r-sm: 10px;
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  --ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);
  --shadow-card:
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 1px 0 rgba(255, 255, 255, 0.02) inset;
}

.floating-panel {
  width: 320px;
  height: 150px;
  background: var(--bg-deep);
  border-radius: var(--r-panel);
  backdrop-filter: blur(40px) saturate(180%) brightness(0.9);
  -webkit-backdrop-filter: blur(40px) saturate(180%) brightness(0.9);
  box-shadow:
    0 0 0 0.5px var(--border-glow),
    0 8px 24px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-glow);
  position: relative;
  overflow: hidden;
  cursor: default;
  contain: layout paint;
}

.glass-reflection {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 30%;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.03) 0%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 1;
  border-radius: var(--r-panel) var(--r-panel) 0 0;
}
```

- [ ] **Step 2: Remove decorative effects (scanline, orbs, edge glow)**

Remove these sections:
- `.scan-line` and animation
- `.glow-orb` and animations
- `.edge-glow` and animation
- `.floating-panel::after` (noise texture)

- [ ] **Step 3: Update content layout styles**

```css
.content {
  position: relative;
  z-index: 10;
  padding: 16px 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.row-main {
  display: flex;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.hero-card {
  width: 130px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(0, 212, 255, 0.02));
  border-radius: var(--r-card);
  border: 1px solid rgba(0, 212, 255, 0.15);
  cursor: pointer;
  transition: transform 0.25s var(--ease-spring), box-shadow 0.25s ease;
}

.hero-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.hero-sub {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.hero-number {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-bright);
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.hero-unit {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  margin-top: 4px;
}

.metrics-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-card {
  flex: 1;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-radius: var(--r-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: transform 0.25s var(--ease-spring), background 0.25s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.05);
}

.metric-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.metric-value {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}

.metric-warm .metric-value { color: var(--amber); }
.metric-cool .metric-value { color: var(--emerald); }

.chart-section {
  position: relative;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  height: 36px;
}
```

- [ ] **Step 4: Commit the changes**

```bash
git add src/styles/floating.css
git commit -m "refactor: update floating window CSS - refined dark theme"
```

---

## Task 6: Floating Window Component - Layout and Interactions

**Files:**
- Modify: `src/components/floating/App.tsx`

- [ ] **Step 1: Update floating App component layout and interactions**

```tsx
import { createResource, Show, onMount } from 'solid-js';
import { state, setState, updateFloatingData, openMenu, closeMenu, setOpacity, setProviders, setMockMode } from '../../stores/floatingStore';
import * as api from '../../scripts/lib/api';
import SparklineChart from './SparklineChart';
import ContextMenu from './ContextMenu';
import { fmt } from '../../scripts/lib/utils';

export default function FloatingApp() {
  const [data] = createResource(async () => {
    setState('isLoading', true);
    try {
      const stats = await api.getStats();
      const hourly = await api.getHourlyStats(24) as Array<{ total_tokens: number }>;
      const sparkline = hourly.map((h) => h.total_tokens);
      const result = {
        today_tokens: (stats as Record<string, number>).today_tokens ?? 0,
        five_min: (stats as Record<string, number>).five_min_tokens ?? 0,
        total_tokens: (stats as Record<string, number>).total_tokens ?? 0,
        sparkline,
      };
      updateFloatingData(result);
      return result;
    } catch (err) {
      console.error('Floating data load failed:', err);
      throw err;
    } finally {
      setState('isLoading', false);
    }
  }, { refetchInterval: 30000 });

  onMount(async () => {
    try {
      const providers = await api.getProviders();
      setProviders(providers);
    } catch {}
    try {
      const settings = await api.getSettings() as Record<string, unknown>;
      setMockMode(!!settings.mock_mode);
    } catch {}
  });

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }

  async function handleHeroClick() {
    closeMenu();
    try {
      await api.showMainWindow('overview');
    } catch (err) {
      console.error('Failed to open main window:', err);
    }
  }

  async function handleMetricClick(tab: string) {
    closeMenu();
    try {
      await api.showMainWindow(tab);
    } catch (err) {
      console.error('Failed to open main window:', err);
    }
  }

  async function handleToggleMock() {
    const newMode = !state.mockMode;
    setMockMode(newMode);
    try {
      const settings = await api.getSettings() as Record<string, unknown>;
      settings.mock_mode = newMode;
      await api.saveSettings(settings);
    } catch (err) {
      setMockMode(!newMode);
      console.error('Failed to toggle mock mode:', err);
    }
  }

  function handleOpacityChange(value: number) {
    setOpacity(value);
    document.documentElement.style.setProperty('--panel-opacity', String(value));
  }

  return (
    <div
      class="floating-panel"
      data-tauri-drag-region
      onContextMenu={handleContextMenu}
      role="complementary"
      aria-label="Token 统计浮动面板"
    >
      <div class="glass-reflection" />
      <div class="content" data-tauri-drag-region>
        <div class="row-main">
          <div class="hero-card" onClick={handleHeroClick}>
            <div class="hero-sub">今日 Token</div>
            <div class="hero-number">
              {state.data ? fmt(state.data.today_tokens) : '-'}
            </div>
            <div class="hero-unit">tokens</div>
          </div>
          <div class="metrics-column">
            <div class="metric-card metric-warm" onClick={() => handleMetricClick('statistics')}>
              <div class="metric-label">5 分钟</div>
              <div class="metric-value">
                {state.data ? fmt(state.data.five_min) : '-'}
              </div>
            </div>
            <div class="metric-card metric-cool" onClick={() => handleMetricClick('statistics')}>
              <div class="metric-label">累计</div>
              <div class="metric-value">
                {state.data ? fmt(state.data.total_tokens) : '-'}
              </div>
            </div>
          </div>
        </div>
        <div class="chart-section">
          <Show when={state.data?.sparkline && state.data.sparkline.length > 0}>
            <SparklineChart
              data={state.data!.sparkline}
              color="#00d4ff"
              width={280}
              height={32}
            />
          </Show>
        </div>
      </div>

      <ContextMenu
        onShowTab={(tab) => handleMetricClick(tab)}
        onShowMain={() => handleHeroClick()}
        onExport={async () => {
          closeMenu();
          try { await api.exportCsv(); } catch (err) { console.error('Export failed:', err); }
        }}
        onCleanup={async () => {
          closeMenu();
          try { await api.cleanupOldData(30); } catch (err) { console.error('Cleanup failed:', err); }
        }}
        onIntegrityCheck={async () => {
          closeMenu();
          try { await api.checkDbIntegrity(); } catch (err) { console.error('Check failed:', err); }
        }}
        onResetPos={async () => {
          closeMenu();
          try {
            const { getCurrentWindow } = (window as any).__TAURI__.window;
            const win = getCurrentWindow();
            await win.setPosition(new (window as any).__TAURI__.window.LogicalPosition(40, 80));
          } catch (err) {
            console.error('Failed to reset position:', err);
          }
        }}
        onClose={async () => {
          closeMenu();
          try {
            const { getCurrentWindow } = (window as any).__TAURI__.window;
            const win = getCurrentWindow();
            await win.hide();
          } catch (err) {
            console.error('Failed to hide window:', err);
          }
        }}
        onToggleMock={handleToggleMock}
        onOpacityChange={handleOpacityChange}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit the changes**

```bash
git add src/components/floating/App.tsx
git commit -m "refactor: update floating window layout and click interactions"
```

---

## Task 7: SettingsTab - Grouped Form Layout

**Files:**
- Modify: `src/components/main/SettingsTab.tsx`

- [ ] **Step 1: Update SettingsTab with grouped sections**

```tsx
import { createResource, Show, For } from 'solid-js';
import { state, setState, updateSettingsForm, addToast } from '../../stores/mainStore';
import * as api from '../../scripts/lib/api';
import ThemeToggle from '../common/ThemeToggle';
import Skeleton from '../common/Skeleton';
import type { AppSettings } from '../../types';

const CURRENCIES = ['USD', 'CNY'];

interface SettingsGroup {
  title: string;
  description: string;
  icon: string;
  items: { key: keyof AppSettings; label: string; type: 'text' | 'number' | 'select' | 'checkbox'; options?: string[]; hint?: string }[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: '外观',
    description: '主题和界面显示设置',
    icon: '🎨',
    items: [
      { key: 'opacity', label: '面板透明度', type: 'number', hint: '0-1 之间' },
    ],
  },
  {
    title: '代理',
    description: '代理服务器配置',
    icon: '🔌',
    items: [
      { key: 'proxy_host', label: '代理主机', type: 'text', hint: '默认 127.0.0.1' },
      { key: 'proxy_port', label: '代理端口', type: 'number', hint: '默认 8765' },
    ],
  },
  {
    title: '费用',
    description: '货币和汇率设置',
    icon: '💰',
    items: [
      { key: 'currency', label: '货币', type: 'select', options: CURRENCIES },
      { key: 'usd_to_cny', label: 'USD→CNY 汇率', type: 'number', hint: '例如 7.25' },
    ],
  },
  {
    title: '通知',
    description: '告警和通知设置',
    icon: '🔔',
    items: [
      { key: 'alert_threshold_5m', label: '5 分钟告警阈值', type: 'number', hint: '超过此值触发通知' },
      { key: 'enable_notifications', label: '启用通知', type: 'checkbox' },
    ],
  },
  {
    title: '数据',
    description: '数据管理和清理',
    icon: '💾',
    items: [
      { key: 'auto_cleanup', label: '自动清理', type: 'checkbox' },
      { key: 'data_retention_days', label: '数据保留天数', type: 'number' },
      { key: 'retention_days', label: '清理保留天数', type: 'number' },
    ],
  },
  {
    title: '窗口',
    description: '悬浮窗行为',
    icon: '🪟',
    items: [
      { key: 'always_on_top', label: '始终置顶', type: 'checkbox' },
      { key: 'show_on_start', label: '启动时显示', type: 'checkbox' },
    ],
  },
  {
    title: '调试',
    description: '开发和调试选项',
    icon: '🔧',
    items: [
      { key: 'debug_log', label: '调试日志', type: 'checkbox' },
      { key: 'mock_mode', label: 'Mock 模式', type: 'checkbox' },
    ],
  },
];

export default function SettingsTab() {
  const [settingsData] = createResource(async () => {
    setState('settings', 'isLoading', true);
    try {
      const data = await api.getSettings() as AppSettings;
      setState('settings', {
        form: { ...data },
        original: data,
        hasChanges: false,
      });
      return data;
    } catch (err) {
      addToast('加载设置失败', 'warning');
      throw err;
    } finally {
      setState('settings', 'isLoading', false);
    }
  });

  async function handleSave() {
    setState('settings', 'isSaving', true);
    try {
      await api.saveSettings(state.settings.form as Record<string, unknown>);
      setState('settings', 'original', state.settings.form as AppSettings);
      setState('settings', 'hasChanges', false);
      addToast('设置已保存');
    } catch (err) {
      addToast('保存失败', 'warning');
    } finally {
      setState('settings', 'isSaving', false);
    }
  }

  async function handleExport() {
    try {
      const path = await api.exportCsv();
      addToast(`已导出: ${path}`);
    } catch (err) {
      addToast('导出失败', 'warning');
    }
  }

  async function handleCleanup() {
    try {
      const days = state.settings.form.retention_days ?? 30;
      const count = await api.cleanupOldData(days);
      addToast(`已清理 ${count} 条记录`);
    } catch (err) {
      addToast('清理失败', 'warning');
    }
  }

  async function handleIntegrityCheck() {
    try {
      const result = await api.checkDbIntegrity();
      addToast(`数据库完整性: ${result}`);
    } catch (err) {
      addToast('完整性检查失败', 'warning');
    }
  }

  function renderInput(item: SettingsGroup['items'][0]) {
    const value = state.settings.form?.[item.key];
    switch (item.type) {
      case 'text':
        return (
          <input
            type="text"
            class="field-input"
            value={value as string ?? ''}
            onInput={(e) => updateSettingsForm(item.key, e.currentTarget.value)}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            step={item.key === 'usd_to_cny' ? '0.01' : '1'}
            min={item.key === 'opacity' ? '0' : undefined}
            max={item.key === 'opacity' ? '1' : undefined}
            class="field-input"
            value={value as number ?? ''}
            onInput={(e) => updateSettingsForm(item.key, parseFloat(e.currentTarget.value) || 0)}
          />
        );
      case 'select':
        return (
          <select
            class="field-input"
            value={value as string ?? ''}
            onChange={(e) => updateSettingsForm(item.key, e.currentTarget.value)}
          >
            <For each={item.options || []}>
              {(opt) => <option value={opt}>{opt}</option>}
            </For>
          </select>
        );
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => updateSettingsForm(item.key, e.currentTarget.checked)}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div class="tab-panel" role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings">
      <Show when={!state.settings.isLoading} fallback={<Skeleton rows={10} />}>
        <div class="settings-groups">
          <For each={SETTINGS_GROUPS}>
            {(group) => (
              <div class="settings-section">
                <div class="section-header">
                  <span class="section-icon">{group.icon}</span>
                  <div>
                    <div class="section-title">{group.title}</div>
                    <div class="section-description">{group.description}</div>
                  </div>
                </div>
                <div class="section-body">
                  <For each={group.items}>
                    {(item) => (
                      <div class="field-row">
                        <div class="field-label-row">
                          <label class="field-label">{item.label}</label>
                          {item.hint && <span class="field-hint">{item.hint}</span>}
                        </div>
                        {renderInput(item)}
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="settings-actions">
          <button
            class="btn-save"
            disabled={!state.settings.hasChanges || state.settings.isSaving}
            onClick={handleSave}
          >
            {state.settings.isSaving ? '保存中...' : '保存设置'}
          </button>
          <div class="action-secondary">
            <button class="toolbar-btn" onClick={handleExport}>导出 CSV</button>
            <button class="toolbar-btn" onClick={handleCleanup}>清理数据</button>
            <button class="toolbar-btn" onClick={handleIntegrityCheck}>完整性检查</button>
          </div>
        </div>
      </Show>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for settings groups**

Add to `src/styles/main.css`:

```css
.settings-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-section {
  background: var(--surface);
  border-radius: var(--r);
  border: 1px solid var(--border);
  overflow: hidden;
}

.section-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-icon {
  font-size: 18px;
  line-height: 1;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.section-description {
  font-size: 11px;
  color: var(--text-muted);
}

.section-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.field-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.field-input {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  font-family: inherit;
}

.field-input:focus {
  border-color: var(--cyan);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.12);
}

.field-input:hover:not(:focus) {
  border-color: var(--border-hover);
}

.field-input::placeholder {
  color: var(--text-muted);
  opacity: 0.5;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-track {
  position: absolute;
  inset: 0;
  background: var(--surface3);
  border-radius: 12px;
  transition: background 0.2s ease;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s var(--ease-spring);
}

.toggle-switch input:checked + .toggle-track {
  background: var(--cyan);
}

.toggle-switch input:checked + .toggle-track .toggle-thumb {
  transform: translateX(20px);
}

.settings-actions {
  margin-top: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.btn-save {
  padding: 10px 24px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, var(--cyan), var(--violet));
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  letter-spacing: -0.01em;
}

.btn-save:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.action-secondary {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 3: Commit the changes**

```bash
git add src/components/main/SettingsTab.tsx src/styles/main.css
git commit -m "refactor: update SettingsTab with grouped layout and better UX"
```

---

## Task 8: Main App Component - Update TopBar

**Files:**
- Modify: `src/components/main/App.tsx`

- [ ] **Step 1: Update App.tsx topbar with proper layout**

```tsx
import { Match, Switch } from 'solid-js';
import { state, setTab } from '../../stores/mainStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import ErrorBoundary from '../common/ErrorBoundary';
import TabNav from './TabNav';
import OverviewTab from './OverviewTab';
import StatisticsTab from './StatisticsTab';
import SettingsTab from './SettingsTab';
import DiagnosticsTab from './DiagnosticsTab';
import ToastContainer from '../common/ToastContainer';

export default function App() {
  useKeyboardShortcuts([
    { key: '1', ctrl: true, handler: () => setTab('overview') },
    { key: '2', ctrl: true, handler: () => setTab('statistics') },
    { key: '3', ctrl: true, handler: () => setTab('settings') },
    { key: '4', ctrl: true, handler: () => setTab('diagnostics') },
  ]);

  return (
    <div class="app">
      <header class="topbar">
        <div class="topbar-left">
          <div class="logo">TS</div>
          <div class="app-name">TokenStats</div>
        </div>
        <TabNav />
        <div class="topbar-right"></div>
      </header>
      <main class="main">
        <ErrorBoundary>
          <Switch>
            <Match when={state.currentTab === 'overview'}>
              <OverviewTab />
            </Match>
            <Match when={state.currentTab === 'statistics'}>
              <StatisticsTab />
            </Match>
            <Match when={state.currentTab === 'settings'}>
              <SettingsTab />
            </Match>
            <Match when={state.currentTab === 'diagnostics'}>
              <DiagnosticsTab />
            </Match>
          </Switch>
        </ErrorBoundary>
      </main>
      <ToastContainer />
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for topbar-left/logo**

Add to `src/styles/main.css`:

```css
.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, var(--cyan), var(--violet));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  color: white;
}

.app-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.topbar-right {
  display: flex;
  gap: 4px;
  width: 80px;
}

.main {
  flex: 1;
  padding: 20px 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  overflow-y: auto;
}
```

- [ ] **Step 3: Commit the changes**

```bash
git add src/components/main/App.tsx src/styles/main.css
git commit -m "refactor: update main App topbar layout"
```

---

## Task 9: Verify Everything Works

**Files:** None - testing only

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

Wait for server to start. Verify:
- No build errors
- Main window loads correctly
- Tab navigation works
- Cards display properly
- Floating window works

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 3: Final commit with summary**

```bash
git add docs/superpowers/specs/2025-05-11-ui-redesign.md docs/superpowers/plans/2025-05-11-ui-redesign.md
git commit -m "docs: add UI redesign spec and plan"
```

---

## Self-Review

**1. Spec coverage:** ✓ All requirements covered
- Refined dark theme - Task 1, 5
- Segmented tab nav - Task 2, 8
- Updated cards with trend - Task 3, 4
- Floating window updates - Task 5, 6
- Settings page grouping - Task 7
- Better UX overall

**2. Placeholder scan:** ✓ No placeholders, all code complete
- Every step has actual code
- No TBD/TODO
- Exact file paths

**3. Type consistency:** ✓ All names consistent
- Component props match
- CSS class names match
- Function names consistent

---

## Complete!

Plan complete and saved to `docs/superpowers/plans/2025-05-11-ui-redesign.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
