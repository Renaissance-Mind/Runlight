export const TERMINAL_EVENT_TYPES = new Set([
  "session.completed",
  "session.failed",
  "session.aborted",
]);

export const RUNNING_STATUSES = new Set([
  "starting",
  "running",
  "tool_running",
  "command_running",
  "waiting_user",
  "waiting_external",
]);

export function isRunStartEvent(eventType: string | null | undefined): boolean {
  return eventType === "message.started";
}

export function isRunFinishEvent(eventType: string | null | undefined): boolean {
  return Boolean(eventType === "message.finished" || (eventType && TERMINAL_EVENT_TYPES.has(eventType)));
}

export function isRunningStatus(status: string | null | undefined): boolean {
  return Boolean(status && RUNNING_STATUSES.has(status));
}

export function nextActiveRunStartedAt(
  latestEventType: string,
  eventTime: string,
  currentValue: string | null = null,
): string | null {
  if (isRunStartEvent(latestEventType)) return eventTime;
  if (isRunFinishEvent(latestEventType)) return null;
  return currentValue;
}

export function nextCurrentRunStartedAt(
  nextStatus: string,
  previousStatus: string | null | undefined,
  eventTime: string,
  currentValue: string | null = null,
  latestEventType: string | null = null,
): string | null {
  if (isRunStartEvent(latestEventType)) return eventTime;
  if (isRunningStatus(nextStatus) && !isRunningStatus(previousStatus)) {
    return eventTime;
  }
  return currentValue;
}

export function nextTerminalResult(latestEventType: string): string | null {
  if (latestEventType === "session.completed") return "completed";
  if (latestEventType === "session.failed") return "failed";
  if (latestEventType === "session.aborted") return "aborted";
  return null;
}

function parseUTC(iso: string): number {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
}

export function inferStatus(
  latestEventType: string | null,
  lastHeartbeatAt: string | null,
  terminalResult: string | null,
  lastEventAt: string | null,
  heartbeatStaleSeconds: number,
  activeRunStartedAt: string | null = null,
): string {
  if (terminalResult) return terminalResult;

  if (latestEventType && TERMINAL_EVENT_TYPES.has(latestEventType)) {
    if (latestEventType === "session.completed") return "completed";
    if (latestEventType === "session.failed") return "failed";
    if (latestEventType === "session.aborted") return "aborted";
  }

  if (latestEventType === "user_input.waiting") return "waiting_user";
  if (latestEventType === "external.waiting") return "waiting_external";
  if (latestEventType === "permission.requested") return "waiting_user";
  if (latestEventType === "message.finished") return "finished";

  if (activeRunStartedAt && !lastHeartbeatAt) {
    if (latestEventType === "command.started") return "command_running";
    if (latestEventType === "tool.started") return "tool_running";
    return "running";
  }

  const staleRef = lastHeartbeatAt || lastEventAt;
  if (staleRef) {
    const age = (Date.now() - parseUTC(staleRef)) / 1000;
    if (age > heartbeatStaleSeconds) {
      // "stale" means an agent stopped responding mid-flight. With heartbeats
      // a gap proves that; without them, infer from the last event: a started
      // action that never completed looks stuck (stale), while a completed
      // action means the turn ended cleanly and the session is idle (finished).
      if (lastHeartbeatAt || (latestEventType && latestEventType.endsWith(".started"))) {
        return "stale";
      }
      return "finished";
    }
  }

  if (latestEventType === "session.started" && !lastHeartbeatAt) {
    return "starting";
  }

  if (latestEventType && latestEventType !== "session.started") {
    return "running";
  }

  if (lastHeartbeatAt) return "running";

  return "starting";
}
