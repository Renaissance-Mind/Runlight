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

export interface DeviceSessionInput {
  machine_hostname: string | null;
  machine_os: string | null;
  machine_user?: string | null;
  machine_id?: string | null;
}

export interface DeviceSessionGroup<T extends DeviceSessionInput> {
  deviceKey: string;
  deviceName: string;
  deviceMeta: string | null;
  sessions: T[];
}

export interface DeviceProjectSessionGroup<
  T extends DeviceSessionInput & ProjectSessionInput,
> extends DeviceSessionGroup<T> {
  projectGroups: ProjectSessionGroup<T>[];
}

export interface MessageDeviceInput extends DeviceSessionInput {
  key: string;
  sortTime: string | null;
}

export interface MessageDeviceGroup<T extends MessageDeviceInput> {
  deviceKey: string;
  deviceName: string;
  deviceMeta: string | null;
  items: T[];
}

export interface MessageDeviceColumn<T extends MessageDeviceInput> {
  groups: MessageDeviceGroup<T>[];
  totalItems: number;
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

function cleanLabel(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function getSessionDeviceKey(session: DeviceSessionInput): string {
  const machineId = cleanLabel(session.machine_id);
  if (machineId) return `id:${machineId}`;

  const hostname = cleanLabel(session.machine_hostname);
  if (hostname) return `host:${hostname}`;

  return "unknown";
}

export function getSessionDeviceName(session: DeviceSessionInput): string {
  return (
    cleanLabel(session.machine_hostname) ||
    cleanLabel(session.machine_id) ||
    "Unknown device"
  );
}

export function getSessionDeviceMeta(session: DeviceSessionInput): string | null {
  const parts = [cleanLabel(session.machine_os), cleanLabel(session.machine_user)]
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" / ") : null;
}

export function groupSessionsByDevice<T extends DeviceSessionInput>(
  sessions: T[],
): DeviceSessionGroup<T>[] {
  const groups = new Map<string, DeviceSessionGroup<T>>();

  for (const session of sessions) {
    const deviceKey = getSessionDeviceKey(session);
    const group = groups.get(deviceKey);
    if (group) {
      group.sessions.push(session);
    } else {
      groups.set(deviceKey, {
        deviceKey,
        deviceName: getSessionDeviceName(session),
        deviceMeta: getSessionDeviceMeta(session),
        sessions: [session],
      });
    }
  }

  return Array.from(groups.values());
}

export function groupSessionsByDeviceAndProject<
  T extends DeviceSessionInput & ProjectSessionInput,
>(sessions: T[]): DeviceProjectSessionGroup<T>[] {
  return groupSessionsByDevice(sessions).map((deviceGroup) => ({
    ...deviceGroup,
    projectGroups: groupSessionsByProject(deviceGroup.sessions),
  }));
}

function sortTimeValue(value: string | null | undefined): number {
  if (!value) return 0;
  return new Date(value.endsWith("Z") ? value : `${value}Z`).getTime();
}

export function groupMessageItemsByDevice<T extends MessageDeviceInput>(
  items: T[],
): MessageDeviceGroup<T>[] {
  const canonicalByHostname = new Map<string, T>();
  for (const item of items) {
    const hostname = cleanLabel(item.machine_hostname);
    if (hostname && cleanLabel(item.machine_id) && !canonicalByHostname.has(hostname)) {
      canonicalByHostname.set(hostname, item);
    }
  }

  const groups = new Map<string, MessageDeviceGroup<T>>();
  for (const item of items) {
    const hostname = cleanLabel(item.machine_hostname);
    const identitySource =
      cleanLabel(item.machine_id) || !hostname
        ? item
        : canonicalByHostname.get(hostname) || item;
    const deviceKey = getSessionDeviceKey(identitySource);
    const group = groups.get(deviceKey);

    if (group) {
      group.items.push(item);
    } else {
      groups.set(deviceKey, {
        deviceKey,
        deviceName: getSessionDeviceName(identitySource),
        deviceMeta: getSessionDeviceMeta(identitySource),
        items: [item],
      });
    }
  }

  const orderedGroups = Array.from(groups.values());
  for (const group of orderedGroups) {
    group.items.sort(
      (a, b) => sortTimeValue(b.sortTime) - sortTimeValue(a.sortTime),
    );
  }

  return orderedGroups.sort((a, b) => {
    const aLatest = sortTimeValue(a.items[0]?.sortTime);
    const bLatest = sortTimeValue(b.items[0]?.sortTime);
    return bLatest - aLatest;
  });
}

export function distributeMessageDeviceGroups<T extends MessageDeviceInput>(
  groups: MessageDeviceGroup<T>[],
  maxColumns: number,
): MessageDeviceColumn<T>[] {
  const columnCount = Math.min(
    groups.length || 1,
    Math.max(1, Math.floor(maxColumns)),
  );
  const columns: MessageDeviceColumn<T>[] = Array.from(
    { length: columnCount },
    () => ({ groups: [], totalItems: 0 }),
  );

  for (const group of groups) {
    let target = columns[0];
    for (const column of columns.slice(1)) {
      if (column.totalItems < target.totalItems) {
        target = column;
      }
    }
    target.groups.push(group);
    target.totalItems += group.items.length;
  }

  return columns;
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
      case "completed":
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
