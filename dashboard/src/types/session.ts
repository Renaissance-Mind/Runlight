export interface Session {
  session_id: string;
  user_id: string;
  agent_type: string;
  adapter_name: string;
  adapter_version: string | null;
  summary: string | null;
  summary_inferred: boolean;
  machine_hostname: string | null;
  machine_os: string | null;
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
}

export interface SessionEvent {
  event_id: string;
  session_id: string;
  event_type: string;
  event_time: string | null;
  received_time: string | null;
  severity: string;
  summary: string | null;
  machine_hostname: string | null;
  workspace_cwd: string | null;
  payload: Record<string, unknown> | null;
}

export type SessionStatus =
  | "starting"
  | "running"
  | "tool_running"
  | "command_running"
  | "waiting_user"
  | "waiting_external"
  | "stale"
  | "completed"
  | "failed"
  | "aborted";
