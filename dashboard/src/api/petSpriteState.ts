import type { RunlightPetStateId } from "../components/pet/petStates";
import type { PetSurfaceSnapshot } from "./petSurface";

export type { RunlightPetStateId };

const promptEvents = new Set(["user.prompt", "message.started"]);
const completionEvents = new Set(["message.finished", "session.completed"]);
const terminalStatuses = new Set(["finished", "completed"]);

export function petStateFromSurface(
  surface: PetSurfaceSnapshot,
): RunlightPetStateId {
  switch (surface.mood) {
    case "alert":
      return "failed";
    case "waiting":
      return "waiting";
    case "offline":
      return "review";
  }

  if (surface.latest) {
    if (promptEvents.has(surface.latest.eventType ?? "")) return "jumping";
    if (
      completionEvents.has(surface.latest.eventType ?? "") ||
      terminalStatuses.has(surface.latest.status)
    ) {
      return "waving";
    }
  }

  switch (surface.mood) {
    case "working":
      return "running";
    case "idle":
      return "idle";
  }
}
