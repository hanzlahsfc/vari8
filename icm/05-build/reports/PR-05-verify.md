# PR-05 independent verification (functional / tests / scope)

Verifier: independent (Neji gear). Subject: PR #69, branch `beta/pr-05-auth-api`, head `e68a2ef`, base `origin/Vari8-Beta` = `ea8f514`.
Scope: function, tests, scope. Security review is the separate Opus lane. No commit, push or merge was made.

## VERDICT: **FIX**

Function works. Gates are green. Canvas is untouched. The role matrix matches owner Q3. The test-retention rules in TEST-AUDIT.md were not followed for the deletions below, and one token-storage invariant regressed (verified live).

Blocking:
1. 28 whole-file CUT-AT-REPLACE deletions remove 462 tests whose pass-2 verdict is KEEP. The audit requires the independent guards to be extracted first. They were not.
2. Four KEEP-ALL files were deleted with no conditional and no replacement (21 tests).
3. Reset tokens are stored raw in `verifications.identifier`. Verified live. The repo's digest-only invariant was dropped.

Non-blocking, but required before SHIP: items 4–10 below.

---

## 1. Test surgery

### 1a. Deleted files vs TEST-AUDIT tags (`git diff --name-status origin/Vari8-Beta...HEAD -- tests`)

39 test files deleted, 28 modified, 6 added. Reconciled by title (base `ea8f514` vs head) and by audit block IDs (`icm/03-plan/output/TA/TB*.md`, 366 pass-2 rows parsed).

| Group | Files | Result |
|---|---|---|
| Whole-file `CUT-AT-REPLACE in PR-05.` | 28 (25 integration, 3 unit: `client-setup-rbac`, `guard`, `rbac`) | Tagged correctly. **But** their pass-2 blocks are KEEP and contain independent guards. See F1. |
| TRIM, CAR-only blocks | `checkin-feedback.test.ts` (TB1.023/025 CAR, 024/026 CUT) | Ok. |
| KEEP-ALL, no conditional | `phase-3-2-password-reset.test.ts`, `credentials.test.ts`, `password-reset-delivery.test.ts`, `password-reset-token-failure.test.ts` | **Violation.** See F2. |
| KEEP-ALL with conditional (AUTH=Better Auth) | `s1-f2b-session.test.ts`, `s1-f2b-session-runtime.test.ts`, `s1-f2d-password-reset.test.ts`, `session-version.test.ts` (TB3.070) | Conditional met on the file tag. Guarantees only partly preserved. See F3, F7. |
| TRIM, KEEP block deleted | `password-reset.test.ts` (TB2.088, TB2.089 KEEP, line 266), `checkin-review.test.ts` (TB2.053 KEEP, not in CAR list, line 192) | **Violation.** See F8. |

Audit lines cited: rule "CUT-AT-REPLACE stays runnable... Do not delete its independent concurrency, transaction, date or token guarantees without first extracting" at `TEST-AUDIT.md:11`. Mixed-suite rule "PR-05 must preserve... The replacement PR must show these invariants passing before deleting the old mixed block" at `TEST-AUDIT.md:323`. Replacement row at `:329`.

### 1b. "Concurrency, transaction, expiry and tenant-isolation blocks in the 22 TRIM files survive" — **not true**

Removed by PR-05 (base→head title diff), all inside CAR-PR05 blocks that the audit says must be extracted first:

- `tests/integration/p022-staff-daily-review.test.ts` (audit line 149; TB0.047 CAR): describe "serialization races" removed (5 tests: lock-ordering / revocation-under-row-lock / concurrent read vs removal). TB0.043: "foreign workspace client is denied for coach and owner alike" (tenant) removed.
- `tests/integration/p016-client-setup.test.ts` (audit line 145; TB2.008–011 CAR): "concurrent creates... exactly one ACTIVE pin", "concurrent cancels produce exactly one transition", "assign vs archive race serializes", "forced audit failure rolls the entire mutation back", "a later published version never moves an existing pin" (pinned immutable), "cancel on foreign... non-disclosing" (tenant). 41 of 45 titles gone; head keeps 4.
- `tests/integration/p021-daily-entry.test.ts` (line 148; TB1.010 CAR): "concurrent saves: one commits, stale loser writes nothing", "stale token fails closed", "cross-user / replaced-membership token replay fails", "rejects out-of-bounds declared date".
- `tests/integration/p023-onboarding-submission.test.ts` (line 150; TB0.058 CAR): "repair C — P2002 fully-authorized replay" (exact-one-winner), "foreign/missing/wrong-workspace assignment IDs fail non-disclosingly" (tenant).
- `tests/integration/p013-onboarding-assignments.test.ts` (line 143; TB2.014–020 CAR): "concurrent replace/cancel bursts settle... under the lock order"; "cross-workspace all denied".
- `tests/integration/p020b-template-transitions.test.ts` (line 147; TB3.007 CAR): "a version published after review makes the review stale", "tampered or mismatched fingerprint is stale", "resubmission after commit fails stale with zero additional writes".
- `tests/integration/p025d2-checkin-calendar.test.ts` (line 157; TB2.023 CAR): "late flag flips around the due instant — before/after-due boundary" (date boundary) and "cross-workspace and cross-client substitutions fail non-disclosingly".
- `tests/unit/invitations.test.ts` (line 240; TB1.047/050 CAR): "post-lock re-authorization", "authorize runs before AND after the advisory lock".

Keyword triage (`/home/nexuslink/.hermes/cache/scratch/pr05v/guardtriage.json`, over-inclusive): 289 guard-like titles removed by PR-05 in total; 191 of them in the 28 whole-file CAR deletions.

### 1c. Mutation check on `tests/unit/roles.test.ts` — PASSES

- Baseline (scratch copy of e68a2ef): `npx vitest run tests/unit/roles.test.ts` → exit 0, 41 passed (39 `it.each` rows = 13 capabilities × 3 roles, plus 2 structural tests).
- Mutant: `lib/auth/roles.ts:57` `"plan.write"` client `deny` → `own` → exit 1, `1 failed | 40 passed`; the failing case is exactly `plan.write for client resolves to deny`.
- Restored: `cmp` byte-equal to original; exit 0, 41 passed.
- The test imports the same `capabilityScope` used by the server (`lib/api/v1.ts:91`, `app/api/v1/workspaces/[workspaceId]/session/route.ts:39`).

---

## 2. Roles vs owner Q3 (`icm/03-plan/OWNER-ANSWERS-1018.md`, row 3)

Q3 (verbatim): "The coach can edit a client's training plan, but the client can't. That's all."

- Owner == coach in all 13 rows of `CAPABILITY_MATRIX` (`lib/auth/roles.ts:54–68`). Pass.
- `plan.write`: owner workspace, coach workspace, client deny (`roles.ts:57`). Pass.
- `plan.read`: client `own` (`roles.ts:56`). Pass.
- Only three roles (`roles.ts:18`). `ASSISTANT_COACH` and `SUPPORT` map to deny (`roles.ts` `memberRoleToRole`). Pass (not built).

Findings (scope, medium):
- **F9a.** The matrix capabilities that have no canvas evidence beyond the owner's answers: `member.remove` (`roles.ts:44–45`). Grep of `frontend/src` finds no member-removal UI. `member.invite` has only the canvas "invitations" state (ethereal clients). Owner said "Any extra role or capability not on the canvas is a finding." Flagged. Other capabilities have canvas hits (notes, tasks, library, appearance, message, roster, plans).
- **F9b.** "Server-enforced" overstates. The matrix is consulted by exactly two GET routes (`lib/api/v1.ts:91`, session route `:39`). No plan-write route exists in `/api/v1`. The ~69 existing `auth()` consumers and the legacy RBAC (9 files in `lib/` and `app/` still reference `ASSISTANT_COACH`) are unchanged. So Q3 is implemented as data and tested, but the write paths the owner cares about are not enforced by the new check.

---

## 3. Function in the running app

Server: `next dev` on 127.0.0.1:3663, DB `app_pr05v` (37 migrations applied), dev-file mailbox. Run from the scratch copy of e68a2ef. Full output: `logs/functional.json`.

| Check | Result |
|---|---|
| Sign in, form (Chromium) | PASS (live proof) |
| Sign in, `POST /api/auth/sign-in/email` | 200, `better-auth.session_token` cookie + bearer token |
| Wrong password | 401 `INVALID_EMAIL_OR_PASSWORD` (generic) |
| Rate limit | 10×401 then 429 |
| Sign out | `POST /api/auth/sign-out` → 200 `{"success":true}`; same cookie then 401 `unauthenticated` |
| Session export, cookie | 200 `{user:{id,email,name}, workspace:{id,memberId}, role:"owner", capabilities:{13 keys}}` |
| Session export, no creds | 401 `unauthenticated` |
| Session export, bearer | 200, same body |
| `/api/v1/…/clients`, cookie | 200 `{"items":[],"nextCursor":null}` |
| `/api/v1/…/clients`, no creds | 401 `unauthenticated` |
| Invite acceptance | e2e `invite-acceptance.spec.ts`: part of 14 passed (dev-file posture) |
| Password reset request, consume, single use, expiry, password change revokes sessions | Live proof 14/14 PASS; e2e reset cases pass (dev-file) |
| Reset token storage | **FAIL (see F4):** `verifications.identifier` = `reset-password:<token>` and the token equals the token in the mailed link |

---

## 4. Canvas untouched

- `git diff --name-only origin/Vari8-Beta...HEAD -- frontend` → 0 files.
- Worktree `git status --short` → empty.
- Note: local branch `Vari8-Beta` (416b2cc) is not the PR base and differs from it in 15 frontend test files. That is outside this PR's diff.

---

## 5. Gates (fresh, scratch copy of e68a2ef, Node v26.7.0 — the repo targets Node 24, so this is not target-runtime certification)

| Command | Exit | Result |
|---|---|---|
| `npm ci` (root) | not captured (background) | Completed; `node_modules` usable; gates ran against it |
| `npx prisma generate` | 0 | |
| `npx prisma migrate deploy` (app_pr05v) | 0 | 37 migrations applied |
| `npm run typecheck` | 0 | |
| `npm run lint` | 0 | 0 errors, 13 warnings |
| `npm test` | 0 | 89 files, 1021 passed, 0 failed |
| `npm run test:integration` | 0 | 27 files, 265 passed, 0 failed (INTEGRATION_DATABASE_URL = app_pr05v) |
| `npm run build` | 0 | |
| `cd frontend && npm ci` | not captured (background) | Completed |
| `cd frontend && npm run build` | 0 | |
| `npx playwright test invite-acceptance password-reset` (MAIL_DELIVERY_ADAPTER=dev-file) | 0 | 14 passed, 2 skipped (404 pair) |
| same, default posture (no mail adapter) | 0 | 10 passed, 6 skipped (flow cases) |
| `node scripts/live-proof-pr05.mjs` (BASE=127.0.0.1:3663) | not captured (background) | Log: "14/14 checks passed" |
| `npx vitest run tests/unit/roles.test.ts` | 0 | 41 passed |
| Mutant (`roles.ts:57`) | 1 | 1 failed (expected) |
| Restored | 0 | 41 passed, byte-equal |

The PR report `icm/05-build/reports/PR-05.md` has two gate tables. The first (1190 unit / 284 integration, line 119) is pre-merge and not labelled as such. The second (1021 / 265, line 252) matches this run.

---

## 6. Leftovers and secrets

- `users.password_hash` / `session_version`: PR-R2 marker is in the migration comment only (`db/migrations/20261020000000_pr05_better_auth/migration.sql:4`). `db/schema.prisma:130` and `:137` carry no marker. Low (F10a).
- `AGENTS.md`: no `nextjs-agent-rules` block at HEAD (`git show HEAD:AGENTS.md | grep -c nextjs-agent` = 0). Note: `next dev` regenerated it in the scratch copy ("✓ Generated AGENTS.md") — the stray returns on any dev run until `agentRules: false`. Program decision still open.
- Secrets in diff: none. Only `BETTER_AUTH_SECRET=replace-with-a-32-byte-base64-secret` (placeholder in `.env.example`) and an SRI hash in a lockfile.
- F10b. `README.md:51–53` still documents `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST` as Auth.js. `.env.example` uses `BETTER_AUTH_*`. Stale docs.
- F10c. `AUTH-DECISION.md` is cited in `PR-05.md:5` and `:267` but is not in the PR branch. It exists only at `/home/nexuslink/vari8-worktrees/beta/icm/05-build/AUTH-DECISION.md`. Owner Q4 asked for the evidence to be recorded; it is not in this PR's commits.

---

## Findings (file:line)

**Blocking**

- **F1. Whole-file CAR deletions remove independent guards.** 28 files, 462 tests (base). Examples: `tests/integration/habits.test.ts` (audit :136; "concurrent same-day DONE logs converge", "audit write failure rolls the whole mutation back"); `checkin-feedback-i1.test.ts` (:130; "concurrent identical sends commit exactly one row", "audit failure rolls the feedback row back"); `checkin-overview-i1.test.ts` (predicate-before-limit, keyset ties); `p008-onboarding-forms.test.ts` (concurrent publish → one version, injected-fault rollbacks); `p025b-checkin-instances.test.ts` ("concurrent duplicate scheduling yields exactly one row"); `s1-f2c-invitations.test.ts` (:175; 19 guard-like titles); `training-i1a`, `mealplan-i1`, `client-tasks`, `p024`, `p025a/c/d6`, `s1-b/c/g/h`, `solo-coach-i1`, `dashboard-layout`, `i4-next-checkin`, `p010`, `p008-actions`, `phase-1-1`. Audit requires extraction before deletion (:11, :323). The PR documents only four rewrites (`PR-05.md` "Test surgery"). **Fix:** extract the guard cases into the replacement suites (or a retained `*-guards` file) and show them green before deleting, or restore the files until the extraction lands.

- **F2. KEEP-ALL deleted without conditional.** `phase-3-2-password-reset.test.ts` (audit :163; 6 tests: identical response for missing and existing accounts, INVITED/DEACTIVATED no-op, "reused, expired, revoked, malformed, and wrong-purpose tokens fail identically with no mutation", successful reset atomic with audit), `credentials.test.ts` (:220; 9 tests: wrong password, unknown email same as wrong password, inactive refused, null without lookup on missing fields), `password-reset-delivery.test.ts` (:264; 4), `password-reset-token-failure.test.ts` (:265; 2: safeTokenHash classification). Most are partly re-covered (`tests/integration/auth-flow.test.ts`, `tests/unit/mail.test.ts`, `tests/unit/email.test.ts`). **Not covered** in head: wrong-purpose tokens, INVITED/DEACTIVATED reset no-op, reset audit write, `safeTokenHash` classification, TokenError→invalid_token / unexpected→reset_failed mapping. **Fix:** rewrite these into the Better Auth boundary before deletion.

- **F3. Token/password guard: reset-token digest invariant dropped.** `tests/integration/s1-f2a-token-store.test.ts` (KEEP-ALL, audit :170) lost "reset issue stores only the digest with user-owned shape" and "reset replacement revocation affects only the intended user". `tests/unit/token-store.test.ts` (TRIM keep TB2.094) lost "issues resets with the user-owned reset shape and digest only". Audit: "Token/password service contracts survive either library choice." Repo's own test had reset tokens stored as SHA-256 digests.

- **F4. Verified live: reset token stored raw.** `lib/auth/server.ts:55–83` sets `emailAndPassword` and `resetPasswordTokenExpiresIn` but no `verification.storeIdentifier`. Installed Better Auth supports it (`node_modules/@better-auth/core/dist/types/init-options.d.mts:1219`). Live check after `POST /api/auth/request-password-reset`: `select identifier from verifications where identifier like 'reset-password:%'` → `reset-password:<token>`, and `<token>` equals the token in `proof-mailbox.jsonl` (`identifier_equals_raw_mail_token: true`). Any reader of the DB can take over a pending reset for 60 minutes. **Fix:** set `verification.storeIdentifier` to hashed (confirm the option value against Better Auth docs), add a test that the stored identifier is not the raw token, and restore the digest assertion. Security lane should confirm severity.

**Non-blocking, must fix before SHIP**

- **F5. Trimmed mixed blocks lost guards.** See §1b. Claim in `PR-05.md` "concurrency, transaction, expiry, and tenant-isolation blocks ... survive" is incorrect for p013, p016, p020b, p021, p022, p023, p025d2, invitations. Fix as F1.

- **F6. `password-reset-boundary.test.ts` (KEEP-ALL, audit :263): 14 of 19 titles removed or renamed.** Gone: "returns invalid for every non-active or foreign shape", "policy failure returns the message without claiming the token", "completion fails closed without a transaction when unavailable", "malformed token → invalid-link message before any DB access". Head has rewritten versions for some. **Fix:** restore the token-shape, foreign-shape and no-claim-on-policy-failure assertions against the new boundary.

- **F7. Behaviour change in a GUARD property.** A second `request-password-reset` no longer revokes the first token (`PR-05.md`, "Behavior notes"). Removed: `phase-3-2` "revoked" case, and `tests/e2e/password-reset.spec.ts:224` (base) "revoked (superseded) and expired links fail safely" → renamed "expired links fail safely" (head line 228). Older links now stay valid for 60 minutes. Not in the audit; decision needs owner sign-off, and AUTH-DECISION.md is not committed (F10c).

- **F8. KEEP blocks deleted outside CAR.** `password-reset.test.ts` (TB2.088 "S1-F2D unit surface", 12 tests; TB2.089 "route boundary", 1; line 266 "TRIM (keep blocks TB2.088)") is deleted whole. `checkin-review.test.ts` (TB2.053 "REVIEWED in the derived projector", 2 tests; not in any CAR list; line 192 "retain replacement blocks only") is deleted whole. **Fix:** rewire or restore.

- **F9.** Scope of matrix enforcement and extra capabilities. See §2 (F9a, F9b).

- **F10a–c.** Leftovers. See §6.

- **F11. Session fail-closed lookup not tested.** Audit's conditional for `session-version.test.ts` (TB3.070) requires session revocation, inactive-account rejection, malformed-claim rejection and fail-closed lookup. Head covers revocation (`auth-flow.test.ts` "change-password revokes the user"), inactive (`"a deactivated user's existing session stops resolving"`), but no test that the viewer lookup fails closed on a DB error. Malformed-claim is N/A for DB session rows and should be recorded as N/A.

---

## Passing

- Typecheck, lint (0 errors), unit (1021), integration (265), root and frontend builds, migrations, both e2e postures, live proof (14/14), roles mutation, canvas untouched, no secrets, AGENTS.md clean at HEAD, sign-in / sign-out / wrong password / session export / `/api/v1` with and without session.

## Cleanup (done)

- Dev server (`next dev` :3663 and child processes) killed; ports 3660–3669 read back free.
- Database `app_pr05v` dropped (`DROP DATABASE` exit 0). Its connections were terminated first. No other database was touched.
- Scratch worktree `…/pr05v/wt` removed; `git worktree prune`; `git worktree list` shows no pr05v entry. Scratch mutation copy removed.
- PR worktree: `git status --short` empty except this report. No commits.
- Observed, not caused by this run: `app_pr03b` was present in `pg_database` at the start and absent at the end. This verifier never dropped it.

Scratch evidence: `/home/nexuslink/.hermes/cache/scratch/pr05v/` (`logs/`, `gates.tsv`, `guardtriage.json`, `reconcile2.txt`, `fcheck.py`, `logs/functional.json`).
