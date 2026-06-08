export interface Env {
  DB: D1Database;
  TOKEN_MAP?: string;
  HEARTBEAT_STALE_SECONDS?: string;
  CORS_ORIGINS?: string;
}

export interface SessionRow {
  id: number;
  session_id: string;
  session_name: string | null;
  session_pin: number;
  user_id: string;
  agent_type: string;
  adapter_name: string;
  adapter_version: string | null;
  summary: string | null;
  summary_inferred: number;
  machine_hostname: string | null;
  machine_os: string | null;
  machine_arch: string | null;
  machine_user: string | null;
  machine_id: string | null;
  workspace_cwd: string | null;
  workspace_repo_root: string | null;
  workspace_git_branch: string | null;
  workspace_git_commit: string | null;
  workspace_project_name: string | null;
  current_status: string;
  latest_event_type: string | null;
  started_at: string;
  last_event_at: string | null;
  last_heartbeat_at: string | null;
  event_count: number;
  terminal_result: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: number;
  event_id: string;
  session_id: string;
  session_name: string | null;
  session_pin: number;
  user_id: string;
  agent_type: string;
  adapter_name: string;
  adapter_version: string | null;
  event_type: string;
  event_time: string;
  received_time: string;
  sequence: number | null;
  severity: string;
  summary: string | null;
  machine_hostname: string | null;
  workspace_cwd: string | null;
  payload_json: string | null;
  dedupe_key: string | null;
  created_at: string;
}

export interface EventEnvelope {
  event_id?: string;
  session_id: string;
  session_name?: string | null;
  session_pin?: boolean;
  user_id?: string | null;
  agent_type: string;
  adapter_name: string;
  adapter_version?: string | null;
  event_type: string;
  event_time: string;
  received_time?: string | null;
  sequence?: number | null;
  severity?: string;
  summary?: string | null;
  machine?: {
    hostname?: string | null;
    os?: string | null;
    arch?: string | null;
    user?: string | null;
    machine_id?: string | null;
  } | null;
  workspace?: {
    cwd?: string | null;
    repo_root?: string | null;
    git_branch?: string | null;
    git_commit?: string | null;
    project_name?: string | null;
  } | null;
  payload?: Record<string, unknown> | null;
  dedupe_key?: string | null;
}

export interface EventBatch {
  events: EventEnvelope[];
}
