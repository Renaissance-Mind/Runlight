import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DashboardConnectionConfig } from "../api/config";
import {
  completeCliConnect,
  createUploadToken,
  type CreatedUploadToken,
} from "../api/client";

type CopyTarget = "token" | "command" | null;

export default function ConnectPage({
  config,
}: {
  config: DashboardConnectionConfig;
}) {
  const [searchParams] = useSearchParams();
  const cliCode = searchParams.get("cli_code")?.trim() ?? "";
  const isCliConnect = cliCode.length > 0;
  const [token, setToken] = useState<CreatedUploadToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCopied(null);
    setConnected(false);
    setToken(null);
    const task = isCliConnect
      ? completeCliConnect(cliCode, config).then(() => {
        if (!cancelled) setConnected(true);
      })
      : createUploadToken(config).then((created) => {
        if (!cancelled) setToken(created);
      });

    task
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cliCode, config.serverUrl, config.token, isCliConnect]);

  const setupCommand = useMemo(() => {
    if (!token) return "";
    return `runlight setup --server ${config.serverUrl} --token ${token.token}`;
  }, [config.serverUrl, token]);

  const copy = async (value: string, target: CopyTarget) => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
  };

  return (
    <main className="min-h-screen px-4 py-10">
      <section className="mx-auto w-full max-w-xl border border-surface-3 bg-surface-1 rounded-lg p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">
              Connect Runlight CLI
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              {isCliConnect
                ? "Keep this page open until your terminal finishes setup."
                : "Copy this token back into your terminal to finish setup."}
            </p>
          </div>
          <Link
            to="/"
            className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-2"
          >
            Live
          </Link>
        </div>

        {loading ? (
          <div className="border border-surface-3 bg-surface-2 rounded px-3 py-3 text-xs text-gray-500">
            {isCliConnect ? "Connecting CLI..." : "Creating upload token..."}
          </div>
        ) : null}

        {error ? (
          <div className="border border-accent-red/40 bg-accent-red/5 rounded p-3 space-y-2">
            <p className="text-xs text-accent-red">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-gray-300 hover:text-white border border-surface-3 px-3 py-1.5 rounded hover:bg-surface-2 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : null}

        {connected ? (
          <div className="border border-accent-green/40 bg-accent-green/5 rounded p-3">
            <p className="text-xs text-accent-green">
              Runlight CLI connected. Return to your terminal.
            </p>
          </div>
        ) : null}

        {token ? (
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-gray-500 tracking-wider">
                Upload token
              </span>
              <div className="flex gap-2">
                <input
                  aria-label="Runlight upload token"
                  readOnly
                  value={token.token}
                  className="min-w-0 flex-1 bg-surface-2 border border-surface-3 rounded px-3 py-2 text-xs text-gray-200 font-mono"
                />
                <button
                  onClick={() => copy(token.token, "token")}
                  className="text-xs text-gray-300 hover:text-white border border-surface-3 px-3 py-1.5 rounded hover:bg-surface-2 transition-colors"
                >
                  {copied === "token" ? "Copied" : "Copy"}
                </button>
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-gray-500 tracking-wider">
                One-line setup
              </span>
              <div className="flex gap-2">
                <input
                  aria-label="Runlight setup command"
                  readOnly
                  value={setupCommand}
                  className="min-w-0 flex-1 bg-surface-2 border border-surface-3 rounded px-3 py-2 text-xs text-gray-200 font-mono"
                />
                <button
                  onClick={() => copy(setupCommand, "command")}
                  className="text-xs text-gray-300 hover:text-white border border-surface-3 px-3 py-1.5 rounded hover:bg-surface-2 transition-colors"
                >
                  {copied === "command" ? "Copied" : "Copy"}
                </button>
              </div>
            </label>
          </div>
        ) : null}
      </section>
    </main>
  );
}
