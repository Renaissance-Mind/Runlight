import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "../types/session";
import { fetchLiveSessions, fetchAllSessions } from "../api/client";

export function useLiveSessions(intervalMs = 3000) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchLiveSessions();
      setSessions(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, intervalMs);
    return () => clearInterval(timer.current);
  }, [refresh, intervalMs]);

  return { sessions, error, loading, refresh };
}

export function useAllSessions(params?: {
  agent_type?: string;
  status?: string;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAllSessions(params)
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [params?.agent_type, params?.status]);

  return { sessions, loading };
}
