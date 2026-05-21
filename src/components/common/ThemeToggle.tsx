import { currentTheme, setTheme } from '../../stores/themeStore';

const THEMES = [
  { id: 'dark', label: '暗色', icon: '🌙' },
  { id: 'light', label: '亮色', icon: '☀️' },
  { id: 'system', label: '跟随系统', icon: '🖥️' },
] as const;

export default function ThemeToggle() {
  return (
    <div class="theme-toggle">
      {THEMES.map((t) => (
        <button
          class="theme-btn"
          classList={{ active: currentTheme() === t.id }}
          onClick={() => setTheme(t.id)}
          title={t.label}
        >
          <span class="theme-icon">{t.icon}</span>
          <span class="theme-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
