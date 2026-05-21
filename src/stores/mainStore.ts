import { createStore } from 'solid-js/store';
import type {
  HourlyDataPoint,
  ModelStat,
  AppSettings,
  DiagnosticsData,
  ToastMessage,
} from '../types';

export type TabId = 'overview' | 'statistics' | 'logs' | 'settings' | 'diagnostics';

export interface MainState {
  currentTab: TabId;
  lastRefresh: Date | null;
  refreshCounter: number;
  overview: {
    stats: Record<string, string | number> | null;
    isLoading: boolean;
  };
  statistics: {
    hourly: HourlyDataPoint[];
    model: ModelStat[];
    recentModels: ModelStat[];
    isLoading: boolean;
  };
  logs: {
    isLoading: boolean;
  };
  settings: {
    form: Partial<AppSettings>;
    original: AppSettings | null;
    isSaving: boolean;
    hasChanges: boolean;
    isLoading: boolean;
  };
  diagnostics: {
    data: DiagnosticsData | null;
    isLoading: boolean;
  };
  toasts: ToastMessage[];
}

export const [state, setState] = createStore<MainState>({
  currentTab: 'overview',
  lastRefresh: null,
  refreshCounter: 0,
  overview: { stats: null, isLoading: false },
  statistics: {
    hourly: [],
    model: [],
    recentModels: [],
    isLoading: false,
  },
  logs: { isLoading: false },
  settings: {
    form: {},
    original: null,
    isSaving: false,
    hasChanges: false,
    isLoading: false,
  },
  diagnostics: { data: null, isLoading: false },
  toasts: [],
});

export function updateLastRefresh() {
  setState('lastRefresh', new Date());
}

export function triggerRefresh() {
  setState('refreshCounter', (c) => c + 1);
}

let toastId = 0;

export function addToast(text: string, type: ToastMessage['type'] = 'info', duration = 2200) {
  const id = ++toastId;
  setState('toasts', (prev) => [...prev, { id, text, type, duration }]);
  setTimeout(() => {
    setState('toasts', (prev) => prev.filter((t) => t.id !== id));
  }, duration);
}

export function removeToast(id: number) {
  setState('toasts', (prev) => prev.filter((t) => t.id !== id));
}

export function setTab(tab: TabId) {
  setState('currentTab', tab);
}

export function updateSettingsForm<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
) {
  setState('settings', 'form', key, value);
  const original = state.settings.original;
  if (original) {
    const hasChanges = Object.entries(state.settings.form).some(
      ([k, v]) => v !== original[k as keyof AppSettings]
    );
    setState('settings', 'hasChanges', hasChanges);
  }
}
