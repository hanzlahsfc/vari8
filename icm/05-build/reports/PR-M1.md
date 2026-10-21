# PR-M1 report

Card `icm/05-build/cards/pr-m1-client-lifecycle.md`, issue #105, PR #106.
Branch `beta/pr-m1-client-lifecycle`, base `f00d37b` (merge base with
`origin/Vari8-Beta`) for the original Linux run, base `fb5c387` for the
macOS run in the last section. Gate-verified head: see the gate summary
below; this report is committed after that head and changes no product code.

## What changed

- `lib/workspace/roster-query.ts`: `rosterClientVisibility(includeArchived)`,
  the one place the roster's "hide archived" predicate (D27) is defined.
- `lib/workspace/clients.ts`:
  - `ClientProfileDetail` + `readClientProfileDetail`: the full canvas profile
    field set (name, `label`, `coachingSince`, `heightCm`,
    `priorityMessagesAllowed`, `archivedAt`, `archiveReason`).
  - `updateClientProfileFields`: staff write of the canvas fields; `null`
    clears nullable columns, per-field validation, CLIENT `own` scope refused.
  - `archiveClientProfile` / `restoreClientProfile`: soft archive pair writes
    (D27), idempotent (`changed: false` on no-op), staff only, structural
    audit event on every real transition.
  - `listAccessibleClientProfiles` gained `includeArchived` (default: hide
    archived). `buildClientProfileWhere` keeps its old default for the two
    pre-existing non-roster callers; the roster passes the flag.
- `lib/workspace/retention.ts` (new): `retentionCutoff` / `retentionElapsed`
  (inclusive boundary, literal case in tests) and `deleteClientProfile`:
  refuses `client_not_archived`, `retention_not_elapsed` (inside
  `workspace.retentionDays`, default 90), `client_not_deletable` (RESTRICT
  dependents), then deletes the row and writes one DELETE audit event in the
  same transaction.
- `lib/workspace/roster.ts`: the `/api/v1` roster read hides archived
  profiles by default (`includeArchived` opt-in).
- `lib/audit.ts`: `client_profile` added to the audit resource allowlist
  (outside the card's file list; required for the D27 delete audit).
- `scripts/seed/20-clients.seed.ts` (new): syncs `label`, `coachingSince`,
  `heightCm`, `priorityMessagesAllowed` onto the 15 seeded profiles from the
  canvas demo state (`frontend/src/data/mock-data.json`; priority flags per
  `model.ts` seedState indices 0 and 4). All demo clients are
  `archived: false` in the canvas, so the archive pair stays unset.
- Tests: `tests/integration/m1-client-lifecycle.test.ts` (10 tests, real
  Postgres); `tests/unit/clients-service.test.ts` expectation updated for the
  new default archived filter.

## Commands and exit codes

Gate log: `/home/nexuslink/vari8-worktrees/pr-m1-client-lifecycle.check.log`.

| Command                                                                                          | Exit | Result                                |
| ------------------------------------------------------------------------------------------------ | ---- | ------------------------------------- |
| `npm run typecheck`                                                                              | 0    | clean                                 |
| `npx eslint` (changed files)                                                                     | 0    | clean                                 |
| `npx prettier --check` (changed files)                                                           | 0    | clean after format                    |
| `npm run index` + `index:check`                                                                  | 0    | regenerated SYMBOLS committed         |
| `vitest run tests/unit/clients-service.test.ts`                                                  | 0    | 6/6                                   |
| `vitest run --config vitest.integration.config.ts tests/integration/m1-client-lifecycle.test.ts` | 0    | 10/10                                 |
| `npm run db:fresh` on `app_m1` (skip-catalogs)                                                   | 0    | 15 profiles seeded with canvas fields |
| `verify-local.sh` BASE_SHA=f00d37b LANE_DB=app_m1 LANE_PORT=3850 CARD=PR-M1                      | TBD  | see PR comment                        |

## Live check

Evidence: `/home/nexuslink/vari8-worktrees/_evidence/PR-M1/build/`.
The sign-in credential was granted directly on the throwaway lane DB
(seed credential workaround until SEED-FIX merges; `live-user.log`).
The app ran on port 3850 against a migrated and seeded `app_m1`; the owner
signed in through the real login form and the proof drove
`GET /api/v1/workspaces/<id>/clients` in a real browser at 1440x900 and
390x844. The acceptance flow:

- `proof-before-archive.json` + `owner-before-archive-{1440,390}.png`:
  HTTP 200, 15 clients.
- `step-archive.log`: `archiveClientProfile` on "Oliver Stone" ->
  `changed: true`, roster-visible 14.
- `proof-after-archive.json` + `owner-after-archive-{1440,390}.png`:
  HTTP 200, 14 clients, the archived name absent (archive hides a client
  from the roster query).
- `step-delete-early.log`: `deleteClientProfile` while inside the 90-day
  window refused with `retention_not_elapsed`.
- `step-restore.log` + `proof-restored.json` +
  `owner-restored-{1440,390}.png`: restore `changed: true`, back to 15.
- `step-age.log` + `step-delete.log`: after `archived_at` was moved past the
  retention window on the throwaway DB, delete returned `changed: true`;
  `proof-after-delete.json` + `owner-after-delete-{1440,390}.png`: HTTP 200,
  14 clients, the row gone.
- `step-audit.log` (psql): four `client_profile` events on the deleted id -
  UPDATE/ARCHIVED, UPDATE/ACTIVE, UPDATE/ARCHIVED, DELETE/REMOVED, all ALLOW.
- `proof-signed-out.json` + `signedout-{1440,390}.png`: the same roster call
  without a session returns HTTP 401 at both widths.

The browser-visible surface is the `/api/v1` roster JSON (no roster UI is
wired on this branch; the roster page belongs to PR-W2).

## Parity

D32 parity: no screens are owned by this card. The parity regression step of
the gate is expected to stay green (harness present on the branch).

## Matrix rows closed

None (foundation/service PR per the card).

## Decisions and boundaries (unproven or open items are labelled)

- Staff-only lifecycle: `authorize` resolves CLIENT writes to `own` scope on
  `clientProfiles`; archive/restore/delete/field-writes refuse `own` (D15 row
  "Invite a client, archive and delete a client": owner and coach allow,
  client deny). A coach still needs an ACTIVE assignment under the current
  matrix (PR-05 rewrites the capability table to D15).
- Delete is a hard delete of the `client_profile` row after the retention
  gate. Every client-scoped dependent FK is RESTRICT (PR-M0), so a profile
  with dependent records refuses with `client_not_deletable`; the audit event
  is not written and nothing is deleted (tested). Erasure of the dependent
  records themselves is the parked retention/erasure policy (D12,
  product-decisions D-10), not this card.
- "Ending a membership archives the client" (D27) has no seam yet: no
  membership-end service exists in `lib/` (`WorkspaceMember` status
  transitions are not mutated anywhere outside invitations). When a
  member-removal path lands (PR-SV4/PR-W2 area), it calls
  `archiveClientProfile`.
- Archive/restore audit events are new (the card requires delete audited;
  archive and restore get the same structural treatment since they change
  staff-visible state).

## macOS run, 2026-10-20 (this machine, gate blocked on parity)

Branches merged into `beta/pr-m1-client-lifecycle` on this run:
`origin/beta/pr-m1-client-lifecycle` was already an ancestor (fast-forward a
no-op), then `origin/Vari8-Beta` at `bb31401`, then `origin/Vari8-Beta` at
`fb5c387`. The only merge conflict was the generated `docs/index/SYMBOLS.md`
counts line; resolved by regenerating (`npm run index`) and committing the
result, not by hand-editing a count.

Gate-verified head `20651ab02dfd72ccc4e418e2a600340100ea63cc`, `BASE_SHA`
`fb5c38780b729679b11b4d2a32d7ce14d3f65ab9` (merge base with `origin/Vari8-Beta`),
`LANE_DB=app_wb_m1`, `LANE_PORT=3900`, node v26.12.0 (gate WARN, target 24).
Log: `Vari8-evidence/WAVEB-LEAD/pr-m1-client-lifecycle.check4.log`.

| Step                            | Result                                   |
| ------------------------------- | ---------------------------------------- |
| clean tree                      | PASS                                     |
| schema guard (D34)              | PASS (no `db/` change)                   |
| program generator check         | PASS                                     |
| npm ci / prisma generate        | PASS / PASS                              |
| frontend npm ci                 | PASS                                     |
| format check / typecheck / lint | PASS / PASS / PASS                       |
| frontend typecheck / lint/tests | PASS / PASS / PASS                       |
| unit tests                      | PASS 97 files, 1111 tests                |
| integration tests               | PASS 62 files, 875 tests (real Postgres) |
| migrate deploy                  | PASS, 38 migrations                      |
| build / frontend build          | PASS / PASS                              |
| e2e flow specs (serialized)     | PASS 10 passed, 7 skipped                |
| parity regression (D32)         | FAIL exit=1 (see below)                  |

The gate exits 1 on parity only, and that failure is not caused by this
card. Evidence:

- Every 1440x900 screen matches the baseline (`OK ... @1440`, 35 screens).
- Every 390x844 screen reports a large pixel diff with unchanged geometry
  and text, e.g. `FAIL s01-roster@390 px=64387 geom=0/0/139 text=0`. A
  whole-width pixel difference with identical element geometry and text
  points at the baseline capture platform, not at a markup change. This
  branch changes no `frontend/` file (`git diff --stat fb5c387...HEAD`
  touches `lib/`, `scripts/seed/`, `tests/` and `icm/`).
- The other lanes on this machine (PR-M3, PR-M5, PR-M7) fail the same step
  with the same shape, so the parity harness/baseline is red machine-wide,
  which is the defect PR #137 addresses with `SKIP_PARITY`.
- `SKIP_PARITY` is absent from `icm/05-build/tools/verify-local.sh` on both
  this branch and `origin/Vari8-Beta` (`grep -c SKIP_PARITY` returns 0), so
  the gate cannot be run with parity skipped yet.

Integration state found and cleared on this run: at base `bb31401`,
`tests/integration/seed-credentials.test.ts` fails 1 of 2 (the SEED-FIX
client link is overwritten by `scripts/seed/33-checkins.seed.ts`). Re-ran
the same file in a detached base worktree: `bb31401` fails the same way,
`fb5c387` passes 2/2. Merging `fb5c387` fixed it on this branch; the
failure was never in this card's code. The earlier "prisma migrate deploy
under host load" note did not reproduce: migrate deploy passed in all three
gate runs.

Not done on this machine: the live browser receipt in
`/home/nexuslink/vari8-worktrees/_evidence/PR-M1/build/` is from the Linux
run and was not re-captured here, and the report's gate table row for the
Linux run still reads `TBD` because that log is on the other machine.

## macOS run, 2026-10-21 (gate exit 0, acceptance proven)

This section supersedes the gate status above. Base
`5553b471e2be1e1f8ea4f3dbadfd50c65f162281` (`git rev-parse origin/Vari8-Beta`
at the moment the log was read), gate-verified head
`b1270da6decdcb8a66be9ddae7768416087be5b3`. The branch already carried the
merge of `origin/Vari8-Beta`; this run changed no product code, only this
report.

Gate command: `run-gate.sh pr-m1-client-lifecycle M1 app_wb_m1 3900`
(`SKIP_PARITY=1`, `BASE_SHA` = merge base with `origin/Vari8-Beta`).
Log: `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/pr-m1-client-lifecycle.check.log`.
Final line of the gate: `EXIT=0` after `VERIFY-LOCAL PASS`. It is the first
gate on this card that ends green on this machine; the earlier run recorded
above failed only on parity, which is skipped here.

| Step                            | Result                                   |
| ------------------------------- | ---------------------------------------- |
| clean tree                      | PASS                                     |
| schema guard (D34)              | PASS (no `db/` change)                   |
| program generator check         | PASS                                     |
| npm ci / prisma generate        | PASS / PASS                              |
| frontend npm ci                 | PASS                                     |
| format check / typecheck / lint | PASS / PASS / PASS                       |
| frontend typecheck / lint/tests | PASS / PASS / PASS                       |
| unit tests                      | PASS 97 files, 1111 tests                |
| integration tests               | PASS 62 files, 875 tests (real Postgres) |
| migrate deploy                  | PASS                                     |
| build / frontend build          | PASS / PASS                              |
| e2e flow specs (serialized)     | PASS 10 passed, 7 skipped                |
| parity regression (D32)         | SKIP (`SKIP_PARITY=1`, card gates none)  |
| `EXIT`                          | 0                                        |

### Acceptance (you see), measured on the lane DB and a live server

Card contract: "Archiving hides a client from the roster query; delete before
retention is refused." Lane database `app_wb_m1` on native PG17
`127.0.0.1:5433`, dev server `npm run dev -- -p 3900`, signed in as the seeded
owner through the real login form. Every roster number below is the response
body of `GET /api/v1/workspaces/cmvik6shb00008opl07msr5cs/clients` with that
session, not a client-side count. Full transcript:
`Vari8-evidence/WAVEB-LEAD/pr-m1-acceptance.out`.

| Step | Query or call                                     | Literal result                                                                                                           |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | roster before archive                             | HTTP 200, `items.length` 15, contains "Oliver Stone" true                                                                |
| 2    | `archiveClientProfile` on "Oliver Stone"          | `{"clientProfileId":"cmvik6slu000t8oplxbdvq14q","changed":true}`                                                         |
| 3    | roster after archive                              | HTTP 200, `items.length` 14, contains "Oliver Stone" false                                                               |
| 4    | `client_profile` row of the archived client       | `archived_at` set, `archive_reason` "acceptance proof", row present                                                      |
| 5    | `deleteClientProfile` on the just-archived client | refused `WorkspaceServiceError code=retention_not_elapsed`, workspace `retention_days` 90, row count after the refusal 1 |
| 6    | `audit_event` for that client id                  | `UPDATE / client_profile / ARCHIVED` on every archive transition                                                         |
| 7    | same roster call with no session                  | HTTP 401                                                                                                                 |

So the roster query drops a client the moment it is archived, and a delete
inside the retention window is refused with no row removed.

Screenshots, both widths, same browser session, roster endpoint opened after
the real sign-in:

- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/PR-M1/build/roster-before-1440.png` (15 items)
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/PR-M1/build/roster-before-390.png` (15 items)
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/PR-M1/build/roster-after-1440.png` (14 items, "Oliver Stone" absent)
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/PR-M1/build/roster-after-390.png` (14 items, "Oliver Stone" absent)

The browser-visible surface is still the `/api/v1` roster JSON: this branch
ships no roster page (that is PR-W2), so there is no screen for the parity
harness to compare, which is why the card declares parity off.

### Commands on this run

| Command                                                              | Exit | Result                                                                                              |
| -------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `run-gate.sh pr-m1-client-lifecycle M1 app_wb_m1 3900`               | 0    | `VERIFY-LOCAL PASS`, `EXIT=0`                                                                       |
| `docker exec vari8-db-1 dropdb/createdb -U app app_wb_m1` (Mac shim) | 0    | lane DB recreated                                                                                   |
| `npx prisma migrate deploy` on `app_wb_m1`                           | 0    | all migrations applied                                                                              |
| `npm run seed:dev` (first attempt, no `BETTER_AUTH_SECRET`)          | 1    | `storage_not_configured` in `40-media.seed.ts`; workspace, clients and check-ins had already seeded |
| `npm run seed:dev` (with `BETTER_AUTH_SECRET`)                       | 0    | `done: 4 module(s) on app_wb_m1`, 15 client profiles                                                |
| `pr-m1-live-server.sh 3900` + `/login` probe                         | 0    | server up, `/login` HTTP 200                                                                        |
| `pr-m1-acceptance.sh`                                                | 0    | the seven steps in the table above                                                                  |
| `node Vari8-evidence/WAVEB-LEAD/shots.cjs before` / `after`          | 0    | 4 screenshots, HTTP 200 at 1440x900 and 390x844                                                     |

The acceptance helpers (`pr-m1-acceptance.sh`, `pr-m1-live-server.sh`,
`shots.cjs`, `step.ts`) and the raw artifacts live in
`Vari8-evidence/WAVEB-LEAD/` and `Vari8-evidence/WAVEB-LEAD/PR-M1/build/`, not
inside the worktree. Two worktree-side artifacts broke the gate while they
existed and both are gone now:

- A `.cjs` file under the worktree root makes `npm run lint` fail with
  `A configuration object specifies rule "react-hooks/set-state-in-effect",
but could not find plugin "react-hooks"`. `eslint.config.mjs` sets
  react-hooks rules in an unscoped object while `eslint-config-next`
  registers the plugin only for the extensions its own globs match, so one
  stray `.cjs` breaks the whole config.
- A `_evidence/` directory makes `tests/unit/system-index.test.ts` fail with
  `["missing: _evidence/AGENTS.md"]`, because the index generator expects an
  index doc in every directory.

Gate history on this card's macOS runs: `EXIT=0` at `b1270da` (the product
head, before any report commit). `EXIT=1` at `6bdbb76` on `FAIL lint exit=2`
for the stray `.cjs`. `EXIT=1` at `cffd2ca` on `FAIL unit tests exit=1` for
the `_evidence/` directory. With both artifacts moved out, `eslint` reports
`0 errors, 81 warnings` and `tests/unit/system-index.test.ts` passes 18/18.
The gate run on the head that carries this text is the one that decides the
READY line.

Not done or not possible on this run: the roster page does not exist on this
branch, so the screenshots show the JSON the roster query returns rather than
a rendered list. Delete-after-retention success is not re-measured here; it is
covered by `tests/integration/m1-client-lifecycle.test.ts` (10 tests, green in
the gate above), and this run proves only the refusal the card asks for. The
lane DB was left seeded and stopped: the dev server was killed after the
screenshots.
