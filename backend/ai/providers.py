"""Symptom -> care-need providers (swap-able behind one interface).

Chain: DatabricksModelServing (if an endpoint exists) -> RuleBased (always works, offline, no key).
The AI ONLY suggests a care-need for the *query*; it is NEVER evidence about a facility and it
NEVER diagnoses. Emergencies are detected and flagged regardless of provider.
"""
from __future__ import annotations

import json
import re
from typing import Any

from backend import config
from backend.ai import prompts

# --- Emergency red-flags (deterministic, provider-independent) ---
EMERGENCY_FLAGS = [
    "not breathing", "cannot breathe", "can't breathe", "cant breathe", "stopped breathing",
    "struggling to breathe", "gasping", "blue lips", "unconscious", "not responding",
    "collapsed", "chest pain", "heart attack", "cardiac arrest", "stroke", "severe bleeding",
    "bleeding heavily", "seizure", "convulsion", "convulsing", "choking", "overdose",
    "not moving", "no pulse",
]

# Free-text signal phrases per care-need (specific ones first). Complemented by config claim keywords.
SYMPTOM_SIGNALS: dict[str, list[str]] = {
    "nicu": ["newborn", "new born", "neonate", "neonatal", "premature", "preterm", "infant",
             "just born", "days old", "baby not breathing", "baby can't breathe", "my baby"],
    "maternity": ["pregnant", "pregnancy", "in labor", "in labour", "labour pain", "labor pain",
                  "giving birth", "childbirth", "delivery", "water broke", "contractions"],
    "dialysis": ["dialysis", "kidney failure", "renal failure", "kidney", "creatinine"],
    "oncology": ["cancer", "tumor", "tumour", "chemotherapy", "chemo", "radiotherapy", "oncology",
                 "malignant"],
    "trauma": ["accident", "road accident", "fracture", "broken bone", "head injury", "fell",
               "fall from", "injured", "trauma", "deep wound", "crush injury"],
    "icu": ["icu", "intensive care", "critical condition", "ventilator", "life support", "sepsis",
            "organ failure", "very serious"],
    "emergency": ["emergency", "urgent", "casualty", "need ambulance"],
}


def _has(text: str, phrase: str) -> bool:
    """Word-boundary match so short tokens (e.g. 'icu') don't match inside words ('diffICUlty')."""
    return re.search(r"\b" + re.escape(phrase.lower()) + r"\b", text) is not None


class RuleBasedProvider:
    name = "rule_based"

    def available(self) -> bool:
        return True

    def map(self, text: str, locale: str = "en") -> dict[str, Any] | None:
        t = f" {(text or '').lower().strip()} "
        if not t.strip():
            return None
        is_emergency = any(_has(t, flag) for flag in EMERGENCY_FLAGS)

        scores: dict[str, float] = {}
        matched_terms: dict[str, list[str]] = {}
        for cn, phrases in SYMPTOM_SIGNALS.items():
            for p in phrases:
                if _has(t, p):
                    scores[cn] = scores.get(cn, 0) + 1.0
                    matched_terms.setdefault(cn, []).append(p)
        # Reinforce with the facility taxonomy claim keywords (weaker signal).
        for cn, cfg in config.CARE_NEEDS.items():
            for kw in cfg["claim_keywords"]:
                if _has(t, kw):
                    scores[cn] = scores.get(cn, 0) + 0.5
                    matched_terms.setdefault(cn, []).append(kw)

        best = max(scores, key=scores.get) if scores else None

        if best is None:
            if is_emergency:
                return {
                    "care_need": "emergency",
                    "confidence": 0.6,
                    "rationale": "Mentions signs that need urgent attention.",
                    "is_emergency": True,
                    "alternatives": [],
                    "provider": self.name,
                }
            return None

        score = scores[best]
        confidence = round(min(0.95, 0.45 + 0.18 * score), 2)
        alts = sorted((c for c in scores if c != best), key=scores.get, reverse=True)[:2]
        if is_emergency and "emergency" not in alts and best != "emergency":
            alts = (["emergency"] + alts)[:3]
        terms = sorted(set(matched_terms.get(best, [])))[:4]
        rationale = f"Mentions: {', '.join(terms)}." if terms else "Best keyword match."
        return {
            "care_need": best,
            "confidence": confidence,
            "rationale": rationale,  # deliberately NOT a diagnosis — only which care type fits
            "is_emergency": is_emergency,
            "alternatives": alts,
            "provider": self.name,
        }


class DatabricksModelServingProvider:
    """Best-effort hook. Uses a Databricks serving endpoint if one is available; else no-op.

    On Free Edition there is often no foundation-model endpoint — then this stays disabled and the
    rule-based provider handles everything. Any error -> None (fall back), never crashes the app.
    """

    name = "databricks_model_serving"

    def __init__(self) -> None:
        self._endpoint: str | None = None
        self._resolved = False
        self._client = None

    def _resolve(self) -> None:
        if self._resolved:
            return
        self._resolved = True
        # Explicit endpoint wins; otherwise leave disabled (auto-detect is opt-in to avoid slow
        # startup / noisy failures on Free Edition).
        ep = config._env("MEDSATYA_MODEL_SERVING_ENDPOINT")
        if not ep:
            return
        try:
            from databricks.sdk import WorkspaceClient

            self._client = WorkspaceClient()
            self._endpoint = ep
        except Exception:
            self._endpoint = None

    def available(self) -> bool:
        self._resolve()
        return self._endpoint is not None

    def map(self, text: str, locale: str = "en") -> dict[str, Any] | None:
        if not self.available():
            return None
        try:
            from databricks.sdk.service.serving import ChatMessage, ChatMessageRole

            resp = self._client.serving_endpoints.query(
                name=self._endpoint,
                messages=[
                    ChatMessage(role=ChatMessageRole.SYSTEM, content=prompts.system_prompt()),
                    ChatMessage(role=ChatMessageRole.USER, content=prompts.user_prompt(text, locale)),
                ],
                temperature=0.0,
                max_tokens=200,
            )
            content = resp.choices[0].message.content
            m = re.search(r"\{.*\}", content, re.DOTALL)
            data = json.loads(m.group(0) if m else content)
            cn = data.get("care_need")
            if cn is not None and not config.care_need_config(cn):
                cn = None
            return {
                "care_need": cn,
                "confidence": float(data.get("confidence", 0.5)),
                "rationale": str(data.get("rationale", ""))[:200],
                "is_emergency": bool(data.get("is_emergency", False)),
                "alternatives": [a for a in (data.get("alternatives") or []) if config.care_need_config(a)][:3],
                "provider": self.name,
            }
        except Exception:
            return None
