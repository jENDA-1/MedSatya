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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
        passed += 1
    print(f"\n{passed}/{len(tests)} passed")
