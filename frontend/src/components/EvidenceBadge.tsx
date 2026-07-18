import type { EvidenceStatus } from "@/lib/api";
import { evidenceVisual } from "@/lib/format";

interface EvidenceBadgeProps {
  status: EvidenceStatus;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * A status pill that always pairs colour with an icon and text label, so
 * the evidence status is never conveyed by colour alone.
 */
export default function EvidenceBadge({
  status,
  label,
  className = "",
  size = "md",
}: EvidenceBadgeProps) {
  const visual = evidenceVisual(status);
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${visual.bgClass} ${visual.borderClass} ${visual.colorClass} ${padding} ${className}`}
    >
      <span aria-hidden="true">{visual.icon}</span>
      <span>{label ?? visual.label}</span>
    </span>
  );
}
