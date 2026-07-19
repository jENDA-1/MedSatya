<div align="center">

# 🩺 MedSatya — Referral Copilot

### _Trust. Verify. Heal India._

**Hack-Nation × Databricks · Challenge #04 "Data Legend" · 18–19 July 2026 · Team AHOJ AI**

**▶ [Live on Databricks Apps](https://medsatya-7474659229844250.aws.databricksapps.com) · [Public demo — no login](https://gridmind.taila69b70.ts.net/medsatyam/)**

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre-396CB2?logo=maplibre&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

▶ [Watch the brand animation](docs/demo.mp4) (6 s)

</div>

MedSatya helps people in India find **trustworthy care**. For a given care need (ICU, NICU, …) near a
location, it returns an **evidence-attached shortlist** of facilities — every claim shows its **source**
("receipt"), and the app is honest about what it does *not* know.

It **never** invents facts about bed availability, current operation, patient admission, or overall hospital
quality, and it **does not diagnose**. The core rule: we don't score "hospital trustworthiness", we score the
**strength of evidence that a specific facility provides a specific type of care**.

---

## 🏆 Hackathon & track

Built at the **Hack-Nation × Databricks Hackathon** on **18–19 July 2026**, for **Challenge #04 — "Data Legend"**.

The track hands you **~10,000 Indian hospital records** (the **Virtue Foundation** dataset) full of
**self-reported, unverified claims** and asks for an app a health planner can *trust and act on* — one that
always shows **where each fact comes from** ("receipts") and **what it doesn't know**, never confusing a
**medical desert** (care truly absent) with a **data desert** (we just lack data).

The brief offers four app variants; **we primarily built the Referral Copilot** (variant 3 —
_"Where should I send the patient?"_): enter a **location + care need** (e.g. _ICU near Patna_) → a short,
**evidence-backed shortlist** showing distance, what supports each claim, and what's still missing — so a
family or planner knows not just *where*, but *how sure we are*.

## 🔗 Live

| Deployment | URL | Access |
|---|---|---|
| 🟠 **Databricks Apps** — canonical; one FastAPI process serves `/api/*` + the React PWA | **https://medsatya-7474659229844250.aws.databricksapps.com** | Databricks workspace SSO |
| 🟢 **Public demo** — for reviewers; static frontend + FastAPI reverse-proxied under a subpath | **https://gridmind.taila69b70.ts.net/medsatyam/** | open, no login |

Both run on the **same live Databricks warehouse** — the public demo is a mirror so reviewers can try it
without a Databricks login. See [Deploy → Public demo mirror](#public-demo-mirror) for the subpath build.

## 👥 Team — AHOJ AI

<table>
<tr>
<td align="center" width="25%">
<a href="https://www.linkedin.com/in/kalaluka-kwalombota-0211961ab/"><img src="docs/team/kalaluka-kwalombota.jpg" width="110" alt="Kalaluka Kwalombota"/></a><br/>
<b>Kalaluka Kwalombota</b><br/>
<sub>Team lead · Data &amp; ML engineering</sub><br/>
<a href="https://www.linkedin.com/in/kalaluka-kwalombota-0211961ab/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?logo=linkedin&logoColor=white" alt="LinkedIn"/></a>
</td>
<td align="center" width="25%">
<a href="https://www.linkedin.com/in/jan-ullmann-5a167920b/"><img src="docs/team/jan-ullmann.jpg" width="110" alt="Jan Ullmann"/></a><br/>
<b>Jan Ullmann</b><br/>
<sub>Full-stack + data/AI engineering</sub><br/>
<a href="https://www.linkedin.com/in/jan-ullmann-5a167920b/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?logo=linkedin&logoColor=white" alt="LinkedIn"/></a>
</td>
<td align="center" width="25%">
<a href="https://www.linkedin.com/in/jirizavorka/"><img src="docs/team/jiri-zavorka.jpg" width="110" alt="Jiří Závorka"/></a><br/>
<b>Jiří Závorka</b><br/>
<sub>Software / data engineering</sub><br/>
<a href="https://www.linkedin.com/in/jirizavorka/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?logo=linkedin&logoColor=white" alt="LinkedIn"/></a>
</td>
<td align="center" width="25%">
<a href="https://www.linkedin.com/in/radek-skoda-bb2a394/"><img src="docs/team/radek-skoda.jpg" width="110" alt="Radek Škoda"/></a><br/>
<b>prof. Radek Škoda</b><br/>
<sub>Academic advisor / mentor</sub><br/>
<a href="https://www.linkedin.com/in/radek-skoda-bb2a394/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?logo=linkedin&logoColor=white" alt="LinkedIn"/></a>
</td>
</tr>
</table>

A European team from three Czech universities: **TU Liberec** · **CTU Prague (CIIRC)** · **University of West Bohemia (FEE)**.

---

## 🧭 Architecture

```
FastAPI (backend/)  ── serves ──►  /api/*   (data + engine + AI)
        │                          /*        (prebuilt React PWA from frontend/dist)
        ▼
  SQL Warehouse  (Databricks SDK Statement Execution API + service-principal OAuth / PAT)
        ▼
  facilities  (Virtue Foundation dataset, via Delta Sharing / Marketplace)
```

- **backend/** — Python. `config.py` (parametrized catalog/schema/table + warehouse), `data/` (SQL warehouse +
  facilities parsing), `engine/` (deterministic Trust Engine: evidence bands, ranking, desert), `ai/`
  (symptom→care-need, rule-based + embeddings + Model Serving hook), `persistence/` (Delta store).
- **frontend/** — React + Vite + Tailwind + shadcn/ui, installable PWA (MapLibre + OSM, no map key).

## 💻 Local development

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

## 🚀 Deploy

Run the **Deploy** workflow manually (**Actions → Deploy MedSatya to Databricks Apps → Run workflow**): it
builds the frontend and runs `databricks sync` + `databricks apps deploy`. It's **manual-only** (so commits
don't trigger deploys) and needs the repo **Secrets** below.

Required repo **Secrets** (Settings → Secrets and variables → Actions — never commit these):

| Secret | Example |
|---|---|
| `DATABRICKS_HOST` | `https://<your-workspace>.cloud.databricks.com` |
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

## 📦 Adding the data (for teammates)

The app reads the **Virtue Foundation Dataset (DAIS 2026)** Marketplace listing
(`19326b3d-db63-4627-abc0-cf4e8131a305`). In your Databricks workspace: **Marketplace → find the listing →
Get instant access** so `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`
appears in your Catalog. Do **not** copy/redistribute the files — that breaks lineage and the source
"receipts". The app parametrizes `catalog.schema.table` via env, so no one's catalog name is hardcoded.

## ⚖️ Honesty ethos (what the engine guarantees)

- Evidence status per `(facility, care_need)`: `strongly_supported` / `partially_supported` / `claim_only` /
  `contradictory` / `not_enough_data` — from **cross-field corroboration** (a claim in `capability` checked
  against `equipment` / `procedure` / `specialties`). An **empty field is not negative evidence**.
- **Data desert** ("we don't know") is visually distinct from **medical desert** ("care probably absent").
- Every status carries an **exact-span citation** + `source_urls`, plus a **call-before-travel checklist**
  built from exactly what the data does not confirm.

---

<div align="center">

**Team AHOJ AI** · Hack-Nation × Databricks · Challenge #04 "Data Legend" · 18–19 July 2026
· [MIT License](LICENSE)

_Trust. Verify. Heal India._ 🩺

</div>
