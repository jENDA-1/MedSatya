"""Data desert vs medical desert (concept ch.6).

The single most important honesty distinction the challenge rewards: separate
  * "we don't know"        (weak care evidence + LOW data quality)  -> DATA DESERT (grey)
  * "care probably absent" (weak care evidence + HIGH data quality) -> MEDICAL DESERT (red)

A facility with a rich, well-populated record but no evidence for the care type is very different
from one whose record is nearly empty: the first is likely a real gap, the second is a data gap.
"""
from __future__ import annotations

from backend.engine import evidence as ev

DATA_CONF_THRESHOLD = 0.5

# desert_type -> (label, ui_color, meaning)
EVIDENCED = "evidenced_coverage"
POTENTIAL = "potential_coverage"
MEDICAL_DESERT = "likely_medical_desert"
DATA_DESERT = "data_desert"

DESERT_META = {
    EVIDENCED: {"label": "Evidenced coverage", "color": "green",
                "meaning": "Care claim is corroborated and the record is reasonably complete."},
    POTENTIAL: {"label": "Potential coverage — verify", "color": "gold",
                "meaning": "Some care evidence, but the record is thin — confirm by phone."},
    MEDICAL_DESERT: {"label": "Likely care gap", "color": "red",
                     "meaning": "The record is fairly complete yet shows no real evidence of this care — care may be absent."},
    DATA_DESERT: {"label": "Unknown — data gap", "color": "grey",
                  "meaning": "We don't have enough data to judge. Absence here means missing data, not missing care."},
}


def classify(evidence: ev.Evidence) -> dict:
    # Honesty: GREEN "Evidenced coverage" is reserved for STRONGLY supported — a claim corroborated
    # by ≥2 independent fields. `partially_supported` means "not fully corroborated", so it is
    # POTENTIAL (gold "verify by phone"), NOT green — otherwise the dominant partially band (55–80%
    # of a real shortlist) paints ~70–93% of cards green while the amber trust meter beside it says
    # "partial". Green only for the genuinely strong signal keeps the semafor honest.
    high_data = evidence.data_confidence >= DATA_CONF_THRESHOLD

    if evidence.status == ev.STRONGLY:
        t = EVIDENCED if high_data else POTENTIAL
    elif evidence.status == ev.PARTIALLY:
        # some evidence, but not fully corroborated -> always "verify", never green
        t = POTENTIAL
    elif high_data:
        # rich record but no care evidence -> likely a real gap (unless explicitly contradictory,
        # which is an even stronger negative signal but still "care not evidenced here")
        t = MEDICAL_DESERT
    else:
        t = DATA_DESERT

    return {"type": t, **DESERT_META[t]}


def area_summary(evidences: list[ev.Evidence]) -> dict:
    """Aggregate the shortlist into an honest area picture: how much is unknown vs likely-absent."""
    n = len(evidences)
    counts = {"evidenced": 0, "claim_only": 0, "contradictory": 0, "unknown": 0}
    for e in evidences:
        if e.status in (ev.STRONGLY, ev.PARTIALLY):
            counts["evidenced"] += 1
        elif e.status == ev.CONTRADICTORY:
            counts["contradictory"] += 1
        elif e.status == ev.NOT_ENOUGH:
            counts["unknown"] += 1
        else:  # claim_only
            counts["claim_only"] += 1
    return {
        "total": n,
        "evidenced": counts["evidenced"],
        "claim_only": counts["claim_only"],
        "contradictory": counts["contradictory"],
        "unknown": counts["unknown"],
    }
