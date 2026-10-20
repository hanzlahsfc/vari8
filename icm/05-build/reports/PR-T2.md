# PR-T2 report - Delete the parked consent tests

Card `icm/05-build/cards/pr-t2-consent-test-cuts.md`. Issue #103. PR #104 (draft, open against `Vari8-Beta`, not merged).

- Head: `8979764d5de97a57c9be49c16b9b8ca532f75c90`
- Base: `1b066e468051c37c3e3e93861545ed1f49425ed5` (`origin/Vari8-Beta` merge-base, 0 behind at branch start)
- Lane DB `app_prt2` on 127.0.0.1:5433 (recreated, used, dropped). Dev port 3725.
- Matrix rows closed: none (foundation/tooling PR)

## What this PR does

Executes the TEST-AUDIT `CUT-AT-REPLACE in PR-04` actions with the PR-03A
lever extended by a `--replace-pr PR-XX` filter: deletes the nine parked
consent/health-data test files, removes every PR-04 replacement block from
the retained suites, and drops the test-only `ENABLE_CONSENT_GATES: "1"`
from `vitest.config.ts`. Consent gates stay parked (default off, D19);
nothing in `app/`, `lib/`, `components/`, `frontend/` or `db/` changed.

## Changed paths (27 files, +168 / -3947)

Tooling and generated docs:

- `icm/05-build/tools/apply-test-audit.mjs` - new `--replace-pr` flag: whole-file `CUT-AT-REPLACE in PR-XX` becomes `CUT-FILE`; TRIM keeps only the named PR's blocks as deletions, treats other replacement PRs' already-removed blocks as optional; `GUARD` keep-verification unchanged.
- `icm/05-build/tools/program_data.py`, `icm/05-build/tools/program.py`, `icm/03-plan/output/PLAN.md` - base drift repair, see "Base defects" below.
- `icm/05-build/reports/PR-T2.md` - this report.

Deleted whole files (CUT-AT-REPLACE in PR-04):

- `tests/integration/s1-d-consent.test.ts` (680 lines)
- `tests/unit/coaching-classification-actions.test.ts`
- `tests/unit/consent.test.ts` (695 lines)
- `tests/unit/crosssheet.test.ts`
- `tests/unit/gdpr-export.test.ts`
- `tests/unit/parameter-classification-dom.test.tsx`
- `tests/unit/redact.test.ts`
- `tests/unit/retention.test.ts`
- `tests/unit/source-data-policy.test.ts`

Also deleted (empty husks after their sole PR-04 block was cut - nothing left to keep):

- `tests/unit/catalog.test.ts`
- `tests/unit/onboarding-review.test.ts`
- `tests/unit/spec-artifacts.test.ts`

Trimmed retained files (PR-04 blocks removed; GUARD and other-PR blocks kept):

- `tests/integration/p020a-parameter-classification.test.ts` (1019 -> 382 lines)
- `tests/integration/p022-staff-daily-review.test.ts` (1065 -> 963)
- `tests/integration/p023-onboarding-submission.test.ts` (1196 -> 1014)
- `tests/unit/checkin-instances.test.ts`
- `tests/unit/coaching-classification.test.ts` (377 -> 26; only the `computeSelectionFingerprint` GUARD tests remain)
- `tests/unit/extraction-contract.test.ts`
- `tests/unit/mealplan-gate.test.ts`
- `tests/unit/onboarding-submission.test.ts`

Config:

- `vitest.config.ts` - removed `ENABLE_CONSENT_GATES: "1"` from `env` (test-only global; gates now exercise their parked default).
- `vitest.integration.config.ts` - flag kept; comment updated (the retained PR-05 consent-gating integration tests still assert gate-on behavior).

## TEST-AUDIT actions executed

`node icm/05-build/tools/apply-test-audit.mjs --audit TEST-AUDIT.md --replace-pr PR-04` (dry run), then `--apply`:

- 9 `CUT-AT-REPLACE in PR-04` whole files -> `CUT-FILE` (deleted)
- 11 files trimmed of their PR-04 blocks (audit ids incl. TB1.003-TB1.006, TB0.044, TB0.052, TB0.056-TB0.057, TB2.036, TB2.045, TB2.065-TB2.066, TB2.068, TB2.082, TB1.053, TB3.056, TB3.059, TB1.059, TB3.072, TB1.063/TB1.069-related content)
- `expected remaining: 0 tests / 0 lines`; no audit resolution problems
- Post-trim cleanup: dead consent imports/fixtures/helpers removed from `onboarding-submission`, `coaching-classification`, `extraction-contract`, p020a, p023; three zero-test husks deleted (above).

After the cuts: `rg` for `consent`/`gdpr`/`redact`/`retention`/audit markers over `tests/` finds no assertion outside the parked-gate integration tests and `runtime.test.ts` env handling (verified by unit+integration runs below and the gate).

## Commands and exit codes

| Command                                                                                                                  | Exit                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `git fetch origin && git merge --ff-only origin/Vari8-Beta`                                                              | 0 (already up to date; 0 behind, 1 ahead = report stub)                         |
| `node icm/05-build/tools/apply-test-audit.mjs --audit TEST-AUDIT.md --replace-pr PR-04` (dry run)                        | 0 (9 CUT-FILE + 11 TRIM, 0 problems)                                            |
| `node icm/05-build/tools/apply-test-audit.mjs --audit TEST-AUDIT.md --replace-pr PR-04 --apply`                          | 0                                                                               |
| `npm ci` / `npx prisma generate`                                                                                         | 0                                                                               |
| `npm run format:check` (first gate attempt)                                                                              | 1 -> fixed by `npx prettier --write` on the 6 touched files, then 0             |
| `npm run typecheck`                                                                                                      | 0                                                                               |
| `npm run lint`                                                                                                           | 0 (0 errors; 3 pre-existing warnings outside the diff after unused-var cleanup) |
| `npx vitest run` (unit, 91 files / 1033 tests)                                                                           | 0                                                                               |
| `npx vitest run --config vitest.integration.config.ts` on the 4 trimmed integration files (51 tests, against `app_prt2`) | 0                                                                               |
| `npm run index`                                                                                                          | 0 (5 docs, 11 routers; `npm run index:check` 0, no drift)                       |
| `python3 icm/05-build/tools/generate.py --check`                                                                         | 1 at base -> 0 after the drift repair (154 files match)                         |
| `BASE_SHA=1b066e4… LANE_DB=app_prt2 LANE_PORT=3725 CARD=PR-T2 icm/05-build/tools/verify-local.sh`                        | **0** (full log: `_evidence/PR-T2/build/verify-local.log`)                      |
| `npm run db:fresh` on `app_prt2` (`DB_FRESH_SKIP_CATALOGS=1`, `SEED_*` env creds)                                        | 0                                                                               |
| `PORT=3725 npm run dev` + Playwright drive (below)                                                                       | 0                                                                               |
| `docker exec vari8-db-1 dropdb -U app --if-exists app_prt2`                                                              | 0                                                                               |

## Local gate result (head 8979764)

```
PASS clean tree            WARN node: target 24 (D5), running v26.8.2; recorded, not certified
PASS schema guard (D34)    PASS program generator check    PASS npm ci
PASS prisma generate       PASS frontend npm ci            PASS format check
PASS typecheck             PASS frontend typecheck         PASS lint
PASS frontend lint         PASS unit tests                 PASS frontend tests
SKIP integration tests: no change under db/, lib/ or app/api/
PASS migrate deploy        PASS build                      PASS frontend build
PASS e2e flow specs (serialized): 10 passed, 7 skipped
PASS parity regression (D32) (246s)
VERIFY-LOCAL PASS - exit 0
```

Integration suites are skipped by the gate's own rule (this diff touches only `tests/`, configs and `icm/`); the four trimmed integration files were run explicitly and passed (51 tests).

## Parity (D32)

Harness `npm run parity` against the built app (PARITY_PORT 3726):
`parity PASS: 0 problem(s), retried=0`. 35 screens captured, all OK at both
widths - 35 x `@1440` and 35 x `@390` (report
`tools/parity/out/report.html`, regenerated each run). No screen diffs.

## Live receipt (real browser, Chromium via Playwright)

- `db:fresh` recreated `app_prt2`, applied migrations, seeded workspace `canvas-demo` (owner + coach + 15 synthetic clients; catalogs skipped, none on this machine).
- `npm run dev` on :3725 with `ENABLE_CONSENT_GATES` unset (parked default).
- Signed in through the real `/login` form as the seeded owner; landed on `/` (App scaffold home) at both widths.
- Screenshots: `_evidence/PR-T2/build/live-owner-1440.png` (1440x900) and `_evidence/PR-T2/build/live-owner-390.png` (390x844).

No acceptance UI exists for this card - the proof target is "suites pass with gates parked; no consent assertion remains outside the parked code", which the gate and the audit levers demonstrate; the live drive confirms the app still boots and authenticates with the flags removed from test env.

## Base defects found (repaired in this branch, separate commit)

`generate.py --check` failed at base for every lane: the owner-rulings merge
(`1b066e4`) hand-wrote O1-O16 ruling paragraphs into 16 generated build
cards without encoding them in `icm/05-build/tools/program_data.py`, so the
generator could not reproduce its own committed output. Commit `0c8443d`
adds `CARD_RULINGS`/`CARD_BUILD_EXTRA` to `program_data.py` and emits them
from `program.py` in build bodies only (verify/merge bodies unchanged);
generated output now matches the committed cards byte-for-byte and
`PLAN.md` gains the PR-W8 booking bullet its card already carried.

Smaller defect, same class: `scripts/seed/00-workspace.seed.ts` and
`icm/05-build/tools/dev-user.ts` still write only `user.passwordHash`, but
since PR-05's Better Auth migration credential sign-in reads the
`accounts` row (`providerId: "credential"`). Seeded users therefore cannot
sign in ("User not found"). Worked around for the lane receipt only by
inserting the two `accounts` rows on `app_prt2` (copying the seeded hash);
the product fix belongs to a seed-update card and is noted here for the
program lead.

## Not done / notes

- Integration test suite: skipped by the gate rule (no `db/`, `lib/` or
  `app/api/` change); trimmed files run manually, 51 tests green.
- Node: v26.8.2 vs target 24 - recorded WARN by the gate, as designed.
- Catalog imports skipped in `db:fresh` (no sheet sources on this machine);
  not needed for this card's receipt.
- GitHub Actions are manual-only; none were triggered.
