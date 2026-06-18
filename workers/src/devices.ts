const TERMINAL_STATUSES = new Set(["completed", "failed", "aborted"]);

export interface DeviceSessionRow {
  session_id: string;
  machine_hostname: string | null;
  machine_os: string | null;
  machine_arch: string | null;
  machine_user: string | null;
  machine_id: string | null;
  current_status: string;
  started_at: string | null;
  last_event_at: string | null;
  last_heartbeat_at: string | null;
}

export interface DeviceRecord {
  device_key: string;
  device_name: string;
  device_meta: string | null;
  machine_hostname: string | null;
  machine_os: string | null;
  machine_arch: string | null;
  machine_user: string | null;
  machine_id: string | null;
  first_seen_at: string | null;
  last_connected_at: string | null;
  last_event_at: string | null;
  last_heartbeat_at: string | null;
  latest_session_id: string | null;
  latest_session_status: string | null;
  open_session_count: number;
  session_count: number;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function timeValue(value: string | null | undefined): number {
  if (!value) return 0;
  return new Date(value.endsWith("Z") ? value : `${value}Z`).getTime();
}

function latestIso(...values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || timeValue(value) > timeValue(latest)) latest = value;
  }
  return latest;
}

function earliestIso(...values: Array<string | null | undefined>): string | null {
  let earliest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!earliest || timeValue(value) < timeValue(earliest)) earliest = value;
  }
  return earliest;
}

function deviceKey(row: DeviceSessionRow): string {
  const machineId = clean(row.machine_id);
  if (machineId) return `id:${machineId}`;
  const hostname = clean(row.machine_hostname);
  if (hostname) return `host:${hostname}`;
  return "unknown";
}

function deviceName(row: DeviceSessionRow): string {
  return clean(row.machine_hostname) || clean(row.machine_id) || "Unknown device";
}

function deviceMeta(row: DeviceSessionRow): string | null {
  const parts = [clean(row.machine_os), clean(row.machine_user)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" / ") : null;
}

function mergeIdentity(record: DeviceRecord, row: DeviceSessionRow): DeviceRecord {
  return {
    ...record,
    machine_hostname: clean(row.machine_hostname) || record.machine_hostname,
    machine_os: clean(row.machine_os) || record.machine_os,
    machine_arch: clean(row.machine_arch) || record.machine_arch,
    machine_user: clean(row.machine_user) || record.machine_user,
    machine_id: clean(row.machine_id) || record.machine_id,
    device_name: deviceName(row) === "Unknown device" ? record.device_name : deviceName(row),
    device_meta: deviceMeta(row) || record.device_meta,
  };
}

export function summarizeDeviceRows(rows: DeviceSessionRow[]): DeviceRecord[] {
  const devices = new Map<string, DeviceRecord>();

  for (const row of rows) {
    const key = deviceKey(row);
    const rowLastConnected = latestIso(row.last_heartbeat_at, row.last_event_at, row.started_at);
    const rowFirstSeen = earliestIso(row.started_at, row.last_event_at, row.last_heartbeat_at);
    const existing = devices.get(key);

    if (!existing) {
      devices.set(key, {
        device_key: key,
        device_name: deviceName(row),
        device_meta: deviceMeta(row),
        machine_hostname: clean(row.machine_hostname),
        machine_os: clean(row.machine_os),
        machine_arch: clean(row.machine_arch),
        machine_user: clean(row.machine_user),
        machine_id: clean(row.machine_id),
        first_seen_at: rowFirstSeen,
        last_connected_at: rowLastConnected,
        last_event_at: row.last_event_at,
        last_heartbeat_at: row.last_heartbeat_at,
        latest_session_id: row.session_id,
        latest_session_status: row.current_status,
        open_session_count: TERMINAL_STATUSES.has(row.current_status) ? 0 : 1,
        session_count: 1,
      });
      continue;
    }

    const nextLastConnected = latestIso(existing.last_connected_at, rowLastConnected);
    const rowIsLatest = rowLastConnected && nextLastConnected === rowLastConnected;
    const next = rowIsLatest ? mergeIdentity(existing, row) : existing;

    devices.set(key, {
      ...next,
      first_seen_at: earliestIso(next.first_seen_at, rowFirstSeen),
      last_connected_at: nextLastConnected,
      last_event_at: latestIso(next.last_event_at, row.last_event_at),
      last_heartbeat_at: latestIso(next.last_heartbeat_at, row.last_heartbeat_at),
      latest_session_id: rowIsLatest ? row.session_id : next.latest_session_id,
      latest_session_status: rowIsLatest ? row.current_status : next.latest_session_status,
      open_session_count: next.open_session_count + (TERMINAL_STATUSES.has(row.current_status) ? 0 : 1),
      session_count: next.session_count + 1,
    });
  }

  return Array.from(devices.values()).sort(
    (a, b) => timeValue(b.last_connected_at) - timeValue(a.last_connected_at),
  );
}
