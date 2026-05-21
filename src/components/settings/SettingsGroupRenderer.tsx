import { For, Show } from "solid-js";
import { state, updateSettingsForm } from "../../stores/mainStore";
import ThemeToggle from "../common/ThemeToggle";
import type { AppSettings } from "../../types";

export interface SettingsItem {
  key: keyof AppSettings;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "range";
  options?: string[];
  option_labels?: string[];
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface SettingsGroup {
  title: string;
  description: string;
  icon: string;
  items: SettingsItem[];
}

interface Props {
  group: SettingsGroup;
}

function renderInput(item: SettingsItem) {
  const value = state.settings.form?.[item.key];
  switch (item.type) {
    case "text":
      return (
        <input
          type="text"
          class="field-input"
          value={(value as string) ?? ""}
          onInput={(e) => updateSettingsForm(item.key, e.currentTarget.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          step={item.key === "usd_to_cny" ? "0.01" : "1"}
          min={item.key === "opacity" ? "0" : undefined}
          max={item.key === "opacity" ? "1" : undefined}
          class="field-input"
          value={(value as number) ?? ""}
          onInput={(e) =>
            updateSettingsForm(item.key, parseFloat(e.currentTarget.value) || 0)
          }
        />
      );
    case "range":
      return (
        <div class="range-input-container">
          <input
            type="range"
            min={item.min ?? 0}
            max={item.max ?? 1}
            step={item.step ?? 0.01}
            class="field-input range-input"
            value={(value as number) ?? 0.5}
            onInput={(e) =>
              updateSettingsForm(item.key, parseFloat(e.currentTarget.value) || 0)
            }
          />
          <span class="range-value">
            {((value as number) ?? 0.5).toFixed(2)}
          </span>
        </div>
      );
    case "select":
      return (
        <select
          class="field-input"
          value={(value as string) ?? ""}
          onChange={(e) => updateSettingsForm(item.key, e.currentTarget.value)}
        >
          <For each={item.options || []}>
            {(opt, i) => {
              const label = item.option_labels?.[i()] ?? opt;
              return <option value={opt}>{label}</option>;
            }}
          </For>
        </select>
      );
    case "checkbox":
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

export default function SettingsGroupRenderer(props: Props) {
  const { group } = props;

  return (
    <div class="settings-section">
      <div class="section-header">
        <span class="section-icon">{group.icon}</span>
        <div>
          <div class="section-title">{group.title}</div>
          <div class="section-description">{group.description}</div>
        </div>
      </div>
      <div class="section-body">
        <Show when={group.title === "外观"}>
          <div class="field-row">
            <div class="field-label-row">
              <label class="field-label">主题</label>
              <span class="field-hint">选择深色、浅色或跟随系统</span>
            </div>
            <ThemeToggle />
          </div>
          <div class="setting-preview">
            <div class="preview-label">预览</div>
            <div class="preview-container">
              <div class="preview-card">
                <div class="preview-title">悬浮窗效果</div>
                <div class="preview-opacity">
                  <div
                    class="preview-opacity-bar"
                    style={{ opacity: state.settings.form?.opacity ?? 0.48 }}
                  >
                    <div class="preview-stat">
                      <div class="preview-stat-label">总 Token</div>
                      <div class="preview-stat-value">124,500</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Show>
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
  );
}
