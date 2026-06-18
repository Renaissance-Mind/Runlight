export type StatusTone =
  | "running"
  | "recent_finished"
  | "finished"
  | "stale"
  | "failed"
  | "waiting"
  | "unknown";

export interface StatusPresentation {
  tone: StatusTone;
  label: string;
  dotClass: string;
  textClass: string;
  pulse?: boolean;
}

export interface StatusPresentationInput {
  current_status: string;
  last_event_at: string | null;
}

export type StatusPresentationCounts = Record<StatusTone, number>;

const RECENT_FINISHED_WINDOW_MS = 30 * 60 * 1000;

const STATUS_PRESENTATIONS: Record<StatusTone, StatusPresentation> = {
  running: {
    tone: "running",
    label: "Running",
    dotClass: "bg-accent-blue",
    textClass: "text-accent-blue",
    pulse: true,
  },
  recent_finished: {
    tone: "recent_finished",
    label: "Finished <30m",
    dotClass: "bg-accent-green",
    textClass: "text-accent-green",
  },
  finished: {
    tone: "finished",
    label: "Finished",
    dotClass: "bg-accent-light-green",
    textClass: "text-accent-light-green",
  },
  stale: {
    tone: "stale",
    label: "Stale",
    dotClass: "bg-accent-orange",
    textClass: "text-accent-orange",
  },
  failed: {
    tone: "failed",
    label: "Failed",
    dotClass: "bg-accent-red",
    textClass: "text-accent-red",
  },
  waiting: {
    tone: "waiting",
    label: "Waiting",
    dotClass: "bg-accent-purple",
    textClass: "text-accent-purple",
    pulse: true,
  },
  unknown: {
    tone: "unknown",
    label: "Unknown",
    dotClass: "bg-gray-600",
    textClass: "text-gray-500",
  },
};

function parseUTC(isoStr: string): number {
  return new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z").getTime();
}

function isRecentFinished(lastEventAt: string | null, nowMs: number): boolean {
  if (!lastEventAt) return false;
  const eventMs = parseUTC(lastEventAt);
  if (!Number.isFinite(eventMs)) return false;
  const ageMs = nowMs - eventMs;
  return ageMs >= 0 && ageMs <= RECENT_FINISHED_WINDOW_MS;
}

export function getStatusTone(
  status: string,
  lastEventAt: string | null,
  nowMs = Date.now(),
): StatusTone {
  switch (status) {
    case "starting":
    case "running":
    case "tool_running":
    case "command_running":
      return "running";
    case "finished":
    case "completed":
      return isRecentFinished(lastEventAt, nowMs)
        ? "recent_finished"
        : "finished";
    case "stale":
      return "stale";
    case "failed":
    case "aborted":
      return "failed";
    case "waiting_user":
    case "waiting_external":
      return "waiting";
    default:
      return "unknown";
  }
}

export function getStatusPresentationForTone(
  tone: StatusTone,
): StatusPresentation {
  return STATUS_PRESENTATIONS[tone];
}

export function getStatusPresentation(
  status: string,
  lastEventAt: string | null,
  nowMs = Date.now(),
): StatusPresentation {
  return getStatusPresentationForTone(getStatusTone(status, lastEventAt, nowMs));
}

export function summarizeStatusPresentationCounts(
  sessions: StatusPresentationInput[],
  nowMs = Date.now(),
): StatusPresentationCounts {
  const counts: StatusPresentationCounts = {
    running: 0,
    recent_finished: 0,
    finished: 0,
    stale: 0,
    failed: 0,
    waiting: 0,
    unknown: 0,
  };

  for (const session of sessions) {
    counts[getStatusTone(session.current_status, session.last_event_at, nowMs)]++;
  }

  return counts;
}
