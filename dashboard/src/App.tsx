import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Routes, Route, useLocation } from "react-router-dom";
import { useLiveSessions } from "./hooks/useSessions";
import { useServerConnection } from "./hooks/useServerConnection";
import HomePage from "./components/HomePage";
import SessionsTable from "./components/SessionsTable";
import SessionDetail from "./components/SessionDetail";
import FloatingHUD from "./components/FloatingHUD";
import SettingsPage from "./components/SettingsPage";
import MessagesPage from "./components/MessagesPage";
import DevicePage from "./components/DevicePage";
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
  userSettingsFromPreferences,
  type DashboardPreferences,
} from "./api/preferences";
import type { Session } from "./types/session";

interface ToolbarAction {
  label: string;
  onClick: () => void;
}

function dashboardNavLinkClass({ isActive }: { isActive: boolean }): string {
  return `text-xs px-2 py-1 rounded transition-colors ${
    isActive
      ? "text-white bg-surface-2"
      : "text-gray-500 hover:text-white hover:bg-surface-2"
  }`;
}

function homeNavLinkClass({ isActive }: { isActive: boolean }): string {
  return `text-sm font-semibold transition-colors ${
    isActive ? "text-[#087e63]" : "text-[#0f172a] hover:text-[#087e63]"
  }`;
}

function LogoMark({ home }: { home: boolean }) {
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded border ${
        home
          ? "border-[#0f9f7a]/40 bg-[#e9fbf5] text-[#087e63]"
          : "border-surface-3 bg-surface-2 text-accent-green"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 20h8M12 16.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.2 10.5h2.4l1.3-2.6 2.1 5.2 1.2-2.6h2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function AppHeader({
  home,
  probe,
  loggedInWithCookie,
  loggingOut,
  onLogout,
  refreshAction,
}: {
  home: boolean;
  probe?: ServerConnectionProbe | null;
  loggedInWithCookie?: boolean;
  loggingOut?: boolean;
  onLogout?: () => void;
  refreshAction?: ToolbarAction | null;
}) {
  if (home) {
    return (
      <header className="sticky top-0 z-20 border-b border-[#d7e0ea] bg-[#f8fafc]/95 px-5 py-3 font-sans backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-black tracking-normal text-[#0f172a]">
            <LogoMark home />
            Runlight
          </Link>
          <nav className="hidden items-center gap-8 sm:flex">
            <NavLink to="/live" className={homeNavLinkClass}>
              Live
            </NavLink>
            <a href="/#devices" className="text-sm font-semibold text-[#0f172a] transition-colors hover:text-[#087e63]">
              Devices
            </a>
            <NavLink to="/connect" className={homeNavLinkClass}>
              Connect
            </NavLink>
            <a href="https://github.com/Renaissance-Mind/Runlight#readme" className="text-sm font-semibold text-[#0f172a] transition-colors hover:text-[#087e63]">
              Docs
            </a>
          </nav>
          <Link
            to="/live"
            className="hidden h-9 items-center rounded-md bg-[#087e63] px-4 text-sm font-bold text-[#f8fafc] transition-colors hover:bg-[#066b54] sm:inline-flex"
          >
            Open Dashboard
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-surface-3 px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 text-sm font-bold text-white tracking-tight">
          <LogoMark home={false} />
          Runlight
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1">
          <NavLink to="/live" className={dashboardNavLinkClass}>
            Live
          </NavLink>
          <NavLink to="/messages" className={dashboardNavLinkClass}>
            Messages
          </NavLink>
          <NavLink to="/devices" className={dashboardNavLinkClass}>
            Devices
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {probe !== undefined ? <ConnectionStatus probe={probe} /> : null}
          <NavLink to="/connect" className={dashboardNavLinkClass}>
            Connect
          </NavLink>
          <Link
            to="/settings"
            className="text-xs text-gray-500 hover:text-white dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
          >
            Settings
          </Link>
          {refreshAction ? (
            <button
              onClick={refreshAction.onClick}
              className="text-xs text-gray-500 hover:text-white dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
            >
              {refreshAction.label}
            </button>
          ) : null}
          {loggedInWithCookie ? (
            <button
              onClick={onLogout}
              disabled={loggingOut}
              className="text-xs text-gray-500 hover:text-white dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2 disabled:opacity-50"
            >
              {loggingOut ? "Logging out" : "Logout"}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
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

function Dashboard({
  config,
  prefs,
  onRefreshActionChange,
}: {
  config: DashboardConnectionConfig;
  prefs: DashboardPreferences;
  onRefreshActionChange: (action: ToolbarAction | null) => void;
}) {
  const { sessions, loading, error, refresh } = useLiveSessions(config, 3000);
  const filtered = useMemo(() => filterSessions(sessions, prefs), [sessions, prefs]);

  useEffect(() => {
    onRefreshActionChange({ label: "Refresh", onClick: refresh });
    return () => onRefreshActionChange(null);
  }, [onRefreshActionChange, refresh]);

  return (
    <div className="min-h-screen flex flex-col">
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
  const location = useLocation();
  const [config, setConfig] = useState(() =>
    resolveDashboardConfig(undefined, readStoredDashboardConfig()),
  );
  const [prefs, setPrefs] = useState(readPreferences);
  const { probe } = useServerConnection(config, 10000);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshAction, setRefreshAction] = useState<ToolbarAction | null>(null);

  const saveConfig = (next: DashboardConnectionConfig) => {
    writeStoredDashboardConfig(next);
    setConfig(next);
  };
  const savePrefs = async (next: DashboardPreferences) => {
    writePreferences(next);
    setPrefs(next);
    await saveUserSettings(userSettingsFromPreferences(next), config);
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
  const isHome = location.pathname === "/";
  const loggedInWithCookie = Boolean(
    probe?.ok && !config.token.trim() && probe.userId && probe.userId !== "default",
  );

  if (authRequired && !isHome) {
    const isConnect = location.pathname === "/connect";
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
      <AppHeader
        home={isHome}
        probe={isHome ? undefined : probe}
        loggedInWithCookie={loggedInWithCookie}
        loggingOut={loggingOut}
        onLogout={doLogout}
        refreshAction={isHome ? null : refreshAction}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/live"
          element={
            <Dashboard
              config={config}
              prefs={prefs}
              onRefreshActionChange={setRefreshAction}
            />
          }
        />
        <Route
          path="/messages"
          element={
            <MessagesPage
              config={config}
              prefs={prefs}
              onRefreshActionChange={setRefreshAction}
            />
          }
        />
        <Route
          path="/devices"
          element={
            <DevicePage
              config={config}
              onRefreshActionChange={setRefreshAction}
            />
          }
        />
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
