import { cn } from "@/lib/cn";
import { trustMeter } from "@/lib/format";
import type { EvidenceStatus } from "@/lib/api";
import TrustMeter from "@/components/TrustMeter";

const LEGEND_STATUSES: EvidenceStatus[] = [
  "strongly_supported",
  "partially_supported",
  "claim_only",
  "contradictory",
  "not_enough_data",
];

/**
 * Explains the trust semafor's five bands and what the meter's fill means.
 * Collapsed by default (native <details>) so it doesn't crowd the results
 * list. Honesty: reiterates that fill = strength of evidence, never hospital
 * quality — and that colour is always backed by shape + icon + label.
 */
export default function TrustLegend({ className }: { className?: string }) {
  return (
    <details className={cn("group rounded-xl border border-line bg-surface-raised p-3", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-navy marker:hidden">
        What do the evidence bands mean?
        <span aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        {LEGEND_STATUSES.map((status) => (
          <LegendRow key={status} status={status} />
        ))}
        <p className="border-t border-line pt-2 text-xs text-ink-muted">
          The meter's fill shows the <strong>strength of evidence</strong> that a facility offers
          this care type — never a rating of hospital quality. A fuller bar means "better
          corroborated," not "better hospital."
        </p>
      </div>
    </details>
  );
}

function LegendRow({ status }: { status: EvidenceStatus }) {
  const model = trustMeter(status);
  return (
    <div className="flex items-start gap-2.5">
      <TrustMeter status={status} size="sm" showLabel={false} className="mt-0.5" />
      <div>
        <p className={cn("text-sm font-semibold", model.colorClass)}>{model.label}</p>
        <p className="text-xs text-ink-muted">{model.meaning}</p>
      </div>
    </div>
  );
}
