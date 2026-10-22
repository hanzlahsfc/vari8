# PR-SUPP report

Card `icm/05-build/cards/pr-supp-plan.md` (generated from
`program_data.py`), issue
[#161](https://github.com/hanzlahsfc/vari8/issues/161), draft PR
[#162](https://github.com/hanzlahsfc/vari8/pull/162). Branch
`beta/pr-supp-plan`, base `69c74c3` (merge base with
`origin/Vari8-Beta`; branch is already at the current beta tip, no
merge needed). Gate-verified head
`1819419073ec43adee5934891d4d8fcac2177d27`.

Contract source: `frontend/docs/supplements-frontend-execution-brief.md`
and `frontend/src/components/coach/supplements/{model,draft,editor,plan-view,catalogue}.ts(x)`
on `FRONTEND` `51fa6a2` (merged via PR #151; the FRONTEND-to-beta sync
is open as PR #160, unmerged at build time, so the beta tree has no
supplements screen — see "Limits" for the proof boundary this sets).

## Coordination

- `program_data.py`: `PR-SUPP` appended to `PRS` (Service track, deps
  `PR-M1`, `schema=True`, `sec=True`, `issue=161`). Regenerated all
  outputs: `PROGRAM.md`, `PLAN.md`, `coverage-ledger.csv`, `graph.json`,
  `graph-summary.json`, `timeline.md`, `cards/.generated`, and the four
  `pr-supp-plan*` card files. `generate.py --check` passes (158 files
  match the committed tree).
- `verify-local.sh`: `SCHEMA_WRITERS` gained `PR-SUPP` (D34 slot for
  this lane; no other lane's claim touched). The slot entry stays until
  the merge lane completes, so review-repair rounds can still run the
  gate on this branch.
- Issue #161 (label `vari8-beta`) and draft PR #162 against
  `Vari8-Beta` created at lane start.

## What changed

- `db/schema.prisma`: `SupplementItemStatus` enum (`MUST_HAVE`,
  `OPTIONAL`, `NONE`), `SupplementPlan` (one per `clientProfileId`,
  `revision` for CAS, name, saved stamps) and `SupplementItem`
  (ordered, embedded product snapshot, quantity/dose unit, timing,
  status, notes) plus back-relations.
- `db/migrations/20261023000000_supplement_plan/migration.sql` +
  `down.sql`: hand-authored; `TIMESTAMPTZ(6)` instants; five composite
  same-workspace coherence FKs in raw SQL (Prisma cannot express them):
  `supplement_plan_client_workspace_fkey`,
  `supplement_plan_creator_workspace_fkey`,
  `supplement_plan_saver_workspace_fkey`,
  `supplement_plan_item_client_workspace_fkey`,
  `supplement_plan_item_plan_coherence_fkey`.
- `lib/supplements/model.ts`: closed input/output types and
  validators — positive finite quantity, dose-unit compatibility with
  the snapshot's quantity unit, `http:`/`https:` product URL with
  hostname and no credentials, exact status union, unknown-key
  rejection, null composition preserved (never coerced to 0), no
  derived dosage persisted.
- `lib/supplements/service.ts`: `readSupplementPlan`,
  `saveSupplementPlan`, `deleteSupplementPlan`. Serializable
  transactions, advisory lock on the client profile, authorization
  re-resolved inside the transaction, expected-revision CAS, ordered
  item rewrite on save, whole-save unit compatibility check.
- `lib/supplements/boundary.ts`: closed safe-error vocabulary
  (`plan_not_accessible`, `invalid_input`, `conflict`,
  `feature_disabled`, `unauthorized`) — no disclosure of foreign
  rows.
- `lib/supplements/gate.ts`: `ENABLE_SUPPLEMENT_PLAN` feature gate,
  checked before session/database work.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/supplements/actions.ts`:
  `readSupplementPlanAction`, `saveSupplementPlanAction`,
  `deleteSupplementPlanAction` — gate, session, bounded validation,
  boundary, `revalidatePath`.
- `lib/auth/rbac.ts` + `lib/auth/guard.ts`: `supplementPlans` resource
  reusing the `mealPlans` capability cells verbatim (`plan.read` /
  `plan.write`): owner `workspace`/`assigned`, coach
  `assigned`/`assigned`, assistant `assigned`/denied, support denied,
  client `own`/denied, platform admin denied.
- `lib/audit.ts`: `supplement_plan` audit resource; events carry
  structural metadata only (plan id, revision, item count — no item
  bodies).
- `lib/consent.ts`: parked `supplementPlan` registry entries under the
  existing D19 pattern (inactive while gates are parked).
- `.env.example`: `ENABLE_SUPPLEMENT_PLAN` documented.
- `tests/unit/supplements-plan.test.ts` (12 tests),
  `tests/integration/supplements-plan.test.ts` (14 tests),
  `tests/unit/rbac.test.ts` (`supplementPlans` cell + count 32 to 33).
- Regenerated index: `docs/index/{DATA-MODEL,GLOSSARY,SYMBOLS}.md`.
- Program files per "Coordination" above.

## Contract implemented

- One saved plan per client; coach edits name and ordered items with
  explicit save; the client reads the saved plan only. Cancelled
  editor state never reaches the service — save is a single
  replace-whole-payload call.
- Items keep coach ordering (`position`); each embeds the full product
  snapshot, so a later catalogue change cannot alter saved plans.
- `status` is exactly the frontend union: `must-have`, `optional`,
  `none` — it is an instruction label, not a lifecycle. No dates,
  weekdays, cycles, pause, check-off, adherence, dose logic, or
  PED/HRT behavior exists anywhere in the implementation.
- Stale saves: `expectedRevision` compare-and-set inside the lock; a
  second save with an old revision returns `conflict` and writes
  nothing.
- Reads by the client (`plan.read` own) and authorized staff return
  the same payload shape; unauthorized, foreign-workspace and
  foreign-client access return `plan_not_accessible` — identical to
  an absent plan.
- Audit: `READ` on staff reads, `CREATE`/`UPDATE`/`DELETE` on saves,
  with plan id + revision + item count only.
- Refused operations (validation, auth, stale revision, flag off)
  perform zero writes — verified by row counts in integration tests.

## Checks at head `1819419` (Node v24.22.1, `REQUIRE_NODE24=1`)

| Command                                             | Exit                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `verify-local.sh` (full gate, `LANE_DB=app_prsupp`) | 0 — every step PASS                                                        |
| Unit `supplements-plan`                             | 0 (12/12)                                                                  |
| Unit `rbac` + related                               | 0 (17/17 across touched files)                                             |
| Integration `supplements-plan` on `app_prsupp`      | 0 (14/14, real Postgres)                                                   |
| `prisma migrate deploy` on fresh `app_prsupp`       | 0                                                                          |
| `down.sql` replay                                   | 0 — supplement tables/enum dropped, `_prisma_migrations` row removed       |
| `prisma migrate diff` schema vs deployed            | only the 5 expected raw composite FKs (Prisma-inexpressible by convention) |
| `generate.py --check`                               | 0 (158 generated files match)                                              |
| `npm run index` + `index:check`                     | 0                                                                          |

Gate summary line: `VERIFY-LOCAL PASS` — clean tree, schema guard
(D34), generator check, npm ci, prisma generate, format, typecheck,
lint, unit (1127), integration, migrate deploy, build, e2e flow specs;
parity SKIP per card contract (`screens: []`, `SKIP_PARITY=1` — the
card gates no screens).

## Mutation evidence

Four deliberate breaks, each failed its guard test, each file restored
byte-identically:

- `saveSupplementPlan` expected-revision check removed → stale-save
  integration test failed.
- `safeProductUrl` scheme check dropped → URL unit test failed.
- Dose-unit vs quantity-unit compatibility check dropped → unit test
  failed.
- `supplementPlans` RBAC cell removed → `rbac.test.ts` matrix test
  failed (and exposed the hard-coded resource count, updated to 33).

## Live / API evidence and its boundary

The card gates no screens (`screens: []`) and the beta tree has no
supplements UI (PR #160 open; FRONTEND source frozen at `51fa6a2`).
Driving a browser flow would require copying frontend code into beta,
which this task excludes. The behavior contract is therefore proven at
the service/action boundary against real Postgres by the 14-test
integration suite: owner/coach save and read, client read-only, client
write denied, assistant write denied, support/platform-admin denied,
foreign workspace and foreign client non-disclosing, stale-revision
conflict with zero writes, audit rows with structural metadata, and
flag-off short-circuit before session/database work.

## Limits

- No browser receipt exists for this card — there is no screen to
  drive (PR #160 unmerged). When the frontend sync lands, a wiring
  card can connect the actions file without backend changes; the
  payload shapes already mirror `SupplementPlan`/`SupplementItem` from
  the canvas model.
- Consent entries are registered but inert while D19 gates are parked;
  no consent behavior was added or activated.
- Schema-writer slot (`PR-SUPP` in `SCHEMA_WRITERS`) is intentionally
  left in place until the merge lane completes so review-repair rounds
  keep passing the D34 guard.
- Lane-env adaptations on this machine: `PATH` shim mapping
  `vari8-db-1` to the local Postgres and `flock` (absent on macOS),
  `VARI8_WORKTREES`/`VARI8_BETA` overrides for the reference-host
  paths in `program-config.json`, Docker binary at
  `~/.docker/bin/docker`. No shared container renamed or reconfigured;
  the reference-host `realpath` notice in gate output is benign.

## Handoff

Independent verifier: head `1819419`, base `69c74c3`, gate log at the
summary above (full output on request). Verify card:
`icm/05-build/cards/pr-supp-plan-verify.md`; security verify:
`pr-supp-plan-secverify.md` (`sec=True`). Builder did not approve and
did not merge; PR #162 stays draft pending review.
