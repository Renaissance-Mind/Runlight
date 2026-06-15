import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "../types/session";
import {
  groupSessionsByDeviceAndProject,
  mergeProjectOrder,
  moveProjectInOrder,
} from "../api/viewModels";
import StatusBadge from "./StatusBadge";
import AgentIcon from "./AgentIcon";

const DEVICE_ORDER_STORAGE_KEY = "runlight.dashboard.device-order.v1";
const COLLAPSED_DEVICES_STORAGE_KEY =
  "runlight.dashboard.collapsed-devices.v1";
const PROJECT_ORDER_STORAGE_KEY = "runlight.dashboard.project-order.v1";
const COLLAPSED_DEVICE_PROJECTS_STORAGE_KEY =
  "runlight.dashboard.collapsed-device-projects.v1";

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

function deviceProjectKey(deviceKey: string, projectName: string): string {
  return JSON.stringify([deviceKey, projectName]);
}

interface Props {
  sessions: Session[];
  loading: boolean;
  error: string | null;
}

export default function SessionsTable({ sessions, loading, error }: Props) {
  const deviceGroups = useMemo(
    () => groupSessionsByDeviceAndProject(sessions),
    [sessions],
  );
  const deviceKeys = useMemo(
    () => deviceGroups.map((group) => group.deviceKey),
    [deviceGroups],
  );
  const projectNames = useMemo(
    () => deviceGroups.flatMap((group) =>
      group.projectGroups.map((projectGroup) => projectGroup.projectName),
    ),
    [deviceGroups],
  );
  const [deviceOrder, setDeviceOrder] = useState(() =>
    readStoredStringList(DEVICE_ORDER_STORAGE_KEY),
  );
  const [collapsedDevices, setCollapsedDevices] = useState(() =>
    readStoredStringList(COLLAPSED_DEVICES_STORAGE_KEY),
  );
  const [projectOrder, setProjectOrder] = useState(() =>
    readStoredStringList(PROJECT_ORDER_STORAGE_KEY),
  );
  const [collapsedProjects, setCollapsedProjects] = useState(() =>
    readStoredStringList(COLLAPSED_DEVICE_PROJECTS_STORAGE_KEY),
  );

  useEffect(() => {
    if (deviceKeys.length === 0) return;
    setDeviceOrder((previousOrder) => {
      const nextOrder = mergeProjectOrder(deviceKeys, previousOrder);
      if (nextOrder.join("\u0000") === previousOrder.join("\u0000")) {
        return previousOrder;
      }
      writeStoredStringList(DEVICE_ORDER_STORAGE_KEY, nextOrder);
      return nextOrder;
    });
  }, [deviceKeys]);

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

  const orderedDeviceKeys = useMemo(
    () => mergeProjectOrder(deviceKeys, deviceOrder),
    [deviceKeys, deviceOrder],
  );
  const groupsByDevice = useMemo(
    () => new Map(deviceGroups.map((group) => [group.deviceKey, group])),
    [deviceGroups],
  );
  const orderedDeviceGroups = orderedDeviceKeys
    .map((key) => groupsByDevice.get(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const collapsedDeviceSet = useMemo(
    () => new Set(collapsedDevices),
    [collapsedDevices],
  );
  const collapsedProjectSet = useMemo(
    () => new Set(collapsedProjects),
    [collapsedProjects],
  );
  const columnCount = 9;

  const toggleDevice = (deviceKey: string) => {
    setCollapsedDevices((previousDevices) => {
      const nextDevices = new Set(previousDevices);
      if (nextDevices.has(deviceKey)) {
        nextDevices.delete(deviceKey);
      } else {
        nextDevices.add(deviceKey);
      }
      const nextList = Array.from(nextDevices);
      writeStoredStringList(COLLAPSED_DEVICES_STORAGE_KEY, nextList);
      return nextList;
    });
  };

  const moveDevice = (deviceKey: string, direction: "up" | "down") => {
    setDeviceOrder((previousOrder) => {
      const currentOrder = mergeProjectOrder(deviceKeys, previousOrder);
      const nextOrder = moveProjectInOrder(currentOrder, deviceKey, direction);
      writeStoredStringList(DEVICE_ORDER_STORAGE_KEY, nextOrder);
      return nextOrder;
    });
  };

  const toggleProject = (deviceKey: string, projectName: string) => {
    const key = deviceProjectKey(deviceKey, projectName);
    setCollapsedProjects((previousProjects) => {
      const nextProjects = new Set(previousProjects);
      if (nextProjects.has(key)) {
        nextProjects.delete(key);
      } else {
        nextProjects.add(key);
      }
      const nextList = Array.from(nextProjects);
      writeStoredStringList(COLLAPSED_DEVICE_PROJECTS_STORAGE_KEY, nextList);
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

  const renderSessionRow = (s: Session) => (
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
        <span className={s.session_pin ? "text-accent-yellow" : "text-gray-600"}>
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
  );

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
            <th className="px-3 py-2">Branch</th>
            <th className="px-3 py-2">Event</th>
            <th className="px-3 py-2 text-right">HB</th>
            <th className="px-3 py-2 text-right">Dur</th>
          </tr>
        </thead>
        {orderedDeviceGroups.map((group, index) => {
          const isCollapsed = collapsedDeviceSet.has(group.deviceKey);
          const isFirst = index === 0;
          const isLast = index === orderedDeviceGroups.length - 1;
          const deviceProjectNames = group.projectGroups.map(
            (projectGroup) => projectGroup.projectName,
          );
          const projectGroupsByName = new Map(
            group.projectGroups.map((projectGroup) => [
              projectGroup.projectName,
              projectGroup,
            ]),
          );
          const orderedProjectGroups = mergeProjectOrder(
            deviceProjectNames,
            projectOrder,
          )
            .map((projectName) => projectGroupsByName.get(projectName))
            .filter((projectGroup): projectGroup is NonNullable<typeof projectGroup> =>
              Boolean(projectGroup),
            );

          return (
            <tbody key={group.deviceKey}>
              <tr className="border-b border-surface-3/70 bg-surface-2/60">
                <td colSpan={columnCount} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDevice(group.deviceKey)}
                        className="h-5 w-5 text-gray-500 hover:text-white"
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.deviceName}`}
                        aria-expanded={!isCollapsed}
                        title={isCollapsed ? "Expand" : "Collapse"}
                      >
                        {isCollapsed ? ">" : "v"}
                      </button>
                      <span className="truncate text-xs font-semibold text-gray-400">
                        {group.deviceName}
                      </span>
                      {group.deviceMeta && (
                        <span className="hidden shrink-0 text-[10px] text-gray-600 sm:inline">
                          {group.deviceMeta}
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-gray-600">
                        {group.sessions.length} session(s)
                      </span>
                      <span className="hidden shrink-0 text-[10px] text-gray-600 sm:inline">
                        {group.projectGroups.length} project(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveDevice(group.deviceKey, "up")}
                        disabled={isFirst}
                        aria-label={`Move ${group.deviceName} up`}
                        title="Move up"
                        className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-white disabled:cursor-not-allowed disabled:text-gray-700"
                      >
                        ^
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDevice(group.deviceKey, "down")}
                        disabled={isLast}
                        aria-label={`Move ${group.deviceName} down`}
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
                orderedProjectGroups.map((projectGroup, projectIndex) => {
                  const projectKey = deviceProjectKey(
                    group.deviceKey,
                    projectGroup.projectName,
                  );
                  const projectCollapsed = collapsedProjectSet.has(projectKey);
                  const projectIsFirst = projectIndex === 0;
                  const projectIsLast =
                    projectIndex === orderedProjectGroups.length - 1;

                  return (
                    <Fragment key={projectKey}>
                      <tr
                        key={projectKey}
                        className="border-b border-surface-3/60 bg-surface-2/30"
                      >
                        <td colSpan={columnCount} className="px-3 py-1.5">
                          <div className="flex items-center justify-between gap-3 pl-7">
                            <div className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleProject(group.deviceKey, projectGroup.projectName)
                                }
                                className="h-5 w-5 text-gray-500 hover:text-white"
                                aria-label={`${projectCollapsed ? "Expand" : "Collapse"} ${projectGroup.projectName}`}
                                aria-expanded={!projectCollapsed}
                                title={projectCollapsed ? "Expand" : "Collapse"}
                              >
                                {projectCollapsed ? ">" : "v"}
                              </button>
                              <span className="truncate text-sm font-semibold text-black">
                                {projectGroup.projectName}
                              </span>
                              <span className="shrink-0 text-[10px] text-gray-600">
                                {projectGroup.sessions.length} session(s)
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveProject(projectGroup.projectName, "up")}
                                disabled={projectIsFirst}
                                aria-label={`Move ${projectGroup.projectName} up`}
                                title="Move up"
                                className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-white disabled:cursor-not-allowed disabled:text-gray-700"
                              >
                                ^
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  moveProject(projectGroup.projectName, "down")
                                }
                                disabled={projectIsLast}
                                aria-label={`Move ${projectGroup.projectName} down`}
                                title="Move down"
                                className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-white disabled:cursor-not-allowed disabled:text-gray-700"
                              >
                                v
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {!projectCollapsed &&
                        projectGroup.sessions.map(renderSessionRow)}
                    </Fragment>
                  );
                })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
