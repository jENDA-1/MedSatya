"""Evidence assessment — the heart of the Trust Engine (deterministic MVP).

We do NOT score "hospital trustworthiness". For a unit `(facility, care_need)` we score the
**strength of evidence that this facility provides this care type**, by cross-field corroboration:
a CLAIM in `capability`/`description`/`specialties` is checked against SUPPORT in
`equipment` / `procedure` / `specialties`.

Hard honesty rules (from the methodology):
  * An empty field is NOT negative evidence — absence lowers confidence, never makes it contradictory.
  * An EXPLICIT contradiction (a field that denies the claim) outweighs absence.
  * Every status carries exact-span citations (the specific field + text) + source_urls ("receipts").
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

from backend import config

# Evidence status bands (methodology §17). Order here is the ranking ladder (best -> worst).
STRONGLY = "strongly_supported"
PARTIALLY = "partially_supported"
CLAIM_ONLY = "claim_only"
NOT_ENOUGH = "not_enough_data"
CONTRADICTORY = "contradictory"

STATUS_LABEL = {
    STRONGLY: "Strongly supported",
    PARTIALLY: "Partially supported",
    CLAIM_ONLY: "Claim only — no supporting evidence",
    NOT_ENOUGH: "Not enough data",
    CONTRADICTORY: "Contradictory",
}


@dataclass
class Citation:
    field: str          # source field the span came from
    text: str           # the exact span (array item or sentence) — the "receipt" content
    matched: str        # the keyword that matched
    role: str           # claim | equipment | procedure | specialty | contradiction


@dataclass
class Evidence:
    care_need: str
    status: str
    status_label: str
    care_evidence: float          # 0..1 within-band ranking signal
    data_confidence: float        # 0..1 record completeness (drives desert classification)
    support_axes: dict            # {equipment: bool, procedure: bool, specialty: bool}
    citations: list               # list[Citation-as-dict] (claim + supports)
    contradictions: list          # list[Citation-as-dict]
    missing: list                 # human-readable list of what is NOT confirmed
    source_urls: list             # provenance receipts

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


_SENT_SPLIT = re.compile(r"[.;\n]")


def _sentence_for(text: str, kw: str) -> str | None:
    """Return the sentence in `text` containing `kw` (case-insensitive), trimmed."""
    if not text:
        return None
    low = text.lower()
    idx = low.find(kw.lower())
    if idx < 0:
        return None
    # find sentence boundaries around idx
    start = 0
    for m in _SENT_SPLIT.finditer(text[:idx]):
        start = m.end()
    end_m = _SENT_SPLIT.search(text, idx)
    end = end_m.start() if end_m else len(text)
    sent = text[start:end].strip()
    return sent[:240] if sent else None


def _match_in_array(items: list[str], keywords: list[str], field_name: str, role: str) -> list[Citation]:
    cites: list[Citation] = []
    seen: set[str] = set()
    for item in items:
        il = item.lower()
        for kw in keywords:
            if kw.lower() in il and item not in seen:
                seen.add(item)
                cites.append(Citation(field=field_name, text=item.strip()[:240], matched=kw, role=role))
                break
    return cites


def _match_in_text(text: str, keywords: list[str], field_name: str, role: str) -> list[Citation]:
    cites: list[Citation] = []
    for kw in keywords:
        sent = _sentence_for(text, kw)
        if sent:
            cites.append(Citation(field=field_name, text=sent, matched=kw, role=role))
    return cites


def _data_confidence(fac: dict) -> float:
    """Record completeness 0..1 — how much do we actually know about this facility?"""
    signals = [
        bool(fac.get("capability")),
        bool(fac.get("equipment")),
        bool(fac.get("procedure")),
        bool(fac.get("specialties")),
        bool((fac.get("description") or "").strip()),
        bool(fac.get("phones")),
        bool(fac.get("source_urls")),
        bool(fac.get("coord_valid")),
    ]
    return round(sum(signals) / len(signals), 3)


def assess(fac: dict, care_need: str) -> Evidence:
    """Assess evidence that `fac` provides `care_need`."""
    cfg = config.care_need_config(care_need)
    if not cfg:
        raise ValueError(f"unknown care_need '{care_need}'")

    capability = fac.get("capability", []) or []
    equipment = fac.get("equipment", []) or []
    procedure = fac.get("procedure", []) or []
    specialties = fac.get("specialties", []) or []
    description = fac.get("description", "") or ""

    # --- CLAIM: does the facility claim this care type? (capability > specialties > description)
    claim_cites: list[Citation] = []
    claim_cites += _match_in_array(capability, cfg["claim_keywords"], "capability", "claim")
    claim_cites += _match_in_array(specialties, cfg["claim_keywords"], "specialties", "claim")
    if not claim_cites:
        claim_cites += _match_in_text(description, cfg["claim_keywords"], "description", "claim")

    # --- SUPPORT axes (cross-field corroboration)
    # Honesty: a support axis must be INDEPENDENT of the claim. For care types whose claim keyword
    # lives in `specialties` (e.g. maternity: "obstetric" ⊂ "gynecologyandobstetrics"), the SAME
    # specialties item would otherwise satisfy both the claim and the specialty support axis —
    # inflating one taxonomy tag into "claim + corroboration". So the specialty axis only counts
    # specialties items that were NOT already consumed as the claim source. Items where the claim
    # comes from `capability`/`description` (ICU/NICU) keep an independent specialty axis unchanged.
    claim_spec_items = {c.text for c in claim_cites if c.field == "specialties"}
    spec_pool = [s for s in specialties if s.strip()[:240] not in claim_spec_items]

    eq_cites = _match_in_array(equipment, cfg["equipment_keywords"], "equipment", "equipment")
    proc_cites = _match_in_array(procedure, cfg["procedure_keywords"], "procedure", "procedure")
    spec_cites = _match_in_array(spec_pool, cfg["specialty_keywords"], "specialties", "specialty")

    # --- CONTRADICTIONS (explicit denial in any narrative/claim field)
    contra: list[Citation] = []
    for fld, items in (("capability", capability), ("procedure", procedure), ("specialties", specialties)):
        contra += _match_in_array(items, cfg["contradiction_keywords"], fld, "contradiction")
    contra += _match_in_text(description, cfg["contradiction_keywords"], "description", "contradiction")

    has_claim = bool(claim_cites)
    axes = {
        "equipment": bool(eq_cites),
        "procedure": bool(proc_cites),
        "specialty": bool(spec_cites),
    }
    n_support = sum(axes.values())

    # --- Specificity gate (opt-in per care-need, honesty; Session-6).
    # For a care type whose support fields are otherwise generic (trauma: surgery depts + ct/ot/blood
    # bank — infrastructure ANY large hospital carries), reaching STRONGLY on two GENERIC axes over-
    # credits a bare claim. `specific_support_keywords` names the discriminating signals (e.g. trauma
    # bay / trauma surgery); STRONGLY then additionally requires at least one of them among the SUPPORT
    # citations. Care types without the key keep `has_specific = True` → identical behavior (no
    # regression to icu/nicu/…). Generic-only corroboration is demoted to PARTIALLY ("verify"), never
    # dropped below — the citations are still emitted in full.
    specific_kws = {k.lower() for k in cfg.get("specific_support_keywords", [])}
    if specific_kws:
        has_specific = any(
            c.matched.lower() in specific_kws for c in (eq_cites + proc_cites + spec_cites)
        )
    else:
        has_specific = True

    # --- Band assignment
    if contra:
        status = CONTRADICTORY
    elif not has_claim:
        status = NOT_ENOUGH
    elif n_support >= 2 and has_specific:
        status = STRONGLY
    elif n_support >= 1:
        status = PARTIALLY
    else:
        status = CLAIM_ONLY

    # --- care_evidence (within-band ranking signal, 0..1)
    # Count-weighted and granular so two facilities in the SAME band differ visibly (the previous
    # all-or-nothing form saturated: nearly every STRONGLY landed on exactly 0.78). Depth of
    # corroboration counts — more distinct equipment/procedure matches score higher — while the
    # specialty axis (a taxonomy tag, the weakest signal) is weighted lowest and capped low. This
    # only spreads ranking WITHIN a band; it never moves a facility across a status gate.
    n_eq, n_proc, n_spec = len(eq_cites), len(proc_cites), len(spec_cites)
    care_evidence = round(
        min(
            1.0,
            (0.20 if has_claim else 0.0)
            + (min(0.34, 0.20 + 0.07 * n_eq) if n_eq else 0.0)
            + (min(0.26, 0.14 + 0.06 * n_proc) if n_proc else 0.0)
            + (min(0.14, 0.06 * n_spec) if n_spec else 0.0),
        ),
        3,
    )
    if status == CONTRADICTORY:
        care_evidence = 0.0

    # --- missing support -> feeds the call-before-travel checklist
    missing: list[str] = []
    if not axes["equipment"]:
        missing.append("equipment")
    if not axes["procedure"]:
        missing.append("procedure")
    if not axes["specialty"]:
        missing.append("specialty")
    # We NEVER know these from the data — always to be confirmed by phone:
    missing.append("current_operation")   # is the unit operating right now
    missing.append("bed_availability")    # is a bed free
    missing.append("admission")           # will they admit this patient

    citations = [asdict(c) for c in (claim_cites + eq_cites + proc_cites + spec_cites)]
    contradictions = [asdict(c) for c in contra]

    return Evidence(
        care_need=care_need,
        status=status,
        status_label=STATUS_LABEL[status],
        care_evidence=care_evidence,
        data_confidence=_data_confidence(fac),
        support_axes=axes,
        citations=citations,
        contradictions=contradictions,
        missing=missing,
        source_urls=fac.get("source_urls", []) or [],
    )
