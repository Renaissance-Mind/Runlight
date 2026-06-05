import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeTauriPetAsset,
  readConfiguredPetAsset,
} from "../src/api/petAssets.ts";

describe("dashboard pet assets", () => {
  it("uses an explicit dashboard pet sprite URL when configured", () => {
    assert.deepEqual(
      readConfiguredPetAsset({
        VITE_AGENT_MONITOR_PET_SPRITE_URL: "/pets/capy/spritesheet.webp",
        VITE_AGENT_MONITOR_PET_NAME: "Capy",
      }),
      {
        source: "configured",
        slug: "configured",
        displayName: "Capy",
        spriteUrl: "/pets/capy/spritesheet.webp",
      },
    );
  });

  it("ignores blank explicit pet sprite configuration", () => {
    assert.equal(
      readConfiguredPetAsset({
        VITE_AGENT_MONITOR_PET_SPRITE_URL: "   ",
        VITE_AGENT_MONITOR_PET_NAME: "Ignored",
      }),
      null,
    );
  });

  it("normalizes the selected Tauri Codex pet payload for the React surface", () => {
    assert.deepEqual(
      normalizeTauriPetAsset({
        slug: "capy-ragdoll",
        displayName: "Capy Ragdoll",
        spriteDataUrl: "data:image/webp;base64,AAAA",
      }),
      {
        source: "codex",
        slug: "capy-ragdoll",
        displayName: "Capy Ragdoll",
        spriteUrl: "data:image/webp;base64,AAAA",
      },
    );
  });
});
