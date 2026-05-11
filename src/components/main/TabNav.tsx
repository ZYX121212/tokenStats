import { state, setTab } from '../../stores/mainStore';
import type { TabId } from '../../stores/mainStore';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'statistics', label: '统计' },
  { id: 'settings', label: '设置' },
  { id: 'diagnostics', label: '诊断' },
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
