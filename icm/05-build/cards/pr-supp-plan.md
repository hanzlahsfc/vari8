# PR-SUPP build: Supplement plan backend (schedule only)

Card slug `pr-supp-plan` (proposed — board assigns the PROGRAM.md slot). Board `vari8`. Track Service/Model. Depends on PR-M1 (client profile lifecycle), PR-05 (capability table — closed set, do not extend). Builder: Hanz's lane per huddle brief 2026-10-22. Repo `hanzlahsfc/vari8`. Worktree `vari8-worktrees/pr-supp-plan`, branch `beta/pr-supp-plan` off latest `origin/Vari8-Beta`. Lane database `app_prsupp` on 127.0.0.1:5433; dev port 3771. **May touch `db/`: YES — this card introduces the first post-M0 schema objects; it must hold the D34 single-writer slot (no other schema-writing lane active) and the card name must be added to the `verify-local.sh` `db/` allowlist.**

## Source of truth

The approved contract is Lilly's frontend on `origin/FRONTEND` (`51fa6a2`, merged via #151, pending FRONTEND-SYNC #160):

- `frontend/docs/supplements-frontend-execution-brief.md` — owner-approved behavior brief ("the owner approved this compact layout revision").
- `frontend/src/components/coach/supplements/model.ts` — saved-shape types, status enum, `safeProductUrl`, `declaredTotal`, `dosageForQuantity`, structural guards.
- `frontend/src/components/coach/supplements/draft.ts` — save semantics: the row's stored product snapshot is authoritative; saving never re-reads the catalogue.
- `frontend/src/components/coach/supplements/editor.tsx` — reorder (move ±1), remove with toast+undo, explicit Save/Cancel, unsaved-changes guard.
- `frontend/src/components/coach/supplements/plan-view.tsx` — shared read-only client/preview view.
- `frontend/src/components/coach/plans/types.ts` + `domain.ts` — `client.plans.supplements?: SupplementPlan`, single saved plan per client, NOT a lifecycle (no draft/active/history).
- `frontend/src/data/supplement-database.json` + `scripts/import-supplement-database.py` — the catalogue is a bundled static JSON generated from `supplement.xlsx`.

Backend conventions to mirror: `lib/mealplan/{service,boundary,gate}.ts`, `lib/mealplan` audit usage, `app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/actions.ts`, `lib/auth/roles.ts` capability matrix, `lib/audit.ts` closed resource-type set, `lib/runtime.ts` `devFlagEnabled`, `db/migrations/` conventions (hand-authored `migration.sql` + `down.sql`, TIMESTAMPTZ(6), RESTRICT/CASCADE per schema-v2 header, composite same-workspace FKs in raw SQL).

## Confirmed product behavior (from the UI)

- One supplement plan per client. The coach edits the whole plan (name + ordered items) and saves it in one explicit action; Cancel discards. The client sees only the last saved plan — never an unsaved draft.
- Item fields: product snapshot `{id, brand, name, referenceQuantity, quantityUnit, declaredAmount, declaredUnit, url}`, `quantity` (> 0), `doseUnit` (must equal snapshot `quantityUnit` when the catalogue knows it; otherwise coach-confirmed text, fallback "reference units"), `timing` (free text, e.g. "with breakfast"), `status` ∈ {`must-have` | `optional` | `none`} (labels: Must have / Optional / No status), `notes` (free text).
- Status carries coach-instruction meaning only. There is NO active/paused/taken state, no dates, no weekday schedule, no cycles. "Schedule" = the coach-ordered item list with per-item timing text.
- Items are reorderable; the same product may appear multiple times; removal is soft-undone client-side (server sees only whole-plan saves).
- Product URL is displayed only when `safeProductUrl` passes: http/https, hostname present, no credentials. Store and re-validate server-side.
- Dosage is a derived display value (`declaredAmount × quantity / referenceQuantity`, or quantity in product units, or "Not provided"). The backend stores inputs, never the derived value, and never substitutes 0 for missing composition.
- The catalogue stays frontend-bundled; the backend stores the embedded product snapshot per item so later catalogue changes never alter a saved row. No catalogue CRUD in this task.
- Empty states: no plan yet ("No supplement plan saved yet") and saved plan with zero items ("no products prescribed") are both valid.

## Explicit non-scope (do not add)

- Taken/not-taken check-offs, adherence logs, scores, streaks.
- Active/paused semantics, date ranges, per-weekday schedules, cycling protocols.
- Dose recommendations, interaction checks, PED/HRT content (hard-denied per AGENTS), any medical logic.
- Server-side catalogue management, spreadsheet import endpoint, live Sheets connection.
- UI wiring (canvas/editor fetch calls) — that is a later W-card; this task ends at the service/boundary/action surface.
- Nutrition/IIFYM/meal-plan work — separate queue items.

## Backend contract

### Schema (one hand-authored migration + down.sql)

- `SupplementItemStatus` enum: `MUST_HAVE` | `OPTIONAL` | `NONE`.
- `supplement_plan`: `id`, `workspace_id`, `client_profile_id` UNIQUE (one current plan per client), `name`, `revision` INT default 1 (CAS guard), `saved_by_member_id`, `saved_at` TIMESTAMPTZ(6), `created_at`, `updated_at`; composite uniques `(id, workspace_id)`, `(id, workspace_id, client_profile_id)`; `@@index([workspaceId])`.
- `supplement_plan_item`: `id`, `plan_id` FK CASCADE, `position` INT, snapshot columns (`product_ref_id`, `brand`, `product_name`, `reference_quantity` numeric nullable, `quantity_unit` nullable, `declared_amount` numeric nullable, `declared_unit` nullable, `product_url` nullable), `quantity` numeric > 0 (CHECK), `dose_unit`, `timing`, `status` enum, `notes`; unique `(plan_id, position)`.
- Workspace-coherence composite FKs and CHECKs in raw SQL per schema-v2 conventions. No history/version table — the UI contract is latest-saved only.

### Service `lib/supplements/`

- `gate.ts`: `isSupplementsEnabled` = `devFlagEnabled(env.ENABLE_SUPPLEMENTS, env)` — dev/test runtime only, fails closed.
- `service.ts`:
  - `saveSupplementPlan(ctx, {workspaceId, clientProfileId, name, items, expectedRevision?})` — staff `plan.write` workspace scope; validates the whole plan against the ported `isSupplementPlan` rules (URL re-validation via `safeProductUrl` semantics, doseUnit↔quantityUnit match, quantity > 0, closed status set, length caps on name/timing/notes, item-count cap); upserts the one plan per client and replaces its items in one transaction; CAS conflict on `expectedRevision` → `stale_revision`; archived client → `plan_not_accessible` per PR-M1.
  - `readStaffSupplementPlan(ctx, {workspaceId, clientProfileId})` — staff `plan.read` workspace scope.
  - `readOwnSupplementPlan(ctx, {workspaceId})` — client `plan.read` own scope (profile.userId match, same pattern as SV2).
  - Consent: parked registry `dailyEntryConsentRegistry(true)`-equivalent call pattern per D19 — no consent gate blocks the surface.
- `boundary.ts`: closed safe-result vocabulary mirroring meal-plan (`denied`, `invalid_input`, `not_available`, `conflict`, `consent_missing`, `policy_not_configured`, `serialization_conflict`) with non-disclosing messages.
- `lib/audit.ts`: add `"supplement_plan"` to `AUDIT_RESOURCE_TYPES` (structural markers only — plan id, revision, item count; never names, notes, timing, URLs, brands).

### App surface

- `app/workspace/[workspaceId]/clients/[clientProfileId]/supplements/actions.ts` — `"use server"`: `saveSupplementPlanAction`, `viewSupplementPlanAction` (one structural READ audit per explicit view, decision #80; the plain page GET writes none).
- Page-level reads call the boundary directly (RSC), matching meal-plan wiring. No new api/v1 route — per-client plan surfaces use actions+reads, not api/v1.
- `.env.example`: commented `# ENABLE_SUPPLEMENTS=1` entry mirroring `ENABLE_CHECK_INS`/`ENABLE_MEAL_PLANS`.

### Authorization

- `plan.write`: owner/coach workspace-scope save; client deny.
- `plan.read`: owner/coach workspace-scope; client own-scope only.
- Foreign workspace/client → 403 (non-disclosing), unauthenticated → 401, flag off → not_available/404 before any DB read.

## Acceptance

1. Coach saves a plan; a second save with the current revision replaces items and preserves nothing stale; stale-revision save returns conflict.
2. Saved rows return literal snapshot fields; dosage is never persisted or recomputed server-side.
3. Item order round-trips exactly; duplicate product ids allowed.
4. `status` outside the closed set, `quantity <= 0`, `doseUnit` mismatch vs known `quantityUnit`, or a URL failing `safeProductUrl` rules → `invalid_input`, nothing written.
5. Client reads own plan; foreign client/workspace and signed-out callers denied; flag off fails closed pre-DB.
6. Archived client's plan remains readable by authorized staff (D27).
7. Save writes exactly one structural audit event per mutation; list/read GETs write none; explicit view action writes one READ.
8. Migration applies on a fresh DB and `down.sql` reverses it; `prisma migrate diff` reviewed.

## Verification

- RED first: unit tests for plan validation (literal rejections) + integration tests over real actions (role matrix, CAS, ordering, snapshot retention, audit counts) on `app_prsupp`.
- Mutations that must fail: reorder ignored (positions dropped), missing-values-to-zero substitution, status enum bypass, snapshot re-read from catalogue, CAS check removed.
- `verify-local.sh` full gate on Node 24 (`REQUIRE_NODE24=1`) unless superseded by NODE-26 (#154 open).
- No screens owned → SKIP_PARITY=1 per card contract; live proof = real action calls against the running app, same receipt style as PR-SV2.

## Owned paths

`db/schema.prisma`, `db/migrations/<ts>_supplement_plan/`, `lib/supplements/{model,gate,service,boundary}.ts`, `lib/audit.ts` (one resource-type line), `app/workspace/[workspaceId]/clients/[clientProfileId]/supplements/actions.ts`, `.env.example` (one line), `tests/unit/supplements-*.test.ts`, `tests/integration/*supplements*.test.ts`, `icm/05-build/reports/PR-SUPP.md`, regenerated `docs/index/*`.

## Open questions for the owner/board (blocking flagged)

1. **PROGRAM slot + card slug**: not in PROGRAM.md; needs a number/name and PROGRAM.md row (not mine to assign — flag, don't guess).
2. **`db/` allowlist**: verify-local fails non-allowlisted `db/` writes; card must be added to the allowlist when the slot is assigned.
3. Not blocking — resolved by the source: no pause/inactive state exists in the approved UI; removal (with undo) is the only deactivation. If the huddle's "pause" wording was intended as a product state, that is a new product decision, not a default.
4. Not blocking — catalogue remains frontend-bundled per the brief; a server-managed catalogue would be a separate card if wanted.
