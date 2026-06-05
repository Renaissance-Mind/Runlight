export interface SessionSurfaceInput {
  current_status: string;
  latest_event_type: string | null;
  session_name: string | null;
  summary: string | null;
  session_id: string;
}

export interface ProjectSessionInput {
  workspace_project_name: string | null;
  workspace_cwd: string | null;
}

export interface ProjectSessionGroup<T extends ProjectSessionInput> {
  projectName: string;
  sessions: T[];
}

export interface SessionSurfaceCounts {
  running: number;
  finished: number;
  stale: number;
  failed: number;
  waiting: number;
}

export interface LatestSessionSurface {
  sessionId: string;
  label: string;
  eventType: string | null;
  status: string;
}

export interface SessionSurfaceSummary {
  counts: SessionSurfaceCounts;
  latest: LatestSessionSurface | null;
}

export function getSessionSurfaceLabel(session: SessionSurfaceInput): string {
  return session.session_name || session.summary || session.session_id;
}

export function getSessionProjectName(session: ProjectSessionInput): string {
  const explicitName = session.workspace_project_name?.trim();
  if (explicitName && explicitName !== "." && explicitName !== "/") {
    return explicitName;
  }

  const cwd = session.workspace_cwd?.trim();
  if (!cwd) return "Unknown project";

  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] || "Unknown project";
}

export function groupSessionsByProject<T extends ProjectSessionInput>(
  sessions: T[],
): ProjectSessionGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const session of sessions) {
    const projectName = getSessionProjectName(session);
    const group = groups.get(projectName);
    if (group) {
      group.push(session);
    } else {
      groups.set(projectName, [session]);
    }
  }

  return Array.from(groups, ([projectName, groupSessions]) => ({
    projectName,
    sessions: groupSessions,
  }));
}

export function mergeProjectOrder(
  projectNames: string[],
  savedOrder: string[],
): string[] {
  const uniqueProjectNames = Array.from(new Set(projectNames));
  const currentProjects = new Set(uniqueProjectNames);
  const merged = savedOrder.filter((name) => currentProjects.has(name));
  const seen = new Set(merged);

  for (const name of uniqueProjectNames) {
    if (!seen.has(name)) {
      merged.push(name);
      seen.add(name);
    }
  }

  return merged;
}

export function moveProjectInOrder(
  projectOrder: string[],
  projectName: string,
  direction: "up" | "down",
): string[] {
  const index = projectOrder.indexOf(projectName);
  if (index === -1) return projectOrder;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= projectOrder.length) {
    return projectOrder;
  }

  const nextOrder = [...projectOrder];
  [nextOrder[index], nextOrder[targetIndex]] = [
    nextOrder[targetIndex],
    nextOrder[index],
  ];
  return nextOrder;
}

export function summarizeSessionsForSurface(
  sessions: SessionSurfaceInput[],
): SessionSurfaceSummary {
  const counts: SessionSurfaceCounts = {
    running: 0,
    finished: 0,
    stale: 0,
    failed: 0,
    waiting: 0,
  };

  for (const session of sessions) {
    switch (session.current_status) {
      case "running":
      case "tool_running":
      case "command_running":
      case "starting":
        counts.running++;
        break;
      case "finished":
        counts.finished++;
        break;
      case "stale":
        counts.stale++;
        break;
      case "failed":
      case "aborted":
        counts.failed++;
        break;
      case "waiting_user":
      case "waiting_external":
        counts.waiting++;
        break;
    }
  }

  const latestSession = sessions[0] ?? null;
  return {
    counts,
    latest: latestSession
      ? {
          sessionId: latestSession.session_id,
          label: getSessionSurfaceLabel(latestSession),
          eventType: latestSession.latest_event_type,
          status: latestSession.current_status,
        }
      : null,
  };
}
