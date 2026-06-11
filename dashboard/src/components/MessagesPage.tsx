import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Session, SessionEvent } from "../types/session";
import type { DashboardConnectionConfig } from "../api/config";
import { useLiveSessions, useRecentEvents } from "../hooks/useSessions";
import { getStatusPresentation } from "../api/statusPresentation";
import AgentIcon from "./AgentIcon";

function parseUTC(isoStr: string): number {
  return new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z").getTime();
}

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "-";
  const sec = Math.floor((Date.now() - parseUTC(isoStr)) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function clockTime(isoStr: string | null): string {
  if (!isoStr) return "";
  const d = new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z");
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Map a completion event type to the status string understood by the
// shared status presentation so colors stay consistent with the table.
function statusForEvent(eventType: string): string {
  switch (eventType) {
    case "session.completed":
      return "completed";
    case "session.failed":
      return "failed";
    case "session.aborted":
      return "aborted";
    default:
      return "finished";
  }
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "session.completed":
      return "Session completed";
    case "session.failed":
      return "Session failed";
    case "session.aborted":
      return "Session aborted";
    case "message.finished":
      return "Response finished";
    default:
      return eventType;
  }
}


interface MessageItem {
  key: string;
  sessionId: string;
  sortTime: string | null;
  kind: "event" | "live";
  event?: SessionEvent;
  session?: Session;
}

function MessageRow({ item }: { item: MessageItem }) {
  if (item.kind === "live" && item.session) {
    return <LiveRow session={item.session} />;
  }
  if (item.event) {
    return <EventRow event={item.event} />;
  }
  return null;
}

function LiveRow({ session: s }: { session: Session }) {
  const presentation = getStatusPresentation(s.current_status, s.last_event_at);
  const title = s.session_name || s.summary || "Running";

  return (
    <Link
      to={`/sessions/${s.session_id}`}
      className="flex items-center gap-3 border-b border-surface-3/50 px-4 py-3 hover:bg-surface-2/50 transition-colors"
    >
      <span className="relative flex shrink-0">
        <span className={`h-2 w-2 rounded-full ${presentation.dotClass}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {s.workspace_project_name && (
            <span className="shrink-0 text-sm font-bold text-white">
              {s.workspace_project_name}
            </span>
          )}
          <span className="shrink-0 flex items-center"><AgentIcon agentType={s.agent_type} /></span>
          <span className="truncate text-sm text-white">{title}</span>
          <span className={`shrink-0 text-[10px] ${presentation.textClass}`}>
            {s.current_status}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-500">
          {s.machine_hostname && <span>{s.machine_hostname}</span>}
          {s.workspace_cwd && (
            <span className="truncate">· {s.workspace_cwd}</span>
          )}
        </div>
      </div>
      <span
        className="shrink-0 whitespace-nowrap text-[10px] text-gray-500"
        title={(s.current_run_started_at || s.started_at) ?? undefined}
      >
        {clockTime(s.current_run_started_at || s.started_at)} · {timeAgo(s.current_run_started_at || s.started_at)}
      </span>
    </Link>
  );
}

function EventRow({ event }: { event: SessionEvent }) {
  const status = statusForEvent(event.event_type);
  const presentation = getStatusPresentation(status, event.event_time);
  const title =
    event.session_name || event.summary || eventLabel(event.event_type);

  return (
    <Link
      to={`/sessions/${event.session_id}`}
      className="flex items-center gap-3 border-b border-surface-3/50 px-4 py-3 hover:bg-surface-2/50 transition-colors"
    >
      <span className="relative flex shrink-0">
        <span className={`h-2 w-2 rounded-full ${presentation.dotClass}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {event.workspace_project_name && (
            <span className="shrink-0 text-sm font-bold text-white">
              {event.workspace_project_name}
            </span>
          )}
          <span className="shrink-0 flex items-center"><AgentIcon agentType={event.agent_type} /></span>
          <span className="truncate text-sm text-white">{title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-500">
          {event.machine_hostname && <span>{event.machine_hostname}</span>}
          {event.workspace_cwd && (
            <span className="truncate">· {event.workspace_cwd}</span>
          )}
        </div>
      </div>
      <span
        className="shrink-0 whitespace-nowrap text-[10px] text-gray-500"
        title={event.event_time ?? undefined}
      >
        {clockTime(event.event_time)} · {timeAgo(event.event_time)}
      </span>
    </Link>
  );
}

export default function MessagesPage({
  config,
}: {
  config: DashboardConnectionConfig;
}) {
  const { events: rawEvents, loading: eventsLoading, error: eventsError, refresh: refreshEvents } = useRecentEvents(config, 3000, 200);
  const { sessions: liveSessions, loading: liveLoading, error: liveError, refresh: refreshLive } = useLiveSessions(config, 3000);

  const loading = eventsLoading && liveLoading;
  const error = eventsError || liveError;
  const refresh = () => { refreshEvents(); refreshLive(); };

  const LIVE_STATUSES = new Set(["starting", "running", "tool_running", "command_running", "waiting_user", "waiting_external"]);

  const items = useMemo(() => {
    const liveSessionIds = new Set(
      liveSessions.filter((s) => LIVE_STATUSES.has(s.current_status)).map((s) => s.session_id),
    );

    const liveItems: MessageItem[] = liveSessions
      .filter((s) => LIVE_STATUSES.has(s.current_status))
      .map((s) => ({
        key: `live-${s.session_id}`,
        sessionId: s.session_id,
        sortTime: s.current_run_started_at || s.started_at,
        kind: "live" as const,
        session: s,
      }));

    const seen = new Set<string>();
    const eventItems: MessageItem[] = rawEvents
      .filter((e) => {
        if (liveSessionIds.has(e.session_id)) return false;
        if (seen.has(e.session_id)) return false;
        seen.add(e.session_id);
        return true;
      })
      .map((e) => ({
        key: e.event_id,
        sessionId: e.session_id,
        sortTime: e.event_time,
        kind: "event" as const,
        event: e,
      }));

    return [...liveItems, ...eventItems].sort((a, b) => {
      const ta = a.sortTime ? parseUTC(a.sortTime) : 0;
      const tb = b.sortTime ? parseUTC(b.sortTime) : 0;
      return tb - ta;
    });
  }, [rawEvents, liveSessions]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-surface-3 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-white tracking-tight">
            Runlight
          </h1>
          <span className="text-[10px] text-gray-600 uppercase">Messages</span>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
        >
          Refresh
        </button>
      </header>

      <main className="flex-1">
        {error ? (
          <div className="m-4 p-4 text-accent-red bg-surface-2 rounded">
            Server unreachable: {error}
          </div>
        ) : loading && items.length === 0 ? (
          <div className="p-4 text-gray-500 animate-pulse">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No sessions yet. Start an agent to see it here.
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <MessageRow key={item.key} item={item} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-surface-3 px-4 py-1.5 text-[10px] text-gray-600 flex justify-between">
        <span>{items.length} session(s)</span>
        <span>Runlight v0.1.0</span>
      </footer>
    </div>
  );
}
