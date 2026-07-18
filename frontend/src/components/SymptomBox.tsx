import { useState } from "react";
import { ApiError, mapSymptom, type MapSymptomResponse } from "@/lib/api";

interface SymptomBoxProps {
  onConfirm: (careNeed: string, careNeedLabel: string, isEmergency: boolean) => void;
}

/**
 * Free-text symptom box. Calls /api/map-symptom and shows a SUGGESTED care
 * need for the user to confirm — it never auto-runs a search. Always makes
 * clear this is not a diagnosis.
 */
export default function SymptomBox({ onConfirm }: SymptomBoxProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MapSymptomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await mapSymptom(text.trim());
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reach the symptom mapper. Please pick a care type button instead."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-navy/15 bg-white p-4">
      <label htmlFor="symptom-text" className="block text-sm font-semibold text-navy">
        Or describe what's happening
      </label>
      <p className="mt-0.5 text-xs text-navy/60">
        This suggests a care type from your words — it is <strong>not a diagnosis</strong> and
        does not replace medical advice.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="symptom-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. my newborn can't breathe"
          className="min-h-[48px] flex-1 rounded-xl border border-navy/20 px-3 text-base text-navy placeholder:text-navy/40 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/30"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="min-h-[48px] rounded-xl bg-navy px-5 font-semibold text-white transition disabled:opacity-50"
        >
          {loading ? "Checking…" : "Suggest"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-evidence-contradictory">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-xl border border-navy/15 bg-warm p-3">
          {result.is_emergency && (
            <p
              role="alert"
              className="mb-2 rounded-lg border border-evidence-contradictory/40 bg-evidence-contradictory/10 px-3 py-2 text-sm font-semibold text-evidence-contradictory"
            >
              In an emergency, call your local emergency services immediately.
            </p>
          )}
          {result.care_need ? (
            <>
              <p className="text-sm text-navy">
                Suggested care type: <strong>{result.care_need_label}</strong>{" "}
                <span className="text-navy/50">
                  (confidence {Math.round(result.confidence * 100)}%)
                </span>
              </p>
              {result.rationale && (
                <p className="mt-1 text-xs italic text-navy/60">"{result.rationale}"</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onConfirm(result.care_need as string, result.care_need_label as string, result.is_emergency)
                  }
                  className="min-h-[44px] rounded-xl bg-satya px-4 font-semibold text-white"
                >
                  Confirm &amp; search for {result.care_need_label}
                </button>
                {result.alternatives.map((alt) => (
                  <button
                    key={alt.key}
                    type="button"
                    onClick={() => onConfirm(alt.key, alt.label, result.is_emergency)}
                    className="min-h-[44px] rounded-xl border border-navy/20 px-4 font-semibold text-navy"
                  >
                    Use {alt.label} instead
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-navy/70">
              We couldn't confidently match this to a care type. Please choose one of the
              buttons above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
