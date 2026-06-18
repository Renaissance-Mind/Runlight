import { useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import type { Session, SessionEvent } from "../types/session";
import type { DashboardConnectionConfig } from "../api/config";
import type { DashboardPreferences } from "../api/preferences";
import { useLiveSessions, useRecentEvents } from "../hooks/useSessions";
import { getStatusPresentation } from "../api/statusPresentation";
import {
  distributeMessageDeviceGroups,
  formatCompactRelativeTime,
  groupMessageItemsByDevice,
} from "../api/viewModels";
import AgentIcon from "./AgentIcon";

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
  machine_hostname: string | null;
  machine_os: string | null;
  machine_user: string | null;
  machine_id: string | null;
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
  const timeRef = s.current_run_started_at || s.started_at;

  return (
    <Link
      to={`/sessions/${s.session_id}`}
      className="flex items-center gap-3 border-b border-surface-3/50 px-3 py-2 hover:bg-surface-2/50 transition-colors"
    >
      <span className="relative flex shrink-0 items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${presentation.dotClass}`} />
        <span
          className={`min-w-7 text-xs font-semibold tabular-nums ${presentation.textClass}`}
          title={timeRef ?? undefined}
        >
          {formatCompactRelativeTime(timeRef)}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        <AgentIcon agentType={s.agent_type} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {s.workspace_project_name && (
            <span className="shrink-0 text-sm font-bold text-white">
              {s.workspace_project_name}
            </span>
          )}
          <span className="truncate text-sm text-white">{title}</span>
        </div>
      </div>
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
      className="flex items-center gap-3 border-b border-surface-3/50 px-3 py-2 hover:bg-surface-2/50 transition-colors"
    >
      <span className="relative flex shrink-0 items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${presentation.dotClass}`} />
        <span
          className={`min-w-7 text-xs font-semibold tabular-nums ${presentation.textClass}`}
          title={event.event_time ?? undefined}
        >
          {formatCompactRelativeTime(event.event_time)}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        <AgentIcon agentType={event.agent_type} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {event.workspace_project_name && (
            <span className="shrink-0 text-sm font-bold text-white">
              {event.workspace_project_name}
            </span>
          )}
          <span className="truncate text-sm text-white">{title}</span>
        </div>
      </div>
    </Link>
  );
}

export default function MessagesPage({
  config,
  prefs,
  onRefreshActionChange,
}: {
  config: DashboardConnectionConfig;
  prefs: DashboardPreferences;
  onRefreshActionChange: (action: { label: string; onClick: () => void } | null) => void;
}) {
  const { events: rawEvents, loading: eventsLoading, error: eventsError, refresh: refreshEvents } = useRecentEvents(config, 3000, 200);
  const { sessions: liveSessions, loading: liveLoading, error: liveError, refresh: refreshLive } = useLiveSessions(config, 3000);

  const loading = eventsLoading && liveLoading;
  const error = eventsError || liveError;
  const refresh = useCallback(() => {
    refreshEvents();
    refreshLive();
  }, [refreshEvents, refreshLive]);

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
        machine_hostname: s.machine_hostname,
        machine_os: s.machine_os,
        machine_user: s.machine_user,
        machine_id: s.machine_id,
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
        machine_hostname: e.machine_hostname,
        machine_os: null,
        machine_user: null,
        machine_id: null,
        kind: "event" as const,
        event: e,
      }));

    return [...liveItems, ...eventItems];
  }, [rawEvents, liveSessions]);

  const messageGroups = useMemo(
    () => groupMessageItemsByDevice(items),
    [items],
  );
  const messageColumns = useMemo(
    () => distributeMessageDeviceGroups(messageGroups, prefs.messageMaxColumns),
    [messageGroups, prefs.messageMaxColumns],
  );

  useEffect(() => {
    onRefreshActionChange({ label: "Refresh", onClick: refresh });
    return () => onRefreshActionChange(null);
  }, [onRefreshActionChange, refresh]);

  return (
    <div className="min-h-screen flex flex-col">
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
          <div className="overflow-x-auto px-4 py-4">
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${messageColumns.length}, minmax(18rem, 1fr))`,
              }}
            >
              {messageColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="min-w-0 space-y-3">
                  {column.groups.map((group) => (
                    <section
                      key={group.deviceKey}
                      className="min-w-0 overflow-hidden rounded border border-surface-3 bg-surface-1"
                    >
                      <div className="flex items-center gap-2 border-b border-surface-3/70 bg-surface-2/60 px-3 py-2">
                        <span className="truncate text-xs font-semibold text-gray-400">
                          {group.deviceName}
                        </span>
                        {group.deviceMeta && (
                          <span className="hidden shrink-0 text-[10px] text-gray-600 lg:inline">
                            {group.deviceMeta}
                          </span>
                        )}
                        <span className="shrink-0 text-[10px] text-gray-600">
                          {group.items.length}
                        </span>
                      </div>
                      {group.items.map((item) => (
                        <MessageRow key={item.key} item={item} />
                      ))}
                    </section>
                  ))}
                </div>
              ))}
            </div>
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
