import { useId, useState } from "react";
import type { DesertInfo } from "@/lib/api";
import { desertVisual } from "@/lib/format";

interface DesertBadgeProps {
  desert: DesertInfo;
  className?: string;
}

/**
 * Distinguishes "we don't know" (data desert, grey) from "care probably
 * absent" (medical desert, red). Always pairs colour with icon + text, and
 * exposes the "meaning" explanation via an inline expandable note so it is
 * never hidden behind a hover-only tooltip (keyboard/touch accessible).
 */
export default function DesertBadge({ desert, className = "" }: DesertBadgeProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const visual = desertVisual(desert.color);

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border font-semibold px-3 py-1 text-sm ${visual.bgClass} ${visual.borderClass} ${visual.colorClass}`}
      >
        <span aria-hidden="true">{visual.icon}</span>
        <span>{desert.label}</span>
        <span aria-hidden="true" className="text-xs opacity-70">
          {open ? "▲" : "▾"}
        </span>
      </button>
      {open && (
        <p
          id={detailId}
          className={`mt-1.5 rounded-lg border px-3 py-2 text-xs leading-relaxed ${visual.bgClass} ${visual.borderClass} text-navy/80`}
        >
          {desert.meaning}
        </p>
      )}
    </div>
  );
}
