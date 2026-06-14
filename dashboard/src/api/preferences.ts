export type Theme = "dark" | "light" | "system";
export type Language = "system" | "en" | "zh-CN";

export interface DashboardPreferences {
  theme: Theme;
  language: Language;
  hideStaleAfterHours: number;
  hideFinishedAfterHours: number;
  messageMaxColumns: number;
}

const STORAGE_KEY = "runlight.dashboard.preferences";

const DEFAULTS: DashboardPreferences = {
  theme: "dark",
  language: "system",
  hideStaleAfterHours: 5,
  hideFinishedAfterHours: 5,
  messageMaxColumns: 3,
};

function normalizeTheme(value: unknown): Theme {
  return value === "dark" || value === "light" || value === "system"
    ? value
    : DEFAULTS.theme;
}

function normalizeLanguage(value: unknown): Language {
  return value === "system" || value === "en" || value === "zh-CN"
    ? value
    : DEFAULTS.language;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizePreferences(
  partial: Partial<DashboardPreferences>,
): DashboardPreferences {
  return {
    ...DEFAULTS,
    ...partial,
    theme: normalizeTheme(partial.theme),
    language: normalizeLanguage(partial.language),
    hideStaleAfterHours: Math.max(
      0,
      Number(partial.hideStaleAfterHours ?? DEFAULTS.hideStaleAfterHours),
    ),
    hideFinishedAfterHours: Math.max(
      0,
      Number(partial.hideFinishedAfterHours ?? DEFAULTS.hideFinishedAfterHours),
    ),
    messageMaxColumns: clampNumber(
      partial.messageMaxColumns,
      1,
      6,
      DEFAULTS.messageMaxColumns,
    ),
  };
}

export function readPreferences(): DashboardPreferences {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULTS;
  try {
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

export function writePreferences(prefs: DashboardPreferences): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePreferences(prefs)));
}

export function userSettingsFromPreferences(
  prefs: DashboardPreferences,
): Pick<DashboardPreferences, "theme" | "language"> {
  const normalized = normalizePreferences(prefs);
  return {
    theme: normalized.theme,
    language: normalized.language,
  };
}

export function getEffectiveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}
