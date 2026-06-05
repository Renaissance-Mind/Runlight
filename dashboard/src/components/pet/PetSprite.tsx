import { type CSSProperties, memo } from "react";

import {
  defaultPetState,
  petStates,
  type AgentMonitorPetStateId,
} from "./petStates";

interface PetSpriteProps {
  src: string;
  state?: AgentMonitorPetStateId;
  scale?: number;
  label?: string;
  className?: string;
}

function PetSpriteImpl({
  src,
  state = "idle",
  scale = 1,
  label,
  className = "",
}: PetSpriteProps) {
  const animation =
    petStates.find((item) => item.id === state) ?? defaultPetState;

  return (
    <div
      className={`pet-sprite-frame ${className}`}
      role="img"
      aria-label={label ?? "AgentMonitor pet"}
      style={
        {
          "--pet-scale": scale,
        } as CSSProperties
      }
    >
      <div
        className="pet-sprite"
        style={
          {
            "--sprite-url": `url("${src.replace(/"/g, '\\"')}")`,
            "--sprite-row": animation.row,
            "--sprite-frames": animation.frames,
            "--sprite-duration": `${animation.durationMs}ms`,
          } as CSSProperties
        }
      />
    </div>
  );
}

export const PetSprite = memo(PetSpriteImpl);
export type { AgentMonitorPetStateId };
