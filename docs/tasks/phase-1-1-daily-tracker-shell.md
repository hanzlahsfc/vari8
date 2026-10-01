# Phase 1.1 — Daily Tracker production shell (plan + acceptance criteria + record)

**Plan committed before code.** Builder: opencode (deepseek-v4.1-flash).
Branch `feature/phase-1-1-daily-tracker-shell`, based on the approved Phase 0.1
blueprint branch `feature/phase-0-1-source-blueprint` `b05c130`, which is off the
verified `main` `fc2c936`.

Basis: `docs/tasks/phase-0-1-source-blueprint.md` (approved crosswalk §2,
exclusions §5), `docs/tasks/phase-b0.md` (dev-only prototype), `AGENTS.md`,
`docs/conductor-generic/SKILL.md`, `docs/product-decisions.md`,
`docs/security/authorization-model.md`.

## 0. Blueprint availability

The Phase 0.1 blueprint is **available** on
`origin/feature/phase-0-1-source-blueprint` at `b05c130`, off verified `main`
`fc2c936`. No source-fact limitation applies: every section, label, unit, and
constraint below is taken from that committed document (crosswalk §2), not
invented. The private `TRACKER 2.0.md` was not read, staged, or committed.

## 1. Scope

Build the **first production-oriented Daily Tracker UI foundation**: a real,
routable, server-authorized workspace page shell at
`/workspace/[workspaceId]/daily`, reached through the existing role-aware
workspace navigation. This is **not** the Phase B0 dev-only `/daily` prototype
(which is left untouched) and **not** a persisted tracker.

**In scope**

- A reusable, pure **section/field contract** (`lib/daily-tracker.ts`) that maps
  to the future persisted tracker record and encodes only source-verified
  labels, units, and the two verified validations.
- Reusable presentational primitives (`TrackerSection`, `TrackerField`,
  `DailyTrackerShell`) built on the existing theme tokens.
- A production route integrated with the existing session + RBAC guard and the
  workspace shell navigation.
- Intentional desktop/tablet/mobile layouts with in-page section navigation,
  visible focus, keyboard operation, and no horizontal overflow.
- An honest "entry is not available until persistence ships (Phase 4)" status;
  no save/edit, no fabricated records, no calculations.

**Out of scope (deliberately deferred, recorded in §6):** persistence, database
schema/migration, server actions/APIs, `localStorage`/cookies/seed data, any
computed value (calories/averages/trends/scores), consent enforcement, client
self-service shell, and every unverified PRGRSS formula or mapping.

## 2. Source fidelity (verified against blueprint §2 before use)

Sections, in source order (blueprint §2 row-8 headers): `DATE & PHASE`,
`BODYWEIGHT`, `MENSES`, `SLEEP`, `ACTIVITY`, `BIOFEEDBACK`, `BIOMETRICS`,
`NUTRITION & DIGESTION`, `NOTES`.

| Section               | Field label (source header)                                                                                  | Unit / hint                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| DATE & PHASE          | Weekday, Date                                                                                                | —                                |
| BODYWEIGHT            | WEIGHT, TIME                                                                                                 | kg; hrs:mins                     |
| MENSES                | CYCLE DAY, PMS SYMPTOMS, BBT                                                                                 | day; —; °C                       |
| SLEEP                 | DURATION, QUALITY (Sleep Score), SLEEP TIME, WAKE TIME                                                       | hrs:mins; —; hrs:mins; hrs:mins  |
| ACTIVITY              | STEPS, CARDIO, RESISTANCE TRAINING, TIME OF TRAINING                                                         | steps; mins; —; hrs:mins         |
| BIOFEEDBACK           | DESIRE TO TRAIN, ENERGY IN GYM, MOOD IN GYM, ENERGY OUTSIDE GYM, MOOD OUTSIDE GYM, STRESS, HUNGER, ADHERENCE | Scale 1–10                       |
| BIOMETRICS            | RHR, BLOOD PRESSURE, BLOOD GLUCOSE                                                                           | bpm; mmHg; mmol/L                |
| NUTRITION & DIGESTION | DAY LABEL, CARBS, PROTEIN, FATS, CALORIES, SALT, WATER, OFF-PLAN MEAL, BOWEL MOVEMENTS                       | —; g; g; g; computed; g; L; —; — |
| NOTES                 | Client Notes                                                                                                 | —                                |

**Excluded fields (out of scope, no input/field contract):** `E2`, `PROG`
(PED/HRT — legal/policy gate), and `Coaches' notes` (coach-authored). `CALORIES`
is the source's "automatic" column and renders only the `TODO(product)` marker —
never an input and never a computed value. `MENSES` is shown with its verified
labels but gated by a visible note that cycle data requires `CYCLE` consent and
persistence.

## 3. Reused conventions

- Auth/RBAC: `requireSessionUser()` (session gate → `/login`, HTTP 403 via
  `forbidden()`) plus the existing `authorizeCollection("dailyTracking", "read",
workspaceId)` primitive, exposed through a new read-only route-guard helper.
  No RBAC matrix, session, or authentication semantics change.
- Shell: the route renders inside `app/workspace/[workspaceId]/layout.tsx`
  (desktop sidebar / tablet top bar / mobile stacked) and adds a nav entry in
  `components/workspace-nav.tsx` using the role-aware `resolveScope` matrix.
- Tokens: colors only from `themes/*`; new layout values are added as scoped CSS
  custom properties in `app/globals.css` (no hex outside `themes/`).

## 4. Locked acceptance criteria (atomic; tests encode these before code)

- **AC1 Route + auth.** Unauthenticated `GET /workspace/[id]/daily` redirects to
  `/login`. A workspace member with a granted `dailyTracking` read scope
  (owner/coach/assistant) gets the page; a non-member gets HTTP 403 with the
  disclosure-free access-denied page.
- **AC2 Navigation.** A signed-in owner sees a `Daily Tracker` link in the
  workspace navigation that routes to `/workspace/[id]/daily`.
- **AC3 Source fidelity.** The route renders exactly the nine verified section
  headings and the field labels/units of §2; `CALORIES` renders only
  `TODO(product)`; no `E2`/`PROG`/`Coaches' notes` field exists.
- **AC4 Verification-only constraints.** The contract exposes only biofeedback
  `min=1/max=10` and `DAY LABEL ∈ {HIGH, MEDIUM, LOW}` (plus the two verified
  labels); the pure validator enforces only those and never invents requiredness.
- **AC5 No fake data/persistence.** No request with `POST/PUT/PATCH/DELETE` is
  made by the page; no `localStorage`/`sessionStorage`/cookie is written; the
  page states that entry/saving is unavailable until Phase 4.
- **AC6 Responsive + accessible.** Distinct desktop (1440px, two-column:
  section nav + content), tablet (834px, reflowed single column, horizontal
  section chips, ≥44px targets), and mobile (390px, single column, scannable
  cards) layouts; zero horizontal document overflow at all three; semantic
  landmarks/headings, associated labels, visible focus, keyboard-operable
  navigation.
- **AC7 Regression safety.** Existing routes/tests are unchanged; `/daily`
  remains the dev-only prototype; no schema/migration/dependency/auth change.

## 5. Files

- `lib/daily-tracker.ts` — verified section/field contract, computed marker,
  pure validator (new).
- `components/tracker/tracker-field.tsx`,
  `components/tracker/tracker-section.tsx`,
  `components/tracker/daily-tracker-shell.tsx` — reusable primitives (new).
- `app/workspace/[workspaceId]/daily/page.tsx` — the route (new).
- `components/workspace-nav.tsx` — Daily Tracker nav entry (edit).
- `lib/auth/route-guard.ts` — `requireDailyTrackerAccess` helper (edit).
- `app/globals.css` — tokenized tracker responsive styles (edit).
- `tests/unit/daily-tracker.test.ts` —
  `tests/integration/phase-1-1-daily-tracker-guard.test.ts` —
  `tests/e2e/daily-tracker.spec.ts` (new).
- `docs/tasks/phase-1-1-daily-tracker-shell.md` (this file), `docs/STATUS.md`.

No `db/**`, `app/api/**`, dependency, or permission-matrix file changes.

## 6. Deferred / unknown PRGRSS logic

Persistence + database model, consent enforcement (CYCLE, health data),
client-facing shell, PED/HRT, all formulas and computed columns (calories,
averages, Δkg/Δ%, cycle-phase estimation, T-minus, meal-plan subtotals),
checkboxes, target-row propagation, real-browser data entry, exports, and every
`TODO(product)`/`TODO(human)` open item in the blueprint §3 remain deferred.

## 7. RED → GREEN + gates

1. Commit this plan.
2. Add the tests below and run them against the pre-implementation tree → **RED**
   (module/route absent).
3. Implement the minimum to pass; focused unit + E2E → **GREEN**.
4. Full gates (real exit codes): `git diff --check`; `npm run format:check`;
   `npm run typecheck`; `npm run lint`; `npm run test`; `npm run build`;
   `npm run test:e2e`; plus `npm run test:integration` on a disposable PG.
5. Fresh-context independent review of the exact tree; repair + re-check.

## 8. Rollback

Pure `git revert` of the scoped commits: no migration, no external state, no
persistence. The Phase B0 `/daily` prototype is untouched.

## 9. Boundaries

No `TRACKER 2.0.md`; no real client data; no Prime Tracker change; product name
undecided (never invented); synthetic fixtures only; no PR/merge/deploy.
