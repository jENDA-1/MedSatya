# Public deploy for judges (Render) — the whole app, live Databricks data

The Databricks App (`medsatya`) is always behind workspace SSO — there is **no toggle** to make it
public. So for judges we run the **same single process** (FastAPI serving the React frontend + the
`/api/*` warehouse queries) on a public host. **The data stays on Databricks**: the backend only
talks to the warehouse over HTTPS with the app Service Principal's creds. No code changes — the
frontend is same-origin (`/api`), so one web service serves everything (no CORS).

Files that make this work (already in the repo): `Dockerfile` (Node build → Python runtime),
`.dockerignore`, `render.yaml` (Blueprint).

## Is it free? / how it works
- **Render free web service = $0.** 750 instance-hours/month. It **spins down after ~15 min idle**
  and cold-starts (~30–60 s) on the next hit. Fine for judging — just **open the URL once to warm it
  up right before the demo**. (Upgrade to Starter ~$7/mo if you want always-on; not needed.)
- **Railway** is no longer truly free (trial credit → ~$5/mo). Render free is the better "zdarma" pick.
- How it works: Render connects to the GitHub repo, builds the `Dockerfile`, runs the container,
  gives you a public HTTPS URL like `https://medsatya.onrender.com`. On every push it rebuilds
  (`autoDeploy`). The Databricks App can keep running in parallel — no need to delete it.

## Steps
1. **Get Databricks creds (least-privilege = Service Principal OAuth).**
   The app Service Principal (its client/application id is in your Databricks console → Service
   principals, and in your local `data-access/.env`) already has SELECT+USE on the dataset catalog
   and CAN_USE on the warehouse. Generate an OAuth secret for it:
   Databricks workspace → **Settings → Identity and access → Service principals →** the app SP →
   **Secrets → Generate secret**. You get a client ID (the SP's application ID) + secret.
   - *No admin rights to do that?* Fallback: use a **PAT** (Settings → Developer → Access tokens).
     Quicker but broader privilege — use only for the demo and **rotate it after**.
2. **Render → New → Blueprint →** connect `github.com/jENDA-1/MedSatya` → it reads `render.yaml`.
   Set the secret values (they live only in Render, never in git). All concrete values are in your
   local `data-access/.env` + the Databricks console — do NOT paste them into this public repo:
   - `DATABRICKS_HOST` = your workspace URL
   - `DATABRICKS_WAREHOUSE_ID` = your SQL warehouse id
   - **Auth — pick ONE:** `DATABRICKS_CLIENT_ID` + `DATABRICKS_CLIENT_SECRET` (SP OAuth), **or**
     `DATABRICKS_TOKEN` (PAT — uncomment it in `render.yaml`, leave the client_id/secret unset).
   - `OPENAI_API_KEY` = your key (optional; omit → AI degrades to rule-based, no crash).
3. **Deploy.** First build ~3–5 min. Health check hits `/api/health` (returns `warehouse_available`).
4. **Verify the live URL:** open it, run a search (e.g. ICU near Patna) — real facilities load =
   warehouse creds work. `/api/health` field `warehouse_available:true` confirms the connection.
5. **Before judging:** hit the URL once to warm the free instance out of cold-start.

## Guardrails
- Secrets ONLY as Render env vars — never commit them. `.env` stays gitignored; `.dockerignore`
  keeps it out of the image.
- Set exactly ONE auth method (SP OAuth **or** PAT), not both, to avoid ambiguous SDK auth.
- Same image runs on Railway/Fly/any Docker host if you ever switch — it's portable.
