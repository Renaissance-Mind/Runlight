export interface Session {
  session_id: string;
  session_name: string | null;
  session_pin: boolean;
  user_id: string;
  agent_type: string;
  adapter_name: string;
  adapter_version: string | null;
  summary: string | null;
  summary_inferred: boolean;
  machine_hostname: string | null;
  machine_os: string | null;
  machine_arch: string | null;
  machine_user: string | null;
  machine_id: string | null;
  workspace_cwd: string | null;
  workspace_git_branch: string | null;
  workspace_project_name: string | null;
  current_status: string;
  latest_event_type: string | null;
  started_at: string | null;
  last_event_at: string | null;
  last_heartbeat_at: string | null;
  event_count: number;
  terminal_result: string | null;
  current_run_started_at: string | null;
  active_run_started_at: string | null;
}

export interface SessionEvent {
  event_id: string;
  session_id: string;
  session_name: string | null;
  session_pin: boolean;
  agent_type: string;
  event_type: string;
  event_time: string | null;
  received_time: string | null;
  severity: string;
  summary: string | null;
  machine_hostname: string | null;
  workspace_cwd: string | null;
  workspace_project_name: string | null;
  payload: Record<string, unknown> | null;
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

export interface ApprovalRequest {
  id: string;
  status: string;
  agent: string;
  session_id: string;
  session_name: string | null;
  tool_name: string;
  summary: string | null;
  requested_at: string;
  event_type: string;
  tool_input: Record<string, unknown>;
  workspace_cwd: string | null;
  machine_hostname: string | null;
}

export interface ApprovalResolution {
  id: string;
  status: string;
  decision: "allow" | "deny";
}

export type SessionStatus =
  | "starting"
  | "running"
  | "finished"
  | "tool_running"
  | "command_running"
  | "waiting_user"
  | "waiting_external"
  | "stale"
  | "completed"
  | "failed"
  | "aborted";
