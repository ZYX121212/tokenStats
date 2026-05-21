import { createResource, Show, For } from "solid-js";
import { state, setState, addToast, triggerRefresh } from "../../stores/mainStore";
import * as api from "../../scripts/lib/api";
import Skeleton from "../common/Skeleton";
import ProviderSection from "../settings/ProviderSection";
import ScanSection from "../settings/ScanSection";
import SettingsGroupRenderer from "../settings/SettingsGroupRenderer";
import type { SettingsGroup } from "../settings/SettingsGroupRenderer";
import type { AppSettings } from "../../types";

const CURRENCIES = ["USD", "CNY"];
const COUNTING_MODES = [
  { value: "all", label: "全部统计（不区分来源）" },
  { value: "ai_tools", label: "AI 工具（Claude Code / Codex CLI）" },
  { value: "api_keys", label: "API Key（代理拦截）" },
];

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "外观",
    description: "主题和界面显示设置",
    icon: "🎨",
    items: [
      { key: "opacity", label: "透明度", type: "range", hint: "0-1 之间", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: "窗口",
    description: "悬浮窗行为",
    icon: "🪟",
    items: [
      { key: "always_on_top", label: "始终置顶", type: "checkbox" },
      { key: "show_on_start", label: "启动时显示", type: "checkbox" },
    ],
  },
  {
    title: "统计口径",
    description: "选择统计哪些来源的 token 数据，AI 工具和 API Key 两者不重叠",
    icon: "📊",
    items: [
      { key: "counting_mode", label: "统计方式", type: "select", options: COUNTING_MODES.map(m => m.value), option_labels: COUNTING_MODES.map(m => m.label) },
    ],
  },
  {
    title: "费用与货币",
    description: "货币、汇率和预算设置",
    icon: "💰",
    items: [
      { key: "currency", label: "货币", type: "select", options: CURRENCIES },
      { key: "usd_to_cny", label: "USD→CNY 汇率", type: "number", hint: "例如 7.25" },
      { key: "budget_enabled", label: "启用预算管理", type: "checkbox" },
      { key: "budget_monthly_limit", label: "月度 Token 上限", type: "number", hint: "每月最大 Token 数量" },
      { key: "budget_alert_threshold", label: "告警阈值 (%)", type: "number", hint: "达到百分比时触发告警" },
    ],
  },
  {
    title: "通知",
    description: "告警和通知设置",
    icon: "🔔",
    items: [
      { key: "enable_notifications", label: "启用通知", type: "checkbox" },
      { key: "alert_threshold_5m", label: "5 分钟告警阈值", type: "number", hint: "超过此值触发通知" },
    ],
  },
  {
    title: "数据管理",
    description: "数据管理和清理",
    icon: "💾",
    items: [
      { key: "auto_cleanup", label: "自动清理", type: "checkbox" },
      { key: "data_retention_days", label: "数据保留天数", type: "number" },
      { key: "retention_days", label: "清理保留天数", type: "number" },
    ],
  },
  {
    title: "代理与高级",
    description: "代理服务器配置和调试选项",
    icon: "⚙️",
    items: [
      { key: "proxy_host", label: "代理主机", type: "text", hint: "默认 127.0.0.1" },
      { key: "proxy_port", label: "代理端口", type: "number", hint: "默认 8765" },
      { key: "debug_log", label: "调试日志", type: "checkbox" },
      { key: "mock_mode", label: "Mock 模式", type: "checkbox" },
    ],
  },
];

const mockSettings: AppSettings = {
  proxy_host: "127.0.0.1",
  proxy_port: 8765,
  alert_threshold_5m: 10000,
  opacity: 0.48,
  theme: "dark",
  always_on_top: true,
  lock_position: false,
  show_on_start: true,
  window_x: 100,
  window_y: 100,
  currency: "CNY",
  usd_to_cny: 7.25,
  floating_width: 300,
  floating_height: 200,
  enable_notifications: true,
  data_retention_days: 30,
  auto_cleanup: false,
  retention_days: 30,
  model_prices: {},
  providers: [],
  config_version: 1,
  debug_log: false,
  mock_mode: false,
  budget_enabled: false,
  budget_monthly_limit: 10000000,
  budget_alert_threshold: 80,
  counting_mode: "ai_tools",
  alert_rules: [],
};

export default function SettingsTab() {
  const [_settingsData] = createResource(async () => {
    setState("settings", "isLoading", true);
    try {
      const data = await api.getSettings().catch(() => mockSettings);
      setState("settings", { form: { ...data }, original: data, hasChanges: false });
      return data;
    } catch (err) {
      console.error("加载设置失败:", err);
      setState("settings", { form: { ...mockSettings }, original: mockSettings, hasChanges: false });
      addToast("使用默认设置", "info");
      return mockSettings;
    } finally {
      setState("settings", "isLoading", false);
    }
  });

  async function handleSave() {
    setState("settings", "isSaving", true);
    try {
      await api.saveSettings(state.settings.form);
      setState("settings", "original", state.settings.form as AppSettings);
      setState("settings", "hasChanges", false);
      addToast("设置已保存");
      // Trigger all data components to re-fetch with the new counting mode
      triggerRefresh();
    } catch (err) {
      addToast("保存失败", "warning");
    } finally {
      setState("settings", "isSaving", false);
    }
  }

  async function handleExport() {
    try {
      const path = await api.exportCsv();
      addToast(`已导出: ${path}`);
    } catch (err) {
      addToast("导出失败", "warning");
    }
  }

  async function handleCleanup() {
    try {
      const days = state.settings.form.retention_days ?? 30;
      const count = await api.cleanupOldData(days);
      addToast(`已清理 ${count} 条记录`);
    } catch (err) {
      addToast("清理失败", "warning");
    }
  }

  async function handleIntegrityCheck() {
    try {
      const result = await api.checkDbIntegrity();
      addToast(`数据库完整性: ${result}`);
    } catch (err) {
      addToast("完整性检查失败", "warning");
    }
  }

  return (
    <div class="tab-panel" role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings">
      <Show when={!state.settings.isLoading} fallback={<Skeleton rows={10} />}>
        <div class="settings-groups">
          <ProviderSection />
          <ScanSection />
          <For each={SETTINGS_GROUPS}>
            {(group) => <SettingsGroupRenderer group={group} />}
          </For>
        </div>

        <div class="settings-actions">
          <button
            class="btn-save"
            disabled={!state.settings.hasChanges || state.settings.isSaving}
            onClick={handleSave}
          >
            {state.settings.isSaving ? "保存中..." : "保存设置"}
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
