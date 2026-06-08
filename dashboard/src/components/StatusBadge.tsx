import { getStatusPresentation } from "../api/statusPresentation";

interface Props {
  status: string;
  lastEventAt?: string | null;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export default function StatusBadge({
  status,
  lastEventAt = null,
  size = "sm",
  showLabel = true,
}: Props) {
  const config = getStatusPresentation(status, lastEventAt);
  const dotSize = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span
      className={`inline-flex items-center ${showLabel ? "gap-1.5" : ""}`}
      title={config.label}
      aria-label={config.label}
    >
      <span className="relative flex">
        <span className={`${dotSize} rounded-full ${config.dotClass}`} />
        {config.pulse && (
          <span
            className={`absolute inset-0 ${dotSize} rounded-full ${config.dotClass} opacity-50 animate-ping`}
          />
        )}
      </span>
      {showLabel && (
        <span className={`${textSize} text-gray-300`}>{config.label}</span>
      )}
    </span>
  );
}
