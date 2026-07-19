// MedSatya API client — typed fetch wrappers for the FastAPI backend.
// All endpoints are served at the same origin under /api/*.
//
// API_BASE lets the app run under a subpath behind a reverse proxy (e.g. /medsatyam on gridmind).
// Empty by default (same-origin /api/*), so Databricks App / Render / local dev are unaffected.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface CareNeed {
  key: string;
  label: string;
  emergency: boolean;
}

export interface CareNeedsResponse {
  care_needs: CareNeed[];
  mvp: string[];
}

export interface Address {
  line1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
}

export type EvidenceStatus =
  | "strongly_supported"
  | "partially_supported"
  | "claim_only"
  | "contradictory"
  | "not_enough_data";

export interface Citation {
  field: string;
  text: string;
  matched: string;
  role: "claim" | "equipment" | "procedure" | "specialty" | string;
}

export interface SupportAxes {
  equipment: boolean;
  procedure: boolean;
  specialty: boolean;
}

export interface EvidenceInfo {
  care_need: string;
  status: EvidenceStatus;
  status_label: string;
  care_evidence: number;
  data_confidence: number;
  support_axes: SupportAxes;
  citations: Citation[];
  contradictions: Citation[];
  missing: string[];
  source_urls: string[];
}

export type DesertType =
  | "evidenced_coverage"
  | "potential_coverage"
  | "likely_medical_desert"
  | "data_desert";

export type DesertColor = "green" | "gold" | "red" | "grey";

export interface DesertInfo {
  type: DesertType;
  label: string;
  color: DesertColor;
  meaning: string;
}

export interface Freshness {
  page_update: string | null;
  last_social_post: string | null;
}

export type Tier = "primary" | "backup" | "fallback" | null;

export interface Scores {
  care_evidence: number;
  freshness: number;
  freshness_label: string;
  distance_access: number;
  location_confidence: number;
}

export interface ShortlistResult {
  unique_id: string;
  cluster_id: string;
  name: string;
  address: Address;
  phones: string[];
  websites: string[];
  latitude: number | null;
  longitude: number | null;
  coord_valid: boolean;
  distance_km: number | null;
  capability: string[];
  equipment: string[];
  procedure: string[];
  specialties: string[];
  description: string | null;
  source_urls: string[];
  freshness: Freshness;
  evidence: EvidenceInfo;
  desert: DesertInfo;
  call_checklist: string[];
  rank_score: number;
  band: EvidenceStatus;
  band_order: number;
  scores: Scores;
  tier: Tier;
  is_nearest: boolean;
}

export interface AreaSummary {
  total: number;
  evidenced: number;
  claim_only: number;
  contradictory: number;
  unknown: number;
}

export interface ShortlistResponse {
  care_need: string;
  care_need_label: string;
  is_emergency: boolean;
  count: number;
  area_summary: AreaSummary;
  results: ShortlistResult[];
}

export interface MapSymptomAlternative {
  key: string;
  label: string;
}

export interface MapSymptomResponse {
  care_need: string | null;
  care_need_label: string | null;
  confidence: number;
  rationale: string;
  is_emergency: boolean;
  alternatives: MapSymptomAlternative[];
  /** Layer-2 AI: one clarifying question when confidence is low (never a diagnosis). */
  needs_clarification?: boolean;
  clarifying_question?: string | null;
  /** Which provider produced the mapping: "rule_based" | "embedding" | "model_serving". */
  provider?: string;
}

export interface SavedFacilityRef {
  unique_id: string;
  name: string;
  address: Address;
  phones: string[];
  distance_km: number | null;
  band: EvidenceStatus;
  band_label: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SavedItem {
  id: string;
  created_at: string;
  care_need: string;
  care_need_label: string;
  note: string | null;
  facility: SavedFacilityRef;
}

export interface SavedResponse {
  items: SavedItem[];
}

export interface SaveFacilityPayload {
  care_need: string;
  care_need_label: string;
  note: string | null;
  facility: SavedFacilityRef;
}

export interface SaveFacilityResponse {
  id: string;
  created_at: string;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "detail" in body) {
        detail = String((body as { detail: unknown }).detail);
      }
    } catch {
      // ignore — keep statusText
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export async function getCareNeeds(): Promise<CareNeedsResponse> {
  return request<CareNeedsResponse>("/api/care-needs");
}

export async function getShortlist(
  careNeed: string,
  lat: number,
  lon: number,
  top = 25
): Promise<ShortlistResponse> {
  const params = new URLSearchParams({
    care_need: careNeed,
    lat: String(lat),
    lon: String(lon),
    top: String(top),
  });
  return request<ShortlistResponse>(`/api/shortlist?${params.toString()}`);
}

export async function mapSymptom(
  text: string,
  locale = "en",
  clarifyAnswer?: string
): Promise<MapSymptomResponse> {
  return request<MapSymptomResponse>("/api/map-symptom", {
    method: "POST",
    body: JSON.stringify({ text, locale, clarify_answer: clarifyAnswer ?? null }),
  });
}

export async function getSaved(): Promise<SavedResponse> {
  return request<SavedResponse>("/api/saved");
}

export async function saveFacility(
  payload: SaveFacilityPayload
): Promise<SaveFacilityResponse> {
  return request<SaveFacilityResponse>("/api/saved", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteSaved(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/saved/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Community feedback (doctors + patients) ------------------------------
// Collected to a Delta table only; it does NOT change evidence live.

export type FeedbackRole = "doctor" | "patient";

export interface FeedbackPayload {
  role: FeedbackRole;
  facility_id: string | null;
  facility_name: string | null;
  care_need: string | null;
  correct_note: string | null; // what the data gets right
  incorrect_note: string | null; // what the data gets wrong
  evidence_url: string | null;
  contact: string | null;
}

export interface FeedbackResponse {
  id: string;
  created_at: string;
  stored: boolean; // Delta write succeeded
  email_sent: boolean; // email hook (false when the provider is not configured)
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  return request<FeedbackResponse>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Conversational triage agent (OpenAI, /api/triage) --------------------
// Stateless: the client sends the running transcript; the server holds no state. The agent NEVER
// diagnoses — it either asks ONE clarifying question, suggests ONE care-need to confirm, or flags
// an emergency. Falls back to the deterministic embeddings + clarify chain when OpenAI is off.

export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface TriageAlternative {
  key: string;
  label: string;
}

export type TriageResponse =
  | { type: "question"; question: string; is_emergency: boolean; provider?: string }
  | {
      type: "suggestion";
      care_need: string;
      care_need_label: string;
      confidence: number;
      rationale: string;
      is_emergency: boolean;
      alternatives: TriageAlternative[];
      provider?: string;
    }
  | {
      type: "emergency";
      is_emergency: true;
      message: string;
      care_need: string;
      care_need_label: string | null;
      provider?: string;
    };

export async function runTriage(messages: ChatMessage[], locale = "en"): Promise<TriageResponse> {
  return request<TriageResponse>("/api/triage", {
    method: "POST",
    body: JSON.stringify({ messages, locale }),
  });
}

export interface CareCandidate {
  key: string;
  label: string;
  score: number;
}

export async function getCareCandidates(text: string): Promise<{ candidates: CareCandidate[] }> {
  return request<{ candidates: CareCandidate[] }>(
    `/api/care-candidates?text=${encodeURIComponent(text)}`
  );
}

// --- Voice: realtime session token + transcription fallback ---------------
// The OpenAI API key never reaches the browser: the backend mints a short-lived ephemeral client
// secret we use only to open the WebRTC connection (see lib/realtime.ts). Transcription is a
// simpler turn-based fallback when realtime isn't usable.

export interface RealtimeSession {
  value: string; // ephemeral client secret (short-lived)
  expires_at: number;
  model: string;
}

export async function createRealtimeSession(): Promise<RealtimeSession> {
  return request<RealtimeSession>("/api/realtime/session", { method: "POST" });
}

export async function transcribeAudio(blob: Blob): Promise<{ text: string }> {
  const form = new FormData();
  form.append("audio", blob, "audio.webm");
  // Do NOT set Content-Type — the browser adds the multipart boundary itself.
  const res = await fetch(API_BASE + "/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new ApiError(`Transcription failed (${res.status})`, res.status);
  return (await res.json()) as { text: string };
}

export { ApiError };
