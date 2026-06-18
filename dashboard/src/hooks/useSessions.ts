import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SessionEvent } from "../types/session";
import {
  fetchDevices,
  fetchLiveSessions,
  fetchAllSessions,
  fetchRecentEvents,
} from "../api/client";
import type { DeviceRecord } from "../types/session";
import type { DashboardConnectionConfig } from "../api/config";

export function useLiveSessions(
  config: DashboardConnectionConfig,
  intervalMs = 3000,
) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchLiveSessions(config);
      setSessions(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, intervalMs);
    return () => clearInterval(timer.current);
  }, [refresh, intervalMs]);

  return { sessions, error, loading, refresh };
}

export function useRecentEvents(
  config: DashboardConnectionConfig,
  intervalMs = 3000,
  limit = 100,
) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchRecentEvents(config, limit);
      setEvents(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [config, limit]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, intervalMs);
    return () => clearInterval(timer.current);
  }, [refresh, intervalMs]);

  return { events, error, loading, refresh };
}

export function useDevices(
  config: DashboardConnectionConfig,
  intervalMs = 10000,
) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchDevices(config);
      setDevices(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, intervalMs);
    return () => clearInterval(timer.current);
  }, [refresh, intervalMs]);

  return { devices, error, loading, refresh };
}

export function useAllSessions(params?: {
  agent_type?: string;
  status?: string;
  config: DashboardConnectionConfig;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAllSessions(params)
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [params?.agent_type, params?.status, params?.config]);

  return { sessions, loading };
}
