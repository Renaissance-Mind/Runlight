import type { ApprovalRequest } from "../types/session";
import AgentIcon from "./AgentIcon";

function compactTime(iso: string): string {
  const ms = Date.now() - new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

function toolDetail(approval: ApprovalRequest): string {
  const input = approval.tool_input || {};
  for (const key of ["command", "cmd", "script", "file_path", "filePath", "path"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().replace(/\s+/g, " ").slice(0, 180);
    }
  }
  return approval.summary || approval.tool_name || "Permission request";
}

function iconAgentType(agent: string): string {
  return agent === "claude" ? "claude_code" : agent;
}

export default function ApprovalPanel({
  approvals,
  error,
  resolvingIds,
  onDecision,
}: {
  approvals: ApprovalRequest[];
  error: string | null;
  resolvingIds: Set<string>;
  onDecision: (approvalId: string, decision: "allow" | "deny", options?: { remember?: boolean }) => void;
}) {
  if (approvals.length === 0 && !error) return null;

  return (
    <section className="mb-3 overflow-hidden rounded border border-accent-yellow/30 bg-surface-1">
      <div className="flex items-center justify-between border-b border-surface-3 bg-surface-2/70 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-accent-yellow">
          Approvals
        </h2>
        <span className="text-[10px] text-gray-500">
          {approvals.length} pending
        </span>
      </div>
      {error ? (
        <div className="px-3 py-2 text-xs text-accent-red">{error}</div>
      ) : null}
      <div className="divide-y divide-surface-3/70">
        {approvals.map((approval) => {
          const busy = resolvingIds.has(approval.id);
          return (
            <div key={approval.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="flex shrink-0 items-center">
                <AgentIcon agentType={iconAgentType(approval.agent)} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-semibold text-white">
                    {approval.session_name || approval.session_id}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-600">
                    {compactTime(approval.requested_at)}
                  </span>
                </div>
                <div className="truncate text-xs text-gray-400">
                  {approval.tool_name || "Tool"} - {toolDetail(approval)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecision(approval.id, "allow")}
                  className="rounded border border-accent-green/40 px-2 py-1 text-xs text-accent-green transition-colors hover:bg-accent-green/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Allow
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecision(approval.id, "allow", { remember: true })}
                  className="rounded border border-accent-blue/40 px-2 py-1 text-xs text-accent-blue transition-colors hover:bg-accent-blue/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Always
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecision(approval.id, "deny")}
                  className="rounded border border-accent-red/40 px-2 py-1 text-xs text-accent-red transition-colors hover:bg-accent-red/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Deny
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
