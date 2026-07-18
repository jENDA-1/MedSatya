import { useEffect, useState } from "react";
import {
  ApiError,
  getCareNeeds,
  getShortlist,
  type CareNeedsResponse,
  type ShortlistResponse,
} from "@/lib/api";
import { PRESET_CITIES, requestLocation, type LatLon } from "@/lib/geo";
import {
  getLastCareNeed,
  getLastLocation,
  setCachedShortlist,
  setLastCareNeed,
  setLastLocation,
} from "@/lib/store";
import CareNeedButtons from "@/components/CareNeedButtons";
import SymptomBox from "@/components/SymptomBox";
import FacilityCard from "@/components/FacilityCard";
import MapView from "@/components/MapView";
import LocationPicker from "@/components/LocationPicker";
import Toast, { type ToastMessage } from "@/components/Toast";

type Step = 1 | 2 | 3;

export default function FindCare() {
  const [step, setStep] = useState<Step>(1);
  const [hydrated, setHydrated] = useState(false);

  const [location, setLocation] = useState<LatLon | null>(() => getLastLocation());
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locatingBusy, setLocatingBusy] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [careNeedsData, setCareNeedsData] = useState<CareNeedsResponse | null>(null);
  const [careNeedsError, setCareNeedsError] = useState<string | null>(null);
  const [careNeed, setCareNeed] = useState<string | null>(() => getLastCareNeed());
  const [careNeedLabel, setCareNeedLabel] = useState<string | null>(null);
  const [isEmergency, setIsEmergency] = useState(false);

  const [shortlist, setShortlist] = useState<ShortlistResponse | null>(null);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = (text: string, kind: "success" | "error") => setToast({ text, kind });

  // Load care needs once on mount.
  useEffect(() => {
    getCareNeeds()
      .then(setCareNeedsData)
      .catch((err) =>
        setCareNeedsError(
          err instanceof ApiError ? err.message : "Could not load care types. Please retry."
        )
      );
  }, []);

  // Resolve the label for a hydrated/persisted care need once the list loads.
  useEffect(() => {
    if (!careNeedsData || !careNeed) return;
    const found = careNeedsData.care_needs.find((n) => n.key === careNeed);
    if (found) {
      setCareNeedLabel(found.label);
      setIsEmergency(found.emergency);
    }
  }, [careNeedsData, careNeed]);

  // Decide the starting step once on mount (graceful refresh/deep-link).
  useEffect(() => {
    if (hydrated) return;
    if (location && careNeed) {
      setStep(3);
    } else if (location) {
      setStep(2);
    } else {
      setStep(1);
    }
    setHydrated(true);
  }, [hydrated, location, careNeed]);

  // Fetch the shortlist whenever we're on step 3 with a location + care need.
  useEffect(() => {
    if (step !== 3 || !location || !careNeed) return;
    let cancelled = false;
    setShortlistLoading(true);
    setShortlistError(null);
    getShortlist(careNeed, location.lat, location.lon)
      .then((res) => {
        if (cancelled) return;
        setShortlist(res);
        setCachedShortlist({
          careNeed: res.care_need,
          careNeedLabel: res.care_need_label,
          location,
          results: res.results,
          fetchedAt: new Date().toISOString(),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setShortlistError(
          err instanceof ApiError
            ? err.message
            : "Could not load nearby facilities. Check your connection and retry."
        );
      })
      .finally(() => {
        if (!cancelled) setShortlistLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, location, careNeed]);

  function chooseLocation(loc: LatLon, label: string) {
    setLocation(loc);
    setLocationLabel(label);
    setLocationError(null);
    setLastLocation(loc);
    setShowMapPicker(false);
    setStep(2);
  }

  async function handleUseMyLocation() {
    setLocatingBusy(true);
    setLocationError(null);
    try {
      const loc = await requestLocation();
      chooseLocation(loc, "your current location");
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : "Could not get your location.");
    } finally {
      setLocatingBusy(false);
    }
  }

  function handleSelectCareNeed(key: string) {
    const found = careNeedsData?.care_needs.find((n) => n.key === key);
    setCareNeed(key);
    setCareNeedLabel(found?.label ?? key);
    setIsEmergency(found?.emergency ?? false);
    setLastCareNeed(key);
    setStep(3);
  }

  function handleSymptomConfirm(key: string, label: string, emergency: boolean) {
    setCareNeed(key);
    setCareNeedLabel(label);
    setIsEmergency(emergency);
    setLastCareNeed(key);
    setStep(3);
  }

  function handleMarkerClick(uniqueId: string) {
    setSelectedId(uniqueId);
    document
      .getElementById(`facility-${uniqueId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const stepLabels: Record<Step, string> = {
    1: "Where are you?",
    2: "What care do you need?",
    3: "Nearby facilities",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      {/* Progress indicator */}
      <ol className="mb-4 flex items-center gap-2 text-xs font-semibold text-navy/50" aria-label="Progress">
        {([1, 2, 3] as Step[]).map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                s === step
                  ? "border-navy bg-navy text-white"
                  : s < step
                  ? "border-satya bg-satya text-white"
                  : "border-navy/20 text-navy/40"
              }`}
              aria-current={s === step ? "step" : undefined}
            >
              {s < step ? "✓" : s}
            </span>
            {s < 3 && <span className="h-px w-4 bg-navy/15" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <h1 className="text-xl font-bold text-navy">{stepLabels[step]}</h1>

      {/* --- STEP 1 --- */}
      {step === 1 && (
        <section className="mt-4 space-y-4" aria-label="Choose your location">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locatingBusy}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-navy px-4 text-base font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {locatingBusy ? "Locating…" : "📍 Use my location"}
          </button>
          {locationError && (
            <p role="alert" className="text-sm text-evidence-contradictory">
              {locationError}
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-navy/70">Or pick a city</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_CITIES.map((city) => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => chooseLocation({ lat: city.lat, lon: city.lon }, city.name)}
                  className="min-h-[44px] rounded-full border border-navy/20 bg-white px-4 text-sm font-semibold text-navy hover:border-navy/50"
                >
                  {city.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowMapPicker((v) => !v)}
              className="text-sm font-semibold text-navy underline"
              aria-expanded={showMapPicker}
            >
              {showMapPicker ? "Hide map picker" : "Or tap a spot on the map"}
            </button>
            {showMapPicker && (
              <div className="mt-2">
                <LocationPicker
                  initialCenter={{ lat: PRESET_CITIES[0].lat, lon: PRESET_CITIES[0].lon }}
                  onConfirm={(loc) => chooseLocation(loc, "your chosen spot")}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* --- STEP 2 --- */}
      {step === 2 && (
        <section className="mt-4 space-y-4" aria-label="Choose care type">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-sm font-semibold text-navy/60 underline"
          >
            ← Change location
          </button>
          {location && (
            <p className="text-sm text-navy/60">
              Searching near <strong>{locationLabel ?? "your saved location"}</strong>
            </p>
          )}

          {careNeedsError && (
            <p role="alert" className="text-sm text-evidence-contradictory">
              {careNeedsError}
            </p>
          )}
          {!careNeedsData && !careNeedsError && (
            <p className="text-sm text-navy/50">Loading care types…</p>
          )}
          {careNeedsData && (
            <CareNeedButtons
              careNeeds={careNeedsData.care_needs}
              mvp={careNeedsData.mvp}
              selected={careNeed}
              onSelect={handleSelectCareNeed}
            />
          )}

          <SymptomBox onConfirm={handleSymptomConfirm} />
        </section>
      )}

      {/* --- STEP 3 --- */}
      {step === 3 && location && careNeed && (
        <section className="mt-4 space-y-4" aria-label="Shortlist results">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm font-semibold text-navy/60 underline"
            >
              ← Change care type
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm font-semibold text-navy/60 underline"
            >
              Change location
            </button>
          </div>

          {(isEmergency || shortlist?.is_emergency) && (
            <p
              role="alert"
              className="rounded-xl border border-evidence-contradictory/40 bg-evidence-contradictory/10 px-4 py-3 text-sm font-semibold text-evidence-contradictory"
            >
              In an emergency, call your local emergency services immediately. The list below
              does not replace emergency care.
            </p>
          )}

          <h2 className="text-lg font-bold text-navy">
            {shortlist?.care_need_label ?? careNeedLabel ?? careNeed}
          </h2>

          {shortlistLoading && <p className="text-sm text-navy/50">Searching nearby facilities…</p>}
          {shortlistError && (
            <p role="alert" className="text-sm text-evidence-contradictory">
              {shortlistError}
            </p>
          )}

          {shortlist && !shortlistLoading && (
            <>
              <div className="rounded-xl border border-navy/15 bg-white p-3 text-sm text-navy/80">
                <p>
                  Of <strong>{shortlist.area_summary.total}</strong> facilities that claim{" "}
                  {shortlist.care_need_label} nearby,{" "}
                  <strong>{shortlist.area_summary.claim_only}</strong> are unsupported claims
                  {shortlist.area_summary.contradictory > 0 && (
                    <>
                      {" "}
                      and <strong>{shortlist.area_summary.contradictory}</strong> have
                      contradictory evidence
                    </>
                  )}{" "}
                  — we show the evidence for each below.
                </p>
                <p className="mt-1 text-xs text-navy/50">
                  {shortlist.area_summary.evidenced} evidenced ·{" "}
                  {shortlist.area_summary.claim_only} claim-only ·{" "}
                  {shortlist.area_summary.contradictory} contradictory ·{" "}
                  {shortlist.area_summary.unknown} unknown
                </p>
              </div>

              {shortlist.results.length > 0 ? (
                <MapView
                  results={shortlist.results}
                  userLocation={location}
                  selectedId={selectedId}
                  onMarkerClick={handleMarkerClick}
                />
              ) : (
                <p className="rounded-xl border border-navy/15 bg-white p-4 text-sm text-navy/70">
                  No facilities found nearby for this care type. Try a different location or
                  care type.
                </p>
              )}

              <div className="space-y-3">
                {shortlist.results.map((r) => (
                  <FacilityCard
                    key={r.unique_id}
                    result={r}
                    careNeed={shortlist.care_need}
                    careNeedLabel={shortlist.care_need_label}
                    highlighted={r.unique_id === selectedId}
                    onNotify={notify}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
