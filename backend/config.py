"""Configuration for MedSatya — everything parametrized via env, nothing hardcoded in logic.

The care-need taxonomy is the single source of truth for BOTH candidate filtering (data layer)
and cross-field evidence corroboration (engine). It is NOT a medical standard — it is a set of
keyword signals used to check whether a facility's *claim* of a capability is corroborated by
supporting fields (equipment / procedure / specialties).
"""
from __future__ import annotations

import os


def _env(key: str, default: str | None = None) -> str | None:
    v = os.environ.get(key)
    return v if v not in (None, "") else default


# --- Data source (parametrized; never hardcode in queries) ---
CATALOG = _env("MEDSATYA_CATALOG", "databricks_virtue_foundation_dataset_dais_2026")
SCHEMA = _env("MEDSATYA_SCHEMA", "virtue_foundation_dataset")
FACILITIES_TABLE = _env("MEDSATYA_FACILITIES_TABLE", "facilities")

# --- SQL Warehouse (in-platform: injected as app resource; local: from .env) ---
WAREHOUSE_ID = _env("DATABRICKS_WAREHOUSE_ID", "344b0522dfa0bbb2")


def facilities_fqn() -> str:
    return f"{CATALOG}.{SCHEMA}.{FACILITIES_TABLE}"


# --- Persistence store (writable Delta table; survives app restart) ---
STORE_CATALOG = _env("MEDSATYA_STORE_CATALOG", "workspace")
STORE_SCHEMA = _env("MEDSATYA_STORE_SCHEMA", "medsatya")
STORE_TABLE = _env("MEDSATYA_STORE_TABLE", "saved")


def store_fqn() -> str:
    return f"`{STORE_CATALOG}`.`{STORE_SCHEMA}`.`{STORE_TABLE}`"


# --- Coordinate validation: India bounding box (drives location_confidence) ---
INDIA_LAT = (6.0, 38.0)
INDIA_LON = (68.0, 98.0)


def coord_in_india(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    return INDIA_LAT[0] <= lat <= INDIA_LAT[1] and INDIA_LON[0] <= lon <= INDIA_LON[1]


# --- Care-need taxonomy ---------------------------------------------------------
# claim_keywords     : substrings that indicate the facility CLAIMS this care type
#                      (matched against `capability` + `description`) -> candidate filter.
# equipment/procedure/specialty_keywords : the corroborating support signals the engine
#                      checks in the respective fields. Each corroborated field = one
#                      independent support axis.
# contradiction_keywords : phrases that, if present, directly contradict the claim.
# tau_minutes        : reference travel-time band for access scoring (config, not a standard).
CARE_NEEDS: dict[str, dict] = {
    "icu": {
        "label": "ICU (Intensive Care)",
        "claim_keywords": ["icu", "intensive care", "critical care", "intensive-care unit"],
        "equipment_keywords": [
            "ventilator", "ventilators", "mechanical ventilation", "cardiac monitor",
            "patient monitor", "icu bed", "central oxygen", "oxygen plant", "defibrillator",
            "infusion pump",
        ],
        "procedure_keywords": [
            "mechanical ventilation", "intubation", "critical care management",
            "hemodynamic monitoring",
        ],
        "specialty_keywords": [
            "criticalcaremedicine", "critical care", "intensivist", "anesthesia", "anaesthesia",
            "pulmonology",
        ],
        "contradiction_keywords": [
            "no icu", "without icu", "no intensive care", "icu not available",
            "referred to higher center", "refer patients elsewhere",
        ],
        "tau_minutes": 60,
    },
    "nicu": {
        "label": "NICU (Neonatal Intensive Care)",
        "claim_keywords": [
            "nicu", "neonatal intensive care", "neonatal icu", "newborn intensive care",
            "level iii nicu", "level ii nicu", "sncu",
        ],
        "equipment_keywords": [
            "incubator", "infant warmer", "radiant warmer", "neonatal ventilator", "cpap",
            "phototherapy", "infant incubator", "neonatal monitor",
        ],
        "procedure_keywords": [
            "neonatal resuscitation", "neonatal intensive care", "surfactant", "exchange transfusion",
        ],
        "specialty_keywords": [
            "neonatologyperinatalmedicine", "neonatology", "perinatal", "pediatrics", "paediatrics",
        ],
        "contradiction_keywords": [
            "no nicu", "without nicu", "no neonatal", "neonatal care not available",
            "referred to higher center",
        ],
        "tau_minutes": 60,
    },
    "emergency": {
        "label": "Emergency",
        "claim_keywords": ["emergency", "24/7 emergency", "casualty", "accident and emergency", "a&e"],
        "equipment_keywords": ["ambulance", "defibrillator", "resuscitation", "trauma bay", "oxygen"],
        "procedure_keywords": ["emergency care", "resuscitation", "triage", "stabilization"],
        "specialty_keywords": ["emergencymedicine", "criticalcaremedicine"],
        "contradiction_keywords": ["no emergency", "no casualty", "emergency not available"],
        "tau_minutes": 30,
        "emergency": True,
    },
    "maternity": {
        "label": "Maternity",
        "claim_keywords": ["maternity", "obstetric", "labor", "labour", "delivery", "birthing"],
        "equipment_keywords": ["labor room", "delivery table", "fetal monitor", "operation theatre"],
        "procedure_keywords": ["cesarean", "caesarean", "normal delivery", "c-section", "obstetric surgery"],
        "specialty_keywords": ["gynecologyandobstetrics", "obstetrics", "gynecology"],
        "contradiction_keywords": ["no maternity", "no delivery services"],
        "tau_minutes": 60,
    },
    "trauma": {
        "label": "Trauma",
        "claim_keywords": ["trauma center", "trauma centre", "level i trauma", "level ii trauma", "polytrauma"],
        "equipment_keywords": ["ct scan", "operation theatre", "blood bank", "trauma bay", "x-ray"],
        "procedure_keywords": ["trauma surgery", "orthopedic surgery", "emergency surgery"],
        "specialty_keywords": ["criticalcaremedicine", "orthopedicsurgery", "generalsurgery", "neurosurgery"],
        "contradiction_keywords": ["no trauma", "trauma not available"],
        "tau_minutes": 45,
    },
    "dialysis": {
        "label": "Dialysis",
        "claim_keywords": ["dialysis", "hemodialysis", "haemodialysis", "renal replacement"],
        "equipment_keywords": ["dialysis machine", "dialysis unit", "ro plant", "dialyzer"],
        "procedure_keywords": ["hemodialysis", "haemodialysis", "dialysis treatment", "peritoneal dialysis"],
        "specialty_keywords": ["nephrology"],
        "contradiction_keywords": ["no dialysis", "dialysis not available"],
        "tau_minutes": 90,
    },
    "oncology": {
        "label": "Oncology",
        "claim_keywords": ["oncology", "cancer center", "cancer centre", "chemotherapy", "radiotherapy"],
        "equipment_keywords": ["linear accelerator", "linac", "radiotherapy", "chemotherapy unit", "pet ct"],
        "procedure_keywords": ["chemotherapy", "radiotherapy", "cancer surgery", "oncology treatment"],
        "specialty_keywords": ["medicaloncology", "radiationoncology", "surgicaloncology", "hematology"],
        "contradiction_keywords": ["no oncology", "cancer treatment not available"],
        "tau_minutes": 120,
    },
}

# Care types with the deepest, hand-tuned evidence rules for this MVP (concept ch.14).
MVP_CARE_NEEDS = ("icu", "nicu")


def care_need_config(care_need: str) -> dict | None:
    return CARE_NEEDS.get((care_need or "").strip().lower())
