import { Routes, Route } from "react-router-dom";
import { useLiveSessions } from "./hooks/useSessions";
import SessionsTable from "./components/SessionsTable";
import SessionDetail from "./components/SessionDetail";
import FloatingHUD from "./components/FloatingHUD";

function Dashboard() {
  const { sessions, loading, error, refresh } = useLiveSessions(3000);

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
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/sessions/:sessionId" element={
        <div className="min-h-screen p-4">
          <SessionDetail />
        </div>
      } />
    </Routes>
  );
}
