import type { Session } from "../types/session";
import { summarizeSessionsForSurface } from "../api/viewModels";

interface Props {
  sessions: Session[];
}

export default function FloatingHUD({ sessions }: Props) {
  const surface = summarizeSessionsForSurface(sessions);

  return (
    <div className="bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 shadow-xl">
      <div className="flex items-center gap-4 text-xs">
        <HUDCounter label="Running" count={surface.counts.running} color="text-accent-green" />
        <HUDCounter label="Finished" count={surface.counts.finished} color="text-accent-blue" />
        <HUDCounter label="Stale" count={surface.counts.stale} color="text-accent-yellow" />
        <HUDCounter label="Failed" count={surface.counts.failed} color="text-accent-red" />
        <HUDCounter label="Waiting" count={surface.counts.waiting} color="text-accent-orange" />
      </div>
      {surface.latest && (
        <div className="mt-2 text-[10px] text-gray-500 truncate">
          Latest: {surface.latest.eventType} — {surface.latest.label}
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
