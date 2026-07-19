"""Fast, offline unit tests for the Trust Engine (no warehouse needed).

Run: python tests/test_evidence.py   (from the MedSatya/ repo root)
Guards the core honesty rules: cross-field corroboration, empty != contradiction, band ordering.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.engine import evidence as ev
from backend.engine import ranking


def fac(**kw):
    base = dict(
        unique_id="x", cluster_id="x", name="Test", capability=[], equipment=[], procedure=[],
        specialties=[], description="", source_urls=["http://s"], phones=["1"], coord_valid=True,
        distance_km=5.0, freshness={},
    )
    base.update(kw)
    return base


def test_strongly_supported():
    f = fac(capability=["Has 10 ICU beds"], equipment=["Ventilator available"],
            specialties=["criticalCareMedicine"])
    e = ev.assess(f, "icu")
    assert e.status == ev.STRONGLY, e.status
    assert any(c["role"] == "equipment" for c in e.citations)
    assert any(c["role"] == "claim" for c in e.citations)


def test_partially_supported():
    f = fac(capability=["ICU unit"], equipment=["Ventilator"])
    e = ev.assess(f, "icu")
    assert e.status == ev.PARTIALLY, e.status


def test_claim_only_empty_fields_not_negative():
    # Claims ICU but NO supporting fields -> claim_only, NOT contradictory (empty != negative).
    f = fac(capability=["ICU available"])
    e = ev.assess(f, "icu")
    assert e.status == ev.CLAIM_ONLY, e.status
    assert e.support_axes == {"equipment": False, "procedure": False, "specialty": False}


def test_contradiction_outweighs_absence():
    f = fac(capability=["ICU"], description="This facility has no ICU; patients referred to higher center.")
    e = ev.assess(f, "icu")
    assert e.status == ev.CONTRADICTORY, e.status
    assert e.contradictions


def test_not_enough_data_without_claim():
    f = fac(capability=["Pharmacy"], equipment=["Fridge"])
    e = ev.assess(f, "icu")
    assert e.status == ev.NOT_ENOUGH, e.status


def test_band_ordering_and_desert():
    cands = [
        fac(unique_id="a", name="Strong", capability=["ICU beds"], equipment=["Ventilator"],
            specialties=["criticalCareMedicine"], distance_km=20),
        fac(unique_id="b", name="ClaimOnly", capability=["ICU"], distance_km=1,
            equipment=[], procedure=[], specialties=[]),
        fac(unique_id="c", name="Partial", capability=["ICU"], equipment=["Ventilator"], distance_km=2),
    ]
    sl = ranking.build_shortlist(cands, "icu")
    orders = [it["band_order"] for it in sl["results"]]
    assert orders == sorted(orders), orders
    # strongly must come before claim_only even though claim_only is nearer
    names = [it["name"] for it in sl["results"]]
    assert names.index("Strong") < names.index("ClaimOnly")
    # nearest flag points at the actually-closest (ClaimOnly @1km), not the best-evidenced
    nearest = next(it for it in sl["results"] if it["is_nearest"])
    assert nearest["name"] == "ClaimOnly", nearest["name"]
    # claim_only with no support + full record would be medical desert; here sparse -> data desert
    co = next(it for it in sl["results"] if it["name"] == "ClaimOnly")
    assert co["desert"]["type"] in ("data_desert", "likely_medical_desert")


def test_claim_from_specialty_not_double_counted():
    # Maternity claim keyword "obstetric" lives INSIDE the specialties tag "gynecologyandobstetrics",
    # and so does the specialty support keyword "obstetrics". The SAME item must not satisfy both the
    # claim and an independent support axis — otherwise one taxonomy tag inflates to "claim + support".
    f = fac(capability=[], equipment=[], procedure=[], specialties=["gynecologyandobstetrics"])
    e = ev.assess(f, "maternity")
    assert e.status == ev.CLAIM_ONLY, e.status
    assert e.support_axes["specialty"] is False, e.support_axes
    # Receipts preserved: the claim citation is still there (we filter axis counting, not citations).
    assert any(c["role"] == "claim" for c in e.citations), e.citations


def test_independent_specialty_still_counts():
    # When the claim comes from `capability`, a DIFFERENT specialties item is genuine independent
    # support and must still raise the facility to partially_supported (ICU/NICU behaviour unchanged).
    f = fac(capability=["9 ICU beds"], equipment=[], procedure=[], specialties=["criticalCareMedicine"])
    e = ev.assess(f, "icu")
    assert e.status == ev.PARTIALLY, e.status
    assert e.support_axes["specialty"] is True, e.support_axes


def test_care_evidence_varies_within_band():
    # Two STRONGLY facilities with different depth of corroboration must score differently, so the
    # trust meter shows visible within-band ranking (the old formula saturated everything at ~0.78).
    thin = fac(capability=["ICU"], equipment=["Ventilator"], specialties=["criticalCareMedicine"])
    rich = fac(
        capability=["ICU"],
        equipment=["Ventilator", "cardiac monitor", "defibrillator", "infusion pump"],
        procedure=["mechanical ventilation", "intubation"],
        specialties=["criticalCareMedicine", "anesthesia", "pulmonology"],
    )
    et, er = ev.assess(thin, "icu"), ev.assess(rich, "icu")
    assert et.status == ev.STRONGLY and er.status == ev.STRONGLY, (et.status, er.status)
    assert er.care_evidence > et.care_evidence, (er.care_evidence, et.care_evidence)


def test_trauma_generic_infra_gated_to_partially():
    # Session-6 specificity gate. Claims "Trauma Centre" + generic multispecialty infra (surgery depts
    # + CT + OT) = 2 support axes, but NOTHING trauma-specific (no trauma bay / trauma surgery). This
    # generic infrastructure is what ANY large hospital carries, so a bare claim + big-hospital gear
    # must NOT reach STRONGLY (green) — it is demoted to partially_supported ("verify by phone").
    f = fac(capability=["Trauma Centre with 24x7 emergency services"],
            equipment=["CT scan", "operation theatre"],
            specialties=["orthopedicSurgery", "generalSurgery"])
    e = ev.assess(f, "trauma")
    assert e.status == ev.PARTIALLY, e.status
    # The receipts are preserved — we gate the BAND, not the citations. Both axes still show support.
    assert e.support_axes["equipment"] is True and e.support_axes["specialty"] is True, e.support_axes


def test_trauma_specific_signal_reaches_strongly():
    # The gate keeps green available for the real thing: a designated trauma facility whose support
    # includes a trauma-SPECIFIC signal (trauma bay) plus a second axis reaches STRONGLY.
    f = fac(capability=["Level I Trauma center"],
            equipment=["Trauma bay", "CT scan"],
            specialties=["orthopedicSurgery"])
    e = ev.assess(f, "trauma")
    assert e.status == ev.STRONGLY, e.status


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
        passed += 1
    print(f"\n{passed}/{len(tests)} passed")
