"""Call-before-travel checklist — generated from exactly what the data does NOT confirm.

This is a core honesty feature: instead of pretending to know current operation / bed availability,
we turn every unknown into a concrete question to ask on the phone before travelling.
"""
from __future__ import annotations

from backend import config
from backend.engine import evidence as ev

# A couple of concrete examples per care-need to make the questions actionable.
_EXAMPLES = {
    "icu": {"equipment": "ventilator, cardiac monitor", "specialty": "an intensivist / anaesthetist"},
    "nicu": {"equipment": "incubator, infant warmer, neonatal ventilator", "specialty": "a neonatologist"},
    "emergency": {"equipment": "ambulance, resuscitation kit", "specialty": "an emergency physician"},
    "maternity": {"equipment": "labour room, fetal monitor", "specialty": "an obstetrician"},
    "trauma": {"equipment": "CT scanner, operation theatre, blood bank", "specialty": "a trauma surgeon"},
    "dialysis": {"equipment": "dialysis machines", "specialty": "a nephrologist"},
    "oncology": {"equipment": "chemotherapy / radiotherapy units", "specialty": "an oncologist"},
}


def call_checklist(evidence: ev.Evidence) -> list[str]:
    cn = evidence.care_need
    cfg = config.care_need_config(cn) or {}
    label = cfg.get("label", cn.upper())
    ex = _EXAMPLES.get(cn, {})
    q: list[str] = []

    missing = set(evidence.missing)
    if "equipment" in missing:
        eq = ex.get("equipment", "the required equipment")
        q.append(f"Confirm the {label} has the necessary equipment ({eq}).")
    if "specialty" in missing:
        sp = ex.get("specialty", "a relevant specialist")
        q.append(f"Ask whether {sp} is on staff and available.")
    if "procedure" in missing:
        q.append(f"Ask whether they actually perform {label}-related procedures.")

    # Always-unknown from data — never presented as fact, always a question:
    q.append(f"Confirm the {label} is operating right now.")
    q.append("Ask if a bed is currently free — we cannot know this from the data.")
    q.append("Confirm they can admit this patient today.")

    if evidence.contradictions:
        q.append("Note: some information contradicts this claim — verify carefully before travelling.")

    return q
