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

## Session 2 — "win-mode" GUI + new tabs + stronger AI (deployed, RUNNING)
Everything below is built, verified locally (build + headless render + live API smoke), and live.
- **Design system + a11y:** CSS-variable theming (`src/index.css` + `tailwind.config.ts`); shadcn-style
  tokens (`bg-canvas/surface`, `text-ink`, `border-line`, `focus`); accessibility store (`src/lib/a11y.tsx`,
  key `medsatya.a11y.v1`) → high-contrast AAA / font A·A+·A++ / colourblind-safe Okabe–Ito, persisted;
  toolbar in header. New deps: `motion`, `vaul`, `driver.js`, `lucide-react`, cva/clsx/tailwind-merge.
- **App shell:** bottom **tab bar** (Find care · Feedback · Support · Saved), routes `/feedback` `/support`
  added; **hero** (logo + Magic-UI ShimmerButton); **guided tour** (`src/lib/tour.ts`, driver.js, auto on
  first visit + header "?"); skip-link.
- **Results (showpiece):** `ResultsView.tsx` — mobile = full-screen MapLibre + **Vaul** bottom sheet
  (snap peek/half/full, marker→card); desktop = map + sidebar. **VerificationSequence** animates during the
  real `/api/shortlist` call. Code-split: initial JS 1.2 MB → ~130 KB gzip (maplibre/ResultsView/driver lazy).
- **Trust semafor + receipts:** `TrustMeter.tsx` (5 bands red→gold→green, colour+shape+icon+text,
  data-desert grey kept distinct) on card + Passport; `Receipts.tsx` (citations grouped by role,
  contradictions prominent, sources with hostname, **"50+"** when `source_urls` hits the 50 cap).
- **Feedback:** `POST /api/feedback` (`backend/app.py`) → Delta `workspace.medsatya.feedback`
  (`backend/persistence/feedback.py`, Delta-first) + best-effort email hook (`backend/notify/email.py`,
  OFF until `MEDSATYA_FEEDBACK_EMAIL_KEY`+`_FROM` set). FE form: doctor/patient + future login placeholder;
  UI states feedback does NOT change evidence live.
- **Stronger AI:** Layer 1 embeddings (`backend/ai/embedding.py`, `databricks-gte-large-en`, cosine, thresholds
  MATCH_MIN 0.47/MARGIN_MIN 0.05) + Layer 2 FM clarify (`databricks-meta-llama-3-1-8b-instruct`, one
  question, deterministic fallback). Chain in `ai/care_need.py`; guardrails preserved (never diagnoses,
  user confirms, emergency red-flags). `map-symptom` gained `needs_clarification`/`clarifying_question`.
  Free-Edition note: paid FM endpoints rate-limited to 0; embeddings + open-weight chat work.
- **Verified live-API:** ICU/Patna shortlist 113 (33 claim_only), embedding maps newborn→nicu(0.86)/emergency,
  ambiguous→clarify ("Is your child under 3 months old?"), feedback Delta round-trip, all engine tests pass.
- **Branding:** `logo.jpg` in header/hero; PWA icons + favicon regenerated from a redrawn shield-mark SVG
  (rsvg-convert); manifest unchanged.
- **Known:** app SP query-perm on serving endpoints not granted (auto-mode blocked ACL write) → if the SP
  can't query embeddings in-platform, AI silently falls back to rule-based; confirm via the symptom box
  (`provider` field shows `embedding` when live). Email hook needs a Resend key to actually send.

## Run / deploy
Local: Python 3.13 venv, `pip install -r requirements.txt`; set `DATABRICKS_HOST`/`DATABRICKS_TOKEN` (from
`../data-access/.env`) + `DATABRICKS_WAREHOUSE_ID`; `(cd frontend && npm run build)`; `uvicorn backend.app:app`.
Deploy: `databricks sync . /Workspace/Users/ullmann@gapps.zcu.cz/medsatya-src --include 'frontend/dist/**'` then
`databricks apps deploy medsatya --source-code-path …`. `app.yaml` uses `sh -c` so `${DATABRICKS_APP_PORT}` is substituted.

## Session 4 — results screen fixes: action tiles + return-from-map (deployed, RUNNING)
Verified: `tsc && vite build` green; headless **WebKit + Chromium** (Safari engine) pass on both A and B.
- **A) Action tiles (`FacilityCard.tsx`):** the 4 actions (Call · Directions · Save · Why this?) overflowed the
  narrow tiles (mobile 2-col ~156px; desktop 4-col sidebar ~84px). Fix: a shared `ACTION_TILE` class overrides the
  button base into a **vertical icon-above-label stack** (`flex-col`, `text-xs`, `px-1.5`, `min-h-[60px]`) so all 4
  tiles are uniform height and never overflow (measured: `heightSpread 0`, `docOverflowX 0` at 360–430px). `ui/button.tsx`
  untouched. Save-button states restacked (`flex flex-col items-center`), keeping the "pop" animation.
- **B) Return from map (`ResultsView.tsx` + `MapView.tsx`):** two independent causes, both fixed —
  1. `ChangeControls` sits in the draggable Vaul `Drawer.Content` header; a touch tap (with any finger movement) was
     swallowed as a drag. Fix: `data-vaul-no-drag=""` on the ChangeControls wrapper (Vaul 1.1.2 honors
     `element.closest('[data-vaul-no-drag]')` in `shouldDrag`). A clean tap always worked — the swallow only triggers on
     pointer MOVEMENT, so reproduce/verify with a micro-drag, not a plain tap.
  2. **MapView unmount crash (was the real blocker):** leaving step 3 unmounts `MapView`; React runs the map-init
     effect cleanup first (`map.remove()` → style dropped), then the distance-ring effect cleanup called
     `map.getLayer(...)` on the destroyed map → `this.style` undefined → **threw and blanked the whole app** (no error
     boundary), so "Change care type/location" appeared to do nothing. Fix: wrap the ring teardown's layer/source
     removals in `try/catch` so it no-ops once the map is gone. Verified: micro-drag Change care type → step 2, Change
     location → step 1 (touch, both engines); desktop click → step 2.
- **Deploy:** `databricks sync … --include 'frontend/dist/**' --full` → `databricks apps deploy medsatya` **SUCCEEDED**,
  app **RUNNING**. Live SSO touch test (real iPhone) is the user's to confirm.

## Session 3 — conversational OpenAI agent + realtime voice + UX/a11y polish (deployed, RUNNING)
Verified: `tsc && vite build` green, 6/6 engine tests, local full-stack uvicorn smoke (all endpoints),
headless render (Playwright), deploy `SUCCEEDED` / app `RUNNING`.
- **Conversational triage agent (OpenAI):** new `backend/ai/triage.py` — real multi-turn agent via
  Chat Completions **tool-calling** (`lookup_care_candidates` grounds in the Layer-1 embeddings taxonomy;
  `ask_clarifying` / `suggest_care_need` / `flag_emergency`). Honesty preserved: never diagnoses, output
  restricted to `config.CARE_NEEDS` (tool `enum` + `care_need_config` guard), emergency red-flags stay
  **deterministic and win**. New **`POST /api/triage`** (stateless — client sends the transcript);
  `/api/map-symptom` unchanged. No key / any error → graceful fallback to the embeddings + deterministic
  clarify chain. Default model `gpt-4o-mini` (`OPENAI_MODEL`). New config in `config.py`
  (`OPENAI_API_KEY`/`OPENAI_MODEL`/`OPENAI_TRANSCRIBE_MODEL`/`OPENAI_REALTIME_MODEL`, `openai_enabled()`).
  Deps added: `openai`, `python-multipart`.
- **Realtime voice (WebRTC):** `POST /api/realtime/session` mints a short-lived **ephemeral** client
  secret (key stays server-side); `frontend/src/lib/realtime.ts` opens WebRTC to OpenAI Realtime
  (`gpt-realtime-mini`), same honesty prompt + tools; tool events handled client-side
  (`lookup_care_candidates` → `GET /api/care-candidates`; suggest/emergency → UI). `POST /api/transcribe`
  (Whisper) = turn-based fallback. Graceful: no key → mic hidden, text chat always works.
- **Chat UI:** `SymptomBox.tsx` rewritten as a compact multi-turn chat (text + voice share one
  transcript), suggestion/emergency CTAs, "not a diagnosis" kept; `onConfirm` contract unchanged.
- **UX/a11y fixes:** (B) landing ALWAYS opens on the hero — removed the localStorage step-promotion in
  `FindCare.tsx`; return visits get a dismissible **"Resume last search"** chip on `Hero`. (C) mobile
  font-scaling A+/A++ no longer overflows (dropped `whitespace-nowrap`, clamp/rem, `min-w-0` in
  `button`/`shimmer-button`/`App`/`TabBar`; verified **0px** overflow at 125% on 390px). (D) a11y panel →
  **Vaul bottom sheet** (`A11yToolbar.tsx`): segmented A/A+/A++ + labelled switch rows, keyboard/focus
  kept. (E) `MapView` **distance rings** (5/10/25 km, honest "straight-line, not travel time" caption) —
  a channel distinct from the evidence marker colour. (F) `TrustMeter` **continuous fill** from
  `care_evidence` + list filter/legend (`TrustLegend.tsx`) + `AreaSummary` distribution bar (band-first
  order kept; never reorders to look better).
- **Live OpenAI key (no git/bundle):** Databricks **secret** scope `medsatya` key `openai_api_key`,
  attached as app **resource** `openai-api-key` → `app.yaml` `env valueFrom` (server-side only).
  `/api/health` now returns **`ai_openai`** (bool) to confirm the wiring while logged in.
- **User-verify (SSO-gated — CLI can't reach the authed app):** open live logged in → `/api/health`
  shows `ai_openai:true` → run the chat (OpenAI) + realtime mic; eyeball map rings + trust variability on
  a real shortlist. Realtime WebRTC is implemented-to-spec but **not browser-tested here** (headless
  can't drive a mic). Traffic/ETA = out of scope.
- **Fix (post-deploy): mobile map was blank (esp. iPhone Safari).** The rings change had put the MapLibre
  container on `absolute inset-0`, but MapLibre forces `.maplibregl-map { position: relative }`, which
  overrode `absolute` → `inset-0` stopped sizing it → container height collapsed to 0 → blank map (canvas
  stuck at MapLibre's 300px fallback). Fixed in `MapView.tsx`: container uses **`!absolute inset-0`** (so
  our absolute + inset sizing wins over MapLibre's relative) + the fill wrapper uses `absolute inset-0`
  (inset-based used height, not `h-full` percentage, since a `position:fixed` parent sized only by
  top/bottom insets isn't "explicit" for `%` height) + a raf/`load` `map.resize()` insurance. Verified
  rendering full-height (788px) in **WebKit (Safari engine)** + Chromium via Playwright. Redeployed, RUNNING.
- **UX refinements (post-deploy):** scroll resets to top on every step transition (`FindCare.tsx`, no more
  landing mid-page after picking a location). Landing/step headings, progress dots, city chips + map link
  are centered (matching the hero). **Step 2 reordered: assistant chat on top** ("type or tap the mic to
  speak"), then a divider, then the care-type options — and the chat's live suggestion now lights up the
  matching option with an **"AI · NN%"** badge (`CareNeedButtons` new `suggestedKey`/`suggestedConfidence`/
  `alternativeKeys` props, fed via `SymptomBox` `onSuggestionChange`), alternatives get "also possible".
  Also fixed the "Best supported" badge overlapping the label (badges now in a flow row, not absolute).

## Session 5 — honest semafor + clear recommendation (engine calibration + hero/ladder UX) (deployed, RUNNING)
Verified: 9/9 engine tests, **real-data engine dump** (warehouse `344b0522dfa0bbb2`), `tsc && vite build` green,
headless **WebKit + Chromium** 26/26, deploy `SUCCEEDED` / app `RUNNING`. Audit: `docs/ENGINE-audit.md`.
- **Diagnosis (real data, not display):** the trust-meter bands were faithful (strongly=green is only 13–30 %;
  the dominant band is `partially_supported`=**amber**). The "green everywhere" was the **DesertBadge**:
  `desert.classify` counted `partially_supported` as full green `evidenced_coverage` → **70–93 % of cards
  green**. Band over-credit came from **double-counting a field as claim AND support** (maternity: 100 % of
  STRONGLY had the specialty axis == the claim tag), and `care_evidence` saturated (STRONGLY ∈ {0.78, 1.0}).
- **Engine calibration (deterministic, citations preserved, `/api/*` unchanged):**
  - `evidence.py`: a `specialties` item consumed as the *claim* no longer also counts as the *specialty
    support axis* (cross-field independence); `care_evidence` is now count-weighted/granular so it ranks
    WITHIN a band (never across a status gate).
  - `desert.py`: **green `evidenced_coverage` reserved for STRONGLY**; `partially_supported` → gold
    `potential_coverage` ("verify"). This is the direct "kill the false green" lever.
  - `config.py`: dropped near-universal generics from `emergency` (oxygen/ambulance/resuscitation) and
    `trauma` (x-ray); added `operating theatre` (data spelling) to maternity/trauma to fix false negatives.
  - **Result on real shortlists:** green DesertBadge **70–93 % → 4–18 %**; `care_evidence` among STRONGLY
    {0.78,1.0} → 5–9 distinct values (visible meter ranking). Facilities that claim but lack equipment/
    procedure are never green. maternity/emergency are honestly red-heavy (thin corroboration in the data).
- **Recommendation UX (`ResultsView.tsx` + `FacilityCard.tsx`):** the flat list is now a **#1 hero**
  ("Best-evidenced nearby") + **ladder #2–#6** + a **collapsed `<details>` tail** ("+N more nearby — weaker
  or unverified evidence"). `FacilityCard` gained optional `rank`/`variant:"hero"|"list"` (default list,
  backward compatible). Band-first order, NEAREST flag, non-reordering filter all preserved — nothing dropped.
- **Hero CTA (`Hero.tsx`):** the "Find trusted care" ShimmerButton wrapper got `flex justify-center` — now
  centered (measured offset **0.0px**) at 360/390/430 px and font scale A/A++.
