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
