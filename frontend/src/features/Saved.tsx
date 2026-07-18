import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, deleteSaved, getSaved, type SavedItem } from "@/lib/api";
import { getSavedMirror, removeSavedMirror } from "@/lib/store";
import { formatDistance } from "@/lib/format";
import EvidenceBadge from "@/components/EvidenceBadge";
import Toast, { type ToastMessage } from "@/components/Toast";

function mergeWithMirror(serverItems: SavedItem[]): SavedItem[] {
  const mirror = getSavedMirror();
  const serverIds = new Set(serverItems.map((i) => `${i.facility.unique_id}:${i.care_need}`));
  const localOnly = mirror
    .filter((m) => !serverIds.has(`${m.facility.unique_id}:${m.care_need}`))
    .map((m) => ({
      id: m.id,
      created_at: m.created_at,
      care_need: m.care_need,
      care_need_label: m.care_need_label,
      note: m.note,
      facility: m.facility,
    }));
  return [...localOnly, ...serverItems];
}

export default function Saved() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    getSaved()
      .then((res) => setItems(mergeWithMirror(res.items)))
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? `${err.message} — showing locally saved facilities only.`
            : "Could not reach the server — showing locally saved facilities only."
        );
        const mirror = getSavedMirror();
        setItems(
          mirror.map((m) => ({
            id: m.id,
            created_at: m.created_at,
            care_need: m.care_need,
            care_need_label: m.care_need_label,
            note: m.note,
            facility: m.facility,
          }))
        );
      });
  }, []);

  async function handleDelete(item: SavedItem) {
    removeSavedMirror(item.id);
    setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    if (item.id.startsWith("local-")) return;
    try {
      await deleteSaved(item.id);
    } catch (err) {
      setToast({
        text: err instanceof ApiError ? err.message : "Could not delete on the server, but removed locally.",
        kind: "error",
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <Link to="/" className="text-sm font-semibold text-navy/60 underline">
        ← Back to search
      </Link>
      <h1 className="mt-3 text-xl font-bold text-navy">Saved facilities</h1>

      {error && (
        <p role="alert" className="mt-2 text-sm text-evidence-partial">
          {error}
        </p>
      )}

      {items === null && <p className="mt-4 text-sm text-navy/50">Loading…</p>}

      {items && items.length === 0 && (
        <p className="mt-4 text-sm text-navy/60">
          No saved facilities yet. Save one from a search result to see it here.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {items?.map((item) => {
          const addressLine = [item.facility.address.line1, item.facility.address.city, item.facility.address.state]
            .filter(Boolean)
            .join(", ");
          const phone = item.facility.phones[0] ?? null;
          const hasCoords = item.facility.latitude != null && item.facility.longitude != null;
          const gmapsUrl = hasCoords
            ? `https://www.google.com/maps/dir/?api=1&destination=${item.facility.latitude},${item.facility.longitude}`
            : null;
          return (
            <li key={item.id} className="rounded-2xl border border-navy/10 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-navy">{item.facility.name}</h2>
                  {addressLine && <p className="text-sm text-navy/60">{addressLine}</p>}
                  <p className="text-sm text-navy/60">{formatDistance(item.facility.distance_km)}</p>
                  <p className="mt-1 text-xs text-navy/50">Saved for {item.care_need_label}</p>
                </div>
              </div>
              <div className="mt-2">
                <EvidenceBadge status={item.facility.band} label={item.facility.band_label} size="sm" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <a
                  href={phone ? `tel:${phone}` : undefined}
                  className={`flex min-h-[44px] items-center justify-center rounded-xl border font-semibold ${
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
                  className={`flex min-h-[44px] items-center justify-center rounded-xl border font-semibold ${
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
                  onClick={() => handleDelete(item)}
                  className="flex min-h-[44px] items-center justify-center rounded-xl border border-evidence-contradictory/30 font-semibold text-evidence-contradictory hover:bg-evidence-contradictory/10"
                >
                  Remove
                </button>
              </div>
              <Link
                to={`/facility/${encodeURIComponent(item.facility.unique_id)}`}
                className="mt-2 inline-block text-xs font-semibold text-navy underline"
              >
                Why this result?
              </Link>
            </li>
          );
        })}
      </ul>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
