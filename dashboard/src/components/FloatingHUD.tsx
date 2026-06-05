import { useEffect, useState } from "react";

import type { Session } from "../types/session";
import { buildPetSurfaceSnapshot } from "../api/petSurface";
import { loadDashboardPetAsset, type DashboardPetAsset } from "../api/petAssets";
import { petStateFromSurface } from "../api/petSpriteState";
import { PetSprite } from "./pet/PetSprite";

interface Props {
  sessions: Session[];
}

export default function FloatingHUD({ sessions }: Props) {
  const surface = buildPetSurfaceSnapshot(sessions);
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
    <div className="bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 shadow-xl">
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
          <div className="flex items-center gap-4 text-xs">
            <HUDCounter
              label="Running"
              count={surface.counts.running}
              color="text-accent-green"
            />
            <HUDCounter
              label="Finished"
              count={surface.counts.finished}
              color="text-accent-blue"
            />
            <HUDCounter
              label="Stale"
              count={surface.counts.stale}
              color="text-accent-yellow"
            />
            <HUDCounter
              label="Failed"
              count={surface.counts.failed}
              color="text-accent-red"
            />
            <HUDCounter
              label="Waiting"
              count={surface.counts.waiting}
              color="text-accent-orange"
            />
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
