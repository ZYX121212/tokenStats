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
          <div class="chart-wrap">
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
