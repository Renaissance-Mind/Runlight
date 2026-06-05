import { Link } from "react-router-dom";
import type { Session } from "../types/session";
import { groupSessionsByProject } from "../api/viewModels";
import StatusBadge from "./StatusBadge";

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "-";
  const ms = Date.now() - new Date(isoStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function duration(startedAt: string | null, lastEventAt: string | null): string {
  if (!startedAt) return "-";
  const end = lastEventAt ? new Date(lastEventAt).getTime() : Date.now();
  const ms = end - new Date(startedAt).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function shortPath(cwd: string | null): string {
  if (!cwd) return "-";
  const parts = cwd.split("/");
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : cwd;
}

interface Props {
  sessions: Session[];
  loading: boolean;
  error: string | null;
}

export default function SessionsTable({ sessions, loading, error }: Props) {
  if (error) {
    return (
      <div className="p-4 text-accent-red bg-surface-2 rounded">
        Server unreachable: {error}
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-gray-500 animate-pulse">Loading...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No active sessions. Start an agent to see it here.
      </div>
    );
  }

  const projectGroups = groupSessionsByProject(sessions);
  const columnCount = 10;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-surface-3 text-left">
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Pin</th>
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2">Session</th>
            <th className="px-3 py-2">Machine</th>
            <th className="px-3 py-2">Path</th>
            <th className="px-3 py-2">Branch</th>
            <th className="px-3 py-2">Event</th>
            <th className="px-3 py-2 text-right">HB</th>
            <th className="px-3 py-2 text-right">Dur</th>
          </tr>
        </thead>
        {projectGroups.map((group) => (
          <tbody key={group.projectName}>
            <tr className="border-b border-surface-3/70 bg-surface-2/60">
              <td colSpan={columnCount} className="px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase text-gray-400">
                    {group.projectName}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {group.sessions.length} session(s)
                  </span>
                </div>
              </td>
            </tr>
            {group.sessions.map((s) => (
              <tr
                key={s.session_id}
                className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors"
              >
                <td className="px-3 py-2">
                  <StatusBadge status={s.current_status} />
                </td>
                <td className="px-3 py-2">
                  <span className={s.session_pin ? "text-accent-yellow" : "text-gray-600"}>
                    {s.session_pin ? "Pinned" : "-"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="text-accent-blue">{s.agent_type}</span>
                </td>
                <td className="px-3 py-2 max-w-xs truncate">
                  <Link
                    to={`/sessions/${s.session_id}`}
                    className="hover:text-white transition-colors"
                  >
                    {s.session_name || s.summary || (
                      <span className="text-gray-500 italic">No summary</span>
                    )}
                    {s.summary_inferred && (
                      <span className="text-gray-600 ml-1">(inferred)</span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-400">
                  {s.machine_hostname || "-"}
                </td>
                <td className="px-3 py-2 text-gray-400">
                  {shortPath(s.workspace_cwd)}
                </td>
                <td className="px-3 py-2 text-accent-purple">
                  {s.workspace_git_branch || "-"}
                </td>
                <td className="px-3 py-2 text-gray-400">
                  {s.latest_event_type || "-"}
                </td>
                <td className="px-3 py-2 text-right text-gray-400">
                  {timeAgo(s.last_heartbeat_at)}
                </td>
                <td className="px-3 py-2 text-right text-gray-400">
                  {duration(s.started_at, s.last_event_at)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
