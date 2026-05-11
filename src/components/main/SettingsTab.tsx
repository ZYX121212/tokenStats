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
      { key: 'opacity', label: '透明度', type: 'number', hint: '0-1 之间' },
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
