import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "../types/session";
import {
  groupSessionsByProject,
  mergeProjectOrder,
  moveProjectInOrder,
} from "../api/viewModels";
import StatusBadge from "./StatusBadge";
import AgentIcon from "./AgentIcon";

const PROJECT_ORDER_STORAGE_KEY = "runlight.dashboard.project-order.v1";
const COLLAPSED_PROJECTS_STORAGE_KEY =
  "runlight.dashboard.collapsed-projects.v1";

function parseUTC(isoStr: string): number {
  return new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z").getTime();
}

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "-";
  const ms = Date.now() - parseUTC(isoStr);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function lastUpdate(isoStr: string | null): string {
  if (!isoStr) return "-";
  const ms = Date.now() - parseUTC(isoStr);
  const sec = Math.floor(ms / 1000);
  const threeDays = 3 * 24 * 60 * 60;
  if (sec < 60) return `${sec}s`;
  if (sec < threeDays) {
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  }
  const d = new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function duration(startedAt: string | null, lastEventAt: string | null): string {
  if (!startedAt) return "-";
  const end = lastEventAt ? parseUTC(lastEventAt) : Date.now();
  const ms = end - parseUTC(startedAt);
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

function readStoredStringList(key: string): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStoredStringList(key: string, values: string[]) {
  window.localStorage.setItem(key, JSON.stringify(values));
}

interface Props {
  sessions: Session[];
  loading: boolean;
  error: string | null;
}

export default function SessionsTable({ sessions, loading, error }: Props) {
  const projectGroups = useMemo(
    () => groupSessionsByProject(sessions),
    [sessions],
  );
  const projectNames = useMemo(
    () => projectGroups.map((group) => group.projectName),
    [projectGroups],
  );
  const [projectOrder, setProjectOrder] = useState(() =>
    readStoredStringList(PROJECT_ORDER_STORAGE_KEY),
  );
  const [collapsedProjects, setCollapsedProjects] = useState(() =>
    readStoredStringList(COLLAPSED_PROJECTS_STORAGE_KEY),
  );

  useEffect(() => {
    if (projectNames.length === 0) return;
    setProjectOrder((previousOrder) => {
      const nextOrder = mergeProjectOrder(projectNames, previousOrder);
      if (nextOrder.join("\u0000") === previousOrder.join("\u0000")) {
        return previousOrder;
      }
      writeStoredStringList(PROJECT_ORDER_STORAGE_KEY, nextOrder);
      return nextOrder;
    });
  }, [projectNames]);

  const orderedProjectNames = useMemo(
    () => mergeProjectOrder(projectNames, projectOrder),
    [projectNames, projectOrder],
  );
  const groupsByProject = useMemo(
    () => new Map(projectGroups.map((group) => [group.projectName, group])),
    [projectGroups],
  );
  const orderedProjectGroups = orderedProjectNames
    .map((name) => groupsByProject.get(name))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const collapsedProjectSet = useMemo(
    () => new Set(collapsedProjects),
    [collapsedProjects],
  );
  const columnCount = 11;

  const toggleProject = (projectName: string) => {
    setCollapsedProjects((previousProjects) => {
      const nextProjects = new Set(previousProjects);
      if (nextProjects.has(projectName)) {
        nextProjects.delete(projectName);
      } else {
        nextProjects.add(projectName);
      }
      const nextList = Array.from(nextProjects);
      writeStoredStringList(COLLAPSED_PROJECTS_STORAGE_KEY, nextList);
      return nextList;
    });
  };

  const moveProject = (projectName: string, direction: "up" | "down") => {
    setProjectOrder((previousOrder) => {
      const currentOrder = mergeProjectOrder(projectNames, previousOrder);
      const nextOrder = moveProjectInOrder(currentOrder, projectName, direction);
      writeStoredStringList(PROJECT_ORDER_STORAGE_KEY, nextOrder);
      return nextOrder;
    });
  };

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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="text-gray-500 border-b border-surface-3 text-left">
            <th className="w-12 px-3 py-2 text-center">Status</th>
            <th className="whitespace-nowrap px-3 py-2 text-right">Updated</th>
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
        {orderedProjectGroups.map((group, index) => {
          const isCollapsed = collapsedProjectSet.has(group.projectName);
          const isFirst = index === 0;
          const isLast = index === orderedProjectGroups.length - 1;

          return (
            <tbody key={group.projectName}>
              <tr className="border-b border-surface-3/70 bg-surface-2/60">
                <td colSpan={columnCount} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleProject(group.projectName)}
                        className="h-5 w-5 text-gray-500 hover:text-white"
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.projectName}`}
                        aria-expanded={!isCollapsed}
                        title={isCollapsed ? "Expand" : "Collapse"}
                      >
                        {isCollapsed ? ">" : "v"}
                      </button>
                      <span className="truncate text-xs font-semibold text-gray-400">
                        {group.projectName}
                      </span>
                      <span className="shrink-0 text-[10px] text-gray-600">
                        {group.sessions.length} session(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveProject(group.projectName, "up")}
                        disabled={isFirst}
                        aria-label={`Move ${group.projectName} up`}
                        title="Move up"
                        className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-white disabled:cursor-not-allowed disabled:text-gray-700"
                      >
                        ^
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProject(group.projectName, "down")}
                        disabled={isLast}
                        aria-label={`Move ${group.projectName} down`}
                        title="Move down"
                        className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-white disabled:cursor-not-allowed disabled:text-gray-700"
                      >
                        v
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
              {!isCollapsed &&
                group.sessions.map((s) => (
                  <tr
                    key={s.session_id}
                    className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors"
                  >
                    <td className="px-3 py-2 text-center">
                      <StatusBadge
                        status={s.current_status}
                        lastEventAt={s.last_event_at}
                        showLabel={false}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-400">
                      {lastUpdate(s.last_event_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          s.session_pin ? "text-accent-yellow" : "text-gray-600"
                        }
                      >
                        {s.session_pin ? "Pinned" : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <AgentIcon agentType={s.agent_type} />
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
          );
        })}
      </table>
    </div>
  );
}
