# PR-SV2 report

Card `icm/05-build/cards/pr-sv2-daily-series.md`, issue
[#150](https://github.com/hanzlahsfc/vari8/issues/150), PR
[#152](https://github.com/hanzlahsfc/vari8/pull/152) (marked ready for
review). Branch `beta/pr-sv2-daily-series`, base `69c74c3` (merge base
with `origin/Vari8-Beta`; branch is already at the current beta tip, no
merge needed). Gate-verified head `a4b2dcb`; commits on top add the
report only, no product code. Repository renamed to `hanzlahsfc/vari8`
during this card; origin updated accordingly.

## What changed

- `lib/daily-entry/service.ts`: `readDailyEntryNumericSeries` +
  `parseDailyEntrySeriesRange` (+ `SERIES_MAX_SPAN_DAYS = 372`). Typed
  per-parameter numeric series for the tracker Week and Trends views.
- `lib/daily-entry/boundary.ts`: `readDailyEntryNumericSeriesFromApi`,
  mapping domain outcomes onto the api/v1 `{ error: { code } }` contract.
- `app/api/v1/daily-entries/[workspaceId]/[clientProfileId]/series/route.ts`:
  `GET`, capability `clientData.read`, `force-dynamic`.
- `tests/unit/daily-entry-series.test.ts` (6 tests),
  `tests/integration/api-v1-daily-entry-series.test.ts` (11 tests).
- `docs/index/ROUTES.md`, `docs/index/SYMBOLS.md`: regenerated index.
- No `db/` edits (D34: schema guard PASS).

## Contract implemented

`GET /api/v1/daily-entries/:workspaceId/:clientProfileId/series?parameterId=&from=&to=`

- Route helper authenticates (cookie or bearer), validates params/query
  with Zod, and resolves `clientData.read` scope before any data access:
  owner/coach get `workspace`, client gets `own`, others deny.
- `from`/`to` are inclusive declared `YYYY-MM-DD` dates; real-calendar
  dates only; `from <= to`; span at most `SERIES_MAX_SPAN_DAYS` (372) so
  one request cannot scan unbounded history. A range may end in the
  future (the Week view shows the whole week; unrecorded days are simply
  absent). Violations return 400 `invalid_input`.
- Response `{ state: "ready", parameter, from, to, points }` with
  `parameter = { parameterId, key, label, unit, kind }` and `points`
  ascending by declared date.
- Latest revision (#79): points come from each entry's
  `currentRevisionId` value row for the parameter — one batched lookup,
  never per-row.
- Missing versus zero (D29): a date whose current revision holds no
  numeric value for the parameter emits no point; a recorded `0` is a
  value, not missing.
- Eligible parameters: `ParameterDefinition` in the workspace with a
  numeric kind (`MEASUREMENT`, `RATING`) and `GENERAL_HEALTH`
  classification — the same disclosure rule as the P-022 detail read.
  Missing, foreign-workspace, non-numeric or other-classification
  parameters return 404 `not_found` without disclosure.
- Archive (D27, PR-M1): archive is soft and removes the roster row, not
  the records; staff reads of an archived client's series still return
  history.
- Authorization inside the service: the client profile must belong to
  the workspace (`client_outside_workspace` denied) and `own` scope only
  resolves when `profile.userId === viewer.userId`; both denials surface
  as the same 403 `forbidden`, indistinguishable from foreign-workspace
  denial.
- Consent: parked gates (D19) are checked with the same unlocked
  `checkRequiredConsent` and the dev policy registry the app callers
  use. Contract: with `ENABLE_CONSENT_GATES=1` set in a dev/test runtime,
  a client profile missing required consents returns HTTP 200
  `{ state: "consent_missing" }` — a state payload, not an api/v1 error
  code — matching the `listStaffDailyEntries` read the app consumes.
  Reachability today: consent gates are parked off everywhere (D19), so
  this state is unreachable in the current lane and production builds;
  this PR changes nothing about consent policy and the state stays as
  the app list read defines it.
- No READ audit event: product decision #80
  (`docs/product-decisions.md`) records one structural `READ` audit per
  explicitly submitted "View details" Server Action and states that list
  loads and GETs create none. The series is a bounded GET collection
  read — like `listStaffDailyEntries` and the api/v1 roster read it
  writes no audit; the audited detail action stays unique to P-022.

## Commands and exit codes

Runtime: Node v24.22.1 (`~/.local/node24`, project-local install from
nodejs.org; machine runtime untouched). `REQUIRE_NODE24=1` passed.

| Command                                                                                                                                                                      | Exit                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `npx vitest run tests/unit/daily-entry-series.test.ts` (RED before implementation: import failure on missing exports)                                                        | 1                                                |
| same, after implementation                                                                                                                                                   | 0 (6/6)                                          |
| `INTEGRATION_DATABASE_URL=...app_prsv2 npx vitest run --config vitest.integration.config.ts tests/integration/api-v1-daily-entry-series.test.ts`                             | 0 (11/11)                                        |
| Mutation: own-scope check removed -> "denies a client reading another client's series" fails                                                                                 | 1 (expected)                                     |
| Mutation: `orderBy desc` -> "literal ascending series" fails                                                                                                                 | 1 (expected)                                     |
| Mutation: missing values emitted as `0` -> "keeps a recorded zero and omits dates without a value" fails                                                                     | 1 (expected)                                     |
| `npm run index` + `npm run index:check`                                                                                                                                      | 0                                                |
| `npm run typecheck`                                                                                                                                                          | 0                                                |
| `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prsv2 LANE_PORT=3767 CARD=PR-SV2 REQUIRE_NODE24=1 SKIP_PARITY=1 KEEP_DB=1 icm/05-build/tools/verify-local.sh` | 0 (PASS)                                         |
| `npm run db:fresh` on `app_prsv2` (`DB_FRESH_SKIP_CATALOGS=1`, seeded creds owner/coach/client/staff2@vari8.test)                                                            | 0                                                |
| `PORT=3767 npm run dev` against `app_prsv2`, real-browser sign-in per role and `GET` of the series URL                                                                       | see receipts                                     |
| Re-verification at head `c07a113` (same code as gate-verified `a4b2dcb`): `npx vitest run tests/unit/daily-entry-series.test.ts`                                             | 0 (6/6)                                          |
| `INTEGRATION_DATABASE_URL=...app_prsv2 npx vitest run --config vitest.integration.config.ts tests/integration/api-v1-daily-entry-series.test.ts`                             | 0 (11/11)                                        |
| `npm run index:check`                                                                                                                                                        | 0                                                |
| Review repair (advisory: RATING emission untested): added literal RATING test, same integration file                                                                         | 0 (12/12)                                        |
| Review mutation: `seriesPointValue` RATING -> `0` -> the new RATING test fails                                                                                               | 1 (expected); restored byte-identically (sha256) |
| Review repair (finding: report fails format gate): `npx prettier --write` then `npm run format:check`                                                                        | 0                                                |

## verify-local summary (head a4b2dcb)

```
PASS clean tree / schema guard (D34) / program generator check /
npm ci / prisma generate / frontend npm ci / format check / typecheck /
frontend typecheck / lint / frontend lint / unit tests / frontend tests /
integration tests / migrate deploy / build / frontend build /
e2e flow specs (serialized)
SKIP parity regression (D32): SKIP_PARITY=1, card contract gates no screens
VERIFY-LOCAL PASS
```

Parity (D32) on: none — the card wires no screens, so `SKIP_PARITY=1` per
the gate's own contract. One earlier run failed `unit tests` on the
pre-existing `system-index` 5 s timeout flake (passes in isolation,
2.1 s); a second earlier run failed `e2e` on a stale `BETTER_AUTH_URL`
carried in the copied lane `.env`, fixed by aligning it to the fixed e2e
port. Both are environment/base issues, not candidate defects.

## Lane-environment adaptations (non-reference host)

`verify-local.sh` and `db:fresh` hardcode the reference host's container
name `vari8-db-1` and `/home/nexuslink` paths (`program-config.json`). On
this machine postgres runs as container `app-db-1`; rather than renaming
the shared container, a throwaway PATH shim (`/tmp/sv2-shim/docker`)
rewrote only the literal `vari8-db-1` argument, and a `flock` shim
covered the absent macOS binary (single-lane run, serialization
irrelevant). `VARI8_WORKTREES` was exported to a real path for
`.locks`. The gate script itself ran unmodified bytes. Same class of
lane-env footgun PR-31's report already flags.

## Live receipts (real browser, `app_prsv2`, port 3767)

Evidence under `~/Devin/vari8-worktrees/_evidence/PR-SV2/build/`:

| Role                                   | Result                                | Screenshot               |
| -------------------------------------- | ------------------------------------- | ------------------------ |
| owner (staff, workspace) 1440          | 200 `state:"ready"`, 6 literal points | `owner-1440.png`         |
| coach (staff, workspace) 1440          | 200 same series                       | `coach-1440.png`         |
| client (own scope) 390                 | 200 same series                       | `client-390.png`         |
| client -> another client's profile 390 | 403 `forbidden`                       | `client-foreign-390.png` |
| staff of foreign workspace 1440        | 403 `forbidden`                       | `foreign-staff-1440.png` |
| signed out 1440                        | 401 `unauthenticated`                 | `signed-out-1440.png`    |

Series on the seeded client (`canvas-demo`, profile `cmvje3x2a…w2zfv`,
parameter `p_sv2_bodyweight` kg, GENERAL_HEALTH MEASUREMENT):
`2026-10-15..21` except `2026-10-18` — the absent day stays missing, the
JSON shows exactly six ascending points.

## Matrix rows closed

0 rows: none (foundation/service PR).

## What I could not do / limitations

- Parity not applicable (no screens); the SKIP is the documented path
  for no-screen cards, not a waiver.
- Bit-exact parity host issue from PR-31 does not apply here.
- `docs/STATUS.md` untouched by rule; GitHub Actions never triggered.
- Lane DB `app_prsv2` dropped at end-clean; dev server stopped.
- `REQUIRE_NODE24=1` honored (v24.22.1); the earlier team note about a
  26.12.1 floor was superseded by the current instruction to use the
  repository pin (Node 24).
