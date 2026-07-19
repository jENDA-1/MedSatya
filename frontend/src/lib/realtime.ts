// MedSatya realtime voice — OpenAI Realtime API over WebRTC.
//
// The OpenAI API key NEVER reaches the browser: the backend mints a short-lived ephemeral client
// secret (POST /api/realtime/session) that we use only to establish this peer connection. The
// honesty system prompt + tool schema are baked into that ephemeral session server-side; we also
// re-assert the tools via session.update as a safety net.
//
// Tool calls are handled here:
//   - lookup_care_candidates -> GET /api/care-candidates (grounds the agent in our taxonomy)
//   - suggest_care_need / flag_emergency -> surfaced to the UI via callbacks
// Any failure (no key, denied mic, handshake error) degrades gracefully — the caller keeps text chat.

import { createRealtimeSession, getCareCandidates } from "@/lib/api";

export type RealtimeState = "idle" | "connecting" | "live" | "closed" | "error";

export interface RealtimeSuggestion {
  careNeed: string;
  careNeedLabel: string;
  rationale: string;
  alternatives: { key: string; label: string }[];
}

export interface RealtimeCallbacks {
  onStateChange?: (state: RealtimeState) => void;
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
  onSuggestion?: (s: RealtimeSuggestion) => void;
  onEmergency?: (reason: string) => void;
  onError?: (message: string) => void;
}

// Taxonomy labels mirrored from backend config.CARE_NEEDS (stable set of 7).
const LABELS: Record<string, string> = {
  icu: "ICU (Intensive Care)",
  nicu: "NICU (Neonatal Intensive Care)",
  emergency: "Emergency",
  maternity: "Maternity",
  trauma: "Trauma",
  dialysis: "Dialysis",
  oncology: "Oncology",
};
const CARE_KEYS = Object.keys(LABELS);

function labelFor(key: string): string {
  return LABELS[key] ?? key;
}

// Flat realtime tool schema (mirrors backend triage._realtime_tools). Re-asserted via session.update.
const TOOLS = [
  {
    type: "function",
    name: "lookup_care_candidates",
    description:
      "Get the top matching care-type candidates from MedSatya's fixed taxonomy for a symptom description. Use this to ground your decision before suggesting.",
    parameters: {
      type: "object",
      properties: { symptom_text: { type: "string" } },
      required: ["symptom_text"],
    },
  },
  {
    type: "function",
    name: "ask_clarifying",
    description: "Ask the user ONE short, plain-language question to decide the care type.",
    parameters: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
    },
  },
  {
    type: "function",
    name: "suggest_care_need",
    description: "Commit to ONE care type from the taxonomy for the user to confirm.",
    parameters: {
      type: "object",
      properties: {
        care_need: { type: "string", enum: CARE_KEYS },
        confidence: { type: "number" },
        rationale: { type: "string" },
        alternatives: { type: "array", items: { type: "string", enum: CARE_KEYS } },
      },
      required: ["care_need", "confidence", "rationale"],
    },
  },
  {
    type: "function",
    name: "flag_emergency",
    description: "Flag a likely life-threatening emergency and advise contacting local emergency services.",
    parameters: { type: "object", properties: { reason: { type: "string" } }, required: [] },
  },
];

async function exchangeSdp(offerSdp: string, ephemeral: string, model: string): Promise<string> {
  // GA endpoint is /v1/realtime/calls; older builds use /v1/realtime. Try both for robustness.
  const urls = [
    `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
    `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
  ];
  let lastErr = "network error";
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: "POST",
        body: offerSdp,
        headers: { Authorization: `Bearer ${ephemeral}`, "Content-Type": "application/sdp" },
      });
      if (r.ok) return await r.text();
      lastErr = `status ${r.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "network error";
    }
  }
  throw new Error(`Realtime handshake failed (${lastErr})`);
}

export class RealtimeVoice {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private state: RealtimeState = "idle";
  private agentBuf = "";
  private readonly cb: RealtimeCallbacks;

  constructor(cb: RealtimeCallbacks) {
    this.cb = cb;
  }

  getState(): RealtimeState {
    return this.state;
  }

  private setState(s: RealtimeState): void {
    this.state = s;
    this.cb.onStateChange?.(s);
  }

  async start(): Promise<void> {
    if (this.state === "connecting" || this.state === "live") return;
    this.setState("connecting");
    try {
      const session = await createRealtimeSession(); // throws ApiError(503) when OpenAI is off
      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Remote audio (the agent's spoken reply).
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      this.audioEl = audioEl;
      pc.ontrack = (e) => {
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
      };

      // Microphone.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = mic;
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      // Event/data channel.
      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.addEventListener("open", () => {
        this.sendEvent({
          type: "session.update",
          session: {
            tools: TOOLS,
            tool_choice: "auto",
            input_audio_transcription: { model: "whisper-1" },
          },
        });
        this.setState("live");
      });
      dc.addEventListener("message", (e) => {
        void this.onEvent(String(e.data));
      });

      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.cb.onError?.("Voice connection lost.");
          this.stop();
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answerSdp = await exchangeSdp(offer.sdp ?? "", session.value, session.model);
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      this.setState("error");
      this.cb.onError?.(err instanceof Error ? err.message : "Could not start voice.");
      this.stop();
    }
  }

  private sendEvent(obj: unknown): void {
    if (this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify(obj));
  }

  private ackTool(callId: string, output: unknown): void {
    this.sendEvent({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
    });
  }

  private async onEvent(raw: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ev: any;
    try {
      ev = JSON.parse(raw);
    } catch {
      return;
    }
    switch (ev.type) {
      case "conversation.item.input_audio_transcription.completed": {
        const t = String(ev.transcript ?? "").trim();
        if (t) this.cb.onUserTranscript?.(t);
        break;
      }
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        this.agentBuf += String(ev.delta ?? "");
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const t = String(ev.transcript ?? this.agentBuf).trim();
        this.agentBuf = "";
        if (t) this.cb.onAgentTranscript?.(t);
        break;
      }
      case "response.function_call_arguments.done":
        await this.handleToolCall(ev);
        break;
      case "error":
        this.cb.onError?.(String(ev.error?.message ?? "Voice error."));
        break;
      default:
        break;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleToolCall(ev: any): Promise<void> {
    const name = String(ev.name ?? "");
    const callId = String(ev.call_id ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let args: any = {};
    try {
      args = JSON.parse(ev.arguments ?? "{}");
    } catch {
      args = {};
    }

    if (name === "lookup_care_candidates") {
      let candidates: unknown[] = [];
      try {
        candidates = (await getCareCandidates(String(args.symptom_text ?? ""))).candidates;
      } catch {
        candidates = [];
      }
      this.ackTool(callId, { candidates });
      this.sendEvent({ type: "response.create" });
      return;
    }
    if (name === "suggest_care_need") {
      const key = String(args.care_need ?? "").toLowerCase();
      if (CARE_KEYS.includes(key)) {
        const alternatives = (Array.isArray(args.alternatives) ? args.alternatives : [])
          .map((a: unknown) => String(a).toLowerCase())
          .filter((a: string) => CARE_KEYS.includes(a) && a !== key)
          .map((a: string) => ({ key: a, label: labelFor(a) }));
        this.cb.onSuggestion?.({
          careNeed: key,
          careNeedLabel: labelFor(key),
          rationale: String(args.rationale ?? ""),
          alternatives,
        });
      }
      this.ackTool(callId, { ok: true });
      return;
    }
    if (name === "flag_emergency") {
      this.cb.onEmergency?.(String(args.reason ?? ""));
      this.ackTool(callId, { ok: true });
      return;
    }
  }

  stop(): void {
    try {
      this.dc?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.getSenders().forEach((s) => s.track?.stop());
    } catch {
      /* noop */
    }
    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* noop */
    }
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.dc = null;
    this.pc = null;
    this.stream = null;
    if (this.state !== "error") this.setState("closed");
  }
}
