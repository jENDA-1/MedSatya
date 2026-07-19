import { Suspense, lazy, useEffect, useState } from "react";
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
import Toast, { type ToastMessage } from "@/components/Toast";
import Hero, { HeroTrustFooter } from "@/components/Hero";
import { Button } from "@/components/ui/button";

// Code-split everything that pulls in maplibre-gl (heavy) so the initial bundle stays lean:
// the map picker (step 1, optional) and the results view (step 3) both load on demand.
const ResultsView = lazy(() => import("@/components/ResultsView"));
const LocationPicker = lazy(() => import("@/components/LocationPicker"));

type Step = 1 | 2 | 3;

/** Best-effort, honest label for a saved lat/lon: only names it when it's an
 *  exact preset city match; otherwise says so plainly rather than guessing. */
function describeSavedLocation(loc: LatLon): string {
  const match = PRESET_CITIES.find(
    (c) => Math.abs(c.lat - loc.lat) < 0.001 && Math.abs(c.lon - loc.lon) < 0.001,
  );
  return match ? match.name : "your saved location";
}

export default function FindCare() {
  const [step, setStep] = useState<Step>(1);

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
  // The assistant's live suggestion, surfaced onto the care-type options below the chat.
  const [agentSuggestion, setAgentSuggestion] = useState<
    { careNeed: string; confidence: number; alternativeKeys: string[] } | null
  >(null);

  const [shortlist, setShortlist] = useState<ShortlistResponse | null>(null);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [shortlistError, setShortlistError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = (text: string, kind: "success" | "error") => setToast({ text, kind });

  // Snapshot of a prior visit's search, captured once at mount — powers the
  // "Resume last search" chip on the hero. Does NOT drive the starting step;
  // the app always starts on step 1 (see below).
  const [resumeSnapshot] = useState<{ loc: LatLon; careNeedKey: string } | null>(() => {
    const loc = getLastLocation();
    const key = getLastCareNeed();
    return loc && key ? { loc, careNeedKey: key } : null;
  });
  const [resumeDismissed, setResumeDismissed] = useState(false);

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

  // On every step transition, jump back to the top so each step starts from its heading — after
  // picking a location (or care type) the user lands at the top of the new step, never left
  // mid-scroll where the previous step's CTA had scrolled them down.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // NOTE: the app intentionally always starts on step 1 (the hero), even when
  // a prior visit left a location + care need in localStorage — `step`'s
  // initial value above already handles that. We deliberately do NOT run a
  // mount effect that promotes `step` to 2/3 here: that used to cause a
  // jarring auto-jump straight to the map on return visits. Returning users
  // instead get the explicit, dismissible "Resume last search" chip (see
  // `resumeSnapshot` above and its use in the render below) — a shortcut
  // they choose, not one the app takes for them.

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
    setAgentSuggestion(null); // fresh location → fresh assistant context
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

  /** User-initiated shortcut for the "Resume last search" chip — jumps
   *  straight to the map using the snapshot of the last saved search. */
  function handleResumeLastSearch() {
    if (!resumeSnapshot) return;
    const { loc, careNeedKey } = resumeSnapshot;
    setLocation(loc);
    setCareNeed(careNeedKey);
    const found = careNeedsData?.care_needs.find((n) => n.key === careNeedKey);
    if (found) {
      setCareNeedLabel(found.label);
      setIsEmergency(found.emergency);
    }
    setStep(3);
  }

  const resumeChip =
    resumeSnapshot && !resumeDismissed
      ? {
          careNeedLabel: careNeedLabel ?? resumeSnapshot.careNeedKey,
          locationLabel: describeSavedLocation(resumeSnapshot.loc),
          onResume: handleResumeLastSearch,
          onDismiss: () => setResumeDismissed(true),
        }
      : null;

  const stepLabels: Record<Step, string> = {
    1: "Where are you?",
    2: "What care do you need?",
    3: "Nearby facilities",
  };

  return (
    <>
      {step === 1 && <Hero resume={resumeChip} />}
      {step !== 3 && (
      <div id="care-flow" className="mx-auto max-w-2xl px-4 pt-4">
      {/* Progress indicator */}
      <ol className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold text-navy/50" aria-label="Progress">
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
      <h1 className="text-center text-xl font-bold text-navy">{stepLabels[step]}</h1>

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
            <p className="mb-2 text-center text-sm font-semibold text-navy/70">Or pick a city</p>
            <div className="flex flex-wrap justify-center gap-2">
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

          <div className="text-center">
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
                <Suspense
                  fallback={
                    <div className="grid h-56 place-items-center rounded-2xl border border-line text-sm text-ink-muted">
                      Loading map…
                    </div>
                  }
                >
                  <LocationPicker
                    initialCenter={{ lat: PRESET_CITIES[0].lat, lon: PRESET_CITIES[0].lon }}
                    onConfirm={(loc) => chooseLocation(loc, "your chosen spot")}
                  />
                </Suspense>
              </div>
            )}
          </div>
        </section>
      )}

      {/* --- STEP 2 --- */}
      {step === 2 && (
        <section className="mt-4 space-y-4" aria-label="Choose care type">
          <div className="flex flex-col items-center gap-1 text-center">
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
          </div>

          {/* Assistant chat FIRST — describe it or speak; it suggests + highlights the option below. */}
          <SymptomBox onConfirm={handleSymptomConfirm} onSuggestionChange={setAgentSuggestion} />

          {/* Then the manual care-type options, which reflect the assistant's live suggestion. */}
          <div className="flex items-center gap-3 pt-1">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Or pick a care type
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          {careNeedsError && (
            <p role="alert" className="text-center text-sm text-evidence-contradictory">
              {careNeedsError}
            </p>
          )}
          {!careNeedsData && !careNeedsError && (
            <p className="text-center text-sm text-navy/50">Loading care types…</p>
          )}
          {careNeedsData && (
            <CareNeedButtons
              careNeeds={careNeedsData.care_needs}
              mvp={careNeedsData.mvp}
              selected={careNeed}
              onSelect={handleSelectCareNeed}
              suggestedKey={agentSuggestion?.careNeed ?? null}
              suggestedConfidence={agentSuggestion?.confidence ?? null}
              alternativeKeys={agentSuggestion?.alternativeKeys ?? []}
            />
          )}
        </section>
      )}
      </div>
      )}

      {/* Trust story closes the landing — below the location flow so the action leads. */}
      {step === 1 && <HeroTrustFooter />}

      {/* --- STEP 3 — full-width map + Vaul results sheet --- */}
      {step === 3 && location && careNeed && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          {shortlistError ? (
            <div className="mx-auto max-w-2xl space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="subtle" size="sm" onClick={() => setStep(2)}>
                  ← Change care type
                </Button>
                <Button variant="subtle" size="sm" onClick={() => setStep(1)}>
                  Change location
                </Button>
              </div>
              <p role="alert" className="text-sm text-evidence-contradictory">
                {shortlistError}
              </p>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="grid h-[60vh] place-items-center text-sm text-ink-muted">
                  Loading results…
                </div>
              }
            >
              <ResultsView
                results={shortlist?.results ?? []}
                userLocation={location}
                careNeed={careNeed}
                careNeedLabel={shortlist?.care_need_label ?? careNeedLabel ?? careNeed}
                areaSummary={
                  shortlist?.area_summary ?? {
                    total: 0,
                    evidenced: 0,
                    claim_only: 0,
                    contradictory: 0,
                    unknown: 0,
                  }
                }
                isEmergency={isEmergency || Boolean(shortlist?.is_emergency)}
                loading={shortlistLoading}
                onNotify={notify}
                onChangeCareType={() => setStep(2)}
                onChangeLocation={() => setStep(1)}
              />
            </Suspense>
          )}
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
