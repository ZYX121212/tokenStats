import { render } from 'solid-js/web';
import App from './components/main/App';
import './styles/main.css';
import { initTheme } from './stores/themeStore';
import { setTab } from './stores/mainStore';
import { listen } from '@tauri-apps/api/event';

const PENDING_TAB_KEY = 'tokenstats-pending-tab';
const VALID_TABS = ['overview', 'statistics', 'logs', 'settings', 'diagnostics'] as const;

function applyTab(tab: string | null) {
  if (tab && VALID_TABS.includes(tab as any)) {
    setTab(tab as any);
    localStorage.removeItem(PENDING_TAB_KEY);
  }
}

initTheme();

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}

applyTab(localStorage.getItem(PENDING_TAB_KEY));

void (async () => {
  await listen<string>('tab-switch', (event) => {
    applyTab(event.payload);
  });
})();
