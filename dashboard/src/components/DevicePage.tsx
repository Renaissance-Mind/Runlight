import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { DashboardConnectionConfig } from "../api/config";
import { formatCompactRelativeTime } from "../api/viewModels";
import { useDevices } from "../hooks/useSessions";
import type { DeviceRecord } from "../types/session";

function parseUTC(isoStr: string): number {
  return new Date(isoStr.endsWith("Z") ? isoStr : `${isoStr}Z`).getTime();
}

function absoluteTime(isoStr: string | null): string {
  if (!isoStr) return "-";
  return new Date(parseUTC(isoStr)).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function connectionDotClass(lastConnectedAt: string | null): string {
  if (!lastConnectedAt) return "bg-gray-600";
  const ageMs = Date.now() - parseUTC(lastConnectedAt);
  if (ageMs < 2 * 60 * 1000) return "bg-accent-green";
  if (ageMs < 30 * 60 * 1000) return "bg-accent-yellow";
  return "bg-gray-600";
}

function deviceSubtitle(device: DeviceRecord): string {
  const parts = [
    device.machine_os,
    device.machine_arch,
    device.machine_user,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" / ") : "-";
}

function DeviceRow({ device }: { device: DeviceRecord }) {
  return (
    <tr className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors">
      <td className="min-w-64 px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${connectionDotClass(device.last_connected_at)}`} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              {device.device_name}
            </div>
            <div className="truncate text-[10px] text-gray-600">
              {deviceSubtitle(device)}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="text-sm font-semibold tabular-nums text-white">
          {formatCompactRelativeTime(device.last_connected_at)}
        </div>
        <div className="text-[10px] tabular-nums text-gray-600">
          {absoluteTime(device.last_connected_at)}
        </div>
      </td>
      <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-400">
        {formatCompactRelativeTime(device.last_heartbeat_at)}
      </td>
      <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-400">
        {formatCompactRelativeTime(device.last_event_at)}
      </td>
      <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-400">
        {device.open_session_count}
      </td>
      <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-400">
        {device.session_count}
      </td>
      <td className="px-3 py-3">
        {device.latest_session_id ? (
          <Link
            to={`/sessions/${device.latest_session_id}`}
            className="inline-flex max-w-48 truncate text-xs text-gray-400 transition-colors hover:text-white"
          >
            {device.latest_session_status || device.latest_session_id}
          </Link>
        ) : (
          <span className="text-xs text-gray-600">-</span>
        )}
      </td>
    </tr>
  );
}

export default function DevicePage({
  config,
  onRefreshActionChange,
}: {
  config: DashboardConnectionConfig;
  onRefreshActionChange: (action: { label: string; onClick: () => void } | null) => void;
}) {
  const { devices, loading, error, refresh } = useDevices(config, 5000);

  useEffect(() => {
    onRefreshActionChange({ label: "Refresh", onClick: refresh });
    return () => onRefreshActionChange(null);
  }, [onRefreshActionChange, refresh]);

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 px-4 py-4">
        {error ? (
          <div className="p-4 text-accent-red bg-surface-2 rounded">
            Server unreachable: {error}
          </div>
        ) : loading && devices.length === 0 ? (
          <div className="p-4 text-gray-500 animate-pulse">Loading...</div>
        ) : devices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No devices connected yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-surface-3 text-left text-gray-500">
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2 text-right">Last connected</th>
                  <th className="px-3 py-2 text-right">Heartbeat</th>
                  <th className="px-3 py-2 text-right">Event</th>
                  <th className="px-3 py-2 text-right">Open</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Latest session</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <DeviceRow key={device.device_key} device={device} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="border-t border-surface-3 px-4 py-1.5 text-[10px] text-gray-600 flex justify-between">
        <span>{devices.length} device(s)</span>
        <span>Runlight v0.1.0</span>
      </footer>
    </div>
  );
}
