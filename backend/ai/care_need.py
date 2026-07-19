"""Public AI interface: map a free-text symptom description to a care-need (never a diagnosis).

Chain (each layer degrades gracefully to the next):
  * Emergency red-flags — deterministic, always checked, provider-independent.
  * Layer 1 — embeddings (semantic match, robust, no hallucination). Reliable primary/fallback.
  * Rule-based keywords — resolves ambiguous embeddings when an explicit term is present, and is
    the full fallback when embeddings are unavailable.
  * Layer 2 — a single clarifying question when the match is ambiguous (phrased by a foundation
    model when reachable, otherwise deterministic). Conversational, still never a diagnosis.

Guardrails (hard):
  * Output is only a care-need key from the taxonomy + a confidence + a non-diagnostic rationale.
  * Emergencies are flagged; the caller shows "contact local emergency services".
  * The AI output is a *query hint* the user confirms — it is never evidence about any facility.
"""
from __future__ import annotations

from typing import Any

from backend import config
from backend.ai import providers
from backend.ai.embedding import EmbeddingProvider
from backend.ai.providers import RuleBasedProvider

_EMBEDDING = EmbeddingProvider()
_RULE_BASED = RuleBasedProvider()

# Lazily-built foundation-model client for the clarify step (best-effort).
_CLARIFY_CLIENT: Any = None
_CLARIFY_DISABLED = False


def _label(care_need: str | None) -> str | None:
    cfg = config.care_need_config(care_need) if care_need else None
    return cfg["label"] if cfg else None


def _emergency(text: str) -> bool:
    t = f" {text.lower().strip()} "
    return any(providers._has(t, flag) for flag in providers.EMERGENCY_FLAGS)


def _fm_clarify_question(text: str, labels: list[str]) -> str | None:
    """Ask a foundation model to phrase ONE clarifying question. None on any failure/disabled."""
    global _CLARIFY_CLIENT, _CLARIFY_DISABLED
    if _CLARIFY_DISABLED or not config.CLARIFY_ENDPOINT or len(labels) < 2:
        return None
    try:
        if _CLARIFY_CLIENT is None:
            from databricks.sdk import WorkspaceClient

            _CLARIFY_CLIENT = WorkspaceClient()
        from databricks.sdk.service.serving import ChatMessage, ChatMessageRole

        sys_p = (
            "You are a triage helper for a hospital-finder app. You NEVER diagnose and NEVER name "
            "a disease. Given a person's own words, ask ONE short, plain-language clarifying "
            "question that would help decide which TYPE of care they need. Output only the "
            "question — no preamble, no diagnosis."
        )
        usr_p = (
            f'Their words: "{text}". Help decide between these care types: '
            f"{labels[0]} or {labels[1]}. Ask one short question."
        )
        resp = _CLARIFY_CLIENT.serving_endpoints.query(
            name=config.CLARIFY_ENDPOINT,
            messages=[
                ChatMessage(role=ChatMessageRole.SYSTEM, content=sys_p),
                ChatMessage(role=ChatMessageRole.USER, content=usr_p),
            ],
            max_tokens=64,
            temperature=0.2,
        )
        content = resp.choices[0].message.content
        if isinstance(content, list):  # some models return content blocks
            content = " ".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        q = (content or "").strip().strip('"').strip()
        return q or None
    except Exception:
        _CLARIFY_DISABLED = True
        return None


def _clarify_question(text: str, top2_keys: list[str]) -> str:
    labels = [_label(k) or k for k in top2_keys][:2]
    q = _fm_clarify_question(text, labels)
    if q:
        return q
    return (
        f"Just to point you to the right place — is this more about {labels[0]} or "
        f"{labels[1]}? You can also pick a care type below."
    )


def map_symptom_to_care_need(
    text: str, locale: str = "en", clarify_answer: str | None = None
) -> dict[str, Any]:
    """Return {care_need, care_need_label, confidence, rationale, is_emergency, alternatives,
    provider, needs_clarification, clarifying_question}.

    care_need may be None when nothing matches confidently -> the UI asks the user to pick a button.
    """
    combined = text if not clarify_answer else f"{text}. Additional detail: {clarify_answer}"
    is_emergency = _emergency(combined)

    emb = _EMBEDDING.map(combined, locale) if _EMBEDDING.available() else None
    rule = _RULE_BASED.map(combined, locale)

    result: dict[str, Any] | None
    if emb is not None:
        if not emb.get("needs_clarification"):
            result = emb
        elif rule and rule.get("care_need") and rule.get("confidence", 0) >= 0.6 and not clarify_answer:
            # Explicit keyword beats a fuzzy tie — resolves the ambiguity without asking.
            result = rule
        else:
            result = emb
    else:
        result = rule

    if result is None:
        if is_emergency:
            result = {
                "care_need": "emergency",
                "confidence": 0.6,
                "rationale": "Mentions signs that need urgent attention.",
                "is_emergency": True,
                "alternatives": [],
                "provider": "rule_based",
            }
        else:
            return {
                "care_need": None,
                "care_need_label": None,
                "confidence": 0.0,
                "rationale": "Couldn't confidently map this to a care type — please pick one below.",
                "is_emergency": False,
                "alternatives": [],
                "provider": "none",
                "needs_clarification": False,
                "clarifying_question": None,
            }

    # Emergency overlay (deterministic flag wins regardless of provider).
    result["is_emergency"] = bool(result.get("is_emergency")) or is_emergency

    # Layer 2 — clarify only for a fresh ambiguous match (never loop after an answer).
    top2 = result.pop("_top2", None)
    if result.get("needs_clarification") and not clarify_answer:
        pair = [k for k in (top2 or [result.get("care_need"), *(result.get("alternatives") or [])]) if k][:2]
        if len(pair) >= 2:
            result["clarifying_question"] = _clarify_question(combined, pair)
        else:
            result["needs_clarification"] = False
    else:
        result["needs_clarification"] = False

    # Guardrail: never emit a care_need outside the taxonomy.
    cn = result.get("care_need")
    if cn is not None and not config.care_need_config(cn):
        cn = None
    result["care_need"] = cn
    result["care_need_label"] = _label(cn)
    # Normalize alternatives to {key,label}, excluding the chosen one + unknowns + dups.
    seen: set[str] = set()
    alts = []
    for a in result.get("alternatives", []):
        if a and a != cn and a not in seen and config.care_need_config(a):
            seen.add(a)
            alts.append({"key": a, "label": _label(a)})
    result["alternatives"] = alts
    result.setdefault("needs_clarification", False)
    result.setdefault("clarifying_question", None)
    result.setdefault("provider", "none")
    return result


def top_candidates(text: str, n: int = 3) -> list[dict[str, Any]]:
    """Top-N taxonomy candidates (embeddings, best-first) for grounding the conversational agent.

    Returns [{key, label, score}], or [] if embeddings are unavailable — the agent then relies on
    the taxonomy baked into its prompt. Reused by /api/triage (tool) and /api/care-candidates (voice).
    """
    return _EMBEDDING.top_candidates(text, n)
