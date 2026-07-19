import { motion } from "motion/react";
import { Check, CircleDashed, HelpCircle, X, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/a11y";
import { trustMeter, type TrustMeterModel } from "@/lib/format";
import type { EvidenceStatus } from "@/lib/api";

export interface TrustMeterProps {
  status: EvidenceStatus;
  /**
   * `evidence.care_evidence` (0–1) — when provided, the meter's fill varies
   * continuously WITHIN the band (e.g. two `strongly_supported` facilities at
   * 0.62 vs 0.94 render visibly different fills) instead of every facility in
   * a band looking identically full. Colour, shape, icon and label always
   * still come from `status` alone — only the fill amount changes. Omit to
   * keep the previous fixed-per-band fill.
   */
  careEvidence?: number;
  /** Segment height / text scale. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  /** Show the honesty caption line beneath the meter. Defaults to false. */
  showCaption?: boolean;
  /** Show the band label text. Defaults to true. */
  showLabel?: boolean;
  className?: string;
}

const TOTAL_SEGMENTS = 5;

/** Maps the model's `shape` to a distinct lucide glyph — a non-colour channel. */
const SHAPE_ICON: Record<TrustMeterModel["shape"], LucideIcon> = {
  check: Check,
  half: CircleDashed,
  query: HelpCircle,
  cross: X,
  dots: MoreHorizontal,
};

const SIZE_CONFIG = {
  sm: {
    segment: "h-1.5",
    gap: "gap-0.5",
    badge: "h-6 w-6",
    badgeIcon: 12,
    label: "text-xs font-bold",
    caption: "text-[11px]",
  },
  md: {
    segment: "h-2.5",
    gap: "gap-1",
    badge: "h-8 w-8",
    badgeIcon: 16,
    label: "text-sm font-bold",
    caption: "text-xs",
  },
  lg: {
    segment: "h-3.5",
    gap: "gap-1.5",
    badge: "h-10 w-10",
    badgeIcon: 20,
    label: "text-base font-bold",
    caption: "text-sm",
  },
} as const;

const HONESTY_NOTE =
  "Strength of evidence for this care type — not a rating of hospital quality.";

/**
 * Soft badge-tint background per status (10% opacity fill). Spelled out as
 * literal class strings (not built via runtime concatenation) so Tailwind's
 * content scanner can find them regardless of what other files contain.
 */
const SOFT_BG_CLASS: Record<EvidenceStatus, string> = {
  strongly_supported: "bg-evidence-strong/10",
  partially_supported: "bg-evidence-partial/10",
  claim_only: "bg-evidence-claim/10",
  contradictory: "bg-evidence-contradictory/10",
  not_enough_data: "bg-evidence-unknown/10",
};

/**
 * The "trust semafor": a horizontal 5-segment meter mapping the 5 evidence
 * bands onto a red→gold→green scale. Status is always carried redundantly by
 * colour + filled-segment-count + icon + label — never colour alone. The
 * "not enough data" band renders as dashed/hatched grey outlines, kept
 * visually distinct from a solid-red "care likely absent" reading.
 */
export default function TrustMeter({
  status,
  careEvidence,
  size = "md",
  showCaption = false,
  showLabel = true,
  className,
}: TrustMeterProps) {
  const reduceMotion = usePrefersReducedMotion();
  const model = trustMeter(status, careEvidence);
  const cfg = SIZE_CONFIG[size];
  const ShapeIcon = SHAPE_ICON[model.shape];
  // Per-segment fill amount (0–1). Segment i covers the fraction slice
  // [i, i+1) of `model.fraction`, so a fractional value (e.g. 4.7) renders as
  // 4 full segments + 1 segment filled to 70% — a continuous-looking meter
  // built from the same 5 discrete segments as before.
  const segments = Array.from({ length: TOTAL_SEGMENTS }, (_, i) =>
    Math.max(0, Math.min(1, model.fraction - i))
  );
  const roundedFraction = Math.round(model.fraction * 10) / 10;

  return (
    <div
      role="meter"
      aria-valuenow={roundedFraction}
      aria-valuemin={0}
      aria-valuemax={TOTAL_SEGMENTS}
      aria-valuetext={`${roundedFraction} of ${TOTAL_SEGMENTS}`}
      aria-label={`${model.label}: evidence strength ${roundedFraction} of ${TOTAL_SEGMENTS}`}
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg",
          model.colorClass,
          SOFT_BG_CLASS[status],
          cfg.badge
        )}
      >
        <ShapeIcon size={cfg.badgeIcon} strokeWidth={2.5} />
      </span>

      <div className="flex flex-col gap-1">
        <div className={cn("flex items-center", cfg.gap)}>
          {segments.map((fillFraction, i) => (
            <TrustSegment
              key={i}
              index={i}
              fillFraction={fillFraction}
              isDataDesert={model.isDataDesert}
              model={model}
              cfg={cfg}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>

        {showLabel && (
          <span className={cn(model.colorClass, cfg.label)}>{model.label}</span>
        )}

        {showCaption && (
          <p className={cn("text-ink-muted leading-snug", cfg.caption)}>
            {model.meaning} {HONESTY_NOTE}
          </p>
        )}
      </div>
    </div>
  );
}

interface TrustSegmentProps {
  index: number;
  /** How much of this segment is filled, 0–1 (may be a fraction for a partial segment). */
  fillFraction: number;
  isDataDesert: boolean;
  model: TrustMeterModel;
  cfg: (typeof SIZE_CONFIG)[keyof typeof SIZE_CONFIG];
  reduceMotion: boolean;
}

function TrustSegment({ index, fillFraction, isDataDesert, model, cfg, reduceMotion }: TrustSegmentProps) {
  const base = cn("relative flex-1 overflow-hidden rounded-full", cfg.segment);

  // Data desert: every segment renders as a dashed/hatched grey outline —
  // never solid, so "we don't know" can't be mistaken for solid-red "absent".
  if (isDataDesert) {
    return (
      <span
        className={cn(base, "border-2 border-dashed border-evidence-unknown/50 bg-transparent")}
      />
    );
  }

  if (fillFraction <= 0) {
    return <span className={cn(base, "bg-ink/10")} />;
  }

  const widthPct = `${fillFraction * 100}%`;

  if (reduceMotion) {
    return (
      <span className={cn(base, "bg-ink/10")}>
        <span className={cn("block h-full rounded-full", model.fillClass)} style={{ width: widthPct }} />
      </span>
    );
  }

  return (
    <span className={cn(base, "bg-ink/10")}>
      <motion.span
        className={cn("block h-full origin-left rounded-full", model.fillClass)}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.32, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: widthPct }}
      />
    </span>
  );
}
