import { resolveDashboardConfig, type DashboardConnectionConfig } from "./config.ts";
import type { ServerConnectionProbe } from "./client.ts";

export type ConnectionStatusTone = "ok" | "muted" | "error";

export interface ConnectionStatusView {
  label: string;
  tone: ConnectionStatusTone;
}

export function formatConnectionStatus(
  probe: ServerConnectionProbe | null,
): ConnectionStatusView {
  if (!probe) {
    return { label: "Checking server", tone: "muted" };
  }

  if (!probe.ok) {
    return {
      label: `Disconnected: ${probe.error}`,
      tone: "error",
    };
  }

  return {
    label: `${probe.userId || "default"} / ${probe.tokenConfigured ? "token" : "no token"}`,
    tone: "ok",
  };
}

export function normalizeSettingsDraft(
  draft: DashboardConnectionConfig,
): DashboardConnectionConfig {
  return resolveDashboardConfig(undefined, draft);
}
