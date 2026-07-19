# Engine audit — honest semafor (Session 5 / PROMPT-6)

Audit of the Trust Engine on **real warehouse data** (`344b0522dfa0bbb2`,
`databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`), the diagnosis of
"the semafor is green almost everywhere", the calibration applied, and the before/after on real shortlists.

Dump method: `facilities.find_candidates(need, lat, lon, limit=400)` → `ranking.build_shortlist(cands, need)`,
counting bands + `desert.type` over the full shortlist (not just the top-N). Care needs × locations:
icu / nicu / maternity / emergency × Patna (25.594, 85.137) / Delhi (28.61, 77.21) / rural Bihar (26.05, 84.40).

## Diagnosis (what actually caused "green everywhere")

1. **The band colours were faithful — the TrustMeter was NOT "all green".** Tokens (`src/index.css`):
   `strong` = green `#00634B`, `partial` = **amber** `#C99A2E`, `claim_only` = **grey** `#6B7280`,
   `contradictory` = red, `not_enough` = slate. STRONGLY (the only green band) was just **13–30 %** of any
   real shortlist; the dominant band is **`partially_supported` (amber)** at 55–80 %. The shortlist never
   shows `not_enough`/`contradictory` because `find_candidates` pre-filters to facilities that *claim* the type.

2. **The green came from `DesertBadge`, not the meter.** `desert.classify` treated `partially_supported` as
   full `strong_care` → `evidenced_coverage` (**green**) whenever `data_confidence ≥ 0.5`. Because
   partially+strongly cover 70–95 % and records are rich (specialties 100 % populated), the **green badge
   sat on 70–93 % of cards** (icu/Patna 70 %, nicu/Patna 93 %, maternity/Patna 85 %, emergency/Patna 77 %) —
   next to an amber meter. That visual contradiction is what read as "over-confident / all green".

3. **Band over-credit = a field double-counted as claim AND support.** The claim is read from
   `capability > specialties > description`; the specialty support axis is read from `specialties`. When the
   claim comes from `specialties`, the **same tag** satisfied both. Measured: maternity **100 %** of STRONGLY
   had the specialty-citation text identical to the claim-citation text (claim "obstetric" + support
   "obstetrics", both from the single tag `gynecologyAndObstetrics`); emergency partially; icu/nicu **0 %**
   (their claim is in `capability`, so the specialty axis was already independent).

4. **`care_evidence` saturated → no within-band ranking.** Among 17 STRONGLY (icu/Patna) only **{0.78, 1.0}**
   occurred, so every strong card's trust-meter fill looked identical. (Old form: 0.30 claim + 0.30 eq +
   0.22 proc + 0.18 spec, all-or-nothing.)

**Verdict: engine calibration (bands/score) + product UX**, and the single biggest visual lever is the
DesertBadge, not the band assignment.

## Calibration applied (deterministic, citations preserved, `/api/*` contract unchanged)

- **`engine/evidence.py` — claim/support independence:** a `specialties` item consumed as the *claim* can no
  longer also count as the *specialty support axis* (`spec_pool` excludes claim-source items). Equipment /
  procedure axes unchanged. **Citations are still emitted in full** — only axis *counting* is filtered.
- **`engine/evidence.py` — spread `care_evidence`:** count-weighted, granular (equipment/procedure weighted
  by number of distinct matches; specialty weighted lowest and capped). Only re-orders *within* a band, never
  across a status gate.
- **`engine/desert.py` — green reserved for STRONGLY:** `evidenced_coverage` (green) only for
  `strongly_supported` + high data; `partially_supported` → `potential_coverage` (**gold, "verify"**) at any
  data confidence. This is the direct fix for "green everywhere".
- **`config.py` — keyword hygiene:** dropped near-universal generics from `emergency` (`oxygen`, `ambulance`,
  `resuscitation`→kept only in procedures) and `trauma` (`x-ray`); added `operating theatre` alongside
  `operation theatre` for maternity/trauma (the source data spells it "operating theatre" — a genuine
  false-negative, e.g. a hospital explicitly claiming "Maternity care" with an OT was scored claim_only).

## Before → After on real shortlists

**DesertBadge green share (the "všude zeleno" metric):**

| care need / location | green BEFORE | green AFTER |
|---|---|---|
| icu / Patna | 70 % | **15 %** |
| nicu / Patna | 93 % | **17 %** |
| nicu / Delhi | 93 % | **13 %** |
| maternity / Patna | 85 % | **5 %** |
| emergency / Patna | 77 % | **6 %** |

**Full after-state (bands = trust meter; desert = badge):**

| need | loc | strongly | partially | claim_only | green | gold | red |
|---|---|---|---|---|---|---|---|
| icu | Patna | 15 % | 55 % | 29 % | 15 % | 55 % | 29 % |
| icu | Delhi | 16 % | 55 % | 28 % | 16 % | 55 % | 28 % |
| icu | Rural | 13 % | 59 % | 26 % | 13 % | 59 % | 26 % |
| nicu | Patna | 17 % | 76 % | 6 % | 17 % | 76 % | 6 % |
| nicu | Delhi | 13 % | 80 % | 6 % | 13 % | 80 % | 6 % |
| nicu | Rural | 18 % | 79 % | 2 % | 18 % | 79 % | 2 % |
| maternity | Patna | 5 % | 29 % | 65 % | 5 % | 29 % | 65 % |
| maternity | Delhi | 10 % | 37 % | 52 % | 10 % | 37 % | 52 % |
| emergency | Patna | 6 % | 45 % | 47 % | 6 % | 45 % | 47 % |

**Within-band ranking restored:** distinct `care_evidence` values among STRONGLY (icu/Patna) went from
**{0.78, 1.0}** to **{0.53, 0.59, 0.60, 0.61, 0.66, 0.68, 0.80}** — the trust meter now differentiates.

## Honesty test (facility claims the type but has no equipment/procedure data)

Confirmed such facilities are **never green**: they land in `claim_only` (grey meter) or `partially_supported`
(amber, when an independent specialty tag exists), with a gold/red DesertBadge — never green. Example:
*Global MultiSpeciality Hospital & Trauma Center* (icu, empty equipment, only a `criticalCareMedicine` tag) →
`partially_supported`, gold "verify", `care_evidence 0.26`.

## Notes / honest caveats

- **maternity/emergency are red-heavy** (52–67 % / 47–57 % claim_only→red). This is honest, not arbitrary:
  in the source data these facilities' only signal is often a specialty tag (now correctly counted as a
  *claim*, not independent corroboration), with no delivery/emergency equipment or procedures documented. A
  spot-check confirmed most are genuine (e.g. a dental clinic pulled in by a "labor" substring; multispecialty
  hospitals listing ob/gyn with zero delivery equipment). Each red carries the "call before you travel"
  checklist and the badge says *"care may be absent — verify"*, never asserts absence as fact. These two care
  types are wired but not MVP-tuned (MVP = icu + nicu); their keyword coverage is the place to deepen next.
- **No band is hardcoded** — every colour is data-driven through `format.ts` / `desert.py`. The recalibration
  raises no false confidence and manufactures no red: it removes a double-count and reserves green for genuine
  independent corroboration.

---

# Engine audit — trauma over-scoring (Session 6 / PROMPT-8)

Honesty check triggered by "how can it be 85 % trauma?". Same dump method as Session 5
(`facilities.find_candidates(need, lat, lon)` → `ranking.build_shortlist`), counting bands + `desert.type`
over the full shortlist. Care needs × locations: **trauma / icu / nicu × Patna (25.594, 85.137) /
New Delhi (28.61, 77.21) / Ranchi (23.34, 85.31)**. Trauma was NOT audited in Session 5 and was never
MVP-tuned (`MVP_CARE_NEEDS = ("icu", "nicu")`).

## Diagnosis — trauma reaches STRONGLY (green) far too easily

| care need | Patna green | Delhi green | Ranchi green |
|-----------|:-----------:|:-----------:|:------------:|
| **trauma (before)** | **50 %** (8/16) | **58 %** (34/59) | **43 %** (3/7) |
| icu (calibrated) | 15 % | 17 % | 23 % |
| nicu (calibrated) | 17 % | 13 % | 21 % |

Trauma's green share was **~3× the calibrated icu/nicu types**. The mechanism:

1. **STRONGLY needs a claim + only 2 of 3 boolean support axes** (`evidence.py`), regardless of depth.
2. **Trauma's claim keywords are strict** (`"trauma center"`, `"level i trauma"`, `"polytrauma"`) → the
   shortlist is genuinely *self-declared trauma centers*. But its **support fields are generic**: the four
   specialty tags (`orthopedicsurgery`, `generalsurgery`, `neurosurgery`, `criticalcaremedicine`) and the
   equipment (`ct scan`, `operation theatre`, `blood bank`) are infrastructure **any large multispecialty
   hospital carries** — they do not discriminate a designated trauma center from a general hospital.
3. **The claim/support independence filter (Session 5) is a no-op for trauma** — its claim keywords never
   overlap its specialty tags (unlike maternity's `"obstetric"` ⊂ `"gynecologyandobstetrics"`), so the
   generic surgical specialty axis counts at full weight.
4. **88–100 % of trauma greens carried NO trauma-specific signal.** Support-axis combo among STRONGLY was
   dominated by `(equipment, specialty)` (Delhi: 32/34), i.e. "has a CT/OT" + "has ortho/general surgery dept",
   with the procedure axis rarely firing. Specialty tags matched (Delhi STRONGLY): `orthopedicsurgery ×32`,
   `generalsurgery ×28`, `criticalcaremedicine ×24`, `neurosurgery ×23`. In this dataset the genuinely
   discriminating fields (`trauma bay`, `trauma surgery`) are sparse.

**Verdict:** trauma **over-scores** — a bare "trauma center" claim plus generic big-hospital gear was
painting green. This is the same class of issue Session 5 fixed for icu/nicu/maternity, which trauma escaped.

## Calibration applied — opt-in "specificity gate" (deterministic)

- **`config.py`**: `CARE_NEEDS["trauma"]` gains `"specific_support_keywords": ["trauma bay", "trauma surgery"]`
  — the two genuinely trauma-discriminating signals (both already present in equipment/procedure keyword lists,
  so citations are unchanged).
- **`evidence.py`**: a care need that declares `specific_support_keywords` reaches **STRONGLY only if a claim
  is corroborated by ≥2 support axes AND at least one support citation matches a specific keyword**.
  Generic-only corroboration is demoted to `partially_supported` (gold **"verify by phone"**) — never below,
  and **all citations are still emitted in full** (we gate the band, not the receipts). Care needs *without*
  the key keep `has_specific = True` → **identical behaviour (zero regression to icu/nicu/…)**.
- Honesty rationale: green (STRONGLY / evidenced coverage) is reserved for a *discriminating* corroboration,
  not "this is a big hospital". For an emergency care type, **"call ahead to confirm trauma capability" (gold)
  is the correct advice** for a self-declared trauma center whose only corroboration is general surgical infra.
- `care_evidence` (the "85 %" within-band ranking signal) is **unchanged** — the fix is a band gate only.

## Before → after (real data, re-run post-calibration)

| trauma green | Patna | Delhi | Ranchi |
|--------------|:-----:|:-----:|:------:|
| before | 50 % (8/16) | 58 % (34/59) | 43 % (3/7) |
| **after** | **6 % (1/16)** | **2 % (1/59)** | **0 % (0/7)** |

Every surviving STRONGLY carries a trauma-specific signal (0 % of the remaining greens lack one). **icu/nicu
green shares are byte-for-byte unchanged** (Patna 15/17 %, Delhi 17/13 %, Ranchi 23/21 %) — the gate is
opt-in per care need.

## Tests + UI

- `tests/test_evidence.py`: added `test_trauma_generic_infra_gated_to_partially` (claim + generic surgery/CT
  → PARTIALLY, citations preserved) and `test_trauma_specific_signal_reaches_strongly` (claim + trauma bay →
  STRONGLY). Full suite **11/11 green**; all Session-5 icu/nicu/maternity guards still pass.
- **UI honesty (small):** Trust Passport metric label `Care evidence score` → **`Evidence strength`**
  (`FacilityPassport.tsx`) so the percentage reads as *strength of evidence for the care type*, not
  *hospital quality* — the TrustMeter band/caption above it already frames "not quality".
