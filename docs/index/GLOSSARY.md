# GLOSSARY.md - program and domain vocabulary

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).
Terms an agent meets in this repo, each with where the authoritative definition lives.

Slice vocabulary is seeded from `icm/02-gap-matrix/output/F1/WIRING-SPEC.md` (that file is kept outside this
repository; recorded sha256 `e4341bc1d169a5a2745360102cceee63d22df97f01d86caccd8e9331bf7a8d92`).
Re-extract it with `npx tsx scripts/index/generate.ts --refresh-glossary --spec <file> --ref <repo path label>`.
Curated terms live in `scripts/index/glossary-seed.json`; edit there, then run `npm run index`.

## Domain terms

- **Backend app** - The root Next App Router app (`app/`, `lib/`, `components/`) that serves the canvas. (`AGENTS.md`)
- **Boundary and gate pair** - Per domain in `lib/`: `*-boundary.ts` validates the shape of input or stored payload, `*-gate.ts` decides runtime enablement. (`lib/mealplan/gate.ts`)
- **Canvas** - Lilly's frontend under `frontend/`. Authoritative for which screens, elements and data exist and how they look (source authority 0). (`AGENTS.md`)
- **Canvas-exact parity** - Any change to what a screen shows needs before/after screenshots at 1440 and 390 px. (`icm/03-plan/DECISIONS.md`)
- **CAS save** - Compare-and-set save on a draft: a stale tab receives a conflict instead of silently overwriting newer work. (`lib/coaching/templates.ts`)
- **CONFLICT row** - A gap-matrix row parked pending an owner answer; tracked in `docs/open-questions.md` and answered in `icm/03-plan/OWNER-ANSWERS-1018.md`. (`docs/open-questions.md`)
- **Consent gate** - Exact per-domain consent check that has to pass before health data is read or written. (`lib/consent.ts`)
- **F1 wiring spec** - Spec that maps each canvas interaction onto the backend slices that deliver it; the source of the slice ids below. (`icm/02-gap-matrix/output/F1/WIRING-SPEC.md`)
- **Fail closed** - Deny when configuration or state is missing, unknown or conflicting, instead of assuming the permissive case. (`AGENTS.md`)
- **Gate** - Resolver that combines an `ENABLE_*` flag with a trusted `APP_ENV` classification, so an unset, invalid or conflicting flag fails closed in production. (`lib/checkin/forms-gate.ts`)
- **One writer for the schema** - Only one task at a time edits `db/schema.prisma` and its migrations. (`icm/03-plan/DECISIONS.md`)
- **Own scope vs assigned scope** - A client reads only their own records, staff read only assigned clients, owners read the workspace. Enforced server-side; UI hiding is not authorization. (`docs/security/authorization-model.md`)
- **PED/HRT/E2** - Never implement client-visible or underivable behavior for these. No diagnoses and no automatic program changes. (`AGENTS.md`)
- **RBAC cell** - One resource/action/role cell of the authorization table. The guard re-reads current database state and never trusts token claims. (`lib/auth/rbac.ts`)
- **Route group** - A `(name)` directory that adds no path segment; `app/(tracker)` holds the client-facing tracker shell. (`docs/index/ROUTES.md`)
- **Slice** - One card and PR of the program plan. Slice ids are the vocabulary used across `icm/` (table below). (`icm/03-plan/output/PLAN.md`)
- **State of record** - `docs/STATUS.md` holds the implementation state; ICM lanes and this index never write it. (`AGENTS.md`)
- **Structural audit** - Audit event that carries ids and counts only, never values. (`lib/audit.ts`)
- **Workspace** - The tenant boundary. Membership carries one of WORKSPACE_OWNER, COACH, ASSISTANT_COACH, SUPPORT, CLIENT. (`db/schema.prisma`)

## Program slices

Slice ids from the F1 wiring spec, as used in `icm/` cards and plans.

| Id | Slice | What it delivers |
|---|---|---|
| `B1` | Messaging: conversations, drafts, unread, priority flag, context links | S02-01..13, S11-13, S11-14, S03-20; #96 (:1071-1078), #101 (:1117-1125), #112 (:1557-1559); Q2 |
| `B2` | Media storage: attachments, voice, video, check-in visuals, logo | S02-08, S02-12, S02-24, S02-25, S03-14, S03-18, S01-02; storage vendor `TODO(human)` (`lib/storage.ts:1-10`), PHOTOS consent (`lib/consent.ts:105`), retention D-10 / #102; Q2 |
| `B3` | Specialist and derived data: cycle tracking, time fields, nutrition totals, muscle volume | S09-10, S09-17, S06-07, S06-08, S06-15, S07-15; #73, #75, #115, #116; Q7, Q10, Q11 (cycle is not a product call: legal gates #38, #73) |
| `M1` | Client profile fields and lifecycle | Entities: `ClientProfile` (`db/schema.prisma:290-300`, today id, workspaceId, userId, name only). |
| `M2` | Workspace and coach preferences | New entity for workspace branding (logo reference, accent) and coach preferences (availability text, notification toggles, sidebar collapsed). Logo depends on B2 media storage; ... |
| `M3` | Coach notes and coach to-dos | Coach notes are pre-authorized: RBAC `coachNotes` / `clientNotes` (`lib/auth/rbac.ts:212-227`), consent mapping (`lib/consent.ts:103-104`). Clients never see coach notes (`docs/... |
| `M4` | Template definition extension | Entities: `CoachingTemplate` draft and version definition (`lib/coaching/templates.ts:47-70`, strict validator `:150`). |
| `M5` | Meal-plan payload extension | Entity: `MealPlan` draft payload (`lib/mealplan/payload.ts:75`, `ROOT_KEYS = ["variants"]`). |
| `M6` | Training payload extension | Entity: training draft boundary maps (`lib/trainingprogram/payload.ts:59-68,145-168`). |
| `M7` | Habit fields | Add nullable bounded `Habit.reason`. Decide frequency + goal mapping onto `target` and the weekday schedule (`HabitSchedule`). Add an all-time done count read (today max 12 week... |
| `M8` | Check-in fields | Add a coach note on `CheckInInstance` (canvas `Extra.note`; no column, `schema.prisma:1281-1331`). |
| `M9` | Dashboard config adapter | No migration. Adapter between canvas `DashboardDraft` and `lib/dashboard/config-schema.ts`: default `settings.visibility`, explicit `labels` and `historyPeriod`, full per-breakp... |
| `P1` | Port the canvas into the backend app behind one route group | Move `frontend/src/components/coach/**`, `frontend/src/components/ethereal/**` (only parts the coach app imports) and the styles into the root app under a coach route group. Rec... |
| `R0` | Make the existing backend reachable in a normal dev run | Merge Hanzlah's training fix `3ed5642` from `/home/nexuslink/vari8-worktrees/r3` (final-week completed state, `r3:lib/trainingprogram/service.ts`; replacement v2 republish, `r3:... |
| `SV1` | Roster read model | One scoped query joining `ClientProfile`, active `ClientSetupPin` and its template version, next `CheckInInstance`, pending review count, overdue `ClientTask`. Search, sort, fil... |
| `SV2` | Daily-entry numeric series | Per-parameter time series for Week and Trends. Client own scope; staff assigned scope, latest revision only (decision #79). Consent PRIVACY_NOTICE + HEALTH_DATA. |
| `SV3` | Dashboard widget feeds | Only CU03, CU04, CU16, TL21, TL22 are connected today (`config-schema.ts:92-98`). Add one read per source domain (bodyweight and measurements from SV2, nutrition targets from me... |
| `SV4` | Client creation and invitation routing | Route `createWorkspaceInvitation` (`lib/workspace/invitations.ts:185`, test callers only) from the roster. Invite acceptance already creates the profile (`invitations.ts:657-661... |
| `W1` | S11 identity, "which client is me" | P1; session, `ClientProfile.userId` own scope (`lib/auth/guard.ts:310-312`), app/(tracker) shell; existing; client signs in and lands on their own tracker; coach sees coach shel... |
| `W10` | S02 notes, S10 appearance | M3, M2; new notes service; preferences service; `components/theme-toggle.tsx`; `ENABLE_COACH_NOTES` (proposed); coach writes notes clients cannot see; accent persists per worksp... |
| `W2` | S01 roster and profile | M1, SV1, SV4; `app/workspace/[id]/clients` services; `ENABLE_CANVAS_SHELL` (proposed); roster lists real clients with next check-in and attention; archive works. Check: seed 3 c... |
| `W3` | S05 templates and setup | M4; `lib/coaching/templates*`, `client-setup*`, transitions; `ENABLE_COACHING_TEMPLATES`, `ENABLE_CLIENT_SETUP`, `ENABLE_CLIENT_SETUP_TRANSITIONS`, `ENABLE_PARAMETER_CLASSIFICAT... |
| `W4` | S09 client tracker | W3, SV2; `lib/daily-entry/**`, `app/(tracker)/.../daily`; `ENABLE_DAILY_ENTRY`; client logs today's values, sees Week and Trends from server. Time and cycle fields hidden (CONFL... |
| `W5` | S04 habits | M7; `lib/habits/**`, TL21/TL22; `ENABLE_CLIENT_DASHBOARD`; coach adds habit, client ticks scheduled habit only. Check: unscheduled habit toggle disabled |
| `W6` | S03 check-ins | M8, W3; `lib/checkin/**`, review queue, feedback; `ENABLE_CHECK_INS`; coach schedules (one rule per weekday), explicitly generates occurrences, client submits, coach reviews the... |
| `W7` | S06 nutrition | M5; `lib/mealplan/**`, `lib/nutrition/search.ts`; `ENABLE_MEAL_PLANS`; coach builds a plan from catalog foods with entered values, confirms timezone, publishes; client sees it. ... |
| `W8` | S07 training | M6, R0; `lib/trainingprogram/**`; `ENABLE_TRAINING_PLANS`; coach edits per-set rows, publishes, client sees current week; final week shows correctly. Check: plan ending this week |
| `W9` | S08 dashboard builder | M9, SV3; `lib/dashboard/**`, client dashboard page; `ENABLE_CLIENT_DASHBOARD`; coach lays out widgets, client sees the client-visible subset with live data where bound. Check: t... |

## Feature flags

Generated from `ENABLE_*` reads in `app/**` and `lib/**`. Every gate is flag AND trusted runtime;
see `icm/03-plan/DECISIONS.md` and the `gate.ts` file in each domain.

| Flag | First read in | Enforcement |
|---|---|---|
| `ENABLE_CHECK_INS` | `lib/checkin/forms-gate.ts` | flag + trusted APP_ENV, fails closed |
| `ENABLE_CLIENT_DASHBOARD` | `lib/dashboard/boundary.ts` | flag only, read the resolver |
| `ENABLE_CLIENT_SETUP` | `app/workspace/[workspaceId]/client-setups/actions.ts` | flag only, read the resolver |
| `ENABLE_CLIENT_SETUP_TRANSITIONS` | `app/workspace/[workspaceId]/client-setups/page.tsx` | flag only, read the resolver |
| `ENABLE_COACHING_TEMPLATES` | `app/workspace/[workspaceId]/parameters/actions.ts` | flag only, read the resolver |
| `ENABLE_CONSENT_GATES` | `lib/checkin/instances.ts` | flag only, read the resolver |
| `ENABLE_DAILY_ENTRY` | `app/(tracker)/workspace/[workspaceId]/daily/entry-actions.ts` | flag only, read the resolver |
| `ENABLE_DAILY_PROTOTYPE` | `app/(tracker)/workspace/[workspaceId]/daily/entry-actions.ts` | flag only, read the resolver |
| `ENABLE_IIFYM_PLANS` | `lib/consent.ts` | flag + trusted APP_ENV, fails closed |
| `ENABLE_MEAL_PLANS` | `lib/consent.ts` | flag + trusted APP_ENV, fails closed |
| `ENABLE_ONBOARDING_ASSIGNMENTS` | `app/workspace/[workspaceId]/onboarding/assignments/actions.ts` | flag only, read the resolver |
| `ENABLE_ONBOARDING_SUBMISSION` | `app/(tracker)/workspace/[workspaceId]/check-ins/layout.tsx` | flag only, read the resolver |
| `ENABLE_PARAMETER_CLASSIFICATION` | `app/workspace/[workspaceId]/parameters/actions.ts` | flag only, read the resolver |
| `ENABLE_SHEET_VIEWER` | `app/sheets/[slug]/page.tsx` | flag only, read the resolver |
| `ENABLE_SUPPLEMENTS` | `lib/consent.ts` | flag + trusted APP_ENV, fails closed |
| `ENABLE_TRAINING_PLANS` | `lib/consent.ts` | flag + trusted APP_ENV, fails closed |

## Where more detail lives

- Routes and guards: `docs/index/ROUTES.md`.
- Exported symbols per module: `docs/index/SYMBOLS.md`.
- Prisma models and fields: `docs/index/DATA-MODEL.md`.
- Locked product decisions: `docs/product-decisions.md`; program decisions: `icm/03-plan/DECISIONS.md`.
- Product state of record: `docs/STATUS.md`.
