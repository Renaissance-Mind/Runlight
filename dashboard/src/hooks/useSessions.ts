import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SessionEvent } from "../types/session";
import {
  fetchApprovals,
  fetchDevices,
  fetchLiveSessions,
  fetchAllSessions,
  fetchRecentEvents,
  resolveApproval,
} from "../api/client";
import type { ApprovalRequest, DeviceRecord } from "../types/session";
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

export function useApprovals(
  config: DashboardConnectionConfig,
  intervalMs = 2000,
) {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(() => new Set());
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchApprovals(config);
      setApprovals(data);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch";
      if (message.includes("API 404")) {
        setApprovals([]);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [config]);

  const decide = useCallback(async (
    approvalId: string,
    decision: "allow" | "deny",
    options: { remember?: boolean } = {},
  ) => {
    setResolvingIds((previous) => new Set(previous).add(approvalId));
    try {
      await resolveApproval(approvalId, decision, config, options);
      await refresh();
    } finally {
      setResolvingIds((previous) => {
        const next = new Set(previous);
        next.delete(approvalId);
        return next;
      });
    }
  }, [config, refresh]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, intervalMs);
    return () => clearInterval(timer.current);
  }, [refresh, intervalMs]);

  return { approvals, error, loading, resolvingIds, refresh, decide };
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
