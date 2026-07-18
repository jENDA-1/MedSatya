// localStorage-backed store for cross-page state: last shortlist results
// (so the Trust Passport page can read a facility by unique_id without a
// refetch), last location, last care need, and a mirror of saved facilities
// in case the /api/saved backend is unavailable.

import type { LatLon } from "./geo";
import type { SaveFacilityPayload, ShortlistResult } from "./api";

const KEYS = {
  shortlist: "medsatya:lastShortlist",
  location: "medsatya:lastLocation",
  careNeed: "medsatya:lastCareNeed",
  savedMirror: "medsatya:savedMirror",
} as const;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — fail silently, app still works in-memory
  }
}

export interface CachedShortlist {
  careNeed: string;
  careNeedLabel: string;
  location: LatLon;
  results: ShortlistResult[];
  fetchedAt: string;
}

export function getCachedShortlist(): CachedShortlist | null {
  return readJson<CachedShortlist>(KEYS.shortlist);
}

export function setCachedShortlist(data: CachedShortlist): void {
  writeJson(KEYS.shortlist, data);
}

export function findCachedFacility(uniqueId: string): ShortlistResult | null {
  const cached = getCachedShortlist();
  if (!cached) return null;
  return cached.results.find((r) => r.unique_id === uniqueId) ?? null;
}

export function getLastLocation(): LatLon | null {
  return readJson<LatLon>(KEYS.location);
}

export function setLastLocation(loc: LatLon): void {
  writeJson(KEYS.location, loc);
}

export function getLastCareNeed(): string | null {
  return readJson<string>(KEYS.careNeed);
}

export function setLastCareNeed(careNeed: string): void {
  writeJson(KEYS.careNeed, careNeed);
}

// --- Saved facilities mirror -------------------------------------------

export interface SavedMirrorItem extends SaveFacilityPayload {
  id: string;
  created_at: string;
}

export function getSavedMirror(): SavedMirrorItem[] {
  return readJson<SavedMirrorItem[]>(KEYS.savedMirror) ?? [];
}

export function addSavedMirror(item: SavedMirrorItem): void {
  const items = getSavedMirror();
  items.unshift(item);
  writeJson(KEYS.savedMirror, items);
}

export function removeSavedMirror(id: string): void {
  const items = getSavedMirror().filter((i) => i.id !== id);
  writeJson(KEYS.savedMirror, items);
}

export function isFacilitySaved(uniqueId: string): boolean {
  return getSavedMirror().some((i) => i.facility.unique_id === uniqueId);
}
