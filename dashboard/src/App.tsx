import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Routes, Route } from "react-router-dom";
import { useLiveSessions } from "./hooks/useSessions";
import { useServerConnection } from "./hooks/useServerConnection";
import SessionsTable from "./components/SessionsTable";
import SessionDetail from "./components/SessionDetail";
import FloatingHUD from "./components/FloatingHUD";
import SettingsPage from "./components/SettingsPage";
import MessagesPage from "./components/MessagesPage";
import ConnectPage from "./components/ConnectPage";
import {
  buildAuthLoginUrl,
  readStoredDashboardConfig,
  resolveDashboardConfig,
  writeStoredDashboardConfig,
  type DashboardConnectionConfig,
} from "./api/config";
import type { ServerConnectionProbe } from "./api/client";
import { fetchUserSettings, logout, saveUserSettings } from "./api/client";
import { formatConnectionStatus } from "./api/settingsModel";
import {
  readPreferences,
  writePreferences,
  getEffectiveTheme,
  type DashboardPreferences,
} from "./api/preferences";
import type { Session } from "./types/session";

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `text-xs px-2 py-1 rounded transition-colors ${
    isActive
      ? "text-white bg-surface-2"
      : "text-gray-500 hover:text-white hover:bg-surface-2"
  }`;
}

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
            Runlight
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
        <span>Runlight v0.1.0</span>
      </footer>
    </div>
  );
}

function LoginScreen({
  config,
  error,
  title = "Runlight",
  subtitle = "Sign in to view live agent sessions.",
}: {
  config: DashboardConnectionConfig;
  error: string | null;
  title?: string;
  subtitle?: string;
}) {
  const returnTo = typeof window === "undefined"
    ? "/"
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <section className="w-full max-w-sm border border-surface-3 bg-surface-1 rounded-lg p-5 space-y-4">
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">{title}</h1>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="grid gap-2">
          <a
            href={buildAuthLoginUrl(config.serverUrl, "github", returnTo)}
            className="text-center text-xs text-gray-200 border border-surface-3 px-3 py-2 rounded hover:bg-surface-2 transition-colors"
          >
            Continue with GitHub
          </a>
          <a
            href={buildAuthLoginUrl(config.serverUrl, "google", returnTo)}
            className="text-center text-xs text-gray-200 border border-surface-3 px-3 py-2 rounded hover:bg-surface-2 transition-colors"
          >
            Continue with Google
          </a>
        </div>
        {error ? <p className="text-[10px] text-accent-red">{error}</p> : null}
      </section>
    </main>
  );
}

export default function App() {
  const [config, setConfig] = useState(() =>
    resolveDashboardConfig(undefined, readStoredDashboardConfig()),
  );
  const [prefs, setPrefs] = useState(readPreferences);
  const { probe } = useServerConnection(config, 10000);
  const [loggingOut, setLoggingOut] = useState(false);

  const saveConfig = (next: DashboardConnectionConfig) => {
    writeStoredDashboardConfig(next);
    setConfig(next);
  };
  const savePrefs = (next: DashboardPreferences) => {
    writePreferences(next);
    setPrefs(next);
    saveUserSettings({ theme: next.theme, language: next.language }, config).catch(() => {
      // Local preferences are already saved; the server can be retried later.
    });
  };

  useEffect(() => {
    const theme = getEffectiveTheme(prefs.theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [prefs.theme]);

  useEffect(() => {
    document.documentElement.lang = prefs.language === "system"
      ? window.navigator.language || "en"
      : prefs.language;
  }, [prefs.language]);

  useEffect(() => {
    if (!probe?.ok) return;
    let cancelled = false;
    fetchUserSettings(config)
      .then((settings) => {
        if (cancelled) return;
        const next = {
          ...readPreferences(),
          theme: settings.theme,
          language: settings.language,
        };
        writePreferences(next);
        setPrefs(next);
      })
      .catch(() => {
        // Keep local fallback settings when server-side preferences are unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [config.serverUrl, config.token, probe?.ok]);

  const authRequired = probe?.error?.startsWith("API 401") && !config.token.trim();
  const loggedInWithCookie = probe?.ok && !config.token.trim() && probe.userId && probe.userId !== "default";

  if (authRequired) {
    const isConnect = typeof window !== "undefined" && window.location.pathname === "/connect";
    return (
      <LoginScreen
        config={config}
        error={probe?.error ?? null}
        title={isConnect ? "Connect Runlight CLI" : "Runlight"}
        subtitle={isConnect ? "Sign in to create an upload token." : "Sign in to view live agent sessions."}
      />
    );
  }

  const doLogout = async () => {
    setLoggingOut(true);
    await logout(config);
    window.location.href = "/";
  };

  return (
    <>
      <header className="border-b border-surface-3 px-4 py-2 flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Live
          </NavLink>
          <NavLink to="/messages" className={navLinkClass}>
            Messages
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <ConnectionStatus probe={probe} />
          {loggedInWithCookie ? (
            <button
              onClick={doLogout}
              disabled={loggingOut}
              className="text-xs text-gray-500 hover:text-white dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2 disabled:opacity-50"
            >
              {loggingOut ? "Logging out" : "Logout"}
            </button>
          ) : null}
          <Link
            to="/settings"
            className="text-xs text-gray-500 hover:text-white dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
          >
            Settings
          </Link>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Dashboard config={config} prefs={prefs} />} />
        <Route path="/messages" element={<MessagesPage config={config} prefs={prefs} />} />
        <Route path="/connect" element={<ConnectPage config={config} />} />
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
