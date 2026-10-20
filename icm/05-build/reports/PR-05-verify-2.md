# PR-05 independent functional verification 2

Verifier: Neji gear, independent. Subject: PR #69, branch `beta/pr-05-auth-api`, worktree
`/home/nexuslink/vari8-worktrees/pr-05-auth-api`, head `bf93d2a` (Devin fix pass 1 `ba3b3f7` +
orchestrator merge of Vari8-Beta `f02a6d6`), base `origin/Vari8-Beta` = `f02a6d6`.
Scope: function, tests, test-surgery compliance, live behaviour, gates, scope. Security is the
separate Opus lane. No commit, no push, no merge.

Method: fresh scratch worktree at `bf93d2a` (`/home/nexuslink/.hermes/cache/scratch/pr05v2/wt`,
root and `frontend` `npm ci` exit 0 from the killed run, `npx prisma generate` exit 0, all
migrations applied (36 migration directories) to `app_pr05v2` on 127.0.0.1:5433). Node v26.7.0,
npm 11.19.0. The repo targets Node 24, so gate results are not target-runtime certification.

Scratch-only change, declared: `tsconfig.json` gains `"icm/**/evidence/**"` in `exclude`. With it
removed, `npx tsc --noEmit` exits 2 on the known base defect
(`icm/05-build/evidence/PR-03b-verify-3/probes/variant-mount-timing.dom.test.tsx:22`, TS2307,
fixed by PR #75). This is not PR-05's defect and was not changed in the branch.

## VERDICT: **FIX**

The three round-1 blockers are closed and independently re-proven: the 28 whole-file
CUT-AT-REPLACE deletions are restored verbatim, the four KEEP-ALL files are back and green, and
reset identifiers are digest-only at rest (proven live, compared in code and in the DB).
Roles, superseded-reset revocation, fail-closed session lookup and every gate check out, and the
production build passes a 15-check live matrix plus the builder's 14-check proof.

Two defects remain, both small and both fixable in one commit. One of them makes the PR's own
integration gate red for any developer who follows the PR's own `.env.example`.

---

## 1. Test surgery (own script: `surgery2.py`, `surgery3.py`)

Inputs joined: the TEST-AUDIT per-file action list (lines 56 to 292), the audit pass-2 block
tables (from line 368), the producer pass-2 tables (`icm/03-plan/output/TA/TB[0-4].md`), the
branch diff, and the reconciliation ledger.

| Check                                                                                      | Result                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test files touched                                                                         | 38: 31 modified, 7 added, **0 deleted**                                                                                                                         |
| Audit KEEP / KEEP-ALL / GUARD blocks in those files                                        | 51; **31 present verbatim** (0 titles missing), **20 rewritten**, 0 missing without an equivalent                                                               |
| Whole-file `CUT-AT-REPLACE in PR-05` set (round-1 F1)                                      | 28 of 28 files exist at HEAD; 453 base test/describe titles, **0 missing**; all restored verbatim                                                               |
| Round-1 F2 KEEP-ALL deletions                                                              | 4 of 4 exist (`phase-3-2-password-reset`, `credentials`, `password-reset-delivery`, `password-reset-token-failure`); 1 test each added or rewired, none skipped |
| Ledger reconciliation                                                                      | 163 rows; 146 resolve to an audit block; per-row test count **0 mismatches**; row test total **1023 = audit block total 1023**                                  |
| Ledger rows pointing at `CUT pass 2` blocks                                                | 17; those blocks are absent from the block tables (they are per-file "cut pass 2" entries), and all were restored, which is conservative, not a loss            |
| Audit rule at `TEST-AUDIT.md:11` (extract guards before deleting)                          | Satisfied: the mixed suites p013, p016, p020b, p021, p022, p023, p025d2, invitations, password-reset-boundary are present with their guard titles               |
| Audit rule at `TEST-AUDIT.md:323` (invariants passing before deleting the old mixed block) | Satisfied for CAS, stale writes, pinned versions, exact-one-winner, rollback on audit failure, date boundaries and tenant isolation; spot reads below           |

Spot reads (10 rewritten blocks, each compared against the base title it replaced):

1. `tests/unit/credentials.test.ts` (TB0.029/030): `authorizeCredentials` is gone, so the generic
   sign-in gate moved to `tests/integration/phase-3-2-password-reset.test.ts:519` ("wrong password,
   unknown email, and non-ACTIVE accounts all fail with the same generic error and mint no
   session"). The unit file now asserts `normalizeEmail` plus the scrypt round trip, wrong password,
   tampered hashes and NFC equivalence. Same invariant, correct layer.
2. `tests/unit/password-reset-delivery.test.ts` (TB1.061): fail-closed adapter registry preserved;
   adds the JSONL shape assertion and "no silent sink". Stronger than base.
3. `tests/unit/password-reset-token-failure.test.ts` (TB0.095): `safeTokenHash` classification
   replaced by boundary classification: non-string, empty, unknown, storage failure all resolve
   `{state:"invalid"}`; messages never echo internals. Same invariant.
4. `tests/unit/password-reset-boundary.test.ts` (TB3.064 to 068, 11 of 19 titles rewritten):
   ready, invalid, no-DB-read on malformed input, storage failure, identical generic message,
   message mapping, policy failure without claiming the token. The old "foreign shape" case is now
   covered structurally (identifier prefix) plus `s1-f2d` ("expired, wrong-purpose, malformed, and
   unknown tokens share the invalid outcome"). Same invariant, different layer.
5. `tests/integration/phase-3-2-password-reset.test.ts` (TB0.061): non-enumeration, non-ACTIVE
   no-op, atomic consume with session-row deletion, and the token-failure matrix, plus digest-only
   storage. `sv + 1` became "every session row deleted", which is the Better Auth expression of the
   same revocation guarantee.
6. `tests/integration/s1-f2a-token-store.test.ts` (TB1.019): 12 access-token tests unchanged; the
   2 reset-issuance tests moved to `tests/integration/pr05-security.test.ts:131` (digest-only) and
   `:162` (user-scoped supersede).
7. `tests/integration/s1-f2b-session-runtime.test.ts` (TB1.020): 7 JWT cases rewritten to cookie
   and bearer through the real pipeline, row-deletion revocation, forged/expired, non-ACTIVE,
   store failure fail-closed, sign-out. Same guarantees.
8. `tests/integration/s1-f2b-session.test.ts` (TB1.021): session-row lifecycle, row deletion,
   deactivation deleting live rows, malformed/expired, generic sign-in failure, sign-out.
9. `tests/integration/s1-f2d-password-reset.test.ts` (TB0.093): 18 titles to 14 stronger cases,
   including "concurrent consumes of one token: exactly one winner" (`:423`) and sibling cleanup
   (`:437`).
10. `tests/unit/token-store.test.ts` (TB2.094): the reset-shape assertion moved to
    `pr05-security.test.ts:131`; the 8 remaining token-store tests are byte-identical.

Mutation checks (guarded code, red then restore, restored file byte-equal via `cmp`/`sha256sum`):

| Guard                                              | Mutation                                                                    | Result                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Concurrency: authorization under the advisory lock | `lib/workspace/invitations.ts:243` post-lock `authorize` deleted            | `tests/unit/invitations.test.ts` exit 1, "authorize runs before AND after the advisory lock" failed; restored, 10 pass          |
| Tenant isolation                                   | `lib/api/v1.ts:83` `workspaceId` dropped from the member lookup             | `tests/integration/api-v1-session.test.ts` exit 1, "refuses a member of another workspace with 403" failed; restored byte-equal |
| Expiry                                             | `lib/tokens/store.ts:259` `row.expiresAt <= new Date()` replaced by `false` | `tests/unit/token-store.test.ts` exit 1, the expired variant of the indistinguishability test failed; restored, sha256 equal    |

## 2. The four KEEP-ALL files

All four exist at HEAD and pass: `npx vitest run` over the unit set (9 files, 63 tests, exit 0) and
the integration set (10 files, 87 tests, exit 0) covering
`phase-3-2-password-reset.test.ts`, `credentials.test.ts`, `password-reset-delivery.test.ts`,
`password-reset-token-failure.test.ts`. No skips, no `.todo`. Declared test counts base to head:
phase-3-2 6 to 9, credentials 7 to 6 (5 credential-gate cases now live in the phase-3-2 file),
password-reset-delivery 3 to 6, password-reset-token-failure 1 to 5.

## 3. Digest-only reset

Code: `lib/auth/server.ts:146` sets `verification.storeIdentifier: "hashed"`;
`lib/auth/password-reset-boundary.ts:45` hashes `reset-password:<token>` with SHA-256 base64url
before the peek; mailing uses the raw token only in the link (`server.ts:167-180`).

Live, production build, after `POST /api/auth/request-password-reset`:
`select identifier from verifications where value = <userId>` returned 1 row; the identifier is not
equal to the mailed token, does not contain it, and equals `sha256b64("reset-password:"+token)`
(`rows=1 containsRaw=false digestOnly=true`). The mailed token completed the reset once (200) and
the replay returned 400 `INVALID_TOKEN`.

## 4. Superseded reset and fail-closed session lookup

- Superseded: live, first token 400 `INVALID_TOKEN`, second token 200 after a second request.
  Tests: `pr05-security.test.ts:162` and `:187`, `s1-f2d` "a new request supersedes only that
  user's outstanding tokens" and "a completed reset kills every outstanding sibling token". Pass.
- Fail-closed lookup: `pr05-security.test.ts:411-430` mocks the session store to throw and asserts
  401 (never 500); `s1-f2b-session-runtime.test.ts:206` renames the `users` table under a live
  cookie and asserts anonymous, then restores. Both pass.

## 5. Roles

| Check                | Result                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `member.remove` gone | Present only in a comment, `lib/auth/roles.ts:44`; no capability entry                                                                              |
| Capability count     | 12 (`roles.ts:54-67`), asserted exhaustive for 3 roles                                                                                              |
| owner == coach       | Equal in all 12 rows                                                                                                                                |
| `plan.write` client  | `deny` (`roles.ts:57`)                                                                                                                              |
| client own-only      | `plan.read`, `clientData.read`, `own.read`, `own.write`, `message.write` = `own`; roster, notes, tasks, library, appearance, member.invite = `deny` |
| Enforcement point    | `capabilityScope` at `lib/api/v1.ts:91` (both `/api/v1` routes) and the session route (`:39`)                                                       |
| Test                 | `tests/unit/roles.test.ts` 38 passed, exit 0                                                                                                        |
| Mutation             | `roles.ts:57` client `deny` to `own` gives 1 failed of 38 (the `plan.write` client case); restored byte-equal, 38 pass                              |

## 6. Live on a production build

`npm run build` exit 0, `npx next start -p 3680` (APP_ENV=test, NODE_ENV=production,
`MAIL_DELIVERY_ADAPTER=dev-file`), DB `app_pr05v2`.

| Check                                                                            | Result                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in cookie and bearer                                                        | 200, `better-auth.session_token` cookie and `set-auth-token` bearer                                                            |
| Wrong password                                                                   | 401 `INVALID_EMAIL_OR_PASSWORD`, generic body                                                                                  |
| Session export                                                                   | cookie 200, bearer 200, anonymous 401 `unauthenticated`; body `{user, workspace{id,memberId}, role:"owner", capabilities{12}}` |
| `/api/v1` clients                                                                | session 200 `{items:[],nextCursor:null}`, no session 401                                                                       |
| Sign-out                                                                         | 200, the session row deleted (2 to 1), same cookie then 401                                                                    |
| Reset flow                                                                       | request 200, mailbox line, digest-only row, consume 200, replay 400, superseded first 400 / second 200                         |
| Invite flow                                                                      | invitation via the reviewed service, `/invite?workspace=&token=`, browser accept, membership `COACH` `ACTIVE`                  |
| My independent matrix (`live-verify-2.ts`)                                       | **15/15, exit 0**                                                                                                              |
| `node scripts/live-proof-pr05.mjs`                                               | **14/14, exit 0**                                                                                                              |
| Kept e2e, dev-file mode (`npx playwright test invite-acceptance password-reset`) | **15 passed, 2 skipped, exit 0**                                                                                               |
| Kept e2e, default mode                                                           | **10 passed, 7 skipped, exit 0**                                                                                               |

## 7. Gates (exit codes)

| Gate                                          | Exit | Evidence                                              |
| --------------------------------------------- | ---: | ----------------------------------------------------- |
| `npx tsc --noEmit` (with the scratch exclude) |    0 | no output                                             |
| `npm run lint`                                |    0 | 0 errors, 3 warnings (unused `join`, `bp`, `fieldId`) |
| `npm run index:check`                         |    0 |                                                       |
| `npx vitest run`                              |    0 | 100 files, 1135 passed                                |
| `npm run test:integration` (`app_pr05v2`)     |    0 | 57 files, 874 passed                                  |
| `npm run build`                               |    0 | compiled                                              |
| `cd frontend && npm run build`                |    0 | compiled                                              |

Two first-run non-zero exits, both diagnosed and both re-run clean:

- Unit, first run exit 1: `tests/unit/system-index.test.ts:136` "F2 indexes re-exports and matches
  an independent compiler count" hit the 5000 ms default at 5755 ms while the gate sweep ran builds
  and the full integration suite concurrently. Alone: 18/18 pass, exit 0. Clean full re-run: exit 0.
  Load-sensitive test, not a logic failure (finding F4).
- Integration, first run exit 1: `tests/integration/pr05-security.test.ts:357` expected
  `http://127.0.0.1:3000/reset?token=` and received `http://127.0.0.1:3680/...`. Cause is the
  worktree `.env` (`BETTER_AUTH_URL`), not a code regression, but the assertion pins the wrong
  variable (finding F1). With the `.env` absent the same suite is 57 files, 874 passed, exit 0.

## 8. Scope, secrets, docs

- `frontend/`: **0 files** changed vs `origin/Vari8-Beta`.
- `docs/STATUS.md`: **modified, 62 added lines** (`docs/STATUS.md:1-62`), from commits `b1daefe`
  and `e68a2ef`. The fix-pass commit `ba3b3f7` did not touch it. See F3.
- Secrets: none in the diff. The local dev DB credential in `.env.example:6,11` is present in the
  base (`origin/Vari8-Beta:.env.example` contains the same value); `BETTER_AUTH_SECRET` is the
  `replace-with-a-32-byte-base64-secret` placeholder; the only `AUTH_SECRET` literals are synthetic
  test fixtures (`vitest.integration.config.ts:40`). No `.env` is tracked.
- README `README.md:28,51-55,89-91` documents `BETTER_AUTH_*`, `AUTH_TRUSTED_IP_HEADER`, the mail
  adapter and the production secret refusal. `.env.example:16-34` matches.
- `AGENTS.md` has no `nextjs-agent-rules` block at HEAD.
- Route surface: `app/api/auth/[...all]`, `app/api/v1/.../clients`, `app/api/v1/.../session`.

## Findings

**Required before merge**

- **F1. Integration assertion pins `AUTH_URL` while the app prefers `BETTER_AUTH_URL`.**
  `tests/integration/pr05-security.test.ts:357` asserts `${process.env.AUTH_URL}/reset?token=`, but
  the mailed origin comes from `BETTER_AUTH_URL ?? AUTH_URL` (`lib/auth/server.ts:174-176`), and
  the PR's own `.env.example:21` tells developers to set `BETTER_AUTH_URL`. Reproduced: with the
  documented `.env` present, `npm run test:integration` exits 1 on that test alone (873 vs 874).
  Fix: assert `${process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? ""}/reset?token=`.
- **F2. Reconciliation ledger is inaccurate and incomplete, which is the artifact the fix card
  asked for.** `icm/05-build/reports/PR-05-test-reconciliation.md:159-163` records TB3.064 to
  TB3.068 as "Kept, removed blocks restored verbatim", while 11 of the block's 19 base titles were
  rewritten (verified equivalent, but not verbatim). The ledger header (line 2) promises one row
  per touched file, yet four touched files with GUARD blocks have no row:
  `tests/integration/s1-a-identity.test.ts` (TB2.003, TB2.004),
  `tests/unit/checkin-review-queue.test.ts` (TB2.048, TB2.049, TB2.051),
  `tests/unit/invite-acceptance.test.ts` (TB0.075, TB0.076),
  `tests/integration/phase-3-1-invite-acceptance.test.ts` (TB1.014). Those blocks are intact (0
  titles missing, except `s1-a-identity` "still authorizes the existing credentials", rewritten at
  `s1-a-identity.test.ts:316` as "still authenticates the existing credentials via the account
  backfill" with the same invariant), so this is traceability, not a lost guard. Fix: correct the
  action text and add the four rows.

**Notes, not blocking**

- **F3. `docs/STATUS.md` is modified** (62 added lines) against the "untouched" clause in this
  brief. It comes from the two feature commits, not the fix pass, and matches how PR-02 records
  itself (`04675f8`). Orchestrator call: keep or revert.
- **F4. `tests/unit/system-index.test.ts:136` is load-sensitive**: it compiles for about 5.7 s
  against a 5 s default. It fails only under concurrent load. Consider an explicit timeout.
- **F5. Round-1 F9b stands.** `capabilityScope` is consulted by the two `/api/v1` GET routes and
  the session route. Plan writes still run through the legacy `rbac.ts`; no `/api/v1` write route
  exists. The PR report's wording was corrected, the enforcement gap remains by design.
- **F6. Recorded as N/A:** "malformed claim" for TB3.070 has no analogue under opaque Better Auth
  session rows; `TB3.070` keeps the fail-closed viewer gate
  (`tests/unit/session-version.test.ts:19-46`).

## Passing (summary)

Test surgery compliant with `TEST-AUDIT.md:11` and `:323`; 28 CAR files restored verbatim (453
titles); 4 KEEP-ALL files green; ledger test counts reconcile (1023 = 1023); 3 mutations red then
restored; digest-only reset proven live; superseded reset revoked; fail-closed lookup tested;
12-capability matrix with owner == coach and `plan.write` client deny; typecheck, lint, unit,
integration, build, frontend build and index check all exit 0; production-build live matrix 15/15
and 14/14; kept e2e green in both postures; canvas untouched; no secrets.

## Cleanup (done)

- `next start` servers on 3680 and 3000 killed; ports 3000 and 3680 to 3689 read back free. Port
  3684 is held by another lane's process (pid 1372643, started outside this run); not touched.
- Database `app_pr05v2` dropped (`DROP DATABASE`, exit 0). `app_pr05` and `app_pr05sec2*` belong to
  other lanes and were not touched.
- Scratch worktree `.../pr05v2/wt` removed with `git worktree remove --force`, `git worktree prune`,
  no `pr05v2` entry remains.
- PR worktree: no commit, no push, `git status` clean except this untracked report.
- Evidence kept: `/home/nexuslink/.hermes/cache/scratch/pr05v2/` (`logs/`, `surgery/surgery*.json`,
  `surgery2/*.py`, `live-verify-2.ts`, mailboxes).
