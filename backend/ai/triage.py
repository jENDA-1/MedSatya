"""Layer 3 — conversational OpenAI triage agent (optional, graceful).

A real multi-turn agent that either asks ONE short clarifying question or commits to ONE care-need
from the fixed taxonomy for the user to confirm. It NEVER diagnoses or names a disease.

Design (all guardrails preserved from the deterministic chain):
  * Emergency red-flags stay DETERMINISTIC and win — checked before any model call.
  * The agent is grounded in our taxonomy via a `lookup_care_candidates` tool that reuses the
    Layer-1 embeddings (so it decides within our 7 care-needs, not hallucinated ones).
  * Output care_need is hard-restricted to `config.CARE_NEEDS` keys (tool enum + server-side guard).
  * No key / any failure -> fall back to the existing embeddings + deterministic clarify chain.
    The app never breaks.

The stateless HTTP contract lives in app.py `/api/triage`: the client sends the running transcript
(`messages`), the server holds no state. The same tool schema also configures the realtime voice
session (see `realtime_session_config`); browser tool-events call `/api/care-candidates` for grounding.
"""
from __future__ import annotations

import json
from typing import Any

from backend import config
from backend.ai import care_need as cn
from backend.ai.prompts import system_prompt as _taxonomy_system_prompt

# India emergency number, surfaced verbatim on the emergency path.
_EMERGENCY_MSG = (
    "This sounds like it could be a medical emergency. Please call your local emergency services "
    "right now — in India, dial 112 (or 108 for an ambulance). This is not a diagnosis."
)

_CARE_KEYS = list(config.CARE_NEEDS.keys())


def _system_prompt() -> str:
    lines = "\n".join(
        f"  - {k}: {v['label']}" for k, v in config.CARE_NEEDS.items()
    )
    return (
        "You are MedSatya's triage assistant for a hospital-finder used in India. You help a worried "
        "person or carer reach the RIGHT TYPE of care quickly.\n\n"
        "HARD RULES (never break):\n"
        "1. You DO NOT diagnose, name a disease, or suggest any treatment or medication. You only map "
        "their words to ONE care TYPE from the fixed list below, which they then confirm.\n"
        "2. Ask only ONE short, plain-language question at a time. Keep it calm, simple, non-clinical.\n"
        "3. You must choose the care type ONLY from these keys (never invent one):\n"
        f"{lines}\n"
        "4. If the description suggests a life-threatening emergency (not breathing, unconscious, "
        "severe bleeding, chest pain, stroke signs, major accident, cardiac arrest, seizure), call "
        "flag_emergency immediately.\n\n"
        "HOW TO WORK:\n"
        "- Call lookup_care_candidates with the person's description to ground yourself in our "
        "taxonomy BEFORE committing.\n"
        "- If you are reasonably confident, call suggest_care_need with a taxonomy key, a confidence "
        "0..1, a SHORT non-diagnostic rationale (say which care type fits and why — never name a "
        "disease), and up to 2 alternative keys.\n"
        "- If genuinely unsure, call ask_clarifying with ONE question. Ask at most 2 questions total; "
        "if still unsure, suggest the best-fit care type and let the user confirm or change it.\n"
        "- Remember: this is a suggestion the user confirms. It is not a diagnosis."
    )


# --- Tool schemas -----------------------------------------------------------------------------
# Chat Completions format (nested under "function").
def _chat_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "lookup_care_candidates",
                "description": (
                    "Get the top matching care-type candidates from MedSatya's fixed taxonomy for a "
                    "symptom description. Use this to ground your decision before suggesting."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symptom_text": {
                            "type": "string",
                            "description": "The person's description of the problem, in their words.",
                        }
                    },
                    "required": ["symptom_text"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "ask_clarifying",
                "description": "Ask the user ONE short, plain-language question to decide the care type.",
                "parameters": {
                    "type": "object",
                    "properties": {"question": {"type": "string"}},
                    "required": ["question"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "suggest_care_need",
                "description": "Commit to ONE care type from the taxonomy for the user to confirm.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "care_need": {"type": "string", "enum": _CARE_KEYS},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "rationale": {
                            "type": "string",
                            "description": "Short, non-diagnostic: which care type fits and why. No disease names.",
                        },
                        "alternatives": {
                            "type": "array",
                            "items": {"type": "string", "enum": _CARE_KEYS},
                        },
                    },
                    "required": ["care_need", "confidence", "rationale"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "flag_emergency",
                "description": (
                    "Flag a likely life-threatening emergency and advise contacting local emergency "
                    "services. Use for the red-flag situations in the rules."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"reason": {"type": "string"}},
                    "required": [],
                },
            },
        },
    ]


def _realtime_tools() -> list[dict[str, Any]]:
    """Realtime API uses a FLAT tool schema (no 'function' wrapper)."""
    flat = []
    for t in _chat_tools():
        fn = t["function"]
        flat.append(
            {
                "type": "function",
                "name": fn["name"],
                "description": fn["description"],
                "parameters": fn["parameters"],
            }
        )
    return flat


# --- OpenAI client (lazy, server-side only) ---------------------------------------------------
_CLIENT: Any = None
_CLIENT_DISABLED = False


def get_client() -> Any:
    global _CLIENT, _CLIENT_DISABLED
    if _CLIENT_DISABLED:
        return None
    if _CLIENT is None:
        if not config.OPENAI_API_KEY:
            _CLIENT_DISABLED = True
            return None
        try:
            from openai import OpenAI

            _CLIENT = OpenAI(api_key=config.OPENAI_API_KEY)
        except Exception:
            _CLIENT_DISABLED = True
            return None
    return _CLIENT


def available() -> bool:
    return get_client() is not None


# --- Response builders ------------------------------------------------------------------------
def _emergency_response(provider: str, care_need: str = "emergency") -> dict[str, Any]:
    cn_key = care_need if config.care_need_config(care_need) else "emergency"
    return {
        "type": "emergency",
        "is_emergency": True,
        "message": _EMERGENCY_MSG,
        "care_need": cn_key,
        "care_need_label": cn._label(cn_key),
        "provider": provider,
    }


def _question_response(question: str, provider: str = "openai") -> dict[str, Any]:
    q = (question or "").strip() or "Can you tell me a little more about what's happening?"
    return {"type": "question", "question": q, "is_emergency": False, "provider": provider}


def _suggestion_response(args: dict[str, Any], provider: str = "openai") -> dict[str, Any]:
    key = (args.get("care_need") or "").strip().lower()
    if not config.care_need_config(key):
        # Model returned an out-of-taxonomy key despite the enum guard -> ask instead of guessing.
        return _question_response(
            "Could you tell me a bit more so I can point you to the right kind of care?", provider
        )
    seen: set[str] = set()
    alts = []
    for a in args.get("alternatives") or []:
        a = (a or "").strip().lower()
        if a and a != key and a not in seen and config.care_need_config(a):
            seen.add(a)
            alts.append({"key": a, "label": cn._label(a)})
    try:
        conf = round(float(args.get("confidence")), 2)
    except (TypeError, ValueError):
        conf = 0.6
    conf = max(0.0, min(1.0, conf))
    return {
        "type": "suggestion",
        "care_need": key,
        "care_need_label": cn._label(key),
        "confidence": conf,
        "rationale": str(args.get("rationale", ""))[:240],
        "is_emergency": False,
        "alternatives": alts,
        "provider": provider,
    }


def _fallback(combined: str, locale: str) -> dict[str, Any]:
    """No OpenAI key / any failure -> reuse the deterministic embeddings + clarify chain."""
    r = cn.map_symptom_to_care_need(combined, locale)
    if r.get("is_emergency"):
        return _emergency_response("deterministic", r.get("care_need") or "emergency")
    if r.get("needs_clarification") and r.get("clarifying_question"):
        return _question_response(r["clarifying_question"], r.get("provider", "fallback"))
    if r.get("care_need"):
        return {
            "type": "suggestion",
            "care_need": r["care_need"],
            "care_need_label": r.get("care_need_label"),
            "confidence": r.get("confidence", 0.5),
            "rationale": r.get("rationale", ""),
            "is_emergency": bool(r.get("is_emergency")),
            "alternatives": r.get("alternatives", []),
            "provider": r.get("provider", "fallback"),
        }
    return _question_response(
        r.get("rationale")
        or "Could you describe what's happening? You can also pick a care type below.",
        r.get("provider", "none"),
    )


# --- Public: run one triage turn --------------------------------------------------------------
def run_triage(messages: list[dict[str, Any]], locale: str = "en") -> dict[str, Any]:
    """Advance the conversation by one agent turn. Stateless: `messages` is the running transcript.

    Returns one of:
      {type:"question",   question, is_emergency:false, provider}
      {type:"suggestion", care_need, care_need_label, confidence, rationale, is_emergency, alternatives, provider}
      {type:"emergency",  is_emergency:true, message, care_need, care_need_label, provider}
    """
    msgs = [
        {"role": m.get("role"), "content": str(m.get("content") or "")}
        for m in (messages or [])
        if m.get("role") in ("user", "assistant") and str(m.get("content") or "").strip()
    ]
    user_texts = [m["content"] for m in msgs if m["role"] == "user"]
    combined = " ".join(user_texts).strip()
    if not combined:
        return _question_response("What's happening? Describe it in your own words.", "none")

    # Deterministic emergency overlay on the latest user turn — always wins, never a model call.
    if cn._emergency(user_texts[-1]):
        return _emergency_response("deterministic")

    client = get_client()
    if client is None:
        return _fallback(combined, locale)

    try:
        return _run_openai(client, msgs, combined, locale)
    except Exception:
        # Any API/transport/parse failure degrades gracefully — the app never breaks.
        return _fallback(combined, locale)


def _run_openai(
    client: Any, msgs: list[dict[str, Any]], combined: str, locale: str
) -> dict[str, Any]:
    convo: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt()}]
    convo.extend(msgs)
    tools = _chat_tools()

    for _ in range(5):
        resp = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=convo,
            tools=tools,
            tool_choice="auto",
            parallel_tool_calls=False,
            temperature=0.2,
        )
        msg = resp.choices[0].message
        tool_calls = msg.tool_calls or []
        if not tool_calls:
            # Model spoke plain text — treat it as a clarifying question.
            return _question_response(msg.content or "")

        tc = tool_calls[0]
        name = tc.function.name
        try:
            args = json.loads(tc.function.arguments or "{}")
        except (json.JSONDecodeError, TypeError):
            args = {}

        if name == "lookup_care_candidates":
            cands = cn.top_candidates(args.get("symptom_text") or combined, 3)
            convo.append(
                {
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": name, "arguments": tc.function.arguments},
                        }
                    ],
                }
            )
            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps({"candidates": cands}),
                }
            )
            continue
        if name == "ask_clarifying":
            return _question_response(args.get("question", ""))
        if name == "suggest_care_need":
            return _suggestion_response(args)
        if name == "flag_emergency":
            return _emergency_response("openai")
        break  # unknown tool -> fall through to fallback

    return _fallback(combined, locale)


# --- Realtime voice session config (baked into the ephemeral client secret) -------------------
def realtime_session_config() -> dict[str, Any]:
    """Session config for the OpenAI Realtime API — same honesty prompt + tools as the text agent.

    The browser establishes WebRTC with a short-lived ephemeral secret minted from this; tool-call
    events are handled client-side (lookup_care_candidates -> /api/care-candidates for grounding;
    suggest_care_need / flag_emergency -> UI). The API key never leaves the server.
    """
    return {
        "type": "realtime",
        "model": config.OPENAI_REALTIME_MODEL,
        "instructions": _system_prompt()
        + "\n\nVOICE MODE: keep replies to one or two short spoken sentences. Speak calmly.",
        "tools": _realtime_tools(),
        "tool_choice": "auto",
    }
