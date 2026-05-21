import { createSignal } from "solid-js";
import * as api from "../scripts/lib/api";

type Theme = "dark" | "light" | "system";

const LOCAL_STORAGE_KEY = "tokenstats-theme";

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const effectiveTheme = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", effectiveTheme);
  document.documentElement.classList.toggle(
    "light",
    effectiveTheme === "light",
  );
}

// Try to get theme from localStorage first
function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored && ["dark", "light", "system"].includes(stored)) {
      return stored as Theme;
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

function setStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, theme);
  } catch {
    // Ignore localStorage errors
  }
}

const [theme, setThemeSignal] = createSignal<Theme>("dark");
let mediaQuery: MediaQueryList | null = null;
let systemThemeHandler: (() => void) | null = null;

function setupSystemThemeListener() {
  if (mediaQuery) return; // Already set up

  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeHandler = () => {
    if (theme() === "system") {
      applyTheme("system");
    }
  };
  mediaQuery.addEventListener("change", systemThemeHandler);
}

export const currentTheme = theme;

export async function initTheme() {
  // Set up system theme listener
  setupSystemThemeListener();

  // First try localStorage for quick loading
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    setThemeSignal(storedTheme);
    applyTheme(storedTheme);
  } else {
    applyTheme("dark");
  }

  // Then try to get from settings for persistence
  try {
    const settings = await api.getSettings();
    const storedThemeFromSettings = settings.theme as Theme;
    if (
      storedThemeFromSettings &&
      ["dark", "light", "system"].includes(storedThemeFromSettings)
    ) {
      setThemeSignal(storedThemeFromSettings);
      applyTheme(storedThemeFromSettings);
      setStoredTheme(storedThemeFromSettings);
    }
  } catch (err) {
    // Quietly fail - we already have a theme applied
  }
}

export async function setTheme(newTheme: Theme) {
  setThemeSignal(newTheme);
  applyTheme(newTheme);
  setStoredTheme(newTheme);

  try {
    const currentSettings = await api.getSettings();
    await api.saveSettings({ ...currentSettings, theme: newTheme });
  } catch (err) {
    // Quietly fail - theme is already applied locally
  }
}
