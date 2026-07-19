# MedSatya — build status (session 1)

**Live:** https://medsatya-7474659229844250.aws.databricksapps.com (Databricks Apps, behind workspace SSO — open logged in).
**Repo:** github.com/jENDA-1/MedSatya · **Stack:** FastAPI (backend) serving a prebuilt React+Vite PWA (single process).

## What it does today
Mobile-first flow: **Where are you?** (geolocation / preset city / tap map) → **What care?** (7 buttons + free-text
symptom box) → **Where can you go?** (MapLibre map + evidence-attached shortlist). Each result carries an evidence
status, exact-span citations ("receipts"), a data-desert/medical-desert flag, and a call-before-travel checklist.
"Why this result?" opens the **Trust Passport** (`/facility/:id`). Save → Delta (survives restart). Installable PWA.

**Core principle:** we don't score "hospital quality" — we score the **strength of evidence that a facility provides a
specific care type**. Unit = `(facility, care_need, snapshot)`. We never present bed availability / current operation /
admission / quality as fact, and we never diagnose.

## Architecture / modules
```
backend/
  app.py            FastAPI: /api/* + serves frontend/dist (SPA)
  config.py         parametrized catalog/schema/table + warehouse + care-need taxonomy + India bbox
  data/warehouse.py SQL warehouse via databricks-sdk Statement Execution (SP OAuth in-platform / PAT local)
  data/facilities.py candidate query (bbox+claim filter), JSON parse+dedup, cluster dedup, Haversine
  engine/evidence.py  cross-field corroboration -> 5 status bands + exact-span citations
  engine/ranking.py   band-first + rank_score; primary/backup/fallback; nearest flagged separately
  engine/desert.py    data-desert vs medical-desert 2x2
  engine/checklist.py call-before-travel checklist from unknowns
  ai/{providers,care_need,prompts}.py  rule-based symptom->care-need + Model Serving hook
  persistence/store.py  saved facilities in Delta (workspace.medsatya.saved)
frontend/ (React 18 + Vite + Tailwind; MapLibre; PWA)
  src/lib/{api,geo,store,format,i18n,registerSW}.ts
  src/components/{EvidenceBadge,DesertBadge,CareNeedButtons,SymptomBox,FacilityCard,MapView,LocationPicker,Toast,OfflineBanner}.tsx
  src/features/{FindCare,FacilityPassport,Saved}.tsx
  public/{manifest.webmanifest,sw.js,icons/*}
```

## API endpoints
- `GET /api/health` — status + warehouse availability + data source
- `GET /api/care-needs` — the 7 care-need buttons (+ mvp list)
- `GET /api/facilities?care_need=&lat=&lon=` — raw candidates (no scoring)
- `GET /api/shortlist?care_need=&lat=&lon=&top=` — ranked, evidence-attached shortlist (+ area_summary)
- `POST /api/map-symptom {text,locale}` — free text → suggested care-need (never a diagnosis)
- `GET/POST/DELETE /api/saved` — saved facilities (Delta)

## Trust Engine (deterministic MVP)
- **Bands:** `strongly_supported` / `partially_supported` / `claim_only` / `contradictory` / `not_enough_data`,
  from cross-field corroboration (claim in `capability` vs support in equipment/procedure/specialties). Empty field ≠
  negative; explicit contradiction outweighs absence. Exact-span citations + source_urls per status.
- **Ranking:** band-first, then `rank_score = 100·(0.50·care_evidence + 0.20·freshness + 0.15·distance +
  0.10·human_verify[hook] + 0.05·location_conf)`. Community adj. ±5 = no-op hook.
- **Desert 2×2:** data_confidence × care_evidence → data_desert (grey="we don't know") vs medical_desert (red="care
  probably absent") vs potential/evidenced coverage.
- **Care types:** ICU + NICU tuned end-to-end; emergency/maternity/trauma/dialysis/oncology also wired.
- **Hooks only (NOT built):** community feedback, traffic/access, RL bandit, human review queue.

## Data (Virtue Foundation, read-only Delta Share)
- `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities` — 10,088 rows, all string
  except lat/lon. Warehouse `344b0522dfa0bbb2`.
- JSON-array-in-string fields need `json.loads`+dedup. Coords validated to India bbox (lat 6–38, lon 68–98).
- **Honesty headline:** ICU near Patna → 175 candidates, **27% `claim_only`** (claim ICU, zero equipment support);
  NICU 73% unsupported overall. `source_urls` avg 17 / median 10 **but capped at 50** (1,243 facilities pegged at
  exactly 50, none above) → "50" is an upstream truncation, show as "50+".

## In-platform setup (done, one-time)
App service principal `448a2853-6e8f-467b-a0ae-fbc92cdac2e8` has: `SELECT`+`USE` on the VF catalog, `CAN_USE` on the
warehouse, `MODIFY/SELECT/CREATE` on `workspace.medsatya`. The warehouse is attached as an app **resource** (scopes the
SP OAuth token). `WorkspaceClient()` auto-auths as the SP in-platform, via PAT locally.

## Verified vs pending
- ✅ Verified: engine on real data (ICU/Patna 175, NICU 63), 6/6 unit tests, all endpoints locally, Delta save round-trip,
  symptom mapping, build + full stack served, deploy `SUCCEEDED`/`RUNNING`.
- ⏳ Pending (human): open live URL logged in and run an ICU/Patna search (SSO-gated — couldn't drive the authed API from
  CLI); add 4 GitHub secrets so CI push→deploy goes green.

## Known gaps / next (see PROMPT-3)
Design is functional but not yet "showpiece": needs hero + verification animation, micro-interactions, Vaul bottom sheet,
logo.jpg integration, onboarding tour, accessibility mode (low-vision / colorblind), trust-score semafor, elegant
citations, plus new tabs (Feedback form → email + Delta, Support) and a stronger free-text AI agent.

## Run / deploy
Local: Python 3.13 venv, `pip install -r requirements.txt`; set `DATABRICKS_HOST`/`DATABRICKS_TOKEN` (from
`../data-access/.env`) + `DATABRICKS_WAREHOUSE_ID`; `(cd frontend && npm run build)`; `uvicorn backend.app:app`.
Deploy: `databricks sync . /Workspace/Users/ullmann@gapps.zcu.cz/medsatya-src --include 'frontend/dist/**'` then
`databricks apps deploy medsatya --source-code-path …`. `app.yaml` uses `sh -c` so `${DATABRICKS_APP_PORT}` is substituted.
