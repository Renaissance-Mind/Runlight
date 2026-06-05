import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useLiveSessions } from "./hooks/useSessions";
import { useServerConnection } from "./hooks/useServerConnection";
import SessionsTable from "./components/SessionsTable";
import SessionDetail from "./components/SessionDetail";
import FloatingHUD from "./components/FloatingHUD";
import {
  readStoredDashboardConfig,
  resolveDashboardConfig,
  writeStoredDashboardConfig,
  type DashboardConnectionConfig,
} from "./api/config";
import type { ServerConnectionProbe } from "./api/client";

function ConnectionControls({
  config,
  probe,
  onChange,
}: {
  config: DashboardConnectionConfig;
  probe: ServerConnectionProbe | null;
  onChange: (config: DashboardConnectionConfig) => void;
}) {
  const [draft, setDraft] = useState(config);

  const save = () => {
    const next = resolveDashboardConfig(undefined, draft);
    writeStoredDashboardConfig(next);
    setDraft(next);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
      <ConnectionStatus probe={probe} />
      <input
        aria-label="Server URL"
        value={draft.serverUrl}
        onChange={(event) =>
          setDraft({ ...draft, serverUrl: event.currentTarget.value })
        }
        className="w-64 bg-surface-1 border border-surface-3 rounded px-2 py-1 text-gray-300"
      />
      <input
        aria-label="Token"
        value={draft.token}
        onChange={(event) =>
          setDraft({ ...draft, token: event.currentTarget.value })
        }
        placeholder="token"
        type="password"
        className="w-32 bg-surface-1 border border-surface-3 rounded px-2 py-1 text-gray-300"
      />
      <button
        onClick={save}
        className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
      >
        Save
      </button>
    </div>
  );
}

function ConnectionStatus({ probe }: { probe: ServerConnectionProbe | null }) {
  if (!probe) {
    return <span className="text-[10px] text-gray-600">Checking server</span>;
  }

  if (!probe.ok) {
    return (
      <span className="max-w-72 truncate text-[10px] text-accent-red">
        Disconnected: {probe.error}
      </span>
    );
  }

  return (
    <span className="text-[10px] text-gray-500">
      {probe.userId || "default"} / {probe.tokenConfigured ? "token" : "no token"}
    </span>
  );
}

function Dashboard({ config }: { config: DashboardConnectionConfig }) {
  const { sessions, loading, error, refresh } = useLiveSessions(config, 3000);

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
        <FloatingHUD sessions={sessions} />
      </div>

      <main className="flex-1 px-4 pb-4">
        <SessionsTable sessions={sessions} loading={loading} error={error} />
      </main>

      <footer className="border-t border-surface-3 px-4 py-1.5 text-[10px] text-gray-600 flex justify-between">
        <span>{sessions.length} session(s)</span>
        <span>AgentMonitor v0.1.0</span>
      </footer>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState(() =>
    resolveDashboardConfig(undefined, readStoredDashboardConfig()),
  );
  const { probe } = useServerConnection(config, 10000);

  return (
    <>
      <header className="border-b border-surface-3 px-4 py-2 flex items-center justify-end">
        <ConnectionControls config={config} probe={probe} onChange={setConfig} />
      </header>
      <Routes>
        <Route path="/" element={<Dashboard config={config} />} />
        <Route
          path="/sessions/:sessionId"
          element={
            <div className="min-h-screen p-4">
              <SessionDetail config={config} />
            </div>
          }
        />
      </Routes>
    </>
  );
}
