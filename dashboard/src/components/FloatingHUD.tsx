import type { Session } from "../types/session";

interface Props {
  sessions: Session[];
}

export default function FloatingHUD({ sessions }: Props) {
  const counts = {
    running: 0,
    stale: 0,
    failed: 0,
    waiting: 0,
  };

  for (const s of sessions) {
    switch (s.current_status) {
      case "running":
      case "tool_running":
      case "command_running":
      case "starting":
        counts.running++;
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

  const latestEvent = sessions.length > 0 ? sessions[0] : null;

  return (
    <div className="bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 shadow-xl">
      <div className="flex items-center gap-4 text-xs">
        <HUDCounter label="Running" count={counts.running} color="text-accent-green" />
        <HUDCounter label="Stale" count={counts.stale} color="text-accent-yellow" />
        <HUDCounter label="Failed" count={counts.failed} color="text-accent-red" />
        <HUDCounter label="Waiting" count={counts.waiting} color="text-accent-orange" />
      </div>
      {latestEvent && (
        <div className="mt-2 text-[10px] text-gray-500 truncate">
          Latest: {latestEvent.latest_event_type} — {latestEvent.summary || latestEvent.session_id}
        </div>
      )}
    </div>
  );
}

function HUDCounter({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${count > 0 ? color : "text-gray-600"}`}>
        {count}
      </div>
      <div className="text-gray-500">{label}</div>
    </div>
  );
}
