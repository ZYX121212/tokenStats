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
      handler: () => setTab('settings'),
    },
    {
      key: '4',
      ctrl: true,
      handler: () => setTab('diagnostics'),
    },
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
