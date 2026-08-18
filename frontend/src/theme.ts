export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

export function readTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyTheme(mode);
}

export function initTheme() {
  applyTheme(readTheme());
}
