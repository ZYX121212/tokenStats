import Icon from '../common/Icon';
import { state, setTab } from '../../stores/mainStore';
import type { TabId } from '../../stores/mainStore';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: '概览', icon: 'layout' },
  { id: 'statistics', label: '统计', icon: 'bar-chart' },
  { id: 'logs', label: '日志', icon: 'list' },
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
          <Icon name={tab.icon} size={14} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
