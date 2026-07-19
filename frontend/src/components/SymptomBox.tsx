import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Mic, Send, Sparkles, Square } from "lucide-react";
import { ApiError, runTriage, type ChatMessage, type TriageResponse } from "@/lib/api";
import { RealtimeVoice, type RealtimeState } from "@/lib/realtime";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

interface SymptomBoxProps {
  onConfirm: (careNeed: string, careNeedLabel: string, isEmergency: boolean) => void;
  /** Fires with the assistant's current best suggestion (or null) so the parent can reflect it in
   *  the care-type options — the suggested type + a live confidence %, plus any alternatives. */
  onSuggestionChange?: (
    s: { careNeed: string; confidence: number; alternativeKeys: string[] } | null
  ) => void;
}

type ChatRole = "user" | "agent";
interface ChatMsg {
  id: number;
  role: ChatRole;
  text: string;
  emergency?: boolean;
}

const GREETING =
  "Tell me what's happening in your own words — I'll help find the right type of care. " +
  "This isn't a diagnosis, and you'll confirm before any search.";
const EMERGENCY_TEXT =
  "This may be a medical emergency. Please call your local emergency services now — in India dial 112 " +
  "(or 108 for an ambulance). This is not a diagnosis.";
const FALLBACK_ERROR =
  "Could not reach the triage assistant. Please pick a care type button instead.";

/**
 * Conversational triage. A compact, mobile chat with a real multi-turn agent (/api/triage):
 * the agent asks ONE question at a time or suggests ONE care type for the user to confirm — it
 * never diagnoses and never auto-runs a search. Optional realtime VOICE (mic) shares the same
 * transcript; both degrade gracefully (voice hidden/erroring never breaks typing).
 */
export default function SymptomBox({ onConfirm, onSuggestionChange }: SymptomBoxProps) {
  const idRef = useRef(2);
  const [messages, setMessages] = useState<ChatMsg[]>([{ id: 1, role: "agent", text: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const voiceRef = useRef<RealtimeVoice | null>(null);
  const [voiceState, setVoiceState] = useState<RealtimeState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const pushUser = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: idRef.current++, role: "user", text }]);
  }, []);
  const pushAgent = useCallback((text: string, emergency = false) => {
    setMessages((prev) => [...prev, { id: idRef.current++, role: "agent", text, emergency }]);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  useEffect(() => () => voiceRef.current?.stop(), []);

  function applyTriage(res: TriageResponse) {
    setResult(res);
    if (res.type === "question") {
      pushAgent(res.question);
      onSuggestionChange?.(null);
    } else if (res.type === "suggestion") {
      pushAgent(
        `I think you may need ${res.care_need_label}.${res.rationale ? " " + res.rationale : ""}`
      );
      onSuggestionChange?.({
        careNeed: res.care_need,
        confidence: res.confidence,
        alternativeKeys: res.alternatives.map((a) => a.key),
      });
    } else {
      pushAgent(res.message || EMERGENCY_TEXT, true);
      onSuggestionChange?.({ careNeed: "emergency", confidence: 1, alternativeKeys: [] });
    }
  }

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || sending) return;
    const nextMsgs: ChatMsg[] = [...messages, { id: idRef.current++, role: "user", text: q }];
    setMessages(nextMsgs);
    setInput("");
    setResult(null);
    setError(null);
    setSending(true);
    try {
      const history: ChatMessage[] = nextMsgs
        .filter((m) => m.id !== 1) // drop the UI-only greeting
        .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.text }));
      applyTriage(await runTriage(history));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : FALLBACK_ERROR);
    } finally {
      setSending(false);
    }
  }

  async function toggleVoice() {
    if (voiceState === "live" || voiceState === "connecting") {
      voiceRef.current?.stop();
      return;
    }
    setVoiceError(null);
    const rv = new RealtimeVoice({
      onStateChange: setVoiceState,
      onUserTranscript: (t) => pushUser(t),
      onAgentTranscript: (t) => pushAgent(t),
      onSuggestion: (s) => {
        setResult({
          type: "suggestion",
          care_need: s.careNeed,
          care_need_label: s.careNeedLabel,
          confidence: 0.85,
          rationale: s.rationale,
          is_emergency: false,
          alternatives: s.alternatives,
          provider: "openai-realtime",
        });
        onSuggestionChange?.({
          careNeed: s.careNeed,
          confidence: 0.85,
          alternativeKeys: s.alternatives.map((a) => a.key),
        });
      },
      onEmergency: () => {
        setResult({
          type: "emergency",
          is_emergency: true,
          message: EMERGENCY_TEXT,
          care_need: "emergency",
          care_need_label: "Emergency",
          provider: "openai-realtime",
        });
        pushAgent(EMERGENCY_TEXT, true);
        onSuggestionChange?.({ careNeed: "emergency", confidence: 1, alternativeKeys: [] });
      },
      onError: (m) => setVoiceError(m),
    });
    voiceRef.current = rv;
    await rv.start();
  }

  function confirm(careNeed: string, careNeedLabel: string, emergency: boolean) {
    voiceRef.current?.stop();
    onConfirm(careNeed, careNeedLabel, emergency);
  }

  const voiceLive = voiceState === "live";
  const voiceConnecting = voiceState === "connecting";

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Sparkles size={15} aria-hidden="true" />
        Not sure? Tell our assistant what's happening
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        <strong>Type or tap the mic to speak</strong> — it asks a question or two, then suggests the
        right care type and highlights it in the options below. This is <strong>not a diagnosis</strong>.
      </p>

      <div
        ref={scrollRef}
        aria-live="polite"
        className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface-raised p-3"
      >
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (
            <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] break-words rounded-2xl px-3 py-2 text-sm",
                  m.role === "user"
                    ? "bg-ink text-surface"
                    : m.emergency
                      ? "border border-evidence-contradictory/40 bg-evidence-contradictory/10 font-medium text-evidence-contradictory"
                      : "border border-line bg-surface text-ink"
                )}
              >
                {m.emergency && (
                  <AlertTriangle size={14} className="mb-0.5 mr-1 inline shrink-0" aria-hidden="true" />
                )}
                {m.text}
              </div>
            </li>
          ))}
          {sending && (
            <li className="flex justify-start" aria-hidden="true">
              <div className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
                <Loader2 className="inline animate-spin" size={14} /> thinking…
              </div>
            </li>
          )}
        </ul>
      </div>

      {result?.type === "suggestion" && (
        <div className="mt-3 rounded-xl border border-line bg-surface-raised p-3">
          <p className="text-sm text-ink">
            Suggested care type: <strong>{result.care_need_label}</strong>{" "}
            <span className="text-ink-muted">
              (confidence {Math.round(result.confidence * 100)}%)
            </span>
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">
            Not a diagnosis — you confirm before we search.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => confirm(result.care_need, result.care_need_label, false)}
            >
              Confirm &amp; search for {result.care_need_label}
            </Button>
            {result.alternatives.map((alt) => (
              <Button
                key={alt.key}
                type="button"
                variant="outline"
                size="md"
                onClick={() => confirm(alt.key, alt.label, false)}
              >
                Use {alt.label} instead
              </Button>
            ))}
          </div>
        </div>
      )}

      {result?.type === "emergency" && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-evidence-contradictory/40 bg-evidence-contradictory/10 p-3"
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-evidence-contradictory">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {result.message}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() =>
                confirm(result.care_need, result.care_need_label || "Emergency", true)
              }
            >
              Search Emergency facilities
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-evidence-contradictory">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-3 flex items-end gap-2"
      >
        <label htmlFor="symptom-text" className="sr-only">
          Describe what's happening
        </label>
        <input
          id="symptom-text"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={voiceLive ? "Listening… or type here" : "e.g. my newborn can't breathe"}
          disabled={sending}
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
        />
        <Button
          type="submit"
          variant="navy"
          size="icon"
          aria-label="Send"
          disabled={sending || !input.trim()}
        >
          {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
        </Button>
        <button
          type="button"
          onClick={() => void toggleVoice()}
          disabled={voiceConnecting}
          aria-pressed={voiceLive}
          aria-label={voiceLive ? "Stop voice" : "Talk to the assistant"}
          title="Talk to the assistant"
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60",
            voiceLive
              ? "border-evidence-contradictory bg-evidence-contradictory/10 text-evidence-contradictory"
              : "border-line bg-surface text-ink hover:bg-surface-raised"
          )}
        >
          {voiceConnecting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : voiceLive ? (
            <Square size={18} />
          ) : (
            <Mic size={18} />
          )}
        </button>
      </form>

      {voiceLive && (
        <p className="mt-2 text-[11px] font-medium text-evidence-contradictory">
          ● Listening — speak now, tap the square to stop.
        </p>
      )}
      {voiceConnecting && <p className="mt-2 text-[11px] text-ink-muted">Connecting voice…</p>}
      {voiceError && (
        <p role="alert" className="mt-2 text-[11px] text-ink-muted">
          Voice unavailable: {voiceError}. You can still type.
        </p>
      )}
    </div>
  );
}
