export type DashboardPetAssetSource = "configured" | "codex";

export interface DashboardPetAsset {
  source: DashboardPetAssetSource;
  slug: string;
  displayName: string;
  spriteUrl: string;
}

export interface TauriPetAsset {
  slug: string;
  displayName: string;
  spriteDataUrl: string;
}

type PetAssetEnv = Record<string, string | undefined>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function readConfiguredPetAsset(
  env: PetAssetEnv = import.meta.env,
): DashboardPetAsset | null {
  const spriteUrl = env.VITE_AGENT_MONITOR_PET_SPRITE_URL?.trim();
  if (!spriteUrl) return null;

  return {
    source: "configured",
    slug: "configured",
    displayName: env.VITE_AGENT_MONITOR_PET_NAME?.trim() || "AgentMonitor Pet",
    spriteUrl,
  };
}

export function normalizeTauriPetAsset(
  payload: TauriPetAsset,
): DashboardPetAsset {
  return {
    source: "codex",
    slug: payload.slug,
    displayName: payload.displayName,
    spriteUrl: payload.spriteDataUrl,
  };
}

export async function loadDashboardPetAsset(): Promise<DashboardPetAsset | null> {
  const configured = readConfiguredPetAsset();
  if (configured) return configured;
  if (!isTauriRuntime()) return null;

  const { invoke } = await import("@tauri-apps/api/core");
  const selectedPet = await invoke<TauriPetAsset | null>(
    "get_selected_pet_asset",
  );

  return selectedPet ? normalizeTauriPetAsset(selectedPet) : null;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
