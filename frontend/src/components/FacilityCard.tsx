import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, saveFacility, type ShortlistResult } from "@/lib/api";
import { addSavedMirror, isFacilitySaved } from "@/lib/store";
import { formatDistance, tierLabel } from "@/lib/format";
import EvidenceBadge from "./EvidenceBadge";
import DesertBadge from "./DesertBadge";

interface FacilityCardProps {
  result: ShortlistResult;
  careNeed: string;
  careNeedLabel: string;
  highlighted?: boolean;
  onNotify?: (text: string, kind: "success" | "error") => void;
}

export default function FacilityCard({
  result,
  careNeed,
  careNeedLabel,
  highlighted = false,
  onNotify,
}: FacilityCardProps) {
  const [saved, setSaved] = useState(() => isFacilitySaved(result.unique_id));
  const [saving, setSaving] = useState(false);

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
      onNotify?.(`Saved ${result.name}.`, "success");
    } catch (err) {
      // Mirror locally even if the backend save fails, so the UI stays usable.
      addSavedMirror({
        ...payload,
        id: `local-${result.unique_id}-${Date.now()}`,
        created_at: new Date().toISOString(),
      });
      setSaved(true);
      const message = err instanceof ApiError ? err.message : "Saved locally only — server unreachable.";
      onNotify?.(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      id={`facility-${result.unique_id}`}
      className={`scroll-mt-24 rounded-2xl border-2 bg-white p-4 shadow-sm transition ${
        highlighted ? "border-navy ring-2 ring-navy/30" : "border-navy/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
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
          <h3 className="mt-1 text-lg font-bold leading-tight text-navy">{result.name}</h3>
          {addressLine && <p className="text-sm text-navy/60">{addressLine}</p>}
          <p className="text-sm font-medium text-navy/70">{formatDistance(result.distance_km)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <EvidenceBadge status={result.evidence.status} label={result.evidence.status_label} size="sm" />
        <DesertBadge desert={result.desert} />
      </div>

      {topCitations.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-navy/10 pl-3 text-xs text-navy/70">
          {topCitations.map((c, i) => (
            <li key={i}>
              <span className="font-semibold capitalize">{c.field}:</span> "{c.text}"
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <a
          href={phone ? `tel:${phone}` : undefined}
          aria-disabled={!phone}
          className={`flex min-h-[44px] items-center justify-center rounded-xl border font-semibold ${
            phone
              ? "border-satya bg-satya text-white"
              : "cursor-not-allowed border-navy/10 bg-navy/5 text-navy/30"
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
          aria-disabled={!gmapsUrl}
          className={`flex min-h-[44px] items-center justify-center rounded-xl border font-semibold ${
            gmapsUrl
              ? "border-navy/20 text-navy hover:bg-navy/5"
              : "cursor-not-allowed border-navy/10 text-navy/30"
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
          className={`flex min-h-[44px] items-center justify-center rounded-xl border font-semibold ${
            saved
              ? "border-gold/40 bg-gold/10 text-gold"
              : "border-navy/20 text-navy hover:bg-navy/5"
          }`}
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </button>
        <Link
          to={`/facility/${encodeURIComponent(result.unique_id)}`}
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-navy/20 font-semibold text-navy hover:bg-navy/5"
        >
          Why this?
        </Link>
      </div>
      {appleMapsUrl && (
        <a
          href={appleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs font-medium text-navy/50 underline"
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
