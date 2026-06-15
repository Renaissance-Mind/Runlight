import { Link } from "react-router-dom";

type SessionStatus = "running" | "waiting" | "command" | "stale" | "failed" | "finished";

interface DemoSession {
  id: string;
  project: string;
  summary: string;
  agent: "Codex" | "Claude Code";
  status: SessionStatus;
  lastEvent: string;
  duration: string;
  commands: number;
  tools: number;
  timeline: number[];
}

interface DeviceGroup {
  name: string;
  meta: string;
  active: number;
  sessions: DemoSession[];
}

const statusStyles: Record<SessionStatus, { label: string; dot: string; bars: string; text: string }> = {
  running: {
    label: "Running",
    dot: "#0f9f7a",
    bars: "#0f9f7a",
    text: "#047857",
  },
  waiting: {
    label: "Waiting",
    dot: "#f59e0b",
    bars: "#f59e0b",
    text: "#b45309",
  },
  command: {
    label: "Command",
    dot: "#2563eb",
    bars: "#2563eb",
    text: "#1d4ed8",
  },
  stale: {
    label: "Stale",
    dot: "#64748b",
    bars: "#64748b",
    text: "#475569",
  },
  failed: {
    label: "Failed",
    dot: "#ef4444",
    bars: "#ef4444",
    text: "#dc2626",
  },
  finished: {
    label: "Finished",
    dot: "#94a3b8",
    bars: "#94a3b8",
    text: "#64748b",
  },
};

const devices: DeviceGroup[] = [
  {
    name: "MacBook Pro 16",
    meta: "macOS 14.5",
    active: 4,
    sessions: [
      {
        id: "rl-101",
        project: "runlight/agent-monitor",
        summary: "Refactor session timeline rendering",
        agent: "Codex",
        status: "running",
        lastEvent: "12s ago",
        duration: "1h 24m",
        commands: 32,
        tools: 18,
        timeline: [8, 12, 10, 17, 20, 28, 23, 34, 39, 42, 31, 24],
      },
      {
        id: "rl-102",
        project: "runlight/dashboard",
        summary: "Add HUD toggle with shortcut",
        agent: "Claude Code",
        status: "waiting",
        lastEvent: "3m ago",
        duration: "42m",
        commands: 8,
        tools: 4,
        timeline: [4, 12, 18, 16, 11, 23, 26, 20, 31, 28, 24, 18],
      },
      {
        id: "rl-103",
        project: "runlight/server",
        summary: "Optimize ingestion queue",
        agent: "Codex",
        status: "command",
        lastEvent: "18s ago",
        duration: "27m",
        commands: 15,
        tools: 2,
        timeline: [2, 5, 13, 9, 19, 15, 22, 18, 28, 25, 21, 17],
      },
      {
        id: "rl-104",
        project: "runlight/docs",
        summary: "Update architecture diagram",
        agent: "Claude Code",
        status: "finished",
        lastEvent: "28m ago",
        duration: "1h 05m",
        commands: 6,
        tools: 0,
        timeline: [12, 14, 10, 8, 16, 12, 6, 5, 4, 3, 2, 1],
      },
    ],
  },
  {
    name: "devbox-01",
    meta: "Ubuntu 22.04",
    active: 3,
    sessions: [
      {
        id: "rl-201",
        project: "infra/terraform",
        summary: "Plan infrastructure changes",
        agent: "Claude Code",
        status: "running",
        lastEvent: "8s ago",
        duration: "1h 10m",
        commands: 24,
        tools: 8,
        timeline: [7, 9, 16, 22, 26, 30, 35, 46, 39, 28, 22, 15],
      },
      {
        id: "rl-202",
        project: "infra/observability",
        summary: "Add runlight metrics exporter",
        agent: "Codex",
        status: "waiting",
        lastEvent: "5m ago",
        duration: "33m",
        commands: 5,
        tools: 1,
        timeline: [3, 8, 13, 11, 17, 21, 14, 18, 16, 11, 8, 6],
      },
      {
        id: "rl-203",
        project: "infra/deploy",
        summary: "Roll out staging probe",
        agent: "Claude Code",
        status: "failed",
        lastEvent: "16m ago",
        duration: "11m",
        commands: 3,
        tools: 0,
        timeline: [2, 4, 5, 9, 6, 12, 18, 7, 4, 2, 1, 1],
      },
    ],
  },
  {
    name: "iPad Lab Viewer",
    meta: "iPadOS 18",
    active: 2,
    sessions: [
      {
        id: "rl-301",
        project: "client/e2e",
        summary: "Update Playwright tests",
        agent: "Claude Code",
        status: "stale",
        lastEvent: "14m ago",
        duration: "1h 32m",
        commands: 2,
        tools: 0,
        timeline: [20, 24, 19, 18, 13, 12, 9, 7, 5, 4, 3, 2],
      },
      {
        id: "rl-302",
        project: "research/agents",
        summary: "Evaluate function-calling patterns",
        agent: "Codex",
        status: "running",
        lastEvent: "6s ago",
        duration: "2h 03m",
        commands: 41,
        tools: 11,
        timeline: [12, 18, 24, 27, 34, 45, 50, 42, 39, 33, 28, 24],
      },
    ],
  },
];

const pulseCards = [
  { label: "Running now", value: "12", color: "#0f9f7a", data: [15, 19, 24, 31, 38, 44, 51, 48, 41, 36, 29, 21] },
  { label: "Waiting on user", value: "7", color: "#f59e0b", data: [8, 12, 18, 21, 17, 24, 28, 25, 30, 22, 18, 13] },
  { label: "Command running", value: "5", color: "#2563eb", data: [5, 9, 16, 12, 20, 24, 18, 27, 31, 26, 20, 14] },
  { label: "Recent failures", value: "2", color: "#ef4444", data: [1, 2, 4, 3, 5, 6, 9, 7, 10, 13, 11, 15] },
];

function MonitorIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 20h8M12 16.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.2 10.5h2.4l1.3-2.6 2.1 5.2 1.2-2.6h2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="7.2" y="2.8" width="9.6" height="18.4" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.6 5.5h2.8M11.2 18.2h1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TabletIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="3.6" width="16" height="16.8" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11.2 17.8h1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BranchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 6v7a4 4 0 0 0 4 4h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 8h4a2 2 0 0 0 2-2V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Bars({ values, color, compact = false }: { values: number[]; color: string; compact?: boolean }) {
  const max = Math.max(...values, 1);
  return (
    <div className={`flex items-end gap-0.5 ${compact ? "h-6" : "h-8"}`} aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="w-1 rounded-sm"
          style={{
            height: `${Math.max(12, Math.round((value / max) * 100))}%`,
            backgroundColor: color,
            opacity: 0.35 + (value / max) * 0.55,
          }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e5ebf2]" aria-hidden="true">
      <span
        className="block h-full rounded-full"
        style={{ width: `${value}%`, backgroundColor: color }}
      />
    </div>
  );
}

function SessionPulseCard() {
  return (
    <section className="w-full max-w-[280px] overflow-hidden rounded-lg border border-[#1f2937] bg-[#0d1218] text-[#f8fafc] shadow-2xl shadow-slate-900/20">
      <div className="space-y-1 border-b border-[#1f2937] px-5 py-5">
        <div className="flex items-center gap-2">
          <BranchIcon className="h-5 w-5 text-[#13c29a]" />
          <h2 className="text-sm font-semibold tracking-tight">Live Session Pulse</h2>
        </div>
        <p className="text-xs text-[#9fb0c2]">4 devices watching</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {pulseCards.map((card) => (
          <div key={card.label} className="rounded-md border border-[#243140] bg-[#121922] p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#d6e0ea]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: card.color }} />
                  {card.label}
                </div>
                <div className="text-2xl font-bold leading-none">{card.value}</div>
                <div className="mt-1 text-[10px] text-[#8494a6]">sessions</div>
              </div>
              <Bars values={card.data} color={card.color} compact />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#1f2937] px-5 py-5">
        <div className="mb-4 text-xs text-[#9fb0c2]">Observe on</div>
        <div className="grid grid-cols-3 gap-3 text-center text-[11px] text-[#d6e0ea]">
          <span className="grid gap-1 place-items-center">
            <MonitorIcon className="h-6 w-6 text-[#13c29a]" />
            Web
          </span>
          <span className="grid gap-1 place-items-center">
            <PhoneIcon className="h-6 w-6 text-[#9fb0c2]" />
            iPhone
          </span>
          <span className="grid gap-1 place-items-center">
            <TabletIcon className="h-6 w-6 text-[#9fb0c2]" />
            iPad
          </span>
        </div>
      </div>
    </section>
  );
}

function DashboardPreview({ compact = false }: { compact?: boolean }) {
  const totals = [
    { label: "Running", value: 12, status: "running" as const },
    { label: "Waiting", value: 7, status: "waiting" as const },
    { label: "Command", value: 5, status: "command" as const },
    { label: "Failed", value: 2, status: "failed" as const },
    { label: "Finished", value: 56, status: "finished" as const },
  ];

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[#d7e0ea] bg-[#f8fafc] shadow-xl shadow-slate-200/70">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d7e0ea] px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-[#0f172a]">Sessions</h2>
          <p className="text-xs text-[#64748b]">78 active / 312 total</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          {totals.map((item) => (
            <div key={item.label} className="min-w-14">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-[#64748b]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: statusStyles[item.status].dot }}
                />
                {item.label}
              </div>
              <div className="text-xl font-bold leading-none text-[#0f172a]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-[11px] text-[#334155]">
          <thead className="border-b border-[#e1e8f0] bg-[#f1f5f9] text-[10px] uppercase tracking-wide text-[#64748b]">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Device / Project / Session</th>
              <th className="px-3 py-2.5 font-semibold">Agent</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Last event</th>
              <th className="px-3 py-2.5 font-semibold">Duration</th>
              <th className="px-3 py-2.5 font-semibold">Activity timeline</th>
              <th className="px-3 py-2.5 font-semibold">Activity</th>
            </tr>
          </thead>
          {devices.map((device) => (
            <tbody key={device.name}>
              <tr className="border-b border-[#dfe7ef] bg-[#f8fafc]">
                <td colSpan={7} className="px-5 py-2">
                  <div className="flex items-center gap-3">
                    <MonitorIcon className="h-4 w-4 text-[#475569]" />
                    <span className="font-bold text-[#0f172a]">{device.name}</span>
                    <span className="text-[#64748b]">{device.meta}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0f9f7a]" />
                    <span className="text-[#0f9f7a]">{device.active}</span>
                  </div>
                </td>
              </tr>
              {device.sessions.slice(0, compact ? 2 : device.sessions.length).map((session) => {
                const style = statusStyles[session.status];
                return (
                  <tr key={session.id} className="border-b border-[#edf2f7] hover:bg-[#f1f5f9]">
                    <td className="max-w-[270px] px-5 py-2.5">
                      <div className="truncate font-semibold text-[#0f172a]">{session.project}</div>
                      <div className="truncate text-[#64748b]">{session.summary}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{session.agent}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: style.text }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                        {style.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{session.lastEvent}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{session.duration}</td>
                    <td className="px-3 py-2.5">
                      <Bars values={session.timeline} color={style.bars} compact />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={Math.min(96, session.commands * 2.3)} color={style.bars} />
                        <span className="whitespace-nowrap text-[#64748b]">
                          {session.commands} cmd / {session.tools} tool
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

function PhonePreview() {
  const rows = devices.flatMap((device) =>
    device.sessions.slice(0, 2).map((session) => ({ ...session, device: device.name })),
  );

  return (
    <section className="mx-auto w-[210px] rounded-[28px] border-[7px] border-[#0b1117] bg-[#0b1117] p-2 shadow-xl shadow-slate-300/70">
      <div className="rounded-[20px] bg-[#101720] px-3 py-4 text-[#f8fafc]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Runlight</div>
            <div className="text-[10px] text-[#7f91a5]">Live feed</div>
          </div>
          <span className="h-2 w-2 rounded-full bg-[#13c29a]" />
        </div>
        <div className="space-y-2">
          {rows.slice(0, 6).map((row) => {
            const style = statusStyles[row.status];
            return (
              <div key={`${row.device}-${row.id}`} className="rounded-md border border-[#253241] bg-[#151e29] p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold text-[#dce6f1]">{row.project}</span>
                  <span className="shrink-0 text-[9px] text-[#7f91a5]">{row.lastEvent}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: style.dot }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                  {style.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TabletPreview() {
  return (
    <section className="overflow-hidden rounded-2xl border-[7px] border-[#0b1117] bg-[#0b1117] shadow-xl shadow-slate-300/70">
      <div className="grid min-h-[252px] grid-cols-[160px_1fr] rounded-lg bg-[#111923] text-[#f8fafc]">
        <aside className="border-r border-[#263545] p-4">
          <h3 className="mb-4 text-base font-bold">Devices</h3>
          <div className="space-y-2">
            {devices.map((device, index) => (
              <div
                key={device.name}
                className={`rounded-md border p-2 ${
                  index === 0
                    ? "border-[#13c29a]/50 bg-[#172538]"
                    : "border-[#263545] bg-[#151e29]"
                }`}
              >
                <div className="truncate text-[11px] font-semibold">{device.name}</div>
                <div className="text-[10px] text-[#8494a6]">{device.active} active</div>
              </div>
            ))}
          </div>
        </aside>
        <div className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">MacBook Pro 16</h3>
              <p className="text-[10px] text-[#8494a6]">4 active sessions</p>
            </div>
            <span className="text-[10px] text-[#13c29a]">synced 6s ago</span>
          </div>
          <div className="space-y-2">
            {devices[0].sessions.map((session) => {
              const style = statusStyles[session.status];
              return (
                <div key={session.id} className="grid grid-cols-[1fr_76px_120px] items-center gap-3 rounded-md border border-[#263545] bg-[#151e29] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold">{session.project}</div>
                    <div className="truncate text-[10px] text-[#8494a6]">{session.summary}</div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: style.dot }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                    {style.label}
                  </span>
                  <Bars values={session.timeline} color={style.bars} compact />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function DeviceSurfaces() {
  return (
    <section id="devices" className="mx-auto max-w-[1600px] px-5 pb-16 pt-4 sm:px-8">
      <h2 className="mb-6 text-center text-xl font-bold tracking-tight text-[#0f172a]">
        Observe from anywhere.
      </h2>
      <div className="grid overflow-hidden rounded-lg border border-[#d7e0ea] bg-[#f8fafc] lg:grid-cols-[1fr_300px_1.1fr]">
        <div className="border-b border-[#d7e0ea] p-6 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-center gap-2 text-sm font-semibold text-[#0f172a]">
            <MonitorIcon className="h-5 w-5" />
            Web Dashboard
          </div>
          <div className="origin-top scale-[0.82] sm:scale-90 lg:scale-75 xl:scale-[0.82]">
            <DashboardPreview compact />
          </div>
        </div>
        <div className="border-b border-[#d7e0ea] p-6 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-center gap-2 text-sm font-semibold text-[#0f172a]">
            <PhoneIcon className="h-5 w-5" />
            iPhone App
          </div>
          <PhonePreview />
        </div>
        <div className="p-6">
          <div className="mb-4 flex items-center justify-center gap-2 text-sm font-semibold text-[#0f172a]">
            <TabletIcon className="h-5 w-5" />
            iPad App
          </div>
          <TabletPreview />
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7fa] font-sans text-[#0f172a]">
      <section className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] items-center gap-8 px-5 pb-8 pt-10 sm:px-8 lg:min-h-[calc(100vh-8rem)] xl:grid-cols-[330px_minmax(0,1fr)] xl:gap-6 xl:pt-6">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-[32px] font-black leading-[1.06] tracking-normal text-[#0b1220] sm:text-5xl sm:leading-[1.02]">
            <span className="block sm:inline">See every agent</span>{" "}
            <span className="block sm:inline">session across</span>{" "}
            <span className="block sm:inline">every device.</span>
          </h1>
          <p className="mt-6 max-w-[32ch] text-sm leading-7 text-[#334155] sm:max-w-lg sm:text-base">
            Runlight follows Codex, Claude Code, and custom adapters from local
            hooks to web, iPhone, and iPad dashboards without storing prompts or
            transcripts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/connect"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#087e63] px-4 text-[13px] font-bold text-[#f8fafc] shadow-lg shadow-emerald-900/10 transition-colors hover:bg-[#066b54]"
            >
              Connect a device
            </Link>
            <Link
              to="/live"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#94a3b8] bg-[#ffffff] px-4 text-[13px] font-bold text-[#0f172a] transition-colors hover:bg-[#eef4f7]"
            >
              View live dashboard
            </Link>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-4 xl:grid-cols-[280px_minmax(660px,1fr)]">
          <SessionPulseCard />
          <div className="min-w-0">
            <DashboardPreview />
          </div>
        </div>
      </section>
      <DeviceSurfaces />
      <footer className="border-t border-[#d7e0ea] px-5 py-6 text-center text-xs text-[#64748b]">
        Runlight watches lifecycle metadata across local hooks, cloud APIs, and native viewers.
      </footer>
    </main>
  );
}
