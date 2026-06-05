import {
  summarizeSessionsForSurface,
  type LatestSessionSurface,
  type SessionSurfaceCounts,
  type SessionSurfaceInput,
} from "./viewModels.ts";

export type PetMood = "idle" | "working" | "waiting" | "alert" | "offline";
export type PetAttentionLevel = "none" | "low" | "medium" | "high";

export interface PetSurfaceSnapshot {
  schemaVersion: "agent-monitor.pet-surface.v1";
  mood: PetMood;
  attentionLevel: PetAttentionLevel;
  counts: SessionSurfaceCounts;
  latest: LatestSessionSurface | null;
  generatedAt: string;
}

function moodFromCounts(counts: SessionSurfaceCounts): {
  mood: PetMood;
  attentionLevel: PetAttentionLevel;
} {
  if (counts.failed > 0) return { mood: "alert", attentionLevel: "high" };
  if (counts.waiting > 0) return { mood: "waiting", attentionLevel: "medium" };
  if (counts.stale > 0) return { mood: "offline", attentionLevel: "medium" };
  if (counts.running > 0) return { mood: "working", attentionLevel: "low" };
  return { mood: "idle", attentionLevel: "none" };
}

export function buildPetSurfaceSnapshot(
  sessions: SessionSurfaceInput[],
  generatedAt = new Date().toISOString(),
): PetSurfaceSnapshot {
  const surface = summarizeSessionsForSurface(sessions);
  const mood = moodFromCounts(surface.counts);

  return {
    schemaVersion: "agent-monitor.pet-surface.v1",
    mood: mood.mood,
    attentionLevel: mood.attentionLevel,
    counts: surface.counts,
    latest: surface.latest,
    generatedAt,
  };
}
