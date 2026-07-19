import { Sparkles } from "lucide-react";
import type { CareNeed } from "@/lib/api";
import { cn } from "@/lib/cn";

interface CareNeedButtonsProps {
  careNeeds: CareNeed[];
  mvp: string[];
  selected: string | null;
  onSelect: (key: string) => void;
  /** The assistant's current best suggestion — highlighted with a live match %. */
  suggestedKey?: string | null;
  suggestedConfidence?: number | null;
  /** Other care types the assistant flagged as possible. */
  alternativeKeys?: string[];
}

/**
 * The 7 big care-type buttons. MVP-supported ones (icu/nicu) are marked
 * "best supported". The emergency button is visually distinct (red). When the
 * conversational assistant produces a suggestion, that button lights up with a
 * live "AI · NN%" badge and alternatives get an "also possible" badge — so
 * chatting visibly updates the options here.
 */
export default function CareNeedButtons({
  careNeeds,
  mvp,
  selected,
  onSelect,
  suggestedKey = null,
  suggestedConfidence = null,
  alternativeKeys = [],
}: CareNeedButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Choose the care type you need">
      {careNeeds.map((need) => {
        const isSelected = selected === need.key;
        const isMvp = mvp.includes(need.key);
        const isEmergency = need.emergency;
        const isSuggested = suggestedKey === need.key;
        const isAlternative = !isSuggested && alternativeKeys.includes(need.key);
        const pct =
          typeof suggestedConfidence === "number" ? Math.round(suggestedConfidence * 100) : null;

        return (
          <button
            key={need.key}
            type="button"
            onClick={() => onSelect(need.key)}
            aria-pressed={isSelected}
            className={cn(
              "relative flex min-h-[84px] flex-col items-start justify-center gap-1.5 rounded-2xl border-2 px-4 py-3 text-left font-semibold shadow-sm transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isEmergency
                ? isSelected
                  ? "border-evidence-contradictory bg-evidence-contradictory text-white focus-visible:ring-evidence-contradictory"
                  : "border-evidence-contradictory/60 bg-evidence-contradictory/10 text-evidence-contradictory focus-visible:ring-evidence-contradictory"
                : isSelected
                  ? "border-navy bg-navy text-white focus-visible:ring-navy"
                  : isSuggested
                    ? "border-satya bg-satya/10 text-navy ring-2 ring-satya/40 focus-visible:ring-satya"
                    : "border-navy/15 bg-white text-navy hover:border-navy/40 focus-visible:ring-navy"
            )}
          >
            {/* Badge row — laid out in flow (no absolute overlap with the label). */}
            <span className="flex w-full flex-wrap items-center gap-1.5 leading-none">
              {isEmergency && (
                <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                  Emergency
                </span>
              )}
              {isSuggested && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    isSelected ? "bg-white/20 text-white" : "bg-satya text-white"
                  )}
                >
                  <Sparkles size={10} aria-hidden="true" />
                  AI{pct !== null ? ` · ${pct}%` : ""}
                </span>
              )}
              {isAlternative && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    isSelected ? "bg-white/20 text-white" : "bg-navy/10 text-navy/70"
                  )}
                >
                  also possible
                </span>
              )}
              {isMvp && !isEmergency && !isSuggested && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    isSelected ? "bg-white/20 text-white" : "bg-gold/20 text-gold"
                  )}
                >
                  Best supported
                </span>
              )}
            </span>
            <span className="text-base leading-tight">{need.label}</span>
          </button>
        );
      })}
    </div>
  );
}
