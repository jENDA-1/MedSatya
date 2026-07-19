import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Clock,
  ExternalLink,
  ListChecks,
  Navigation,
  Phone,
  Stethoscope,
} from "lucide-react";
import { ApiError, saveFacility } from "@/lib/api";
import { addSavedMirror, findCachedFacility, getCachedShortlist, isFacilitySaved } from "@/lib/store";
import {
  desertTypeExplainer,
  formatDistance,
  formatPercent,
  tierLabel,
  titleCaseSpecialty,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/a11y";
import { Button, buttonVariants } from "@/components/ui/button";
import TrustMeter from "@/components/TrustMeter";
import Receipts from "@/components/Receipts";
import DesertBadge from "@/components/DesertBadge";
import Toast, { type ToastMessage } from "@/components/Toast";

const CARD = "rounded-2xl border border-line bg-surface p-5 shadow-soft";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/** Motion-gated entrance wrapper — renders statically when the user prefers reduced motion. */
function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduceMotion = usePrefersReducedMotion();
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function FacilityPassport() {
  const { id } = useParams<{ id: string }>();
  const result = id ? findCachedFacility(id) : null;

  const [saved, setSaved] = useState(() => (id ? isFacilitySaved(id) : false));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  if (!result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-ink">We don't have this facility cached</h1>
        <p className="mt-2 text-ink-muted">
          Trust Passports are opened from a search result. Please start a new search and select
          "Why this?" on a facility card.
        </p>
        <Link
          to="/"
          className={cn(buttonVariants({ variant: "navy", size: "lg" }), "mt-6 inline-flex")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to search
        </Link>
      </div>
    );
  }

  const { evidence, desert } = result;
  const careNeedLabel = getCachedShortlist()?.careNeedLabel ?? evidence.care_need;
  const hasCoords = result.coord_valid && result.latitude !== null && result.longitude !== null;
  const gmapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${result.latitude},${result.longitude}`
    : null;
  const appleMapsUrl = hasCoords
    ? `https://maps.apple.com/?daddr=${result.latitude},${result.longitude}`
    : null;
  const phone = result.phones[0] ?? null;
  const addressLine = [result.address.line1, result.address.city, result.address.state, result.address.pincode]
    .filter(Boolean)
    .join(", ");
  const tier = tierLabel(result.tier);
  const sourceUrls = evidence.source_urls.length > 0 ? evidence.source_urls : result.source_urls;

  async function handleSave() {
    if (saved || saving || !result) return;
    setSaving(true);
    const payload = {
      care_need: evidence.care_need,
      care_need_label: careNeedLabel,
      note: null,
      facility: {
        unique_id: result.unique_id,
        name: result.name,
        address: result.address,
        phones: result.phones,
        distance_km: result.distance_km,
        band: result.band,
        band_label: evidence.status_label,
        latitude: result.latitude,
        longitude: result.longitude,
      },
    };
    try {
      const res = await saveFacility(payload);
      addSavedMirror({ ...payload, id: res.id, created_at: res.created_at });
      setSaved(true);
      setToast({ text: `Saved ${result.name}.`, kind: "success" });
    } catch (err) {
      addSavedMirror({
        ...payload,
        id: `local-${result.unique_id}-${Date.now()}`,
        created_at: new Date().toISOString(),
      });
      setSaved(true);
      setToast({
        text: err instanceof ApiError ? err.message : "Saved locally only — server unreachable.",
        kind: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded text-sm font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to search
      </Link>

      <Reveal className="mt-3">
        <header>
          <div className="flex flex-wrap items-center gap-1.5">
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
          <h1 className="mt-1 text-2xl font-bold leading-tight text-ink">{result.name}</h1>
          {addressLine && <p className="mt-1 text-sm text-ink-muted">{addressLine}</p>}
          <p className="text-sm font-medium text-ink-muted">{formatDistance(result.distance_km)}</p>
        </header>
      </Reveal>

      {/* Action bar */}
      <Reveal delay={0.05} className="mt-4">
        <div className="grid grid-cols-3 gap-2">
          <a
            href={phone ? `tel:${phone}` : undefined}
            aria-disabled={!phone}
            className={cn(
              buttonVariants({ variant: "primary", size: "lg" }),
              !phone && "pointer-events-none cursor-not-allowed opacity-40",
            )}
            onClick={(e) => {
              if (!phone) e.preventDefault();
            }}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            Call
          </a>
          <a
            href={gmapsUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!gmapsUrl}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              !gmapsUrl && "pointer-events-none cursor-not-allowed opacity-40",
            )}
            onClick={(e) => {
              if (!gmapsUrl) e.preventDefault();
            }}
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Directions
          </a>
          <Button
            variant={saved ? "gold" : "outline"}
            size="lg"
            onClick={handleSave}
            disabled={saved || saving}
          >
            {saved ? (
              <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            )}
            {saved ? "Saved" : saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {appleMapsUrl && (
          <a
            href={appleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted underline hover:text-ink"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Open in Apple Maps
          </a>
        )}
      </Reveal>

      {/* Trust semafor hero + evidence detail */}
      <Reveal delay={0.1} className="mt-6">
        <section className={CARD}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Evidence for {careNeedLabel}
          </h2>
          <div className="mt-2">
            <TrustMeter status={evidence.status} size="lg" showLabel showCaption />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-muted">Evidence strength</dt>
              <dd className="font-semibold text-ink">{formatPercent(evidence.care_evidence)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Data confidence</dt>
              <dd className="font-semibold text-ink">{formatPercent(evidence.data_confidence)}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Support signals</p>
            <ul className="mt-1.5 flex flex-wrap gap-2 text-xs">
              {(["equipment", "procedure", "specialty"] as const).map((axis) => (
                <li
                  key={axis}
                  className={cn(
                    "rounded-full border px-2 py-1 font-semibold",
                    evidence.support_axes[axis]
                      ? "border-evidence-strong/40 bg-evidence-strong/10 text-evidence-strong"
                      : "border-evidence-unknown/40 bg-evidence-unknown/10 text-evidence-unknown",
                  )}
                >
                  {evidence.support_axes[axis] ? "✓" : "✕"} {axis}
                </li>
              ))}
            </ul>
          </div>

          {result.specialties.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                Listed specialties
              </p>
              <p className="mt-1 text-sm text-ink/90">
                {result.specialties.map(titleCaseSpecialty).join(", ")}
              </p>
            </div>
          )}

          {evidence.missing.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                What we could not confirm
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {evidence.missing.map((m) => m.replace(/_/g, " ")).join(", ")}
              </p>
            </div>
          )}
        </section>
      </Reveal>

      {/* Desert classification */}
      <Reveal delay={0.15} className="mt-4">
        <section className={CARD}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Desert classification
          </h2>
          <div className="mt-2">
            <DesertBadge desert={desert} />
          </div>
          <p className="mt-2 text-sm text-ink-muted">{desertTypeExplainer(desert.type)}</p>
        </section>
      </Reveal>

      {/* Call-before-travel checklist */}
      {result.call_checklist.length > 0 && (
        <Reveal delay={0.2} className="mt-4">
          <section className={CARD}>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <ListChecks className="h-5 w-5 text-satya" aria-hidden="true" />
              Before you travel — call and confirm
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              We cannot know current bed availability, staffing, or admission status. Confirm by
              phone before travelling.
            </p>
            <ul className="mt-3 space-y-2">
              {result.call_checklist.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 border-line text-xs font-semibold text-ink-muted"
                  >
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      {/* Receipts — citations, contradictions, sources */}
      <Reveal delay={0.25} className="mt-4">
        <section>
          <h2 className="mb-2 text-base font-bold text-ink">Citations — the receipts</h2>
          <p className="mb-3 text-xs text-ink-muted">
            Every claim below is traceable to exact text found for this facility.
          </p>
          <Receipts
            citations={evidence.citations}
            contradictions={evidence.contradictions}
            sourceUrls={sourceUrls}
          />
        </section>
      </Reveal>

      {/* Freshness */}
      <Reveal delay={0.3} className="mt-4">
        <section className={cn(CARD, "flex items-start gap-3 text-sm text-ink-muted")}>
          <Clock className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <p>
            <strong className="text-ink">Information recency:</strong> {result.scores.freshness_label}.{" "}
            {result.freshness.page_update && <>Page last updated {result.freshness.page_update}. </>}
            {result.freshness.last_social_post && (
              <>Last social post {result.freshness.last_social_post}. </>
            )}
            Confirm current operation before travelling — we never present bed availability or
            admission as fact.
          </p>
        </section>
      </Reveal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
