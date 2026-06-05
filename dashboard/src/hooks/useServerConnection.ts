import { useCallback, useEffect, useState } from "react";
import {
  probeServerConnection,
  type ServerConnectionProbe,
} from "../api/client";
import type { DashboardConnectionConfig } from "../api/config";

export function useServerConnection(
  config: DashboardConnectionConfig,
  intervalMs = 10000,
) {
  const [probe, setProbe] = useState<ServerConnectionProbe | null>(null);

  const refresh = useCallback(async () => {
    setProbe(await probeServerConnection(config));
  }, [config]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, intervalMs);
    return () => clearInterval(interval);
  }, [refresh, intervalMs]);

  return { probe, refresh };
}
