import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";
import { Loader2, Map as MapIcon, MapPin, Stethoscope } from "lucide-react";
import type { AreaSummary, EvidenceStatus, ShortlistResult } from "@/lib/api";
import type { LatLon } from "@/lib/geo";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import FacilityCard from "@/components/FacilityCard";
import TrustLegend from "@/components/TrustLegend";
import VerificationSequence from "@/components/VerificationSequence";

// Code-split the map (maplibre-gl is heavy) — only loads when results are shown.
const MapView = lazy(() => import("@/components/MapView"));

interface ResultsViewProps {
  results: ShortlistResult[];
  userLocation: LatLon;
  careNeed: string;
  careNeedLabel: string;
  areaSummary: AreaSummary;
  isEmergency: boolean;
  loading: boolean;
  onNotify: (text: string, kind: "success" | "error") => void;
  onChangeCareType: () => void;
  onChangeLocation: () => void;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof matchMedia !== "undefined" && matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

function MapFallback() {
  return (
    <div className="grid h-full w-full place-items-center bg-surface-raised text-ink-muted">
      <span className="inline-flex items-center gap-2 text-sm">
        <Loader2 className="animate-spin" size={16} aria-hidden="true" /> Loading map…
      </span>
    </div>
  );
}

/**
 * Compact stacked semafor bar — the area's evidence mix at a glance, so it
 * reads as "not all green" immediately. Reuses the same evidence colour
 * tokens as TrustMeter (bg-evidence-*): green=evidenced (strongly + partially
 * supported), gold=claim-only, red=contradictory, grey=unknown.
 */
function EvidenceDistributionBar({ s }: { s: AreaSummary }) {
  const total = Math.max(s.total, 1);
  const segments: { count: number; className: string }[] = [
    { count: s.evidenced, className: "bg-evidence-strong" },
    { count: s.claim_only, className: "bg-evidence-claim" },
    { count: s.contradictory, className: "bg-evidence-contradictory" },
    { count: s.unknown, className: "bg-evidence-unknown" },
  ];
  return (
    <div
      role="img"
      aria-label={`Evidence mix: ${s.evidenced} of ${s.total} evidenced, ${s.claim_only} claim-only, ${s.contradictory} contradictory, ${s.unknown} unknown`}
      className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-ink/10"
    >
      {segments.map((seg, i) =>
        seg.count > 0 ? (
          <span
            key={i}
            aria-hidden="true"
            className={seg.className}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

/** Honesty-first summary of the area (what we don't know vs. what's likely absent). */
function AreaSummaryCard({ s, label }: { s: AreaSummary; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-3 text-sm text-ink">
      <p>
        Of <strong>{s.total}</strong> facilities that claim {label} nearby,{" "}
        <strong>{s.claim_only}</strong> are unsupported claims
        {s.contradictory > 0 && (
          <>
            {" "}
            and <strong>{s.contradictory}</strong> have contradictory evidence
          </>
        )}{" "}
        — we show the evidence for each below.
      </p>
      <EvidenceDistributionBar s={s} />
      <p className="mt-1.5 text-xs text-ink-muted">
        {s.evidenced} evidenced · {s.claim_only} claim-only · {s.contradictory} contradictory ·{" "}
        {s.unknown} unknown
      </p>
    </div>
  );
}

type EvidenceFilter = "all" | "evidenced" | "needs_verification";

const EVIDENCED: EvidenceStatus[] = ["strongly_supported", "partially_supported"];

const FILTER_OPTIONS: { value: EvidenceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "evidenced", label: "Strong evidence" },
  { value: "needs_verification", label: "Needs verification" },
];

/**
 * Client-side filter only — never reorders `results` (the server's band-first
 * ranking is the honest order) and never silently drops facilities from the
 * underlying list. Defaults to "All" so weak-evidence facilities are shown
 * unless the user explicitly narrows the view.
 */
function EvidenceFilterToggle({
  value,
  onChange,
}: {
  value: EvidenceFilter;
  onChange: (v: EvidenceFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter by evidence strength" className="flex flex-wrap gap-1.5">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            value === opt.value
              ? "border-navy bg-navy text-white"
              : "border-line bg-surface text-ink-muted hover:bg-surface-raised",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ChangeControls({
  onChangeCareType,
  onChangeLocation,
}: Pick<ResultsViewProps, "onChangeCareType" | "onChangeLocation">) {
  return (
    // data-vaul-no-drag: inside the mobile Vaul sheet header these buttons sit in a
    // draggable region — without this, a tap is swallowed as a drag start and onClick
    // (setStep) never fires. Vaul 1.1.2 walks element.closest('[data-vaul-no-drag]'),
    // so the wrapper covers both buttons. Harmless on desktop (no Vaul there).
    <div className="flex flex-wrap gap-2" data-vaul-no-drag="">
      <Button variant="subtle" size="sm" onClick={onChangeCareType}>
        <Stethoscope size={15} aria-hidden="true" /> Change care type
      </Button>
      <Button variant="subtle" size="sm" onClick={onChangeLocation}>
        <MapPin size={15} aria-hidden="true" /> Change location
      </Button>
    </div>
  );
}

export default function ResultsView(props: ResultsViewProps) {
  const {
    results,
    userLocation,
    careNeed,
    careNeedLabel,
    areaSummary,
    isEmergency,
    loading,
    onNotify,
    onChangeCareType,
    onChangeLocation,
  } = props;
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snap, setSnap] = useState<number | string | null>("170px");
  // Client-side only — filters what's RENDERED, never reorders or drops
  // facilities from `results` itself (the server's band-first order stays
  // the source of truth). Defaults to "all" so weak-evidence facilities are
  // visible unless the user opts to narrow the view.
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("all");

  const filteredResults = useMemo(() => {
    if (evidenceFilter === "all") return results;
    if (evidenceFilter === "evidenced") {
      return results.filter((r) => EVIDENCED.includes(r.band));
    }
    return results.filter((r) => !EVIDENCED.includes(r.band));
  }, [results, evidenceFilter]);

  function handleMarkerClick(id: string) {
    setSelectedId(id);
    if (!isDesktop) setSnap(0.6);
    // Let the sheet/scroll settle, then bring the card into view.
    window.setTimeout(() => {
      document.getElementById(`facility-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 220);
  }

  const emergencyBanner = (isEmergency || false) && (
    <p
      role="alert"
      className="rounded-xl border border-evidence-contradictory/40 bg-evidence-contradictory/10 px-4 py-3 text-sm font-semibold text-evidence-contradictory"
    >
      In an emergency, call your local emergency services immediately. This list does not replace
      emergency care.
    </p>
  );

  const list = (
    <div className="space-y-3">
      {emergencyBanner}
      <AreaSummaryCard s={areaSummary} label={careNeedLabel} />
      <TrustLegend />
      {results.length > 0 && (
        <EvidenceFilterToggle value={evidenceFilter} onChange={setEvidenceFilter} />
      )}
      {results.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
          No facilities found nearby for this care type. Try a different location or care type.
        </p>
      ) : filteredResults.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
          No facilities match this filter.{" "}
          <button
            type="button"
            onClick={() => setEvidenceFilter("all")}
            className="font-semibold text-navy underline"
          >
            Show all {results.length}.
          </button>
        </p>
      ) : (
        (() => {
          // Honest ranking ladder over `filteredResults` (server's band-first order,
          // never reordered here): #1 is a showcase "hero" card, #2–#6 are the
          // regular ladder, and anything past #6 collapses behind a <details> so
          // the weakest-evidence facilities don't dominate the screen but stay
          // reachable — nothing is dropped, only progressively de-emphasised.
          const [hero, ...rest] = filteredResults;
          const ladder = rest.slice(0, 5);
          const tail = rest.slice(5);
          return (
            <>
              <FacilityCard
                key={hero.unique_id}
                result={hero}
                careNeed={careNeed}
                careNeedLabel={careNeedLabel}
                highlighted={hero.unique_id === selectedId}
                onNotify={onNotify}
                rank={1}
                variant="hero"
              />
              {ladder.map((r, i) => (
                <FacilityCard
                  key={r.unique_id}
                  result={r}
                  careNeed={careNeed}
                  careNeedLabel={careNeedLabel}
                  highlighted={r.unique_id === selectedId}
                  onNotify={onNotify}
                  rank={i + 2}
                  variant="list"
                />
              ))}
              {tail.length > 0 && (
                <details className="group rounded-xl border border-line bg-surface-raised p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-navy marker:hidden">
                    +{tail.length} more nearby — weaker or unverified evidence
                    <span
                      aria-hidden="true"
                      className="text-ink-muted transition-transform group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    {tail.map((r, i) => (
                      <FacilityCard
                        key={r.unique_id}
                        result={r}
                        careNeed={careNeed}
                        careNeedLabel={careNeedLabel}
                        highlighted={r.unique_id === selectedId}
                        onNotify={onNotify}
                        rank={i + 7}
                        variant="list"
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          );
        })()
      )}
    </div>
  );

  const mapEl = (
    <Suspense fallback={<MapFallback />}>
      <MapView
        results={results}
        userLocation={userLocation}
        selectedId={selectedId}
        onMarkerClick={handleMarkerClick}
        className="h-full w-full"
      />
    </Suspense>
  );

  // --- Desktop: map + sidebar list ----------------------------------------
  if (isDesktop) {
    return (
      <div className="space-y-3">
        <ChangeControls onChangeCareType={onChangeCareType} onChangeLocation={onChangeLocation} />
        <div className="grid grid-cols-[1fr_400px] gap-4">
          <div className="relative h-[72vh] overflow-hidden rounded-2xl border border-line">
            {mapEl}
          </div>
          <div className="h-[72vh] overflow-y-auto pr-1" data-tour="results-list">
            {loading ? <VerificationSequence active={loading} /> : list}
          </div>
        </div>
      </div>
    );
  }

  // --- Mobile: full-screen map + Vaul bottom sheet -------------------------
  return (
    <>
      {/* Full-bleed map fills the area between header and tab bar. */}
      <div className="fixed inset-x-0 bottom-0 top-14 z-20" aria-hidden={false}>
        {mapEl}
      </div>

      {loading && (
        <div className="fixed inset-x-0 top-20 z-30 mx-auto w-[min(92%,26rem)] px-2">
          <VerificationSequence active={loading} />
        </div>
      )}

      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        snapPoints={["170px", 0.6, 0.95]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <Drawer.Portal>
          <Drawer.Content
            data-tour="results-sheet"
            className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-full max-h-[95vh] max-w-2xl flex-col rounded-t-2xl border border-line bg-surface shadow-lift outline-none"
          >
            <div className="shrink-0 px-4 pt-2">
              <div
                className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-ink/20"
                aria-hidden="true"
              />
              <div className="flex items-center justify-between gap-2">
                <Drawer.Title className="flex items-center gap-2 text-base font-bold text-navy">
                  <MapIcon size={16} className="text-satya" aria-hidden="true" />
                  {results.length} {results.length === 1 ? "facility" : "facilities"}
                </Drawer.Title>
                <span className="text-xs text-ink-muted">Drag to see the list</span>
              </div>
              <Drawer.Description className="sr-only">
                Ranked, evidence-attached facilities for {careNeedLabel}. Drag the sheet up for the
                full list.
              </Drawer.Description>
              <div className="mt-2">
                <ChangeControls
                  onChangeCareType={onChangeCareType}
                  onChangeLocation={onChangeLocation}
                />
              </div>
            </div>
            <div className="mt-3 overflow-y-auto px-4 pb-28" data-tour="results-list">
              {loading ? <VerificationSequence active={loading} /> : list}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
