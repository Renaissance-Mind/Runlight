import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Session, SessionEvent } from "../types/session";
import { fetchSession, fetchSessionEvents } from "../api/client";
import StatusBadge from "./StatusBadge";
import type { DashboardConnectionConfig } from "../api/config";

function formatTime(isoStr: string | null): string {
  if (!isoStr) return "-";
  return new Date(isoStr).toLocaleString();
}

const SEVERITY_COLORS: Record<string, string> = {
  debug: "text-gray-500",
  info: "text-gray-300",
  warning: "text-accent-yellow",
  error: "text-accent-red",
};

export default function SessionDetail({
  config,
}: {
  config: DashboardConnectionConfig;
}) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    Promise.all([
      fetchSession(sessionId, config),
      fetchSessionEvents(sessionId, config),
    ])
      .then(([s, evts]) => {
        setSession(s);
        setEvents(evts);
      })
      .finally(() => setLoading(false));

    const interval = setInterval(async () => {
      try {
        const [s, evts] = await Promise.all([
          fetchSession(sessionId, config),
          fetchSessionEvents(sessionId, config),
        ]);
        setSession(s);
        setEvents(evts);
      } catch {
        /* ignore refresh errors */
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, config]);

  if (loading) {
    return <div className="p-4 text-gray-500 animate-pulse">Loading...</div>;
  }

  if (!session) {
    return <div className="p-4 text-accent-red">Session not found</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="text-gray-500 hover:text-white transition-colors"
        >
          &larr; Back
        </Link>
        <StatusBadge status={session.current_status} size="md" />
        <h2 className="text-sm font-medium text-white truncate">
          {session.session_name || session.summary || session.session_id}
        </h2>
        {session.session_pin && (
          <span className="text-[10px] text-accent-yellow border border-accent-yellow/40 rounded px-1.5 py-0.5">
            PIN
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <MetaCard label="Session Name" value={session.session_name} />
        <MetaCard label="Pinned" value={session.session_pin ? "true" : "false"} />
        <MetaCard label="Agent" value={session.agent_type} />
        <MetaCard label="Adapter" value={session.adapter_name} />
        <MetaCard label="Machine" value={session.machine_hostname} />
        <MetaCard label="OS" value={session.machine_os} />
        <MetaCard label="Path" value={session.workspace_cwd} />
        <MetaCard label="Branch" value={session.workspace_git_branch} />
        <MetaCard label="Project" value={session.workspace_project_name} />
        <MetaCard label="Events" value={String(session.event_count)} />
        <MetaCard label="Started" value={formatTime(session.started_at)} />
        <MetaCard label="Last Event" value={formatTime(session.last_event_at)} />
        <MetaCard label="Last Heartbeat" value={formatTime(session.last_heartbeat_at)} />
        <MetaCard label="Latest Event Type" value={session.latest_event_type} />
      </div>

      <div>
        <h3 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
          Event Timeline ({events.length})
        </h3>
        <div className="space-y-0.5">
          {events.map((ev) => (
            <div
              key={ev.event_id}
              className="flex items-start gap-2 px-3 py-1.5 bg-surface-1 hover:bg-surface-2 rounded text-xs transition-colors"
            >
              <span className="text-gray-500 w-20 shrink-0 text-right">
                {ev.event_time
                  ? new Date(ev.event_time).toLocaleTimeString()
                  : "-"}
              </span>
              <span className="w-36 shrink-0 text-accent-blue truncate">
                {ev.event_type}
              </span>
              <span className={`w-12 shrink-0 ${SEVERITY_COLORS[ev.severity] || "text-gray-400"}`}>
                {ev.severity}
              </span>
              <span className="text-gray-300 truncate flex-1">
                {ev.summary || "-"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaCard({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="bg-surface-1 rounded px-3 py-2">
      <div className="text-gray-500 text-[10px] uppercase tracking-wider">
        {label}
      </div>
      <div className="text-gray-200 truncate">{value || "-"}</div>
    </div>
  );
}
