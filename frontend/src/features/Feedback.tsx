import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Building2,
  CheckCircle,
  Info,
  Loader2,
  Stethoscope,
  User,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/a11y";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  getCareNeeds,
  submitFeedback,
  type CareNeed,
  type FeedbackPayload,
  type FeedbackResponse,
  type FeedbackRole,
} from "@/lib/api";

/** Static fallback shown if /api/care-needs cannot be reached. */
const FALLBACK_CARE_NEEDS: CareNeed[] = [
  { key: "icu", label: "ICU", emergency: false },
  { key: "nicu", label: "NICU", emergency: false },
  { key: "emergency", label: "Emergency", emergency: true },
  { key: "maternity", label: "Maternity", emergency: false },
  { key: "trauma", label: "Trauma", emergency: true },
  { key: "dialysis", label: "Dialysis", emergency: false },
  { key: "oncology", label: "Oncology", emergency: false },
];

interface FormState {
  facilityName: string;
  careNeed: string;
  correctNote: string;
  incorrectNote: string;
  evidenceUrl: string;
  contact: string;
}

const EMPTY_FORM: FormState = {
  facilityName: "",
  careNeed: "",
  correctNote: "",
  incorrectNote: "",
  evidenceUrl: "",
  contact: "",
};

/** Trims a field and turns "" into null, matching the nullable API contract. */
function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const fieldClass =
  "mt-1 min-h-[44px] w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink " +
  "placeholder:text-ink-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * Doctor + patient feedback form. Collected feedback sharpens *future*
 * evidence extraction — it never mutates what a user is looking at live.
 * That honesty guardrail is stated prominently and must not be removed.
 */
export default function Feedback() {
  const reduceMotion = usePrefersReducedMotion();

  const [role, setRole] = useState<FeedbackRole>("patient");
  const [careNeeds, setCareNeeds] = useState<CareNeed[]>(FALLBACK_CARE_NEEDS);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedbackResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCareNeeds()
      .then((res) => {
        if (!cancelled && res.care_needs.length > 0) setCareNeeds(res.care_needs);
      })
      .catch(() => {
        // Keep the static fallback list — the form must stay usable offline.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "correctNote" || key === "incorrectNote") setNoteError(null);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setNoteError(null);
    setSubmitError(null);
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const correct = form.correctNote.trim();
    const incorrect = form.incorrectNote.trim();
    if (!correct && !incorrect) {
      setNoteError(
        "Tell us at least one thing — what the data gets right, or what's wrong or missing."
      );
      return;
    }

    setNoteError(null);
    setSubmitError(null);
    setSubmitting(true);

    const payload: FeedbackPayload = {
      role,
      facility_id: null,
      facility_name: toNullable(form.facilityName),
      care_need: toNullable(form.careNeed),
      correct_note: toNullable(form.correctNote),
      incorrect_note: toNullable(form.incorrectNote),
      evidence_url: toNullable(form.evidenceUrl),
      contact: toNullable(form.contact),
    };

    try {
      const res = await submitFeedback(payload);
      setResult(res);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Could not send your feedback. Please check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-extrabold text-navy">Improve the evidence</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Doctors and patients can flag what our data gets right or wrong about a facility.
        </p>
      </header>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-gold/40 bg-gold/10 p-4">
        <Info aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold" />
        <p className="text-sm text-ink">
          <strong className="font-semibold">
            Feedback is collected to sharpen future evidence.
          </strong>{" "}
          It does <strong className="font-semibold">NOT</strong> change what you see live.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Who's giving feedback"
        className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1"
      >
        <button
          type="button"
          role="tab"
          aria-pressed={role === "patient"}
          aria-selected={role === "patient"}
          onClick={() => setRole("patient")}
          className={cn(
            "flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            role === "patient" ? "bg-surface text-navy shadow-soft" : "text-ink-muted hover:text-ink"
          )}
        >
          <User aria-hidden="true" className="h-4 w-4" />
          I&apos;m a patient/caregiver
        </button>
        <button
          type="button"
          role="tab"
          aria-pressed={role === "doctor"}
          aria-selected={role === "doctor"}
          onClick={() => setRole("doctor")}
          className={cn(
            "flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            role === "doctor" ? "bg-surface text-navy shadow-soft" : "text-ink-muted hover:text-ink"
          )}
        >
          <Stethoscope aria-hidden="true" className="h-4 w-4" />
          I&apos;m a clinician
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-line bg-surface-raised p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Accounts
          </span>
          <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
            Coming soon
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled aria-disabled="true" className="cursor-not-allowed">
            <Building2 aria-hidden="true" className="h-4 w-4" />
            Hospital sign-in
          </Button>
          <Button variant="outline" size="sm" disabled aria-disabled="true" className="cursor-not-allowed">
            <User aria-hidden="true" className="h-4 w-4" />
            Patient sign-in
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Accounts are coming — a future database will link verified hospitals and patients. For
          now, feedback is anonymous and stored securely.
        </p>
      </div>

      <div aria-live="polite" className="mt-6">
        {result ? (
          <ConfirmationCard result={result} onReset={resetForm} reduceMotion={reduceMotion} />
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="facility-name" className="block text-sm font-semibold text-ink">
                Facility name
              </label>
              <input
                id="facility-name"
                type="text"
                value={form.facilityName}
                onChange={(e) => updateField("facilityName", e.target.value)}
                placeholder="e.g. City General Hospital"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="care-need" className="block text-sm font-semibold text-ink">
                Care type
              </label>
              <select
                id="care-need"
                value={form.careNeed}
                onChange={(e) => updateField("careNeed", e.target.value)}
                className={fieldClass}
              >
                <option value="">— select —</option>
                {careNeeds.map((need) => (
                  <option key={need.key} value={need.key}>
                    {need.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="correct-note" className="block text-sm font-semibold text-ink">
                What does the data get RIGHT?
              </label>
              <textarea
                id="correct-note"
                value={form.correctNote}
                onChange={(e) => updateField("correctNote", e.target.value)}
                rows={3}
                aria-invalid={noteError ? "true" : undefined}
                aria-describedby={noteError ? "note-error" : undefined}
                placeholder="e.g. They really do have a staffed NICU, confirmed on our visit"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="incorrect-note" className="block text-sm font-semibold text-ink">
                What&apos;s WRONG or missing?
              </label>
              <textarea
                id="incorrect-note"
                value={form.incorrectNote}
                onChange={(e) => updateField("incorrectNote", e.target.value)}
                rows={3}
                aria-invalid={noteError ? "true" : undefined}
                aria-describedby={noteError ? "note-error" : undefined}
                placeholder="e.g. Phone number is out of date; the ICU listed here closed in 2023"
                className={fieldClass}
              />
            </div>

            {noteError && (
              <p id="note-error" role="alert" className="text-sm text-evidence-contradictory">
                {noteError}
              </p>
            )}

            <div>
              <label htmlFor="evidence-url" className="block text-sm font-semibold text-ink">
                Evidence link <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                id="evidence-url"
                type="url"
                value={form.evidenceUrl}
                onChange={(e) => updateField("evidenceUrl", e.target.value)}
                placeholder="https://…"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="contact" className="block text-sm font-semibold text-ink">
                Contact <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                id="contact"
                type="text"
                value={form.contact}
                onChange={(e) => updateField("contact", e.target.value)}
                placeholder="Email or phone"
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-ink-muted">
                Only if you&apos;re happy to be contacted.
              </p>
            </div>

            {submitError && (
              <p role="alert" className="text-sm text-evidence-contradictory">
                {submitError}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send feedback"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

interface ConfirmationCardProps {
  result: FeedbackResponse;
  onReset: () => void;
  reduceMotion: boolean;
}

function ConfirmationCard({ result, onReset, reduceMotion }: ConfirmationCardProps) {
  const card = (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-soft">
      <CheckCircle aria-hidden="true" className="mx-auto h-10 w-10 text-satya" />
      <h2 className="mt-3 text-lg font-bold text-navy">
        Thank you — this helps us sharpen the evidence.
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        {result.stored
          ? "Your feedback was stored."
          : "We received your feedback, but couldn't confirm it was stored — please try again later."}
      </p>
      {!result.email_sent && (
        <p className="mt-1 text-xs text-ink-muted">
          Saved. (Email notifications aren&apos;t enabled yet.)
        </p>
      )}
      <Button variant="outline" size="md" className="mt-4" onClick={onReset}>
        Submit another
      </Button>
    </div>
  );

  if (reduceMotion) return card;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {card}
    </motion.div>
  );
}
