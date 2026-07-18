import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, saveFacility } from "@/lib/api";
import { addSavedMirror, findCachedFacility, getCachedShortlist, isFacilitySaved } from "@/lib/store";
import {
  desertTypeExplainer,
  desertVisual,
  formatDistance,
  formatPercent,
  tierLabel,
  titleCaseSpecialty,
} from "@/lib/format";
import EvidenceBadge from "@/components/EvidenceBadge";
import Toast, { type ToastMessage } from "@/components/Toast";

export default function FacilityPassport() {
  const { id } = useParams<{ id: string }>();
  const result = id ? findCachedFacility(id) : null;

  const [saved, setSaved] = useState(() => (id ? isFacilitySaved(id) : false));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  if (!result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-navy">We don't have this facility cached</h1>
        <p className="mt-2 text-navy/60">
          Trust Passports are opened from a search result. Please start a new search and select
          "Why this?" on a facility card.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block min-h-[44px] rounded-xl bg-navy px-5 py-3 font-semibold text-white"
        >
          ← Back to search
        </Link>
      </div>
    );
  }

  const { evidence, desert } = result;
  const visual = desertVisual(desert.color);
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
      <Link to="/" className="text-sm font-semibold text-navy/60 underline">
        ← Back to search
      </Link>

      <header className="mt-3">
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
        <h1 className="mt-1 text-2xl font-bold leading-tight text-navy">{result.name}</h1>
        {addressLine && <p className="mt-1 text-sm text-navy/60">{addressLine}</p>}
        <p className="text-sm font-medium text-navy/70">{formatDistance(result.distance_km)}</p>
      </header>

      {/* Action bar */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <a
          href={phone ? `tel:${phone}` : undefined}
          className={`flex min-h-[48px] items-center justify-center rounded-xl border font-semibold ${
            phone ? "border-satya bg-satya text-white" : "cursor-not-allowed border-navy/10 bg-navy/5 text-navy/30"
          }`}
          onClick={(e) => {
            if (!phone) e.preventDefault();
          }}
        >
          Call
        </a>
        <a
          href={gmapsUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={`flex min-h-[48px] items-center justify-center rounded-xl border font-semibold ${
            gmapsUrl ? "border-navy/20 text-navy hover:bg-navy/5" : "cursor-not-allowed border-navy/10 text-navy/30"
          }`}
          onClick={(e) => {
            if (!gmapsUrl) e.preventDefault();
          }}
        >
          Directions
        </a>
        <button
          type="button"
          onClick={handleSave}
          disabled={saved || saving}
          className={`flex min-h-[48px] items-center justify-center rounded-xl border font-semibold ${
            saved ? "border-gold/40 bg-gold/10 text-gold" : "border-navy/20 text-navy hover:bg-navy/5"
          }`}
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </button>
      </div>
      {appleMapsUrl && (
        <a href={appleMapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-navy/50 underline">
          Open in Apple Maps
        </a>
      )}

      {/* Evidence status */}
      <section className="mt-6 rounded-2xl border border-navy/15 bg-white p-4">
        <h2 className="text-base font-bold text-navy">Evidence status</h2>
        <div className="mt-2">
          <EvidenceBadge status={evidence.status} label={evidence.status_label} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-navy/50">Care evidence score</dt>
            <dd className="font-semibold text-navy">{formatPercent(evidence.care_evidence)}</dd>
          </div>
          <div>
            <dt className="text-navy/50">Data confidence</dt>
            <dd className="font-semibold text-navy">{formatPercent(evidence.data_confidence)}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">
            Support signals
          </p>
          <ul className="mt-1 flex flex-wrap gap-2 text-xs">
            {(["equipment", "procedure", "specialty"] as const).map((axis) => (
              <li
                key={axis}
                className={`rounded-full border px-2 py-1 font-semibold ${
                  evidence.support_axes[axis]
                    ? "border-evidence-strong/40 bg-evidence-strong/10 text-evidence-strong"
                    : "border-evidence-unknown/40 bg-evidence-unknown/10 text-evidence-unknown"
                }`}
              >
                {evidence.support_axes[axis] ? "✓" : "✕"} {axis}
              </li>
            ))}
          </ul>
        </div>
        {result.specialties.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">
              Listed specialties
            </p>
            <p className="mt-1 text-sm text-navy/80">
              {result.specialties.map(titleCaseSpecialty).join(", ")}
            </p>
          </div>
        )}
      </section>

      {/* Contradictions — prominent if present */}
      {evidence.contradictions.length > 0 && (
        <section className="mt-4 rounded-2xl border-2 border-evidence-contradictory bg-evidence-contradictory/10 p-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-evidence-contradictory">
            <span aria-hidden="true">!</span> Contradictory evidence
          </h2>
          <p className="mt-1 text-sm text-evidence-contradictory/90">
            Some sources conflict about this care type. Verify directly before travelling.
          </p>
          <ul className="mt-2 space-y-2">
            {evidence.contradictions.map((c, i) => (
              <li key={i} className="rounded-lg bg-white/70 p-2 text-sm text-navy">
                <span className="font-semibold capitalize">{c.field}:</span> "{c.text}"
                <span className="ml-1 text-xs text-navy/50">(matched: {c.matched})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Citations as receipts */}
      <section className="mt-4 rounded-2xl border border-navy/15 bg-white p-4">
        <h2 className="text-base font-bold text-navy">Citations — the receipts</h2>
        <p className="mt-1 text-xs text-navy/60">
          Every claim below is traceable to exact text found for this facility.
        </p>
        {evidence.citations.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {evidence.citations.map((c, i) => (
              <li key={i} className="rounded-lg border border-navy/10 bg-warm p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy/70">
                    {c.field}
                  </span>
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
                    {c.role}
                  </span>
                  <span className="text-[10px] text-navy/40">matched "{c.matched}"</span>
                </div>
                <p className="mt-1.5 text-navy/90">"{c.text}"</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-navy/60">No supporting citations found.</p>
        )}

        {evidence.missing.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">
              What we could not confirm
            </p>
            <p className="mt-1 text-sm text-navy/70">
              {evidence.missing
                .map((m) => m.replace(/_/g, " "))
                .join(", ")}
            </p>
          </div>
        )}
      </section>

      {/* Desert classification */}
      <section className={`mt-4 rounded-2xl border-2 p-4 ${visual.borderClass} ${visual.bgClass}`}>
        <h2 className={`flex items-center gap-2 text-base font-bold ${visual.colorClass}`}>
          <span aria-hidden="true">{visual.icon}</span> {desert.label}
        </h2>
        <p className="mt-1 text-sm text-navy/80">{desert.meaning}</p>
        <p className="mt-1 text-xs text-navy/60">{desertTypeExplainer(desert.type)}</p>
      </section>

      {/* Call-before-travel checklist */}
      {result.call_checklist.length > 0 && (
        <section className="mt-4 rounded-2xl border border-navy/15 bg-white p-4">
          <h2 className="text-base font-bold text-navy">Before you travel — call and confirm</h2>
          <p className="mt-1 text-xs text-navy/60">
            We cannot know current bed availability, staffing, or admission status. Confirm by
            phone before travelling.
          </p>
          <ul className="mt-2 space-y-2">
            {result.call_checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-navy">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 border-navy/30 text-xs"
                >
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sources */}
      <section className="mt-4 rounded-2xl border border-navy/15 bg-white p-4">
        <h2 className="text-base font-bold text-navy">
          Sources — {result.source_urls.length} receipt{result.source_urls.length === 1 ? "" : "s"}
        </h2>
        {result.source_urls.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {result.source_urls.map((url, i) => (
              <li key={i} className="truncate text-sm">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-navy underline hover:text-navy/70"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-navy/60">No source URLs recorded.</p>
        )}
      </section>

      {/* Freshness */}
      <section className="mt-4 rounded-2xl border border-navy/15 bg-warm p-4 text-sm text-navy/80">
        <p>
          <strong>Information recency:</strong> {result.scores.freshness_label}.{" "}
          {result.freshness.page_update && <>Page last updated {result.freshness.page_update}. </>}
          {result.freshness.last_social_post && (
            <>Last social post {result.freshness.last_social_post}. </>
          )}
          Confirm current operation before travelling — we never present bed availability or
          admission as fact.
        </p>
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
