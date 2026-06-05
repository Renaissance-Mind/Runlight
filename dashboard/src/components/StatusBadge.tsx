interface Props {
  status: string;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<string, { color: string; label: string; pulse?: boolean }> = {
  starting: { color: "bg-accent-blue", label: "Starting", pulse: true },
  running: { color: "bg-accent-green", label: "Running", pulse: true },
  tool_running: { color: "bg-accent-green", label: "Tool", pulse: true },
  command_running: { color: "bg-accent-green", label: "Cmd", pulse: true },
  waiting_user: { color: "bg-accent-yellow", label: "Waiting", pulse: true },
  waiting_external: { color: "bg-accent-orange", label: "External", pulse: true },
  stale: { color: "bg-accent-yellow", label: "Stale" },
  completed: { color: "bg-gray-500", label: "Done" },
  failed: { color: "bg-accent-red", label: "Failed" },
  aborted: { color: "bg-accent-red", label: "Aborted" },
};

export default function StatusBadge({ status, size = "sm" }: Props) {
  const config = STATUS_CONFIG[status] ?? {
    color: "bg-gray-600",
    label: status,
  };
  const dotSize = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex">
        <span className={`${dotSize} rounded-full ${config.color}`} />
        {config.pulse && (
          <span
            className={`absolute inset-0 ${dotSize} rounded-full ${config.color} opacity-50 animate-ping`}
          />
        )}
      </span>
      <span className={`${textSize} text-gray-300`}>{config.label}</span>
    </span>
  );
}
