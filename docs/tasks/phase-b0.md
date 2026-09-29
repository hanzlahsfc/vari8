# Phase B0 task record — Daily Tracker entry prototype (dev-only, in-memory)

Status: **PASS** (non-persistent prototype; persistence blocked on stakeholder decisions).

## What was built

- `lib/daily-prototype.ts` — pure field schema + `validateDailyEntry` + dev gate.
- `app/daily/page.tsx` — server page, `force-dynamic`, **404 unless `ENABLE_DAILY_PROTOTYPE=1`**;
  visible "not saved" notice.
- `app/daily/daily-tracker.tsx` — client component: form + in-memory week view (state only).
- Tokenized styles in `app/globals.css` (no hex outside `themes/`).

## Scope / fields

- **Included (source-backed labels/units):** date; weight kg; weigh-in time; cycle day; PMS
  symptoms; BBT °C; sleep duration/quality/sleep time/wake time; steps; cardio min; training
  session; training time; 8 × biofeedback 1–10; RHR; BP systolic/diastolic; blood glucose
  mmol/L; day label HIGH/MEDIUM/LOW; carbs g; protein g; fats g; salt g; water L; off-plan
  meal; bowel movements; client note.
- **Excluded:** E2, PROG, PED/HRT, coach notes, targets, calories, averages.
- **Computed:** a "Calories (automatic)" column renders the plain `TODO(product)` marker — never
  a computed value.
- **Constraints enforced:** only biofeedback 1–10 and the day-label enum (plus date as the
  week-view key). No other ranges/requiredness invented.

## Non-persistence / policy boundary

- No DB, schema, migration, server actions, API writes, `localStorage`, `IndexedDB`, or cookies.
- The prototype is **development-only**: `ENABLE_DAILY_PROTOTYPE=1` required; default (and any
  real deployment) returns 404 — no access-policy change. The prototype is not linked in
  navigation (reached directly at `/daily`) so no dead link is baked into static builds.
- `playwright.config.ts` enables the flag for the test server only.

## Tests + real exit codes

```
npm run verify        → 0  (19 files, 133 tests)
npm run build         → 0
npm run test:e2e      → 0  (21 passed)
```

E2E: notice + in-scope fields present, excluded fields absent, `TODO(product)` advertised;
entry appears in the week view with **no POST/PUT/PATCH/DELETE request** and is cleared on
refresh; biofeedback 11 rejected by validation; mobile (390px) usable. Unit tests cover the
schema (labels/units, 8 biofeedback 1–10, exclusions, computed marker), validation
(date-only requiredness, biofeedback range, day-label enum, and that other fields are
unconstrained), and the dev gate predicate.

## Review

Independent fresh-context review recorded in the report; limitation: reviewer shares the
builder's underlying model — not model-diverse.

## Blocked / limitations

- **Persistence is blocked** on stakeholder decisions: roles/ownership, coach↔client access
  scoping, historical-edit rules, retention/deletion, consent/audit, synthetic fixtures, and
  the public-exposure/licensing policy.
- Only a subset of source-confirmed fields is editable; computed/estimation/wiring behaviour
  awaits Lilly's blueprint and the missing `.xlsx`.
- No `localStorage`/cookies: refreshing clears entries by design.
