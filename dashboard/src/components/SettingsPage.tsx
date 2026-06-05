import { useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardConnectionConfig } from "../api/config";
import type { ServerConnectionProbe } from "../api/client";
import {
  formatConnectionStatus,
  normalizeSettingsDraft,
} from "../api/settingsModel";

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
  onSave,
}: {
  config: DashboardConnectionConfig;
  probe: ServerConnectionProbe | null;
  onSave: (config: DashboardConnectionConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [saved, setSaved] = useState(false);
  const status = formatConnectionStatus(probe);

  const save = () => {
    const next = normalizeSettingsDraft(draft);
    setDraft(next);
    onSave(next);
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
      </main>
    </div>
  );
}
