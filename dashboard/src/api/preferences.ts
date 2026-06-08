export type Theme = "dark" | "light" | "system";

export interface DashboardPreferences {
  theme: Theme;
  hideStaleAfterHours: number;
  hideFinishedAfterHours: number;
}

const STORAGE_KEY = "agent-monitor.dashboard.preferences";

const DEFAULTS: DashboardPreferences = {
  theme: "dark",
  hideStaleAfterHours: 5,
  hideFinishedAfterHours: 5,
};

export function readPreferences(): DashboardPreferences {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function writePreferences(prefs: DashboardPreferences): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getEffectiveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}
