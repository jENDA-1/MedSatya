"""Ranking (methodology §17, MVP) + shortlist assembly.

Rule: **status band first, then a rank_score within the band.** No numeric score may promote a
facility across a status gate. Community adjustment (±5) and human-verification weight are hooks
(no-op) for this MVP; traffic is off, so access = straight-line (Haversine) distance.

The shortlist is surfaced as a ladder (primary / backup / fallback). We also flag the NEAREST
facility separately, because nearest is not the same as best-evidenced (an explicit honesty point).
"""
from __future__ import annotations

import datetime
import re

from backend.engine import checklist
from backend.engine import desert
from backend.engine import evidence as ev

# Band ordering (lower = higher in the list). "A: strongly + recent human verify" collapses into
# strongly for this MVP since human verification is a no-op hook.
BAND_ORDER = {
    ev.STRONGLY: 1,
    ev.PARTIALLY: 2,
    ev.CLAIM_ONLY: 3,
    ev.NOT_ENOUGH: 4,
    ev.CONTRADICTORY: 5,
}

TIER_LABELS = {0: "primary", 1: "backup", 2: "fallback"}


def freshness_score(freshness: dict) -> tuple[float, str]:
    """Score recency 0..1 from whatever date-ish signals exist. Unknown -> low + flagged.

    Honesty: we never treat 'unknown' as 'fresh' — absence yields a low score and an explicit label.
    """
    now_year = datetime.datetime.now().year
    years: list[int] = []
    for v in (freshness or {}).get("last_social_post"), (freshness or {}).get("page_update"):
        if v:
            m = re.search(r"(20\d{2})", str(v))
            if m:
                years.append(int(m.group(1)))
    if not years:
        return 0.2, "unknown"
    y = max(years)
    age = max(0, now_year - y)
    return round(max(0.05, min(1.0, 1 - age / 6.0)), 3), f"~{y}"


def distance_access_score(distance_km: float | None) -> float:
    if distance_km is None:
        return 0.2  # unknown location -> penalized, not zero
    return round(max(0.0, min(1.0, 1 - distance_km / 150.0)), 3)


def location_confidence_score(coord_valid: bool) -> float:
    return 1.0 if coord_valid else 0.35


def rank_score(care_evidence: float, freshness: float, distance_access: float,
               location_confidence: float, human_verification: float = 0.0,
               community_adjustment: float = 0.0) -> float:
    """Within-band rank score (0..100). The status band gates ranking (see BAND_ORDER); this score
    only orders facilities *inside* a band and can NEVER promote one across a status gate — the core
    honesty invariant (methodology §17).

    Safe-learning hooks (present but INERT in this MVP — the engine is deterministic by design; cf.
    docs/STATUS.md "Hooks only (NOT built): … RL bandit …" and the methodology's §9 "Safe
    Reinforcement Learning" / §10 "Safe learning lifecycle"):
      * ``human_verification`` (0..1) — a human-review / expert-verification signal.
      * ``community_adjustment`` (±5) — an aggregate crowd/doctor correction.
    Both default to ``0.0`` and are intentionally NOT passed at the only call site
    (``build_shortlist`` below), so today the score is fully deterministic and reproducible.

    They are the wired plug-in points for a FUTURE *safe constrained contextual bandit*, not built
    here: the feedback already logged (write-only) by ``persistence/feedback.py`` (``/api/feedback``)
    is the offline training set; a learned policy would supply ``human_verification`` /
    ``community_adjustment`` at this call — trained offline → shadow-mode → limited rollout — and
    stays SAFE because it is bounded to re-rank only WITHIN a band (never across an evidence gate),
    with emergency care types kept purely deterministic (no exploration). Nothing learns online today.
    """
    base = 100.0 * (
        0.50 * care_evidence
        + 0.20 * freshness
        + 0.15 * distance_access
        + 0.10 * human_verification      # hook (no-op)
        + 0.05 * location_confidence
    )
    return round(max(0.0, min(100.0, base + community_adjustment)), 1)  # community_adjustment: hook


# Facility fields carried into the shortlist item (for card + Trust Passport).
_CARRY = (
    "unique_id", "cluster_id", "name", "address", "phones", "websites",
    "latitude", "longitude", "coord_valid", "distance_km",
    "capability", "equipment", "procedure", "specialties", "description",
    "source_urls", "freshness",
)


def build_shortlist(candidates: list[dict], care_need: str) -> dict:
    """Assess + rank candidates into an evidence-attached shortlist."""
    items = []
    evidences = []
    for fac in candidates:
        e = ev.assess(fac, care_need)
        evidences.append(e)
        fr_score, fr_label = freshness_score(fac.get("freshness", {}))
        dist_score = distance_access_score(fac.get("distance_km"))
        loc_score = location_confidence_score(bool(fac.get("coord_valid")))
        score = rank_score(e.care_evidence, fr_score, dist_score, loc_score)
        item = {k: fac.get(k) for k in _CARRY}
        item["evidence"] = e.to_dict()
        item["desert"] = desert.classify(e)
        item["call_checklist"] = checklist.call_checklist(e)
        item["rank_score"] = score
        item["band"] = e.status
        item["band_order"] = BAND_ORDER[e.status]
        item["scores"] = {
            "care_evidence": e.care_evidence,
            "freshness": fr_score,
            "freshness_label": fr_label,
            "distance_access": dist_score,
            "location_confidence": loc_score,
        }
        items.append(item)

    # Band-first, then rank_score desc.
    items.sort(key=lambda it: (it["band_order"], -it["rank_score"]))

    # Ladder tiers on the top of the ranking.
    for i, it in enumerate(items):
        it["tier"] = TIER_LABELS.get(i)

    # Nearest (by distance) flagged separately — nearest != best-evidenced.
    nearest_id = None
    with_dist = [it for it in items if it.get("distance_km") is not None]
    if with_dist:
        nearest = min(with_dist, key=lambda it: it["distance_km"])
        nearest_id = nearest["unique_id"]
    for it in items:
        it["is_nearest"] = it["unique_id"] == nearest_id

    return {
        "care_need": care_need,
        "count": len(items),
        "results": items,
        "area_summary": desert.area_summary(evidences),
    }
