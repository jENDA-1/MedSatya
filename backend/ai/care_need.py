"""Public AI interface: map a free-text symptom description to a care-need (never a diagnosis).

Guardrails (hard):
  * Output is only a care-need key from the taxonomy + a confidence + a non-diagnostic rationale.
  * Emergencies are flagged; the caller shows "contact local emergency services".
  * The AI output is a *query hint* the user confirms — it is never evidence about any facility.
"""
from __future__ import annotations

from typing import Any

from backend import config
from backend.ai.providers import DatabricksModelServingProvider, RuleBasedProvider

# Provider chain: Model Serving (if available) first, then always-on rule-based.
_MODEL_SERVING = DatabricksModelServingProvider()
_RULE_BASED = RuleBasedProvider()


def _label(care_need: str | None) -> str | None:
    cfg = config.care_need_config(care_need) if care_need else None
    return cfg["label"] if cfg else None


def map_symptom_to_care_need(text: str, locale: str = "en") -> dict[str, Any]:
    """Return {care_need, care_need_label, confidence, rationale, is_emergency, alternatives, provider}.

    care_need may be None when nothing matches confidently -> the UI asks the user to pick a button.
    """
    result: dict[str, Any] | None = None
    # Try the model-serving hook only if an endpoint is configured; otherwise skip straight to rules.
    if _MODEL_SERVING.available():
        result = _MODEL_SERVING.map(text, locale)
    if result is None:
        result = _RULE_BASED.map(text, locale)

    if result is None:
        return {
            "care_need": None,
            "care_need_label": None,
            "confidence": 0.0,
            "rationale": "Couldn't confidently map this to a care type — please pick one below.",
            "is_emergency": False,
            "alternatives": [],
            "provider": "none",
        }

    # Guardrail: never emit a care_need outside the taxonomy.
    cn = result.get("care_need")
    if cn is not None and not config.care_need_config(cn):
        cn = None
    result["care_need"] = cn
    result["care_need_label"] = _label(cn)
    # Normalize alternatives to {key,label}.
    result["alternatives"] = [
        {"key": a, "label": _label(a)} for a in result.get("alternatives", []) if config.care_need_config(a)
    ]
    return result
