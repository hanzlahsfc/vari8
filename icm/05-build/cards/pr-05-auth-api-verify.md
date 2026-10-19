# PR-05 verify: Better Auth, versioned API and the ROLES table

Card slug `pr-05-auth-api-verify`. Independent verifier on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-05-auth-api-verify` (local branch `beta/pr-05-auth-api-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-05/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-05-auth-api --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-05-auth-api-verify && git fetch origin && git checkout --detach origin/beta/pr-05-auth-api`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-05 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr05 LANE_PORT=3729 CARD=PR-05 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-05/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3729 with a fresh `app_verify_pr05` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-05/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-05/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-05/verdict.md`, where the first line is `SHIP PR-05 <head sha>` or `FIX PR-05 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr05`, leave the worktree clean.

## Acceptance to check

- Scripted HTTP flow on a fresh database: sign-up, sign-in, wrong password refused, 11th rapid attempt rate limited, reset link reused refused, expired reset refused, session revoked after password change, bearer call to the reference route 200 for the coach, 403 for another workspace, 401 without credentials.

## Program contract checks (each must PASS for SHIP)

- Roles table (D10 and owner answer Q3, written as D15): one module holds the complete capability table for every canvas surface (staff edit, clients read their own plans, D22 workspace-wide staff reads, R3-23 and R3-24 deny every cell), and one table-driven test runs every actor by every capability against the real server check with literal allow and deny. Name the module, the test file and its pass count; mutate one cell and show the test fails.
- Session export for PR-01: `lib/auth/session.ts` (or the module PR-05 names in its report) exports one server-side session read that returns user id, name, workspace and role without importing `next-auth` or Better Auth in the caller. Show the export signature and one call from a server component; `lib/auth/viewer.ts` in PR-01 builds on it.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-05` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- V2-H5: S07 ROLES: Coach library notes render in client training view
- V2-H12: S07 ROLES: Authorization docs conflict on client training-plan write path
- V3-CO01: S09 ROLES: Coach note shown in client-facing tracker field
- S11-24: S11 MISSING: Implied first coach/workspace bootstrap (canvas opens into a fully populated coaching workspace)
- S11-25: S11 UNCONFIGURED: Implied account recovery ("forgot password" on a real login)
- S11-26: S11 PARTIAL: Single implied coach role; canvas draws no owner/assistant/support distinction
- V3-CO05: S11 ROLES: Standalone tracker binds data to one named client without clientId
- V3-H4-05: S11 MISSING: No mail library; password reset pages return 404
- R3-23: ROLES ROLES: Platform-admin administrative, catalog and audit capability cells. No canvas console exists, so the owner decides the cells, not a new conso
- R3-24: ROLES ROLES: Assistant read-only and assigned-scope capability cells. The canvas draws no assistant persona.
- R3-25: ROLES ROLES: Does the workspace-wide canvas roster stand, or does an actor see assigned scope only?
- G6-504: PARKED-D12: Export, erasure and audit-log cells: no canvas surface, denied by D15.

## Backend orphans this PR owns (delete or keep as each line says)

- S12-01: Auth.js v5 route handler. Evidence: `app/api/auth/[...nextauth]/route.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-02: Login page + credentials action. Evidence: `app/login/page.tsx:7, app/login/actions.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-03: Logout action. Evidence: `app/logout/actions.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-04: Invitation acceptance page + action. Evidence: `app/invite/page.tsx:18, app/invite/actions.ts:1, app/invite/in (keep or replace per D16a; covered by the roles test)
- S12-05: Password reset request page + action. Evidence: `app/reset-request/page.tsx:18, app/reset-request/actions.ts:1 (keep or replace per D16a; covered by the roles test)
- S12-06: Password reset page + action. Evidence: `app/reset/page.tsx:21, app/reset/actions.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-07: Forbidden (403) boundary. Evidence: `app/forbidden.tsx:1`. (keep or replace per D16a; covered by the roles test)
- S12-34: Authorization guard (authorize/AccessDeniedError). Evidence: `lib/auth/guard.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-35: RBAC role/resource matrix. Evidence: `lib/auth/rbac.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-36: Route guard (requireSessionUser/requireWorkspaceAccess). Evidence: `lib/auth/route-guard.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-37: Session helpers. Evidence: `lib/auth/session.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-38: Password-reset service. Evidence: `lib/auth/password-reset.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-39: Password-reset route boundary. Evidence: `lib/auth/password-reset-boundary.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-40: Password-reset delivery port. Evidence: `lib/auth/password-reset-delivery.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-42: Credentials verification. Evidence: `lib/credentials.ts:3`. (keep or replace per D16a; covered by the roles test)
- S12-66: Password policy (15-char setup rules). Evidence: `lib/password-policy.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-67: Password hashing. Evidence: `lib/password.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-68: Sheet-viewer flag gate. Evidence: `lib/sheet-viewer.ts:7`. (keep or replace per D16a; covered by the roles test)
- S12-69: Access-token helpers. Evidence: `lib/tokens.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-70: Token hashing/crypto. Evidence: `lib/tokens/crypto.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-71: Token store (claim/inspect). Evidence: `lib/tokens/store.ts:1`. (keep or replace per D16a; covered by the roles test)
- S12-72: Prisma authorization repo. Evidence: `lib/workspace/access.ts:9`. (keep or replace per D16a; covered by the roles test)

## TEST-AUDIT actions this PR executes

- `tests/integration/checkin-feedback-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/checkin-overview-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/checkin-recurrence-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/client-tasks.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/dashboard-layout.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/habits.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/i4-next-checkin.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/mealplan-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p008-onboarding-actions.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p008-onboarding-forms.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p010-client-roster.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p024-onboarding-review.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025a-checkin-actions.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025a-checkin-forms.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025b-checkin-instances.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025c-checkin-review.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025d6-checkin-tracker-context.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/phase-1-1-daily-tracker-guard.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-b-authorization.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-c-client-assignments.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-f2c-invitations.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-g-export.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-h-route-guard.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/solo-coach-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/training-i1a.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/client-setup-rbac.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/guard.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/rbac.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/checkin-review-queue.test.ts`: REWIRE in PR-05. Blocks TB2.048, TB2.049, TB2.051.
- `tests/unit/client-setup-actions.test.ts`: REWIRE in PR-05. Blocks TB2.058, TB2.059.
- `tests/unit/client-setup-transition-actions.test.ts`: REWIRE in PR-05. Blocks TB2.060.
- `tests/unit/clients-service.test.ts`: REWIRE in PR-05. Blocks TB1.028, TB1.029, TB1.030, TB1.033, TB1.034.
- `tests/unit/coach-assignments-actions.test.ts`: REWIRE in PR-05. Blocks TB2.063.
- `tests/unit/coaching-actions.test.ts`: REWIRE in PR-05. Blocks TB3.032.
- `tests/unit/coaching-boundary.test.ts`: REWIRE in PR-05. Blocks TB1.038.
- `tests/unit/invitations.test.ts`: REWIRE in PR-05. Blocks TB1.048, TB1.049.
- `tests/unit/onboarding-actions.test.ts`: REWIRE in PR-05. Blocks TB3.041, TB3.042, TB3.043.
- `tests/unit/onboarding-assignments-actions.test.ts`: REWIRE in PR-05. Blocks TB3.045.
- `tests/unit/onboarding-assignments-boundary.test.ts`: REWIRE in PR-05. Blocks TB3.046, TB3.047, TB3.048.
- `tests/unit/onboarding-forms-boundary.test.ts`: REWIRE in PR-05. Blocks TB3.052, TB3.053.
- `tests/unit/route-guard.test.ts`: REWIRE in PR-05. Blocks TB1.068.
- `tests/unit/session-version.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Blocks TB3.070.
- `tests/unit/transition-review.test.ts`: REWIRE in PR-05. Blocks TB1.076, TB1.077.
- `tests/integration/p013-onboarding-assignments.test.ts`: REWIRE in PR-05. Blocks TB2.016, TB2.021.
- `tests/integration/p014-coaching-templates.test.ts`: REWIRE in PR-05. Blocks TB0.037, TB0.038, TB0.039, TB0.041, TB0.042.
- `tests/integration/p020b-template-transitions.test.ts`: REWIRE in PR-05. Blocks TB3.008, TB3.009.
- `tests/integration/p021-daily-entry.test.ts`: REWIRE in PR-05. Blocks TB1.011.
- `tests/integration/p023-onboarding-submission.test.ts`: REWIRE in PR-05. Blocks TB0.050, TB0.053, TB0.055.
- `tests/integration/p025d2-checkin-calendar.test.ts`: REWIRE in PR-05. Blocks TB2.024.
- `tests/integration/phase-3-1-invite-acceptance.test.ts`: REWIRE in PR-05. Blocks TB1.014.
- `tests/integration/s1-e-audit.test.ts`: REWIRE in PR-05. Blocks TB1.016.
- `tests/integration/s1-f2b-account-audit.test.ts`: REWIRE in PR-05. Blocks TB3.017.
- `tests/integration/s1-f2b-session-runtime.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Blocks TB1.020.
- `tests/integration/s1-f2b-session.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Blocks TB1.021.
- `tests/e2e/invite-acceptance.spec.ts`: REWIRE in PR-05. Retained GUARD flow cases only.
- `tests/e2e/password-reset.spec.ts`: REWIRE in PR-05 if AUTH changes the session implementation. Retained GUARD flow cases only.
- `tests/integration/s1-f2d-password-reset.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Block TB0.093 retains the password-reset and session-revocation contracts; replace only library-specific session setup

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-002: Login works with a plus sign in the email (PARTIAL): baseline owner
- PR-003: Password reset links expire and work once (PARTIAL): baseline owner
- PR-005: Session timeout and kill all sessions (PARTIAL): baseline owner
- PR-013: Rate limits on login (MISSING): baseline owner
- PR-009: Roles deeper than admin and everyone else (MISSING): baseline owner
- PR-010: No IDOR: user A cannot read user B by changing an id (PARTIAL): baseline owner
- PR-011: Tenant isolation (PARTIAL): baseline owner
- PR-023: Server-side validation (PARTIAL): baseline owner
- PR-041: OWASP protections: SQL injection, XSS, CSRF and the rest (PARTIAL): every write behind the v1 boundary with Zod, CSRF from Better Auth; the security verifier runs a scan
- PR-092: End-to-end tests for money flows (PARTIAL): baseline owner
