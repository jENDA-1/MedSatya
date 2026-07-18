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

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.data import facilities as facilities_data
from backend.data import warehouse

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
