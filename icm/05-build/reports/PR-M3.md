# PR-M3 report: coach notes, coach tasks and tracker comments

Card `icm/05-build/cards/pr-m3-notes-tasks.md`, issue #109, PR #110, branch
`beta/pr-m3-notes-tasks`, lane DB `app_wb_m3` on 127.0.0.1:5433, lane port 3910.

Head measured in this round: `c97aed4b9736e25e50f2341e933c78794ce2f936`
(`chore(index): regenerate after merging Vari8-Beta`, on top of the `5f6d11f` merge
of `origin/Vari8-Beta`). Base: `origin/Vari8-Beta` at `6d06cf8`.

## Gate status: pending, no receipt for this head

The gate is **not** green for this head and this round did not run it. `origin/Vari8-Beta`
at `6d06cf8` fails `tests/unit/system-index.test.ts:127` on its own, with no card code
involved, so `verify-local.sh` aborts at the unit step. That base defect is being repaired
in PR #145. No `READY` line was written.

The last gate receipt for this branch was recorded at head `8a42418` against base
`fb5c387`: 19 of 20 steps PASS, one FAIL on `parity regression (D32)`, which is not this
card's contract (`- Parity (D32) on: none.`). That receipt predates the current base and
does not apply to `c97aed4`. A missing gate row here means pending, not green.

## Acceptance contract, measured live

Contract line: `A client request to a coach note or coach task route gets 403; staff see them.`

Run against a production server (`npm run build` then `npx next start -p 3910`) with real
session cookies (`POST /api/auth/sign-in/email`, cookie jar per role) on a freshly seeded
`app_wb_m3`. Script `Vari8-evidence/WAVEB-LEAD/pr-m3-acceptance-r2.sh`, output
`Vari8-evidence/WAVEB-LEAD/pr-m3-r2-acceptance.out`.

Workspace probed: `cmvimhxkg00008ob1j0ugaaia` (slug `canvas-demo`). Foreign workspace used
for the deny check: `cmvimhxnn000i8ob1heitev37`.

| Route                                 | Method | client | staff |
| ------------------------------------- | ------ | ------ | ----- |
| `/api/v1/workspaces/<ws>/notes`       | GET    | 403    | 200   |
| `/api/v1/workspaces/<ws>/coach-tasks` | GET    | 403    | 200   |
| `/api/v1/workspaces/<ws>/notes`       | POST   | 403    | 200   |
| `/api/v1/workspaces/<ws>/coach-tasks` | POST   | 403    | 200   |

Client 403 bodies were `{"error":{"code":"forbidden"}}` on all four. Staff POST created real
rows (`{"id":"cmvimm4j100038owuez9knu2k","revision":1}` for the note,
`{"id":"cmvimm4jz00078owu0drxj56j","revision":1}` for the to-do) and staff GET returned the
seeded notes and to-dos for the workspace.

Deny controls in the same run:

| Probe                                    | Status    |
| ---------------------------------------- | --------- |
| client GET foreign workspace notes       | 403       |
| client GET foreign workspace coach-tasks | 403       |
| staff GET foreign workspace notes        | 403       |
| staff GET foreign workspace coach-tasks  | 403       |
| no session GET notes / coach-tasks       | 401 / 401 |

Sign-in returned 200 for both seed users and each jar held one `session_token` cookie.

## Unit line, measured

Card line: `Isolation: client and foreign-workspace reads denied; audit metadata carries no body text.`

`npx vitest run --config vitest.integration.config.ts tests/integration/notes-tasks.test.ts`
exit 0, 7 tests passed, including `staff create and list notes; a client gets 403 on every
note route`, `rejects a GENERAL note without a client; audit carries no body text`,
`foreign workspace member and signed-out caller fail closed`, `staff create and complete
coach tasks; a client gets 403 on every task route` and `own-scope reads return GENERAL
notes only, on the caller's own profile`.

`npx vitest run tests/unit/notes-tasks-input.test.ts` exit 0, 4 tests passed.

Audit check on the rows the live staff POST created, read directly from Postgres:

```
action | resource_type | result | meta              | leaks_body
CREATE | coach_task    | ALLOW  | {"changed": true} | f
CREATE | coach_note    | ALLOW  | {"changed": true} | f

coach_audit_rows | rows_with_body_text | distinct_meta
2                | 0                   | {"changed": true}
```

`leaks_body` is `to_jsonb(e)::text ilike '%live acceptance%'`, so the check covers the whole
audit row, not only `meta`. The note bodies written in this run (`live acceptance note round 2`)
appear zero times in `audit_event`.

## Screenshots, 1440 and 390

Rendered in Chromium at width 1440x900 and 390x844 with each role's real session cookie, on the
running server. Eight files under
`/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m3-notes-tasks/_evidence/PR-M3/build/`
(directory is gitignored through `.git/info/exclude`):

| File                    | Role   | Route       | Width | Status |
| ----------------------- | ------ | ----------- | ----- | ------ |
| `client-notes-1440.png` | client | notes       | 1440  | 403    |
| `client-tasks-1440.png` | client | coach-tasks | 1440  | 403    |
| `client-notes-390.png`  | client | notes       | 390   | 403    |
| `client-tasks-390.png`  | client | coach-tasks | 390   | 403    |
| `staff-notes-1440.png`  | staff  | notes       | 1440  | 200    |
| `staff-tasks-1440.png`  | staff  | coach-tasks | 1440  | 200    |
| `staff-notes-390.png`   | staff  | notes       | 390   | 200    |
| `staff-tasks-390.png`   | staff  | coach-tasks | 390   | 200    |

These routes are JSON API endpoints, so the screenshots show the response the browser
received at that width (status from `PerformanceNavigationTiming.responseStatus`, body text
visible on the page). The status is identical at both widths because no layout is involved:
the contract is enforced server side, before any lookup.

## Changed paths

| Path                                                                  | Why                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `lib/notes/service.ts`, `lib/notes/boundary.ts`                       | CoachNote read/create/update/delete/restore, PRIVATE vs GENERAL (O13), structural audit |
| `lib/coach-tasks/service.ts`, `lib/coach-tasks/boundary.ts`           | CoachTask to-dos, own entity, never ClientTask (D26)                                    |
| `lib/tracker-comments/service.ts`, `lib/tracker-comments/boundary.ts` | Comments-only coach tracker write path (O7)                                             |
| `lib/audit.ts`                                                        | structural audit helper for the three domains, ids and `changed` markers only           |
| `app/api/v1/workspaces/[workspaceId]/notes/**`                        | GET/POST list+create, PATCH/DELETE, restore                                             |
| `app/api/v1/workspaces/[workspaceId]/coach-tasks/**`                  | GET/POST list+create, PATCH, DELETE, restore                                            |
| `scripts/seed/22-notes.seed.ts`                                       | canvas demo notes and to-dos, synthetic                                                 |
| `tests/integration/notes-tasks.test.ts`                               | behaviour test over real PG through the route handlers                                  |
| `tests/unit/notes-tasks-input.test.ts`                                | input validation                                                                        |
| `docs/index/ROUTES.md`, `docs/index/SYMBOLS.md`                       | regenerated (`npm run index`)                                                           |

`git diff --name-status 6d06cf8..HEAD` lists 19 files. `db/` and `frontend/` file counts in
that diff are both 0. `scripts/seed/33-checkins.seed.ts`, repaired in an earlier round, now
has an empty diff against the base.

## Commands and exit codes (this round)

| Command                                                                                      | Exit                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `git rev-parse HEAD`                                                                         | 0, `c97aed4b9736e25e50f2341e933c78794ce2f936`   |
| `npm run index:check`                                                                        | 0 (preconditions handed over green, re-checked) |
| `npm run db:fresh` on `app_wb_m3`                                                            | 0                                               |
| `npm run build`                                                                              | 0, build id `tefkebLwIQFdpT30feZDL`             |
| `npx next start -p 3910` + readiness probe                                                   | 0, `http 200` after 2s                          |
| `POST /api/auth/sign-in/email` as `client@prm3.test` and `coach@prm3.test`                   | 200 / 200, one session cookie each              |
| route probes, 4 GET + 4 POST + 4 foreign + 2 anonymous                                       | see the table above                             |
| `psql` audit queries on `audit_event`                                                        | 0, 2 rows, 0 with body text                     |
| playwright screenshot run, 8 shots                                                           | 0                                               |
| `npx vitest run tests/unit/notes-tasks-input.test.ts`                                        | 0, 4 passed                                     |
| `npx vitest run --config vitest.integration.config.ts tests/integration/notes-tasks.test.ts` | 0, 7 passed                                     |
| `icm/05-build/tools/verify-local.sh`                                                         | not run this round, blocked by PR #145          |

Logs: `Vari8-evidence/WAVEB-LEAD/pr-m3-r2-{dbfresh,build,server,acceptance,integration}.out` and
`pr-m3-r2-acceptance.out`, `pr-m3-r2-screens.out`.

## Environment notes for the next runner

- The app refuses to start when `AUTH_URL` and `BETTER_AUTH_URL` are both set to different
  values (`lib/auth/server.ts:140`). Export both to `http://127.0.0.1:3910`, or drop
  `AUTH_URL`.
- `vitest.integration.config.ts` sets its own `BETTER_AUTH_SECRET`, so an exported
  `AUTH_SECRET` aborts every integration file at import. Run the suite with
  `env -u AUTH_SECRET -u AUTH_URL` and `INTEGRATION_DATABASE_URL=$DATABASE_URL`.
- `npm run db:fresh` needs `AUTH_SECRET` (or `BETTER_AUTH_SECRET`); without it `40-media.seed.ts`
  fails closed with `storage_not_configured`.
- The audit table is `audit_event` (Prisma model `AuditEvent`), lowercase and snake case in
  raw SQL.

## What I could not do

- Produce a gate receipt for `c97aed4` on base `6d06cf8`. The base is red on
  `tests/unit/system-index.test.ts:127` before any card code runs, and PR #145 owns that fix.
- Run the parity step. The card gates no screens (`Parity (D32) on: none.`), the branch touches
  no `frontend/` file, and the committed baseline was captured on the Linux reference host.
- Anything outside this card's files. No shared code, no gate script, no `docs/STATUS.md`.
