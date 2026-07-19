// Small presentation helpers shared across components.

import type { DesertColor, DesertType, EvidenceStatus } from "./api";

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || Number.isNaN(km)) return "Distance unknown";
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

export interface EvidenceVisual {
  label: string;
  colorClass: string; // text colour utility class
  bgClass: string; // background utility class (soft)
  borderClass: string;
  icon: string; // simple glyph, paired with text (never colour-only)
}

const EVIDENCE_VISUALS: Record<EvidenceStatus, EvidenceVisual> = {
  strongly_supported: {
    label: "Strongly supported",
    colorClass: "text-evidence-strong",
    bgClass: "bg-evidence-strong/10",
    borderClass: "border-evidence-strong/40",
    icon: "✓",
  },
  partially_supported: {
    label: "Partially supported",
    colorClass: "text-evidence-partial",
    bgClass: "bg-evidence-partial/10",
    borderClass: "border-evidence-partial/40",
    icon: "◐",
  },
  claim_only: {
    label: "Claim only",
    colorClass: "text-evidence-claim",
    bgClass: "bg-evidence-claim/10",
    borderClass: "border-evidence-claim/40",
    icon: "?",
  },
  contradictory: {
    label: "Contradictory evidence",
    colorClass: "text-evidence-contradictory",
    bgClass: "bg-evidence-contradictory/10",
    borderClass: "border-evidence-contradictory/40",
    icon: "!",
  },
  not_enough_data: {
    label: "Not enough data",
    colorClass: "text-evidence-unknown",
    bgClass: "bg-evidence-unknown/10",
    borderClass: "border-evidence-unknown/40",
    icon: "…",
  },
};

export function evidenceVisual(status: EvidenceStatus): EvidenceVisual {
  return EVIDENCE_VISUALS[status] ?? EVIDENCE_VISUALS.not_enough_data;
}

export interface DesertVisual {
  colorClass: string;
  bgClass: string;
  borderClass: string;
  icon: string;
}

const DESERT_COLOR_MAP: Record<DesertColor, DesertVisual> = {
  green: {
    colorClass: "text-evidence-strong",
    bgClass: "bg-evidence-strong/10",
    borderClass: "border-evidence-strong/40",
    icon: "✓",
  },
  gold: {
    colorClass: "text-evidence-partial",
    bgClass: "bg-evidence-partial/10",
    borderClass: "border-evidence-partial/40",
    icon: "◐",
  },
  red: {
    colorClass: "text-evidence-contradictory",
    bgClass: "bg-evidence-contradictory/10",
    borderClass: "border-evidence-contradictory/40",
    icon: "⚠",
  },
  grey: {
    colorClass: "text-evidence-unknown",
    bgClass: "bg-evidence-unknown/10",
    borderClass: "border-evidence-unknown/40",
    icon: "?",
  },
};

export function desertVisual(color: DesertColor): DesertVisual {
  return DESERT_COLOR_MAP[color] ?? DESERT_COLOR_MAP.grey;
}

export function desertTypeExplainer(type: DesertType): string {
  switch (type) {
    case "evidenced_coverage":
      return "Multiple independent signals (equipment, procedures, specialties) support this care type here.";
    case "potential_coverage":
      return "Some evidence supports this care type, but it is not fully corroborated across sources.";
    case "likely_medical_desert":
      return "Available evidence suggests this care type is probably NOT offered here — this is a claim about likely absence, not a confirmed fact.";
    case "data_desert":
      return "We simply don't have enough data about this facility to say either way. This is a data gap, not evidence of absence.";
    default:
      return "";
  }
}

/** Convert a camelCase specialty key into readable Title Case words. */
export function titleCaseSpecialty(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function tierLabel(tier: string | null): string | null {
  if (tier === "primary") return "Primary";
  if (tier === "backup") return "Backup";
  if (tier === "fallback") return "Fallback";
  return null;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Source-count label. The upstream dataset caps `source_urls` at 50, so a
 * facility pegged at exactly 50 is truncated — show "50+", not a real count.
 */
export function sourceCountLabel(urls: string[] | null | undefined): string {
  const n = urls?.length ?? 0;
  return n >= 50 ? "50+" : String(n);
}

/**
 * Trust-meter model: maps the 5 evidence bands onto a red→gold→green scale
 * carried by colour + shape + icon + text (colourblind-safe). Honesty: this is
 * the STRENGTH OF EVIDENCE that a facility provides a given care type — NOT a
 * rating of hospital quality. "Not enough data" (grey, data desert) is kept
 * visually distinct from "contradictory/claim" (red, likely-absent).
 */
export interface TrustMeterModel {
  status: EvidenceStatus;
  /** Filled segments out of 5 — the fixed per-band fallback fill. */
  level: number;
  /**
   * Continuous fill out of 5 (segments, may be fractional). Equals `level`
   * unless a `care_evidence` value (0–1) was passed into `trustMeter()`, in
   * which case it is mapped into this band's `fillRange` — so two facilities
   * in the SAME band still render visibly different fills. Honesty: this
   * variability never crosses into a different band's territory and never
   * changes colour, shape, icon or label — only how much of the band's own
   * slice is filled.
   */
  fraction: number;
  label: string;
  /** One-line honesty meaning for this band. */
  meaning: string;
  colorClass: string; // text-evidence-*
  fillClass: string; // bg-evidence-* for filled segments
  icon: string; // glyph paired with text (never colour-only)
  /** Geometric shape name, a second non-colour channel for colourblind users. */
  shape: "check" | "half" | "query" | "cross" | "dots";
  /** True for the grey "we don't know" band — render distinctly from red. */
  isDataDesert: boolean;
  /** [min, max] continuous-fill window (segments out of 5) this band's `care_evidence` maps into. */
  fillRange: [number, number];
}

const TRUST_METER: Record<EvidenceStatus, TrustMeterModel> = {
  strongly_supported: {
    status: "strongly_supported",
    level: 5,
    fraction: 5,
    label: "Strongly supported",
    meaning: "Independent fields (equipment, procedures, specialties) back this claim.",
    colorClass: "text-evidence-strong",
    fillClass: "bg-evidence-strong",
    icon: "✓",
    shape: "check",
    isDataDesert: false,
    fillRange: [4.0, 5.0],
  },
  partially_supported: {
    status: "partially_supported",
    level: 3,
    fraction: 3,
    label: "Partially supported",
    meaning: "Some evidence backs this claim, but it isn't fully corroborated.",
    colorClass: "text-evidence-partial",
    fillClass: "bg-evidence-partial",
    icon: "◐",
    shape: "half",
    isDataDesert: false,
    fillRange: [2.2, 3.4],
  },
  claim_only: {
    status: "claim_only",
    level: 2,
    fraction: 2,
    label: "Claim only",
    meaning: "The facility claims this care, but nothing in the data supports it.",
    colorClass: "text-evidence-claim",
    fillClass: "bg-evidence-claim",
    icon: "?",
    shape: "query",
    isDataDesert: false,
    fillRange: [1.3, 2.1],
  },
  contradictory: {
    status: "contradictory",
    level: 1,
    fraction: 1,
    label: "Contradictory evidence",
    meaning: "Sources conflict about this care type — treat with caution.",
    colorClass: "text-evidence-contradictory",
    fillClass: "bg-evidence-contradictory",
    icon: "!",
    shape: "cross",
    isDataDesert: false,
    fillRange: [0.4, 1.2],
  },
  not_enough_data: {
    status: "not_enough_data",
    level: 0,
    fraction: 0,
    label: "Not enough data",
    meaning: "We simply don't have enough data — a gap, not evidence of absence.",
    colorClass: "text-evidence-unknown",
    fillClass: "bg-evidence-unknown",
    icon: "…",
    shape: "dots",
    isDataDesert: true,
    fillRange: [0, 0],
  },
};

/**
 * Look up the trust-meter model for a band. When `careEvidence` (0–1, the
 * `evidence.care_evidence` score) is supplied, `fraction` is remapped into
 * the band's own `fillRange` so two facilities in the same band render
 * visibly different fills — e.g. `strongly_supported` at 0.62 vs 0.94 both
 * stay clearly "strong" (fraction in [4,5]) but are not identical. Omit
 * `careEvidence` to get the previous fixed-`level` behaviour unchanged.
 */
export function trustMeter(status: EvidenceStatus, careEvidence?: number): TrustMeterModel {
  const base = TRUST_METER[status] ?? TRUST_METER.not_enough_data;
  if (
    careEvidence === undefined ||
    careEvidence === null ||
    Number.isNaN(careEvidence) ||
    base.isDataDesert // "not enough data" always renders dashed, never a partial fill
  ) {
    return base;
  }
  const clamped = Math.min(1, Math.max(0, careEvidence));
  const [min, max] = base.fillRange;
  return { ...base, fraction: min + clamped * (max - min) };
}
