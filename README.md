# MedSatya — Referral Copilot

**Trust. Verify. Heal India.**

<video src="https://github.com/jENDA-1/MedSatya/raw/main/docs/demo.mp4" controls width="320"></video>

▶ [Watch the brand animation](docs/demo.mp4) (6 s)

MedSatya helps people in India find **trustworthy care**. For a given care need (ICU, NICU, …) near a
location, it returns an **evidence-attached shortlist** of facilities — every claim shows its **source**
("receipt"), and the app is honest about what it does *not* know.

It **never** invents facts about bed availability, current operation, patient admission, or overall hospital
quality, and it **does not diagnose**. The core rule: we don't score "hospital trustworthiness", we score the
**strength of evidence that a specific facility provides a specific type of care**.

Built for **Hack-Nation × Databricks, Challenge #04 "Data Legend"**. Runs live on **Databricks Apps**
(FastAPI backend serving a prebuilt React PWA — one process).

---

## Live deployments

MedSatya runs **live on two targets, both querying the same live Databricks warehouse**:

| Target | URL | Access |
|---|---|---|
| **Databricks Apps** — canonical; one FastAPI process serves `/api/*` + the React PWA | https://medsatya-7474659229844250.aws.databricksapps.com | Databricks workspace SSO |
| **Public demo** — for reviewers; static frontend + FastAPI reverse-proxied under a subpath | https://gridmind.taila69b70.ts.net/medsatyam/ | open, no login |

Same Trust Engine, same live data — the public demo is a mirror so reviewers can try it without a Databricks
login. See [Deploy → Public demo mirror](#public-demo-mirror) for how the subpath build works.

## Architecture

```
FastAPI (backend/)  ── serves ──►  /api/*   (data + engine + AI)
        │                          /*        (prebuilt React PWA from frontend/dist)
        ▼
  SQL Warehouse  (databricks-sql-connector + service-principal OAuth)
        ▼
  facilities  (Virtue Foundation dataset, via Delta Sharing / Marketplace)
```

- **backend/** — Python. `config.py` (parametrized catalog/schema/table + warehouse), `data/` (SQL warehouse +
  facilities parsing), `engine/` (deterministic Trust Engine: evidence bands, ranking, desert), `ai/`
  (symptom→care-need, rule-based + Model Serving hook), `persistence/` (Delta store).
- **frontend/** — React + Vite + Tailwind + shadcn/ui, installable PWA (MapLibre + OSM, no map key).

## Local development

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r ../requirements.txt
uvicorn backend.app:app --reload --port 8000     # run from repo root: cd .. && uvicorn ...

# frontend (separate terminal) — proxies /api to :8000
cd frontend && npm install && npm run dev        # http://localhost:5173
```

Data access in local dev uses a PAT (SQL Statement Execution REST API); see the repo's `data-access/` helper
and set env vars in a git-ignored `.env`. **In-platform the app uses the app's service principal (OAuth) — no
PAT in code.**

## Deploy

Push to `main` → **GitHub Actions** builds the frontend and runs `databricks sync` + `databricks apps deploy`.

Required repo **Secrets** (Settings → Secrets and variables → Actions — never commit these):

| Secret | Example |
|---|---|
| `DATABRICKS_HOST` | `https://dbc-ad43c802-45af.cloud.databricks.com` |
| `DATABRICKS_TOKEN` | PAT of the deploy identity |
| `DATABRICKS_APP_NAME` | `medsatya` |
| `DATABRICKS_SOURCE_PATH` | `/Workspace/Users/<you>/medsatya-src` |

Manual deploy (from `MedSatya/`, with `DATABRICKS_HOST`/`DATABRICKS_TOKEN` in env):

```bash
(cd frontend && npm ci && npm run build)
databricks sync . /Workspace/Users/<you>/medsatya-src --full --include 'frontend/dist/**'
databricks apps deploy medsatya --source-code-path /Workspace/Users/<you>/medsatya-src
databricks apps get medsatya -o json
```

Live: **https://medsatya-7474659229844250.aws.databricksapps.com**

### Public demo mirror

To also serve the app publicly under a subpath (e.g. `/medsatyam/` behind an Nginx reverse proxy), build the
frontend for that base and reverse-proxy the API to the FastAPI backend — **same live Databricks data, no login**:

```bash
(cd frontend && VITE_API_BASE=/medsatyam npx vite build --base=/medsatyam/)   # → frontend/dist
# upload frontend/dist to the static host; run the backend and proxy /<base>/api/ → 127.0.0.1:8080/api/
uvicorn backend.app:app --host 127.0.0.1 --port 8080
```

All `/api` calls honour `VITE_API_BASE`, the router uses `import.meta.env.BASE_URL`, and the service
worker + manifest are base-aware — so root-path deploys (Databricks Apps, Render, local dev) are unaffected.

## Adding the data (for teammates)

The app reads the **Virtue Foundation Dataset (DAIS 2026)** Marketplace listing
(`19326b3d-db63-4627-abc0-cf4e8131a305`). In your Databricks workspace: **Marketplace → find the listing →
Get instant access** so `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`
appears in your Catalog. Do **not** copy/redistribute the files — that breaks lineage and the source
"receipts". The app parametrizes `catalog.schema.table` via env, so no one's catalog name is hardcoded.

## Honesty ethos (what the engine guarantees)

- Evidence status per `(facility, care_need)`: `strongly_supported` / `partially_supported` / `claim_only` /
  `contradictory` / `not_enough_data` — from **cross-field corroboration** (a claim in `capability` checked
  against `equipment` / `procedure` / `specialties`). An **empty field is not negative evidence**.
- **Data desert** ("we don't know") is visually distinct from **medical desert** ("care probably absent").
- Every status carries an **exact-span citation** + `source_urls`, plus a **call-before-travel checklist**
  built from exactly what the data does not confirm.
