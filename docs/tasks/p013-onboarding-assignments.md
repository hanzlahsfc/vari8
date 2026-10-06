# P-013 — Dev-gated staff onboarding-form assignments

Status: R2 repair candidate — `be811f3` received CONDITIONAL PASS from
DeepSeek V4.1 Flash (no P0/P1; three P2 repairs, five P3 items); the repair
delta is a separate forward commit that has NOT been independently reviewed.
Builder: Devin (SWE-2 High). Independent review: DeepSeek V4.1 Flash.
Base: `origin/main` @ `7ead9481ea95dc0dbe6898713b3a97247c9b7c7f`.
Branch: `feature/p013-onboarding-assignments`.
Original reviewed candidate: `be811f3ffdc609e1380e8235888b1d393e8f4e1d`
(27 files: 14 modified + 13 added — corrected from the initial report's
"25"; original integration result was 323 tests across 26 files including
25 P-013 tests, not "322+25").

## Scope

Staff-only onboarding-form **assignment management** — assignment metadata
only: `client → onboarding form → immutable published version → lifecycle`.
Product decisions implemented: #31 (assignment authority), #32 (one ACTIVE per
client+form, latest-published pin, no repin), #33 (lifecycle + provenance),
#34 (client-associated operational metadata — future export/retention work is
still gated, not implemented).

Explicitly out of scope and unchanged: client answers, submissions, drafts,
autosave, consent behavior, retention/export/erasure, invitation issuance,
tokens, `ClientAssignment` mutations, deployments, real-client use. Synthetic
fixtures only.

## Dev gate

`ENABLE_ONBOARDING_ASSIGNMENTS` enables the surface only when exactly `"1"`
(`lib/onboarding/assignments-gate.ts`). When off: the route 404s before
session/rendering work, the nav entry is absent, actions return the
feature-off failure before binding any user-controlled field, and the
boundary never reaches the service — zero rows, zero audits (proven by unit
tests, an integration flag-off test, and a dedicated flag-OFF E2E server on
port 3101 in `playwright.config.ts`). Documented disabled-by-default in
`.env.example`. The gate is not authorization — every op re-authorizes
server-side inside its transaction.

## Data model

`onboarding_form_assignment` (migration `20261006180000`):

- Partial unique `onboarding_assignment_one_active_key` on
  `(workspace_id, client_profile_id, form_id) WHERE status='ACTIVE'` —
  final concurrency authority for one-ACTIVE-per-pair.
- Composite same-workspace FKs: client, form, `assigned_by_member_id`,
  `ended_by_member_id` (raw SQL; composite targets
  `onboarding_form(id,workspace_id)` and `workspace_member(id,workspace_id)`
  exist as `@@unique`). Version-belongs-to-form FK
  `(form_version_id, form_id)` → `onboarding_form_version(id, form_id)`
  (new `@@unique` target added).
- `onboarding_assignment_provenance_shape` CHECK: ACTIVE forbids ending
  provenance; every terminal status requires `ended_by_member_id`+`ended_at`.
- `COMPLETED` is schema-reserved for the future submission transaction; no
  P-013 code path writes it.
- Indexes: `(workspace_id,id)` pagination, `(client_profile_id,status)`,
  `(form_id,status)`, `(form_version_id)` FK-parent scan. All Restrict
  deletes — terminal history is preserved.

## Authorization

New closed resource `onboardingAssignments` (R/W):

| Principal       | Read                                          | Write     |
| --------------- | --------------------------------------------- | --------- |
| PLATFORM_ADMIN  | denied (incl. dual-role members via PD29 set) | denied    |
| WORKSPACE_OWNER | workspace                                     | workspace |
| COACH           | assigned                                      | assigned  |
| ASSISTANT_COACH | assigned                                      | denied    |
| SUPPORT         | denied                                        | denied    |
| CLIENT          | denied                                        | denied    |

`assigned` resolves through the actor's current ACTIVE `ClientAssignment` in
the tx on every call — revocation takes effect immediately. Coach write never
mutates `ClientAssignment`. Route uses
`requireOnboardingAssignmentsAccess` (`authorizeCollection`) → HTTP 403;
mutations use `authorize(write, clientProfileId)` inside the Serializable tx.

## Service (`lib/onboarding/assignments.ts`)

- Reads: `listOnboardingAssignments` (id-cursor, bounded ≤100, scope-
  filtered), `listAssignableClients` (scope filter + eligibility predicate:
  profile→ACTIVE user→ACTIVE CLIENT member), `listAssignableForms` (ACTIVE
  forms with ≥1 published version, latest seq).
- Create: tx-authorize → `pg_advisory_xact_lock` on (ws,client,form) →
  eligibility re-read → latest-version resolution → conflict check → insert +
  one `ASSIGN` audit. P2002 → `assignment_conflict`.
- Replace: FOR UPDATE row lock → tx-authorize → tuple lock → eligibility →
  already-latest returns `{changed:false}` with no audit → atomic
  SUPERSEDED+ended provenance on the old row and a new ACTIVE row pinning
  latest → `UPDATE`+`ASSIGN` audits in the same tx.
- Cancel: FOR UPDATE → tx-authorize → tuple lock → exactly-once CANCELLED +
  provenance + one `UPDATE` audit. Terminal/foreign/missing requests are
  inert and non-disclosing (`assignment_not_accessible` and AccessDenied both
  map to the same safe message at the boundary).
- Serializable isolation, bounded retry on P2034 / P2010{40001,40P01},
  partial-unique index is the last word on concurrency. Audit writes are
  transaction-bound — a forced audit failure rolls the mutation back
  (integration-verified).
- Audit metadata uses only the existing `changed:true` structural marker;
  SUPERSEDED/CANCELLED are recorded on the rows themselves, deliberately not
  widening the shared `status` vocabulary (task-directed choice).

## Route & UI

`/workspace/[workspaceId]/onboarding/assignments` — page + server actions +
`AssignmentManager` client component. Rows show client name, form name,
pinned `v{seq}`, status text, assigned/ended dates only. Owner/coach get
create (client+form selects; the browser never picks a version — the server
pins latest) plus explicit-confirm Replace (only when a newer published
version exists) and Cancel; assistant gets a read-only table. Empty and
no-eligible-picker states, bounded pagination (roster-query reuse), pending
disables all competing actions, role=alert errors, labeled controls, ≥44px
targets, no overflow at 1440/834/390 (E2E-verified). No emails/answers/
definitions/user-visible IDs.

## RED-first evidence

- Unit RED (21:10, exit 1): 4 files failed — `assignments-gate`,
  `assignments-boundary`, nav link missing, RBAC 21-resource expectation
  against the 20-resource matrix.
- Integration RED by construction: the file was authored before the service
  existed; first run (21:16) showed 11 service-path failures (advisory-lock
  deserialization surfaced the real path) after the schema-only tests passed —
  then iterated to green.
- E2E RED: initial run 9/12 — fixed a fixture `client_profile` uniqueness
  violation (each eligible client needs its own user), a missing assistant
  `ClientAssignment` fixture, a UI-wait race before DB asserts, and a 390px
  `nowrap` overflow.

## Gates (all on `feature/p013-onboarding-assignments`)

| Gate                   | Command                                                    | Result                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --check`     | worktree                                                   | 0                                                                                                                                                                                                    |
| Format                 | `npm run format:check` (prettier)                          | 0 — all files pass                                                                                                                                                                                   |
| Typecheck              | `npm run typecheck`                                        | 0                                                                                                                                                                                                    |
| Lint                   | `npm run lint` (full repo)                                 | 0 — no warnings/errors                                                                                                                                                                               |
| Unit suite             | `npm test`                                                 | 658 passed / 55 files, exit 0                                                                                                                                                                        |
| Integration suite      | `npm run test:integration` vs fresh `app_integration_test` | 322+25 passed / 26 files, exit 0 (closed table-inventory repair mid-run, re-verified green)                                                                                                          |
| Prisma generate        | `npx prisma generate`                                      | 0                                                                                                                                                                                                    |
| Prisma validate        | `npx prisma validate`                                      | 0                                                                                                                                                                                                    |
| Migration from zero    | `prisma migrate deploy` vs fresh `app_p013_check`          | 0 — all 14 migrations applied                                                                                                                                                                        |
| Migration status       | `prisma migrate status` vs `app_p013_check`                | "Database schema is up to date"                                                                                                                                                                      |
| Schema↔DB drift        | `prisma migrate diff`                                      | only the intentional raw-SQL composite FKs / raw indexes (same pattern as existing `client_assignment` FKs + catalog name indexes)                                                                   |
| Production build       | `npm run build`                                            | 0 — `/workspace/[workspaceId]/onboarding/assignments` (1.83 kB)                                                                                                                                      |
| Focused E2E            | `playwright test tests/e2e/onboarding-assignments.spec.ts` | 12/12                                                                                                                                                                                                |
| Full E2E               | `npx playwright test`                                      | 188 passed, 12 skipped (pre-existing delivery-gated reset specs), 0 failed, ~1.6m                                                                                                                    |
| `npm audit`            | —                                                          | 11 findings (1 moderate, 10 high), all pre-existing transitive devDeps (braces/micromatch, deepmerge-ts via prisma, postcss via next, source-map-js); none introduced — no package manifests changed |
| Secrets/raw-data scan  | diff scan                                                  | clean — only pre-existing test-only AUTH_SECRET + dev DB URL; synthetic fixtures only                                                                                                                |
| Base→head scope review | `git diff origin/main...HEAD`                              | 14 modified + 11 new paths, all inside the approved slice                                                                                                                                            |

## Limitations / boundaries

- Retention, export, erasure, and post-termination handling of assignment
  rows remain unresolved (pending legal/product approvals — decisions
  #34/#39). This slice preserves rows and Restricts deletes only.
- The flag-off server in Playwright is local-E2E infrastructure; production
  builds leave the flag unset and the surface is 404.
- `COMPLETED` exists only as an enum value; nothing writes it.
- Coach scope reads constrain through `ClientAssignment`; a coach cannot see
  or mutate assignments for clients they don't coach.
- The eligible-client picker is bounded at 100 rows (dev-gated slice); the
  assignment table itself paginates.
- The row's internal id appears only inside select option values / serialized
  action props (required for the server-action binding) — never as rendered
  content.
- Playwright's flag-off server (`:3101`) is a second `next start` instance of
  the same build with `ENABLE_ONBOARDING_ASSIGNMENTS` pinned empty — local
  test infrastructure only.

## R2 repairs (be811f3..HEAD — not yet independently reviewed)

DeepSeek V4.1 Flash reviewed `be811f3` → **CONDITIONAL PASS** (no P0/P1;
three P2 repairs + five P3 items; all reviewer-run gates passed).

**P2-1 — authorization-before-lock.** `replace`/`cancel` previously took a
`FOR UPDATE` row lock and disclosed terminal status before authorizing.
Now: a non-locking scoped lookup resolves the immutable
(workspace, client, form) tuple → `authorize(write)` inside the tx, with
`AccessDeniedError` mapped to `assignment_not_accessible` → tuple advisory
lock → row lock → status re-check. Missing/active/terminal/foreign inputs
return the identical code to denied callers; authorized callers keep
`assignment_not_active`. Integration test proves per-case uniformity for an
assigned-out-of-scope coach, an assistant on its own client's row, a
foreign-workspace row, and missing ids — plus a 4-way replace/cancel burst
with no deadlock and a valid single-transition outcome.

**P2-2 — enforced boundary.** The page and the manager now import only
`assignments-boundary` (reads return `ActionResult`, `!ok → forbidden()`,
the P-008 convention); surface types are re-exported through the boundary.
A mechanical test (`onboarding-assignments-boundary-imports.test.ts`) walks
`app/**` and fails on any direct service import — it caught both the page
and the client component before the fix.

**R2 gates (re-run on the repaired tree, real exit codes).**

| Gate                                           | Result                                                  |
| ---------------------------------------------- | ------------------------------------------------------- |
| `git diff --check`                             | 0                                                       |
| `npm run format:check`                         | 0                                                       |
| `npm run typecheck`                            | 0                                                       |
| `npm run lint`                                 | 0                                                       |
| `npm test`                                     | 667 passed / 57 files, exit 0 (+9 tests in 2 new files) |
| prisma generate / validate                     | 0 / 0                                                   |
| fresh `app_p013_check` migrate deploy / status | 0 — all 14 migrations; "up to date"                     |
| `npm run test:integration` (fresh PG)          | 328 passed / 26 files (30 P-013)                        |
| `npm run build`                                | 0                                                       |
| focused P-013 E2E                              | 12/12                                                   |
| full E2E                                       | 188 passed, 12 skipped (pre-existing), 0 failed         |
| secrets/scope scan on `be811f3..HEAD`          | clean — 9 modified + 2 new test files                   |

**P2-3 — form-picker permission.** `listAssignableForms` now authorizes
`onboardingFormTemplates/read` (owner + coach) instead of relying on
assignment read; an assistant — who may read assignment rows — is denied,
proven at service and boundary level. Only id/name/latest-version-seq is
returned; no definitions or drafts.

**P3 items.**

- Advisory lock uses `hashtextextended($1, 0)` (64-bit, matching the
  reviewed invitations convention).
- Server actions check the flag BEFORE `auth()` — flag-off performs no
  session lookup, FormData access, boundary call, mutation, or audit
  (proven by `onboarding-assignments-actions.test.ts` mocking auth,
  boundary, and FormData spies).
- The E2E "crafted POST" test is renamed to say exactly what it proves —
  a transport-level non-action POST to a 404'd route with zero DB effects;
  action-layer ordering is proven by the unit spec above.
- Dual-role platform-admin integration test (platformRole=PLATFORM_ADMIN +
  ACTIVE workspace COACH membership → read and write denied).
- Positive assistant-scope integration test (assistant sees rows only for
  clients under its own ACTIVE `ClientAssignment`).

## Same-model self-review (fresh pass over the full diff)

- Authorization order and scope filtering re-checked: every read uses
  `authorizeCollection` + scope-scoped queries; every mutation re-authorizes
  inside the Serializable tx against the resolved client (row-derived for
  replace/cancel, input-derived for create) — coach scope flows through the
  reviewed `getActiveAssignment` path, so ClientAssignment revocation fails
  closed immediately (integration-tested).
- `assignment_not_accessible` and `AccessDeniedError` map to the same safe
  boundary message — existence probing is non-disclosing.
- Cancel deliberately skips client/form eligibility (staff must be able to
  cancel after client deactivation or form archival); replace re-checks both.
- Audit writes use only `changed:true` — no status-vocabulary widening; row
  state carries the terminal detail. Verified in tx by the forced-failure
  rollback test and by zero-audit assertions on every failure path.
- The playwright-config unit-test repair (array webServer) pins the flag-off
  server to an explicitly empty env value so an inherited `=1` cannot leak.
- Confirmed no `ClientAssignment`, form-definition, consent, token,
  invitation, retention, or client-facing changes in the diff.

## Review log

- P-013 same-model self-review: complete — no P0/P1 findings; repairs made
  during implementation were the advisory-lock `$executeRawUnsafe` fix, the
  scoped audit assertion, the assistant-assignment fixture, the UI-wait
  races, the 390px `nowrap` overflow, the closed table-inventory update, and
  the webServer-array config test.
- DeepSeek V4.1 Flash independent review of the pushed head: pending.
