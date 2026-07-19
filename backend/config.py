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


# --- Community feedback (writable Delta; collected only, never changes evidence live) ---
FEEDBACK_TABLE = _env("MEDSATYA_FEEDBACK_TABLE", "feedback")


def feedback_fqn() -> str:
    return f"`{STORE_CATALOG}`.`{STORE_SCHEMA}`.`{FEEDBACK_TABLE}`"


# --- Feedback email hook (optional; Delta-first, email best-effort via HTTPS API) ---
# Ships DISABLED: with no API key the email step is a no-op hook and feedback still lands in Delta.
FEEDBACK_EMAIL_TO = _env("MEDSATYA_FEEDBACK_EMAIL_TO", "ullmann@fel.zcu.cz")
FEEDBACK_EMAIL_FROM = _env("MEDSATYA_FEEDBACK_EMAIL_FROM")  # e.g. "MedSatya <onboarding@resend.dev>"
FEEDBACK_EMAIL_PROVIDER = _env("MEDSATYA_FEEDBACK_EMAIL_PROVIDER", "resend")
FEEDBACK_EMAIL_API_KEY = _env("MEDSATYA_FEEDBACK_EMAIL_KEY")  # secret; unset => email disabled

# --- AI: semantic layer (embeddings, Layer 1) + clarify layer (foundation model, Layer 2) ---
# Layer 1 (embeddings) is ON by default via a Databricks system endpoint; it degrades gracefully
# to the deterministic rule-based provider if the endpoint is unreachable. Layer 2 (FM clarify) is
# best-effort: it only phrases the clarifying question more naturally when an endpoint is reachable;
# otherwise a deterministic clarify question is used. Neither ever diagnoses.
EMBEDDING_ENDPOINT = _env("MEDSATYA_EMBEDDING_ENDPOINT", "databricks-gte-large-en")
CLARIFY_ENDPOINT = _env("MEDSATYA_CLARIFY_ENDPOINT", "databricks-meta-llama-3-1-8b-instruct")
# Legacy full-mapping model-serving hook — OFF unless explicitly set (embeddings supersede it).
MODEL_SERVING_ENDPOINT = _env("MEDSATYA_MODEL_SERVING_ENDPOINT")


def _envf(key: str, default: float) -> float:
    try:
        return float(_env(key, str(default)) or default)
    except (TypeError, ValueError):
        return default


# Embedding-match thresholds (calibrated on gte-large-en; workspace/model specific).
# Below MATCH_MIN absolute cosine, or below MARGIN_MIN top-1..top-2 gap -> ambiguous -> clarify.
EMBED_MATCH_MIN = _envf("MEDSATYA_EMBED_MATCH_MIN", 0.47)
EMBED_MARGIN_MIN = _envf("MEDSATYA_EMBED_MARGIN_MIN", 0.05)


# --- AI Layer 3: OpenAI conversational triage agent (optional) ---------------
# Enabled only when OPENAI_API_KEY is present. Locally it comes from MedSatya/.env; in-platform it is
# injected as a Databricks App secret (server-side env var). The key is NEVER sent to the browser —
# every OpenAI call is server-side, and realtime voice uses a short-lived ephemeral client secret
# minted here. With no key the app degrades gracefully to the embeddings + deterministic clarify chain.
OPENAI_API_KEY = _env("OPENAI_API_KEY")
OPENAI_MODEL = _env("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_TRANSCRIBE_MODEL = _env("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")
OPENAI_REALTIME_MODEL = _env("OPENAI_REALTIME_MODEL", "gpt-realtime-mini")


def openai_enabled() -> bool:
    return bool(OPENAI_API_KEY)


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
        # Honesty: dropped the near-universal generics that fire at almost any facility and carry no
        # emergency-specificity — "oxygen"/"ambulance" (listed everywhere) and "resuscitation" (a
        # procedure, kept in procedure_keywords). Left the genuinely emergency-indicative equipment.
        "equipment_keywords": ["defibrillator", "trauma bay", "crash cart"],
        "procedure_keywords": ["emergency care", "resuscitation", "triage", "stabilization"],
        "specialty_keywords": ["emergencymedicine", "criticalcaremedicine"],
        "contradiction_keywords": ["no emergency", "no casualty", "emergency not available"],
        "tau_minutes": 30,
        "emergency": True,
    },
    "maternity": {
        "label": "Maternity",
        "claim_keywords": ["maternity", "obstetric", "labor", "labour", "delivery", "birthing"],
        "equipment_keywords": ["labor room", "delivery table", "fetal monitor", "operation theatre",
                               "operating theatre"],
        "procedure_keywords": ["cesarean", "caesarean", "normal delivery", "c-section", "obstetric surgery"],
        "specialty_keywords": ["gynecologyandobstetrics", "obstetrics", "gynecology"],
        "contradiction_keywords": ["no maternity", "no delivery services"],
        "tau_minutes": 60,
    },
    "trauma": {
        "label": "Trauma",
        "claim_keywords": ["trauma center", "trauma centre", "level i trauma", "level ii trauma", "polytrauma"],
        # Honesty: dropped near-universal "x-ray" (every facility has one) — kept trauma-specific gear.
        "equipment_keywords": ["ct scan", "operation theatre", "operating theatre", "blood bank", "trauma bay"],
        "procedure_keywords": ["trauma surgery", "orthopedic surgery", "emergency surgery"],
        "specialty_keywords": ["criticalcaremedicine", "orthopedicsurgery", "generalsurgery", "neurosurgery"],
        # Honesty (Session-6, audited on real data): trauma's support fields are otherwise generic
        # multispecialty infrastructure (surgery depts + ct/ot/blood bank) that ANY large hospital
        # carries, so a mere "trauma center" claim + big-hospital gear was reaching STRONGLY (green)
        # for 43–58% of the shortlist vs 13–23% for calibrated icu/nicu — with 88–100% of those greens
        # showing NO genuinely trauma-specific signal. `specific_support_keywords` gates STRONGLY on a
        # discriminating corroboration (a designated trauma facility's trauma bay / trauma surgery);
        # generic-only corroboration drops to partially_supported (gold "verify by phone"). See
        # docs/ENGINE-audit.md. Opt-in per care-need: types without this key are unaffected.
        "specific_support_keywords": ["trauma bay", "trauma surgery"],
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
