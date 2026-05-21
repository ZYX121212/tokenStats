import { Match, Switch, createSignal } from 'solid-js';
import { state, setTab } from '../../stores/mainStore';
import { currentTheme } from '../../stores/themeStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { formatTimeAgo } from '../../scripts/lib/utils';
import ErrorBoundary from '../common/ErrorBoundary';
import TabNav from './TabNav';
import OverviewTab from './OverviewTab';
import StatisticsTab from './StatisticsTab';
import SettingsTab from './SettingsTab';
import DiagnosticsTab from './DiagnosticsTab';
import LogsTab from './LogsTab';
import ToastContainer from '../common/ToastContainer';
import RefreshIndicator from './RefreshIndicator';
import ThemeToggle from '../common/ThemeToggle';
import { isPreviewMode } from '../../scripts/lib/api';

const TAB_META = {
  overview: {
    title: '概览',
  },
  statistics: {
    title: '统计',
  },
  logs: {
    title: '日志',
  },
  settings: {
    title: '设置',
  },
  diagnostics: {
    title: '诊断',
  },
} as const;

const SHORTCUTS = [
  { key: 'Ctrl+1', tab: 'overview', label: '概览' },
  { key: 'Ctrl+2', tab: 'statistics', label: '统计' },
  { key: 'Ctrl+3', tab: 'logs', label: '日志' },
  { key: 'Ctrl+4', tab: 'settings', label: '设置' },
  { key: 'Ctrl+5', tab: 'diagnostics', label: '诊断' },
] as const;

export default function App() {
  const [showShortcuts, setShowShortcuts] = createSignal(false);
  useKeyboardShortcuts([
    {
      key: '1',
      ctrl: true,
      handler: () => setTab('overview'),
    },
    {
      key: '2',
      ctrl: true,
      handler: () => setTab('statistics'),
    },
    {
      key: '3',
      ctrl: true,
      handler: () => setTab('logs'),
    },
    {
      key: '4',
      ctrl: true,
      handler: () => setTab('settings'),
    },
    {
      key: '5',
      ctrl: true,
      handler: () => setTab('diagnostics'),
    },
  ]);

  return (
    <div class="app">
      <header class="topbar">
        <div class="topbar-left">
          <div class="logo">TS</div>
          <div class="brand-copy">
            <div class="brand-row">
              <div class="app-name">TokenStats</div>
              {isPreviewMode() && <span class="preview-badge">预览数据</span>}
            </div>
            <div class="app-subtitle">LLM token observability for local proxy traffic</div>
          </div>
        </div>
        <TabNav />
        <div class="topbar-right">
          <button
            class="keyboard-hint-btn"
            title="键盘快捷键"
            onClick={() => setShowShortcuts(true)}
          >
            <span class="key-icon">?</span>
          </button>
          <ThemeToggle />
          <RefreshIndicator />
        </div>
      </header>
      <main class="main">
        <section class="dashboard-strip" aria-label="页面状态">
          <div class="dashboard-strip-copy">
            <h1 class="dashboard-title">{TAB_META[state.currentTab].title}</h1>
          </div>
          <div class="dashboard-strip-meta">
            <div class="meta-card">
              <div class="meta-label">最后刷新</div>
              <div class="meta-value">{formatTimeAgo(state.lastRefresh)}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">当前主题</div>
              <div class="meta-value">{currentTheme() === 'system' ? '跟随系统' : currentTheme() === 'light' ? '亮色' : '暗色'}</div>
            </div>
          </div>
        </section>
        <ErrorBoundary>
          <Switch>
            <Match when={state.currentTab === 'overview'}>
              <OverviewTab />
            </Match>
            <Match when={state.currentTab === 'statistics'}>
              <StatisticsTab />
            </Match>
            <Match when={state.currentTab === 'logs'}>
              <LogsTab />
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
      {showShortcuts() && (
        <div class="keyboard-help-overlay" onClick={() => setShowShortcuts(false)}>
          <div class="keyboard-help-modal" onClick={(e) => e.stopPropagation()}>
            <div class="keyboard-help-header">
              <h3>键盘快捷键</h3>
              <button class="keyboard-help-close" onClick={() => setShowShortcuts(false)}>×</button>
            </div>
            <div class="keyboard-help-content">
              {SHORTCUTS.map((s) => (
                <div class="keyboard-shortcut-item">
                  <div class="keyboard-keys">
                    <span class="keyboard-key">{s.key}</span>
                  </div>
                  <span class="keyboard-description">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
