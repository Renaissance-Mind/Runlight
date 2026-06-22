import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { Session, SessionEvent } from "../types/session";
import { deleteSession, fetchSession, fetchSessionEvents } from "../api/client";
import StatusBadge from "./StatusBadge";
import type { DashboardConnectionConfig } from "../api/config";
import { useApprovals } from "../hooks/useSessions";
import ApprovalPanel from "./ApprovalPanel";

function formatTime(isoStr: string | null): string {
  if (!isoStr) return "-";
  return new Date(isoStr).toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const approvals = useApprovals(config, 2000);
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setEventsError(null);

      try {
        const nextSession = await fetchSession(sessionId, config);
        if (cancelled) return;
        setSession(nextSession);
      } catch (err) {
        if (cancelled) return;
        setLoadError(errorMessage(err));
        setSession(null);
        setLoading(false);
        return;
      }

      try {
        const nextEvents = await fetchSessionEvents(sessionId, config);
        if (cancelled) return;
        setEvents(nextEvents);
        setEventsError(null);
      } catch (err) {
        if (cancelled) return;
        setEvents([]);
        setEventsError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const interval = setInterval(async () => {
      try {
        const nextSession = await fetchSession(sessionId, config);
        if (cancelled) return;
        setSession(nextSession);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
        return;
      }

      try {
        const nextEvents = await fetchSessionEvents(sessionId, config);
        if (cancelled) return;
        setEvents(nextEvents);
        setEventsError(null);
      } catch (err) {
        if (!cancelled) setEventsError(errorMessage(err));
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, config]);

  if (loading) {
    return <div className="p-4 text-gray-500 animate-pulse">Loading...</div>;
  }

  if (loadError && !session) {
    return (
      <div className="p-4 text-accent-red">
        Failed to load session: {loadError}
      </div>
    );
  }

  if (!session) {
    return <div className="p-4 text-accent-red">Session not found</div>;
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="rounded bg-surface-2 px-3 py-2 text-xs text-accent-red">
          Failed to refresh session: {loadError}
        </div>
      )}
      {deleteError && (
        <div className="rounded bg-surface-2 px-3 py-2 text-xs text-accent-red">
          Failed to delete session: {deleteError}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="text-gray-500 hover:text-white transition-colors"
        >
          &larr; Back
        </Link>
        <StatusBadge
          status={session.current_status}
          lastEventAt={session.last_event_at}
          size="md"
        />
        <h2 className="text-sm font-medium text-white truncate">
          {session.session_name || session.summary || session.session_id}
        </h2>
        {session.session_pin && (
          <span className="text-[10px] text-accent-yellow border border-accent-yellow/40 rounded px-1.5 py-0.5">
            PIN
          </span>
        )}
        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            if (!sessionId) return;
            if (!window.confirm("Delete this session and its events?")) return;
            setDeleting(true);
            setDeleteError(null);
            try {
              await deleteSession(sessionId, config);
              navigate("/");
            } catch (err) {
              setDeleteError(errorMessage(err));
              setDeleting(false);
            }
          }}
          className="ml-auto rounded border border-accent-red/40 px-2 py-1 text-xs text-accent-red transition-colors hover:bg-accent-red/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
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

      <ApprovalPanel
        approvals={approvals.approvals.filter((approval) => approval.session_id === session.session_id)}
        error={approvals.error}
        resolvingIds={approvals.resolvingIds}
        onDecision={approvals.decide}
      />

      <div>
        <h3 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
          Event Timeline ({events.length})
        </h3>
        {eventsError && (
          <div className="mb-2 rounded bg-surface-2 px-3 py-2 text-xs text-accent-red">
            Failed to load events: {eventsError}
          </div>
        )}
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
