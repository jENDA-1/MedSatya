"""MedSatya — FastAPI backend.

One process on Databricks Apps: serves the JSON API under /api/* and the
prebuilt React PWA (frontend/dist) for everything else (SPA fallback).

Honesty ethos lives in the engine, not here — this module only wires HTTP.
"""
from __future__ import annotations

import os
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent

# Local dev only: load MedSatya/.env before importing config (which reads env at import).
# In-platform there is no .env — auth/config come from injected app resources / OAuth.
try:  # pragma: no cover
    from dotenv import load_dotenv

    load_dotenv(APP_ROOT / ".env")
except Exception:  # pragma: no cover
    pass

from fastapi import Body, FastAPI, File, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.ai import care_need as ai_care_need
from backend.ai import triage as ai_triage
from backend.data import facilities as facilities_data
from backend.data import warehouse
from backend.engine import ranking
from backend.notify import email as email_notify
from backend.persistence import feedback as feedback_store
from backend.persistence import store

DIST = APP_ROOT / "frontend" / "dist"

app = FastAPI(title="MedSatya — Referral Copilot", version="0.1.0")


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "app": "medsatya",
            "version": app.version,
            "frontend_built": DIST.exists(),
            "warehouse_available": warehouse.available(),
            "data_source": config.facilities_fqn(),
            "ai_openai": config.openai_enabled(),  # bool only — never the key itself
        }
    )


@app.get("/api/care-needs")
def care_needs() -> JSONResponse:
    """The care-need buttons (label + emergency flag)."""
    return JSONResponse(
        {
            "care_needs": [
                {"key": k, "label": v["label"], "emergency": bool(v.get("emergency"))}
                for k, v in config.CARE_NEEDS.items()
            ],
            "mvp": list(config.MVP_CARE_NEEDS),
        }
    )


@app.get("/api/facilities")
def api_facilities(
    care_need: str = Query(..., description="care-need key, e.g. icu / nicu"),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    limit: int = Query(400, ge=1, le=2000),
) -> JSONResponse:
    """Raw candidate facilities that CLAIM the care-need near (lat, lon). No scoring yet (M2)."""
    if not config.care_need_config(care_need):
        return JSONResponse({"error": f"unknown care_need '{care_need}'"}, status_code=400)
    try:
        cands = facilities_data.find_candidates(care_need, lat, lon, limit=limit)
    except Exception as e:
        return JSONResponse(
            {"error": "data unavailable", "detail": str(e), "warehouse_available": warehouse.available()},
            status_code=503,
        )
    return JSONResponse({"care_need": care_need, "count": len(cands), "candidates": cands})


@app.get("/api/shortlist")
def api_shortlist(
    care_need: str = Query(..., description="care-need key, e.g. icu / nicu"),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    limit: int = Query(400, ge=1, le=2000),
    top: int = Query(25, ge=1, le=200, description="max ranked results to return"),
) -> JSONResponse:
    """Evidence-attached, ranked shortlist for a care-need near (lat, lon).

    Each result carries: evidence status band + exact-span citations + source_urls,
    data-desert/medical-desert classification, and a call-before-travel checklist.
    """
    cfg = config.care_need_config(care_need)
    if not cfg:
        return JSONResponse({"error": f"unknown care_need '{care_need}'"}, status_code=400)
    try:
        cands = facilities_data.find_candidates(care_need, lat, lon, limit=limit)
    except Exception as e:
        return JSONResponse(
            {"error": "data unavailable", "detail": str(e), "warehouse_available": warehouse.available()},
            status_code=503,
        )
    shortlist = ranking.build_shortlist(cands, care_need)
    shortlist["results"] = shortlist["results"][:top]
    shortlist["care_need_label"] = cfg["label"]
    shortlist["is_emergency"] = bool(cfg.get("emergency"))
    return JSONResponse(shortlist)


@app.post("/api/map-symptom")
def api_map_symptom(payload: dict = Body(...)) -> JSONResponse:
    """Map a free-text symptom description to a suggested care-need. NEVER a diagnosis.

    The user always confirms the suggestion via the care-need buttons before a search runs.
    """
    text = (payload or {}).get("text", "")
    locale = (payload or {}).get("locale", "en")
    if not isinstance(text, str) or not text.strip():
        return JSONResponse({"error": "empty text"}, status_code=400)
    result = ai_care_need.map_symptom_to_care_need(text.strip(), locale)
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# Conversational triage agent (OpenAI, optional) + voice (realtime / transcribe)
# ---------------------------------------------------------------------------
@app.post("/api/triage")
def api_triage(payload: dict = Body(...)) -> JSONResponse:
    """Advance the triage conversation by one agent turn. Stateless — the client sends the running
    transcript in `messages`; the server holds no state.

    Body: {messages:[{role:"user"|"assistant", content:str}], locale?}. (A single {text} is also
    accepted for convenience.) NEVER a diagnosis: the agent either asks ONE clarifying question,
    suggests ONE care-need for the user to confirm, or flags an emergency. Falls back to the
    deterministic embeddings + clarify chain when OpenAI is unavailable.
    """
    p = payload or {}
    messages = p.get("messages")
    locale = p.get("locale", "en")
    if not isinstance(messages, list) or not messages:
        text = (p.get("text") or "").strip()
        if not text:
            return JSONResponse({"error": "messages required"}, status_code=400)
        messages = [{"role": "user", "content": text}]
    result = ai_triage.run_triage(messages, locale)
    return JSONResponse(result)


@app.get("/api/care-candidates")
def api_care_candidates(text: str = Query(..., min_length=1)) -> JSONResponse:
    """Top-3 taxonomy candidates for a symptom description — grounding for the realtime voice agent."""
    return JSONResponse({"candidates": ai_care_need.top_candidates(text.strip(), 3)})


@app.post("/api/realtime/session")
def api_realtime_session() -> JSONResponse:
    """Mint a SHORT-LIVED ephemeral client secret for an OpenAI Realtime (voice) session.

    The API key stays server-side; only this ephemeral token reaches the browser, which uses it to
    open the WebRTC connection. 503 when OpenAI is not configured (the frontend then hides the mic).
    """
    client = ai_triage.get_client()
    if client is None:
        return JSONResponse({"error": "voice unavailable", "enabled": False}, status_code=503)
    try:
        resp = client.realtime.client_secrets.create(session=ai_triage.realtime_session_config())
        data = resp.model_dump() if hasattr(resp, "model_dump") else dict(resp)
        return JSONResponse(
            {
                "value": data.get("value"),
                "expires_at": data.get("expires_at"),
                "model": config.OPENAI_REALTIME_MODEL,
            }
        )
    except Exception as e:
        return JSONResponse({"error": "voice session failed", "detail": str(e)[:200]}, status_code=502)


@app.post("/api/transcribe")
async def api_transcribe(audio: UploadFile = File(...)) -> JSONResponse:
    """Transcribe an uploaded audio clip via OpenAI (fallback voice path when WebRTC isn't usable).

    Server-side only; 503 when OpenAI is not configured.
    """
    client = ai_triage.get_client()
    if client is None:
        return JSONResponse({"error": "transcription unavailable", "enabled": False}, status_code=503)
    try:
        data = await audio.read()
        tr = client.audio.transcriptions.create(
            model=config.OPENAI_TRANSCRIBE_MODEL,
            file=(audio.filename or "audio.webm", data),
        )
        return JSONResponse({"text": getattr(tr, "text", "") or ""})
    except Exception as e:
        return JSONResponse({"error": "transcription failed", "detail": str(e)[:200]}, status_code=502)


# ---------------------------------------------------------------------------
# Persistence — saved facilities (survives restart via Delta)
# ---------------------------------------------------------------------------
@app.get("/api/saved")
def api_saved_list() -> JSONResponse:
    try:
        return JSONResponse({"items": store.list_saved()})
    except Exception as e:
        return JSONResponse({"items": [], "error": "store unavailable", "detail": str(e)}, status_code=503)


@app.post("/api/saved")
def api_saved_create(payload: dict = Body(...)) -> JSONResponse:
    facility = (payload or {}).get("facility")
    if not isinstance(facility, dict) or not facility.get("unique_id"):
        return JSONResponse({"error": "facility with unique_id required"}, status_code=400)
    try:
        res = store.save(
            care_need=(payload.get("care_need") or ""),
            care_need_label=payload.get("care_need_label"),
            facility=facility,
            note=payload.get("note"),
        )
        return JSONResponse(res, status_code=201)
    except Exception as e:
        return JSONResponse({"error": "store unavailable", "detail": str(e)}, status_code=503)


@app.delete("/api/saved/{saved_id}")
def api_saved_delete(saved_id: str) -> JSONResponse:
    try:
        store.delete(saved_id)
        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=503)


# ---------------------------------------------------------------------------
# Community feedback (doctors + patients) — Delta-first, email best-effort
# ---------------------------------------------------------------------------
@app.post("/api/feedback")
def api_feedback(payload: dict = Body(...)) -> JSONResponse:
    """Collect community feedback. Delta-first; the email notification is a best-effort hook.

    Guardrail: feedback is COLLECTED ONLY — it never changes evidence live. The Delta write
    happens first, so a failing/disabled email never loses the submission.
    """
    p = payload or {}
    role = p.get("role") or "patient"
    correct = (p.get("correct_note") or "").strip()
    incorrect = (p.get("incorrect_note") or "").strip()
    if not correct and not incorrect:
        return JSONResponse(
            {"error": "Tell us what's right and/or what's wrong."}, status_code=400
        )
    try:
        rec = feedback_store.record(
            role=role,
            facility_id=p.get("facility_id"),
            facility_name=p.get("facility_name"),
            care_need=p.get("care_need"),
            correct_note=correct or None,
            incorrect_note=incorrect or None,
            evidence_url=p.get("evidence_url"),
            contact=p.get("contact"),
        )
    except Exception as e:
        return JSONResponse(
            {"error": "store unavailable", "detail": str(e), "stored": False}, status_code=503
        )

    # Email hook AFTER the Delta write; disabled/failure must not affect the stored result.
    email_sent = False
    try:
        email_sent = email_notify.send_feedback_email(
            {
                **rec,
                "role": role,
                "facility_id": p.get("facility_id"),
                "facility_name": p.get("facility_name"),
                "care_need": p.get("care_need"),
                "correct_note": correct,
                "incorrect_note": incorrect,
                "evidence_url": p.get("evidence_url"),
                "contact": p.get("contact"),
            }
        )
    except Exception:
        email_sent = False

    return JSONResponse({**rec, "stored": True, "email_sent": email_sent}, status_code=201)


# ---------------------------------------------------------------------------
# Static frontend (prebuilt) + SPA fallback
# ---------------------------------------------------------------------------
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{full_path:path}")
def spa(full_path: str):
    """Serve real files from dist (manifest, sw, icons) else index.html (SPA)."""
    if not DIST.exists():
        return JSONResponse(
            {
                "status": "backend-only",
                "message": "Frontend not built yet. Run `npm run build` in frontend/.",
            }
        )
    candidate = DIST / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("DATABRICKS_APP_PORT", 8000)))
