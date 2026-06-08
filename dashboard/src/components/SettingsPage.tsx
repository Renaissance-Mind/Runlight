import { useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardConnectionConfig } from "../api/config";
import type { ServerConnectionProbe } from "../api/client";
import {
  formatConnectionStatus,
  normalizeSettingsDraft,
} from "../api/settingsModel";
import { getEffectiveTheme, type DashboardPreferences, type Theme } from "../api/preferences";

function statusToneClass(tone: "ok" | "muted" | "error"): string {
  switch (tone) {
    case "ok":
      return "text-accent-green";
    case "error":
      return "text-accent-red";
    case "muted":
      return "text-gray-600";
  }
}

export default function SettingsPage({
  config,
  probe,
  prefs,
  onSave,
  onSavePrefs,
}: {
  config: DashboardConnectionConfig;
  probe: ServerConnectionProbe | null;
  prefs: DashboardPreferences;
  onSave: (config: DashboardConnectionConfig) => void;
  onSavePrefs: (prefs: DashboardPreferences) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [prefsDraft, setPrefsDraft] = useState(prefs);
  const [saved, setSaved] = useState(false);
  const status = formatConnectionStatus(probe);

  const save = () => {
    const next = normalizeSettingsDraft(draft);
    setDraft(next);
    onSave(next);
    onSavePrefs(prefsDraft);
    setSaved(true);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-surface-3 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Back
          </Link>
          <h1 className="text-sm font-bold text-white tracking-tight">
            Settings
          </h1>
        </div>
        <span className={`max-w-80 truncate text-[10px] ${statusToneClass(status.tone)}`}>
          {status.label}
        </span>
      </header>

      <main className="max-w-2xl px-4 py-5">
        <div className="border border-surface-3 bg-surface-1 rounded-lg p-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase text-gray-500 tracking-wider">
              Server URL
            </span>
            <input
              aria-label="Server URL"
              value={draft.serverUrl}
              onChange={(event) => {
                setSaved(false);
                setDraft({ ...draft, serverUrl: event.currentTarget.value });
              }}
              className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm text-gray-200"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase text-gray-500 tracking-wider">
              Token
            </span>
            <input
              aria-label="Token"
              value={draft.token}
              onChange={(event) => {
                setSaved(false);
                setDraft({ ...draft, token: event.currentTarget.value });
              }}
              type="password"
              className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm text-gray-200"
            />
          </label>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-gray-600">
              {saved ? "Saved" : status.label}
            </span>
            <button
              onClick={save}
              className="text-xs text-gray-300 hover:text-white border border-surface-3 px-3 py-1.5 rounded hover:bg-surface-2 transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        <div className="border border-surface-3 bg-surface-1 rounded-lg p-4 space-y-4 mt-4">
          <h2 className="text-xs font-semibold uppercase text-gray-500 tracking-wider">
            Display
          </h2>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase text-gray-500 tracking-wider">
              Theme
            </span>
            <select
              value={prefsDraft.theme}
              onChange={(e) => {
                const next = e.currentTarget.value as Theme;
                setSaved(false);
                setPrefsDraft({ ...prefsDraft, theme: next });
                document.documentElement.classList.toggle("dark", getEffectiveTheme(next) === "dark");
              }}
              className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase text-gray-500 tracking-wider">
              Hide stale sessions after (hours)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={prefsDraft.hideStaleAfterHours}
              onChange={(e) => {
                setSaved(false);
                setPrefsDraft({ ...prefsDraft, hideStaleAfterHours: Math.max(0, Number(e.currentTarget.value)) });
              }}
              className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm text-gray-200"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase text-gray-500 tracking-wider">
              Hide finished sessions after (hours)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={prefsDraft.hideFinishedAfterHours}
              onChange={(e) => {
                setSaved(false);
                setPrefsDraft({ ...prefsDraft, hideFinishedAfterHours: Math.max(0, Number(e.currentTarget.value)) });
              }}
              className="w-full bg-surface-2 border border-surface-3 rounded px-3 py-2 text-sm text-gray-200"
            />
          </label>

          <p className="text-[10px] text-gray-600">
            Set to 0 to never hide. Pinned sessions are always shown.
          </p>
        </div>
      </main>
    </div>
  );
}
