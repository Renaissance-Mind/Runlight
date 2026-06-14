import { useEffect, useState } from "react";

import type { Session } from "../types/session";
import { buildPetSurfaceSnapshot } from "../api/petSurface";
import { loadDashboardPetAsset, type DashboardPetAsset } from "../api/petAssets";
import { petStateFromSurface } from "../api/petSpriteState";
import {
  getStatusPresentationForTone,
  summarizeStatusPresentationCounts,
  type StatusTone,
} from "../api/statusPresentation";
import { PetSprite } from "./pet/PetSprite";

interface Props {
  sessions: Session[];
}

const COUNTER_TONES: StatusTone[] = [
  "running",
  "recent_finished",
  "finished",
  "stale",
  "failed",
  "waiting",
];

export default function FloatingHUD({ sessions }: Props) {
  const surface = buildPetSurfaceSnapshot(sessions);
  const statusCounts = summarizeStatusPresentationCounts(sessions);
  const petState = petStateFromSurface(surface);
  const [petAsset, setPetAsset] = useState<DashboardPetAsset | null>(null);
  const [petLoadError, setPetLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadDashboardPetAsset()
      .then((asset) => {
        if (!cancelled) setPetAsset(asset);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPetLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 shadow-sm">
      <div className="flex items-center gap-4">
        {petAsset && (
          <div className="shrink-0 rounded-md border border-surface-3 bg-surface-1/60 px-1.5 pt-1.5">
            <PetSprite
              src={petAsset.spriteUrl}
              state={petState}
              scale={0.34}
              label={`${petAsset.displayName}: ${petState}`}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
            aria-label="Session status counts"
          >
            {COUNTER_TONES.map((tone) => (
              <HUDCounter key={tone} tone={tone} count={statusCounts[tone]} />
            ))}
            {statusCounts.unknown > 0 && (
              <HUDCounter tone="unknown" count={statusCounts.unknown} />
            )}
          </div>
          {surface.latest && (
            <div className="mt-2 truncate text-[10px] text-gray-500">
              Latest: {surface.latest.eventType} — {surface.latest.label}
            </div>
          )}
          {petLoadError && (
            <div className="mt-1 truncate text-[10px] text-accent-yellow">
              Pet unavailable: {petLoadError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HUDCounter({
  tone,
  count,
}: {
  tone: StatusTone;
  count: number;
}) {
  const presentation = getStatusPresentationForTone(tone);

  return (
    <div
      className="flex items-center gap-1.5 whitespace-nowrap"
      title={`${presentation.label}: ${count}`}
      aria-label={`${presentation.label}: ${count}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${presentation.dotClass} ${
          count > 0 ? "" : "opacity-30"
        }`}
      />
      <div
        className={`text-[10px] font-semibold uppercase leading-none ${
          count > 0 ? presentation.textClass : "text-gray-600"
        }`}
      >
        {presentation.label}
      </div>
      <div
        className={`text-lg font-bold leading-none tabular-nums ${
          count > 0 ? presentation.textClass : "text-gray-600"
        }`}
      >
        {count}
      </div>
    </div>
  );
}
