// MedSatya API client — typed fetch wrappers for the FastAPI backend.
// All endpoints are served at the same origin under /api/*.

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
  const res = await fetch(path, {
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
  locale = "en"
): Promise<MapSymptomResponse> {
  return request<MapSymptomResponse>("/api/map-symptom", {
    method: "POST",
    body: JSON.stringify({ text, locale }),
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

export { ApiError };
