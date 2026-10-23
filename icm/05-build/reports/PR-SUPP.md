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
- `lib/supplements/service.ts`: `readStaffSupplementPlan`,
  `viewStaffSupplementPlan`, `readOwnSupplementPlan`,
  `saveSupplementPlan`. Serializable
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
  `saveSupplementPlanAction`, `viewSupplementPlanAction` — gate,
  session, bounded validation,
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
- Audit: `READ` only on the explicit staff view action;
  `CREATE`/`UPDATE` on saves, with plan id + revision + item count
  only. Ordinary staff list/page reads and client-own reads write
  none; no `DELETE` exists (no delete/lifecycle surface).
- Refused operations (validation, auth, stale revision, flag off)
  perform zero writes — verified by row counts in integration tests.

## Checks at head `1819419` (Node v24.22.1, `REQUIRE_NODE24=1`)

| Command                                             | Exit                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verify-local.sh` (full gate, `LANE_DB=app_prsupp`) | 0 — every step PASS                                                                                                                                                      |
| Unit `supplements-plan`                             | 0 (12/12)                                                                                                                                                                |
| Unit `rbac` + related                               | 0 (17/17 across touched files)                                                                                                                                           |
| Integration `supplements-plan` on `app_prsupp`      | 0 (14/14, real Postgres)                                                                                                                                                 |
| `prisma migrate deploy` on fresh `app_prsupp`       | 0                                                                                                                                                                        |
| `down.sql` replay                                   | 0 — supplement tables/enum dropped, `_prisma_migrations` row removed                                                                                                     |
| `prisma migrate diff` schema vs deployed            | 121 `DROP CONSTRAINT` statements: the pre-existing raw composite FKs (Prisma-inexpressible by convention) plus the 5 supplement ones — same drift shape, generated count |
| `generate.py --check`                               | 0 (158 generated files match)                                                                                                                                            |
| `npm run index` + `index:check`                     | 0                                                                                                                                                                        |

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
  produced 3 failures (and exposed the hard-coded resource count,
  updated to 33).

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

---

## Resume — integration on `Vari8-Beta` @ `17eb756` (PROMPT 346)

Review status before this pass: one gate-summary comment only; no
independent FIX/SHIP findings. Candidate prepared for independent review
against the current base.

### Base integration

`git merge origin/Vari8-Beta` at `17eb756` (boot-checks #194 + logging
#195 landed since base `69c74c3`; check-in #193 not yet merged). One
conflict — `docs/index/SYMBOLS.md` — resolved by `npm run index`
regeneration. `.env.example` auto-merged (`ENABLE_SUPPLEMENTS` beside
#194's S3 vars). `db/` had zero changes on the base; `SCHEMA_WRITERS` retains
`PR-SUPP`. Correction: the earlier "only pending migration" claim was
too strong — the allowlist entry is not an exclusive writer slot.
PR #158 (AUTH-ROTATE, OPEN) carries `20261022090000_auth_rotate`
(timestamped before this lane's `20261023000000_supplement_plan`) and
touches `db/schema.prisma`; see "Schema coordination" below.

### Gates on the merged head `413d342` (Node v24.22.1)

`verify-local.sh` with `BASE_SHA=17eb756`, `LANE_DB=app_prsupp`,
`LANE_PORT=3833`, `CARD=PR-SUPP`, `SKIP_PARITY=1`, host shim
`vari8-db-1`→`app-db-1` (docker arg rewrite; no container renamed):

```
PASS clean tree / schema guard (D34) / generator check
PASS npm ci / prisma generate / frontend npm ci
PASS format / typecheck / frontend typecheck / lint / frontend lint
PASS unit tests / frontend tests
(independent re-measurement: 1180/1180 across 101 files, including
the 12 supplement tests — the "1168" figure recorded earlier was the
pre-supplement base count and is corrected here)
PASS integration tests (all suites) / migrate deploy
PASS build / frontend build
FAIL e2e flow specs (serialized): webServer exit 1
VERIFY-LOCAL FAIL on that step only
```

- Focused re-runs at this head: `supplements-plan` unit 12/12,
  `rbac` 5/5; integration `supplements-plan` 14/14 + `pr05-security`
  16/16 on a fresh disposable `app_prsupp` (`prisma migrate deploy`
  incl. `20261023000000_supplement_plan` — clean).
- `npm run test` inside the gate passed at 21s (the known
  system-index compiler timeout did not reproduce on this run).

### e2e step — diagnosed, run standalone

The gate exports `AUTH_URL=http://127.0.0.1:${LANE_PORT}` unconditionally;
the e2e `webServer` runs `next start` (production boot), and the merged
#194 origin check correctly refuses `http:` in production — the failure
is the gate's env contract vs the new boot gate, not product code.
Standalone rerun with `AUTH_URL`/`BETTER_AUTH_URL` unset (derived origin,
the accepted case): `DATABASE_URL=app_prsupp CI=1 npx playwright test
tests/e2e/invite-acceptance.spec.ts tests/e2e/password-reset.spec.ts
--workers=1` — **10 passed, 7 skipped, 0 failed**. The 7 skips are
mail-adapter-dependent reset specs ("mail delivery adapter not
configured") — skips, not passes; the standalone run also exercises
the derived-origin path, not the configured-origin contract, so it is
a diagnostic rather than the canonical gate. Fixing the gate script's
export is program machinery (shared file, other lanes use it);
tracked as **issue #197** rather than patched in this lane.

### Schema coordination

- `20261023000000_supplement_plan` deploys cleanly over the merged
  schema (fresh DB, `migrate deploy` PASS inside the gate).
- No other lane wrote `db/` on the merged base; `SCHEMA_WRITERS` still
  lists `PR-SUPP` (allowlist, not an exclusive slot).
- **#158 AUTH-ROTATE (OPEN)** carries
  `db/migrations/20261022090000_auth_rotate` + `db/schema.prisma` —
  timestamped before this lane's `20261023000000`. Concrete ordering:
  whichever PR merges second merges the schema/models union and
  regenerates the index; both migrations apply in timestamp order on
  `migrate deploy` regardless of merge order (migration_name ordering
  is by directory name), and the two feature areas do not share tables,
  so no content conflict exists — only `schema.prisma` adjacency +
  generated index. The reviewer's upgrade replay (base migrations →
  seed rows → supplement migration → `down.sql` restores the base
  state) already passed at `b696630`; migration files are unchanged in
  this repair pass, so that evidence carries byte-identically.
- **#164 (`[MIG-ORDER]`)** OPEN — the ordering coordination issue
  itself; this PR's merge must sequence with it per the board.

### Carried forward (byte-identical code, unchanged since `a8c378e`)

All §4-§7 evidence stands: literal unit cases, CAS/CAS-lock integration
role matrix, audit rows, flag-off short-circuit, the four mutations.
No screen evidence — card gates no screens (`screens: []`); PR #160's
frontend-sync is merged into base now, but wiring remains a later
W-card per the card contract.

### Review handoff

Head `413d342` (+ report/test commits), base `17eb756`, draft lifted for
independent review. Verify card `pr-supp-plan-verify.md`, security
verify `pr-supp-plan-secverify.md`. Builder did not approve or merge.

---

## Fix pass — independent review `b696630` (PROMPT 348)

FIX verdict findings repaired; head of pass recorded below after gates.

### 1. READ audit contract (HIGH, repaired)

Issue #161 acceptance 7 + app-surface spec: "list/read GETs write none;
explicit view action writes one READ." Previously `readStaffSupplementPlan`
audited every staff read and `readOwnSupplementPlan` every client read.

- `lib/supplements/service.ts`: the staff-read body is now internal
  `staffSupplementPlanRead(…, auditRead)`; `readStaffSupplementPlan`
  passes `false` (ordinary page/list read — zero audit) and
  `viewStaffSupplementPlan` passes `true` (explicit view — one READ).
  `readOwnSupplementPlan` writes none. Denied paths already throw before
  the audit block.
- `lib/supplements/boundary.ts`: `viewSupplementPlanFromAction` is the
  audited surface; `readStaffSupplementPlanFromAction` stays audit-free.
- `app/.../supplements/actions.ts`: `viewSupplementPlanAction` calls the
  audited boundary.
- Tests: staff read → READ 0; explicit view → READ 1; client own read →
  READ 0; denied reads (unassigned coach, SUPPORT, foreign, empty
  session) → READ 0 and `revision` unchanged.

### 2. Archived-client write (MEDIUM, repaired)

`lockProfile` selects `archived_at`; `saveSupplementPlan` throws
`plan_not_accessible` when `archivedAt` is set — inside the existing
serializable transaction/lock, matching the card's "archived client →
plan_not_accessible per PR-M1". Reads unchanged (archived plan stays
readable per acceptance 6). Test: archived save refuses; plan revision,
name, items and UPDATE audit count all unchanged.

### 3. URL scheme coverage (repaired)

`safeProductUrl("ftp://shop.example.test/x")` added — parses and has a
hostname, so only the http(s) scheme check refuses it. Mutation removing
only the scheme guard now bites (1 failure); restored byte-identically.

### 4. Authorization wording (resolved — no code change)

Issue wording "owner/coach workspace-scope save" vs the code's
assigned-write cells. The approved card is the narrower, later,
authoritative instruction: "Access reuses the closed `plan.read`/
`plan.write` capability cells exactly as `mealPlans`; no new capability,
no broadened permission." The capability matrix is a closed set (PR-05,
D10) — broadening it needs an owner decision, not a card. The issue's
"workspace-scope" wording describes the surface breadth (any workspace
client is addressable via `clientProfileId`), not a capability override;
the write cell itself is `assigned` for owner and coach — identical to
the mealPlans precedent the card mandates. Documented here; no
permission change made.

### 5. Schema coordination (corrected)

The "only pending migration" claim was wrong — see "Schema
coordination" above for the #158/#164 ordering record.

### 6. Harness defect (tracked, not patched)

Canonical `verify-local` e2e remains red: `AUTH_URL=http://` export vs
the merged #194 production-origin refusal + LANE_PORT/Playwright-3000
mismatch. Tracked as issue #197; shared harness files untouched here.
The http-origin refusal is NOT weakened and unset-origin is NOT counted
as equivalent; the standalone 10/7/0 run is diagnostic only.

### 7. Hygiene corrections

- Removed unused `w`/`cp` (the 2 new lint warnings at test line ~589).
- Unit count corrected: fresh standard run recorded below; the "1168"
  figure was the pre-supplement base count.
- Removed the false `deleteSupplementPlan`/`deleteSupplementPlanAction`/
  DELETE-audit claims (lines 54, 67, 105 of this report).
- Drift description corrected: 121 `DROP CONSTRAINT` (pre-existing raw
  FKs + 5 supplement), not "only the 5".
- RBAC mutation count corrected: 3 failures, not 1. Prior URL scheme
  mutation noted as non-biting is superseded by the ftp case above.
- Function-name drift in the original inventory corrected inline;
  original run history preserved.

### Fresh results on the repaired head (Node v24.22.1)

- `npx vitest run tests/unit/supplements-plan.test.ts` — **12/12**
  (includes the ftp scheme case).
- `INTEGRATION_DATABASE_URL=app_prsupp npx vitest run --config
vitest.integration.config.ts tests/integration/supplements-plan.test.ts`
  — **14/14** (audit counts, archived save refusal, denied no-audit).
- `npm run test` (standard, no overrides) — **exit 1, 1179/1180 across
  101 files**; the only failure is the environmental
  `system-index.test.ts:79` compiler timeout (~6.7s vs the 5s default
  under 101-worker load on this host; the same pre-existing flake, not a
  regression — supplements tests all green in-run). Reviewer-measured
  1180/1180 confirms the count.
- `npm run format:check` 0 · `npm run typecheck` 0 · `npm run lint`
  0 errors / **81 warnings** (the 2 new `w`/`cp` warnings removed) ·
  `npm run index` + `index:check` 0 (new exports indexed) ·
  `npm run build` 0.
- Mutations this pass (restored byte-identically): scheme check removed
  → 1 failure (ftp case); `|| profile.archivedAt` removed → 1 failure
  (archived-save test); `readStaffSupplementPlan` flipped to
  `auditRead: true` → 1 failure (read=0 assertion).
- Migration evidence carries byte-identically: `db/` untouched this
  pass; the reviewer's fresh-deploy / upgrade / down-replay results at
  `b696630` stand.
- Canonical `verify-local` e2e: still red — issue #197; not counted as
  green here.

---

## Post-#199 base merge — head `54701f1` (PROMPT 359)

Merged `origin/Vari8-Beta` @ `ec5c301` (includes the merged harness PR
#199) via normal merge `99352cc` — clean, no conflicts. The stale
"canonical e2e red" blocker above is resolved by that merge.

### Fixes/closures this pass

- Archived-client save refusal now asserts the persisted item rows are
  literally unchanged (full-row `findMany` equality before/after), not
  merely a count — the review's coverage gap.
- The canonical e2e now runs the merged HTTPS harness:
  `PLAYWRIGHT_PORT_BASE=3833` → `next start` loopback on 3834, TLS
  terminator + browser + configured `BETTER_AUTH_URL`/`AUTH_URL` on
  `https://127.0.0.1:3833`. The old `AUTH_URL=http:` /
  port-mismatch blocker (issue #197) is fixed upstream, not patched
  here.

### Canonical gate on `54701f1` (Node v24.22.1)

`BASE_SHA=ec5c301 LANE_DB=app_prsupp LANE_PORT=3833 CARD=PR-SUPP
SKIP_PARITY=1 verify-local.sh` — **VERIFY-LOCAL PASS**, every step:

clean tree, schema guard (D34, `PR-SUPP` writer), generator check,
npm ci, prisma generate, frontend npm ci, format, typecheck, frontend
typecheck, lint (0 errors / 81 warnings), frontend lint, **unit tests
(26s: 1199/1199 across 102 files)**, frontend tests (889/889), **full
integration (231s, includes supplements 14/14 with the item-row
assertion)**, migrate deploy, build, frontend build, **e2e flow specs
(39s: 10 passed / 7 skipped / 0 failed)** — the 7 skips are the
mail-adapter-dependent reset specs, not passes.

### Contract status

- Authorization: no new owner decision; the closed capability matrix
  disposition stands (assigned write; issue wording documented, not
  broadened).
- Schema coordination: #158 (auth_rotate, earlier timestamp) and #164
  (MIG-ORDER) remain OPEN — merge order is still a board sequencing
  item; combined-schema compatibility demonstrated, not exclusive
  authorization.
- Migration evidence: `db/` unchanged since the reviewer's fresh-deploy/
  upgrade/down-replay at `b696630` — carried byte-identically; the gate
  redeployed it on `app_prsupp` again this pass (migrate deploy PASS).
