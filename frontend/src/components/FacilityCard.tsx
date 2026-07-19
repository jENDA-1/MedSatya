import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Bookmark, Check, HelpCircle, Navigation, Phone } from "lucide-react";
import { ApiError, saveFacility, type ShortlistResult } from "@/lib/api";
import { addSavedMirror, isFacilitySaved } from "@/lib/store";
import { formatDistance, tierLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/a11y";
import { buttonVariants } from "@/components/ui/button";
import TrustMeter from "@/components/TrustMeter";
import DesertBadge from "./DesertBadge";

// Shared action-tile styling: overrides the button base's horizontal row into a
// vertical icon-above-label stack with a uniform height, so all 4 actions line up
// and nothing overflows in the narrow tiles (mobile 2-col ~175px, desktop 4-col
// sidebar ~85px) — even at A+/A++ font scaling. tailwind-merge dedupes against the
// button variant (flex-col over the base row, gap-1←gap-2, px-1.5←px-4, text-xs←text-sm,
// min-h-[60px]←min-h-[44px]). Keep these overrides here, not in ui/button.tsx.
const ACTION_TILE =
  "h-auto min-h-[60px] flex-col gap-1 px-1.5 py-2 text-xs font-semibold leading-tight text-center whitespace-normal";

interface FacilityCardProps {
  result: ShortlistResult;
  careNeed: string;
  careNeedLabel: string;
  highlighted?: boolean;
  onNotify?: (text: string, kind: "success" | "error") => void;
  /** 1-based position in the recommendation ladder (server's band-first order). */
  rank?: number;
  /** "hero" showcases rank #1 as the best-evidenced pick; "list" (default) is the standard ladder card. */
  variant?: "hero" | "list";
}

export default function FacilityCard({
  result,
  careNeed,
  careNeedLabel,
  highlighted = false,
  onNotify,
  rank,
  variant = "list",
}: FacilityCardProps) {
  const [saved, setSaved] = useState(() => isFacilitySaved(result.unique_id));
  const [saving, setSaving] = useState(false);
  // True only right after a successful handleSave in this session — drives the
  // one-time "pop" confirmation without re-animating a facility that was
  // already saved on page load.
  const [justSaved, setJustSaved] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  const phone = result.phones[0] ?? null;
  const hasCoords = result.coord_valid && result.latitude !== null && result.longitude !== null;
  const gmapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${result.latitude},${result.longitude}`
    : null;
  const appleMapsUrl = hasCoords
    ? `https://maps.apple.com/?daddr=${result.latitude},${result.longitude}`
    : null;

  const topCitations = result.evidence.citations.slice(0, 2);
  const tier = tierLabel(result.tier);
  const addressLine = [result.address.line1, result.address.city, result.address.state]
    .filter(Boolean)
    .join(", ");
  const isHero = variant === "hero";

  async function handleSave() {
    if (saved || saving) return;
    setSaving(true);
    const payload = {
      care_need: careNeed,
      care_need_label: careNeedLabel,
      note: null,
      facility: {
        unique_id: result.unique_id,
        name: result.name,
        address: result.address,
        phones: result.phones,
        distance_km: result.distance_km,
        band: result.band,
        band_label: result.evidence.status_label,
        latitude: result.latitude,
        longitude: result.longitude,
      },
    };
    try {
      const res = await saveFacility(payload);
      addSavedMirror({ ...payload, id: res.id, created_at: res.created_at });
      setSaved(true);
      setJustSaved(true);
      onNotify?.(`Saved ${result.name}.`, "success");
    } catch (err) {
      // Mirror locally even if the backend save fails, so the UI stays usable.
      addSavedMirror({
        ...payload,
        id: `local-${result.unique_id}-${Date.now()}`,
        created_at: new Date().toISOString(),
      });
      setSaved(true);
      setJustSaved(true);
      const message = err instanceof ApiError ? err.message : "Saved locally only — server unreachable.";
      onNotify?.(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      id={`facility-${result.unique_id}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border-2 bg-surface p-4 shadow-soft",
        "transition-[transform,box-shadow] duration-200 ease-out hover:shadow-lift",
        !reduceMotion && "hover:-translate-y-0.5",
        isHero
          ? "border-satya bg-gradient-to-br from-satya/10 via-surface to-surface ring-2 ring-satya/30"
          : "border-line",
        // Marker-click highlight always wins the border/ring colour, hero or not.
        highlighted && "border-navy ring-2 ring-navy/40",
      )}
    >
      {isHero && (
        <div className="mb-2 flex items-center gap-1.5">
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-satya text-xs font-extrabold text-white"
            aria-hidden="true"
          >
            {rank ?? 1}
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-satya">
            Best-evidenced nearby
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!isHero && rank !== undefined && (
              <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                #{rank}
              </span>
            )}
            {result.is_nearest && (
              <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Nearest
              </span>
            )}
            {tier && (
              <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
                {tier}
              </span>
            )}
          </div>
          <h3
            className={cn(
              "mt-1 font-bold leading-tight text-navy",
              isHero ? "text-xl" : "text-lg",
            )}
          >
            {result.name}
          </h3>
          {addressLine && <p className="text-sm text-ink-muted">{addressLine}</p>}
          <p className="text-sm font-medium text-ink-muted">{formatDistance(result.distance_km)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TrustMeter
          status={result.evidence.status}
          careEvidence={result.evidence.care_evidence}
          size="sm"
          showLabel
        />
        <DesertBadge desert={result.desert} />
      </div>

      {topCitations.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-line pl-3 text-xs text-ink-muted">
          {topCitations.map((c, i) => (
            <li key={i}>
              <span className="font-semibold capitalize text-ink">{c.field}:</span> "{c.text}"
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <a
          href={phone ? `tel:${phone}` : undefined}
          aria-disabled={!phone}
          className={cn(
            buttonVariants({ variant: phone ? "primary" : "outline", size: "md" }),
            ACTION_TILE,
            !phone && "pointer-events-none cursor-not-allowed opacity-50",
          )}
          onClick={(e) => {
            if (!phone) e.preventDefault();
          }}
        >
          <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
          Call
        </a>
        <a
          href={gmapsUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!gmapsUrl}
          className={cn(
            buttonVariants({ variant: "outline", size: "md" }),
            ACTION_TILE,
            !gmapsUrl && "pointer-events-none cursor-not-allowed opacity-50",
          )}
          onClick={(e) => {
            if (!gmapsUrl) e.preventDefault();
          }}
        >
          <Navigation className="h-5 w-5 shrink-0" aria-hidden="true" />
          Directions
        </a>
        <button
          type="button"
          onClick={handleSave}
          disabled={saved || saving}
          className={cn(
            buttonVariants({ variant: saved ? "subtle" : "outline", size: "md" }),
            ACTION_TILE,
            saved && "border border-satya/30 bg-satya/10 text-satya disabled:opacity-100",
          )}
        >
          {saved ? (
            reduceMotion || !justSaved ? (
              <span className="flex flex-col items-center gap-1">
                <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
                Saved
              </span>
            ) : (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="flex flex-col items-center gap-1"
              >
                <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
                Saved
              </motion.span>
            )
          ) : saving ? (
            "Saving…"
          ) : (
            <span className="flex flex-col items-center gap-1">
              <Bookmark className="h-5 w-5 shrink-0" aria-hidden="true" />
              Save
            </span>
          )}
        </button>
        <Link
          to={`/facility/${encodeURIComponent(result.unique_id)}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "md" }),
            ACTION_TILE,
          )}
        >
          <HelpCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          Why this?
        </Link>
      </div>
      {appleMapsUrl && (
        <a
          href={appleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block rounded text-xs font-medium text-ink-muted underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Open in Apple Maps
        </a>
      )}
      {!hasCoords && (
        <p className="mt-2 text-xs text-evidence-unknown">
          Location coordinates unavailable — not shown on the map.
        </p>
      )}
    </article>
  );
}
