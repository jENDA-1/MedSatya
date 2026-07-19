# MedSatya — single-image build for public hosting (Render / Railway / Fly / any Docker host).
# One process: FastAPI serves /api/* AND the prebuilt React PWA. Data stays on Databricks — the
# backend queries the warehouse over HTTPS with the app Service Principal's OAuth creds (env).
#
# Stage 1 builds the frontend (Node); stage 2 runs the backend (Python) and serves the built dist.

# ---- Stage 1: build the React frontend -> /app/frontend/dist ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python backend that also serves the built frontend ----
FROM python:3.13-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# ca-certificates: TLS to the Databricks warehouse + OpenAI.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./frontend/dist
# APP_ROOT = /app (backend/app.py -> parent.parent), so DIST = /app/frontend/dist. ✓
EXPOSE 8000
# Render/Railway inject $PORT; default 8000 locally. sh -c so the shell substitutes it.
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
