import { useEffect, useMemo, useState } from "react";
import { Link, Routes, Route } from "react-router-dom";
import { useLiveSessions } from "./hooks/useSessions";
import { useServerConnection } from "./hooks/useServerConnection";
import SessionsTable from "./components/SessionsTable";
import SessionDetail from "./components/SessionDetail";
import FloatingHUD from "./components/FloatingHUD";
import SettingsPage from "./components/SettingsPage";
import {
  readStoredDashboardConfig,
  resolveDashboardConfig,
  writeStoredDashboardConfig,
  type DashboardConnectionConfig,
} from "./api/config";
import type { ServerConnectionProbe } from "./api/client";
import { formatConnectionStatus } from "./api/settingsModel";
import {
  readPreferences,
  writePreferences,
  getEffectiveTheme,
  type DashboardPreferences,
} from "./api/preferences";
import type { Session } from "./types/session";

function ConnectionStatus({ probe }: { probe: ServerConnectionProbe | null }) {
  const status = formatConnectionStatus(probe);
  const toneClass =
    status.tone === "error"
      ? "text-accent-red"
      : status.tone === "ok"
        ? "text-accent-green"
        : "text-gray-600";

  return (
    <span className={`max-w-72 truncate text-[10px] ${toneClass}`}>
      {status.label}
    </span>
  );
}

function filterSessions(sessions: Session[], prefs: DashboardPreferences): Session[] {
  const now = Date.now();
  return sessions.filter((s) => {
    if (s.session_pin) return true;
    if (s.current_status !== "stale" && s.current_status !== "finished") return true;
    const limit = s.current_status === "stale" ? prefs.hideStaleAfterHours : prefs.hideFinishedAfterHours;
    if (limit === 0) return true;
    const ref = s.last_event_at;
    if (!ref) return false;
    const age = (now - new Date(ref.endsWith("Z") ? ref : ref + "Z").getTime()) / 3600000;
    return age <= limit;
  });
}

function Dashboard({ config, prefs }: { config: DashboardConnectionConfig; prefs: DashboardPreferences }) {
  const { sessions, loading, error, refresh } = useLiveSessions(config, 3000);
  const filtered = useMemo(() => filterSessions(sessions, prefs), [sessions, prefs]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-surface-3 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-white tracking-tight">
            AgentMonitor
          </h1>
          <span className="text-[10px] text-gray-600 uppercase">
            Live Sessions
          </span>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
        >
          Refresh
        </button>
      </header>

      <div className="px-4 py-3">
        <FloatingHUD sessions={filtered} />
      </div>

      <main className="flex-1 px-4 pb-4">
        <SessionsTable sessions={filtered} loading={loading} error={error} />
      </main>

      <footer className="border-t border-surface-3 px-4 py-1.5 text-[10px] text-gray-600 flex justify-between">
        <span>{filtered.length} session(s){filtered.length < sessions.length ? ` (${sessions.length - filtered.length} hidden)` : ""}</span>
        <span>AgentMonitor v0.1.0</span>
      </footer>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState(() =>
    resolveDashboardConfig(undefined, readStoredDashboardConfig()),
  );
  const [prefs, setPrefs] = useState(readPreferences);
  const { probe } = useServerConnection(config, 10000);

  const saveConfig = (next: DashboardConnectionConfig) => {
    writeStoredDashboardConfig(next);
    setConfig(next);
  };
  const savePrefs = (next: DashboardPreferences) => {
    writePreferences(next);
    setPrefs(next);
  };

  useEffect(() => {
    const theme = getEffectiveTheme(prefs.theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [prefs.theme]);

  return (
    <>
      <header className="border-b border-surface-3 px-4 py-2 flex items-center justify-end gap-3">
        <ConnectionStatus probe={probe} />
        <Link
          to="/settings"
          className="text-xs text-gray-500 hover:text-white dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
        >
          Settings
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<Dashboard config={config} prefs={prefs} />} />
        <Route
          path="/sessions/:sessionId"
          element={
            <div className="min-h-screen p-4">
              <SessionDetail config={config} />
            </div>
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage
              config={config}
              probe={probe}
              prefs={prefs}
              onSave={saveConfig}
              onSavePrefs={savePrefs}
            />
          }
        />
      </Routes>
    </>
  );
}
