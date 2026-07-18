"""MedSatya — FastAPI backend.

One process on Databricks Apps: serves the JSON API under /api/* and the
prebuilt React PWA (frontend/dist) for everything else (SPA fallback).

Honesty ethos lives in the engine, not here — this module only wires HTTP.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

APP_ROOT = Path(__file__).resolve().parent.parent
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
        }
    )


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
