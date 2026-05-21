import { createSignal, For, Show } from "solid-js";
import { state, setState, addToast } from "../../stores/mainStore";
import type { ProviderConfig } from "../../types";

const PRESET_PROVIDERS = [
  { name: "openai", label: "OpenAI", base_url: "https://api.openai.com/v1" },
  { name: "anthropic", label: "Anthropic", base_url: "https://api.anthropic.com/v1" },
  { name: "deepseek", label: "DeepSeek", base_url: "https://api.deepseek.com/v1" },
];

interface ProviderForm {
  name: string;
  base_url: string;
  api_key: string;
  weight: number;
}

export default function ProviderSection() {
  const [newProvider, setNewProvider] = createSignal<ProviderForm>({
    name: "",
    base_url: "",
    api_key: "",
    weight: 1,
  });

  function selectPreset(provider: (typeof PRESET_PROVIDERS)[0]) {
    setNewProvider({
      name: provider.name,
      base_url: provider.base_url,
      api_key: "",
      weight: 1,
    });
  }

  function addProvider() {
    if (!newProvider().name || !newProvider().base_url) {
      addToast("请填写提供商名称和基础 URL", "warning");
      return;
    }

    const providers = (state.settings.form.providers as ProviderConfig[]) || [];
    const existing = providers.find((p) => p.name === newProvider().name);

    if (existing) {
      addToast(`提供商 "${newProvider().name}" 已存在`, "warning");
      return;
    }

    const updatedProviders = [
      ...providers,
      {
        name: newProvider().name,
        base_url: newProvider().base_url,
        api_key: newProvider().api_key,
        weight: newProvider().weight,
      },
    ];

    setState("settings", "form", {
      ...state.settings.form,
      providers: updatedProviders,
    });
    setState("settings", "hasChanges", true);

    setNewProvider({ name: "", base_url: "", api_key: "", weight: 1 });
    addToast(`已添加提供商: ${newProvider().name}`);
  }

  function removeProvider(name: string) {
    const providers = (state.settings.form.providers as ProviderConfig[]) || [];
    const updatedProviders = providers.filter((p) => p.name !== name);

    setState("settings", "form", {
      ...state.settings.form,
      providers: updatedProviders,
    });
    setState("settings", "hasChanges", true);
    addToast(`已删除提供商: ${name}`);
  }

  return (
    <div class="settings-section provider-section">
      <div class="section-header">
        <span class="section-icon">🔑</span>
        <div>
          <div class="section-title">API 提供商</div>
          <div class="section-description">
            配置 LLM API 提供商，只需输入 Base URL 和 API Key 即可开始统计
          </div>
        </div>
      </div>

      <div class="section-body">
        <div class="preset-providers">
          <div class="preset-label">预设提供商：</div>
          <div class="preset-buttons">
            <For each={PRESET_PROVIDERS}>
              {(preset) => (
                <button
                  class="preset-btn"
                  onClick={() => selectPreset(preset)}
                >
                  {preset.label}
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="provider-form">
          <div class="field-row">
            <div class="field-label-row">
              <label class="field-label">提供商名称</label>
              <span class="field-hint">用于标识此提供商</span>
            </div>
            <input
              type="text"
              class="field-input"
              value={newProvider().name}
              onInput={(e) =>
                setNewProvider({ ...newProvider(), name: e.currentTarget.value })
              }
              placeholder="例如: openai"
            />
          </div>
          <div class="field-row">
            <div class="field-label-row">
              <label class="field-label">API 基础 URL</label>
              <span class="field-hint">例如: https://api.openai.com/v1</span>
            </div>
            <input
              type="text"
              class="field-input"
              value={newProvider().base_url}
              onInput={(e) =>
                setNewProvider({ ...newProvider(), base_url: e.currentTarget.value })
              }
              placeholder="https://..."
            />
          </div>
          <div class="field-row">
            <div class="field-label-row">
              <label class="field-label">API Key</label>
              <span class="field-hint">选填，用于转发请求</span>
            </div>
            <input
              type="password"
              class="field-input"
              value={newProvider().api_key}
              onInput={(e) =>
                setNewProvider({ ...newProvider(), api_key: e.currentTarget.value })
              }
              placeholder="sk-..."
            />
          </div>
          <button class="btn-add-provider" onClick={addProvider}>
            添加提供商
          </button>
        </div>

        <div class="provider-list">
          <For each={(state.settings.form.providers as ProviderConfig[]) || []}>
            {(provider) => (
              <div class="provider-item">
                <div class="provider-info">
                  <div class="provider-name">{provider.name}</div>
                  <div class="provider-url">{provider.base_url}</div>
                </div>
                <button
                  class="btn-remove-provider"
                  onClick={() => removeProvider(provider.name)}
                >
                  删除
                </button>
              </div>
            )}
          </For>
          <Show
            when={
              !((state.settings.form.providers as ProviderConfig[])?.length)
            }
          >
            <div class="empty-state">暂无配置的提供商，请添加一个</div>
          </Show>
        </div>
      </div>
    </div>
  );
}
