import type { CareNeed } from "@/lib/api";

interface CareNeedButtonsProps {
  careNeeds: CareNeed[];
  mvp: string[];
  selected: string | null;
  onSelect: (key: string) => void;
}

/**
 * The 7 big care-type buttons. MVP-supported ones (icu/nicu) are visually
 * highlighted as "best supported". The emergency button is visually
 * distinct (red) so it stands out but never blocks the flow.
 */
export default function CareNeedButtons({
  careNeeds,
  mvp,
  selected,
  onSelect,
}: CareNeedButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Choose the care type you need">
      {careNeeds.map((need) => {
        const isSelected = selected === need.key;
        const isMvp = mvp.includes(need.key);
        const isEmergency = need.emergency;

        let classes =
          "relative flex min-h-[76px] flex-col items-start justify-center gap-1 rounded-2xl border-2 px-4 py-3 text-left font-semibold shadow-sm transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ";

        if (isEmergency) {
          classes += isSelected
            ? "border-evidence-contradictory bg-evidence-contradictory text-white focus-visible:ring-evidence-contradictory"
            : "border-evidence-contradictory/60 bg-evidence-contradictory/10 text-evidence-contradictory focus-visible:ring-evidence-contradictory";
        } else if (isSelected) {
          classes += "border-navy bg-navy text-white focus-visible:ring-navy";
        } else {
          classes += "border-navy/15 bg-white text-navy hover:border-navy/40 focus-visible:ring-navy";
        }

        return (
          <button
            key={need.key}
            type="button"
            onClick={() => onSelect(need.key)}
            aria-pressed={isSelected}
            className={classes}
          >
            {isMvp && !isEmergency && (
              <span
                className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  isSelected ? "bg-white/20 text-white" : "bg-gold/20 text-gold"
                }`}
              >
                Best supported
              </span>
            )}
            {isEmergency && (
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                Emergency
              </span>
            )}
            <span className="text-base leading-tight">{need.label}</span>
          </button>
        );
      })}
    </div>
  );
}
