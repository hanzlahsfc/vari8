# PR-05 build: Better Auth, versioned API and the ROLES table

Card slug `pr-05-auth-api`. Board `vari8`. Track Foundation. Depends on none. Builder: devin/swe-2-max, outside the graph. Issue #58.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-05-auth-api`, branch `beta/pr-05-auth-api` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_pr05` on 127.0.0.1:5433 user `app`; dev port 3728. May touch `db/`: yes (D34 schema writer).

## State

In flight outside the graph: issue #58, worktree `/home/nexuslink/vari8-worktrees/pr-05-auth-api`, branch `beta/pr-05-auth-api`, builder devin/swe-2-max. The orchestrator completes this card (`hermes kanban --board vari8 complete <id>`) when the builder exits with its PR open; the verify card then runs. The sections below are the program's acceptance contract for that PR.

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

## Backend orphans this PR disposes

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

## Files

- `auth.ts`
- `auth.config.ts`
- `lib/auth/**`
- `app/api/v1/**`
- `app/signup/**`
- `app/reset/**`
- `app/reset-request/**`
- `lib/mail/**`
- `docs/security/authorization-model.md`
- db/schema.prisma and one migration for the Better Auth tables
- tests: the PR-05 CUT-AT-REPLACE and REWIRE files from TEST-AUDIT, a table-driven roles test

## Build

- In flight outside the graph (Devin, kakashi gear, issue #58, card `PR-05`), started from `55a0f08`. D16a: Better Auth replaces Auth.js v5 with the Prisma adapter; Hanzlah's invite token store stays; reset links 60 minutes, single use; bearer plugin for API clients; refresh rotation is a later mobile issue.
- Sign-in, coach self-signup (D17), sign-out, reset, invite acceptance, session revocation on password change, inactive-account lockout, login rate limiting.
- `/api/v1` route helper: authenticate (cookie or bearer), resolve workspace and role, Zod-validate, call one service, typed JSON errors (D6). Reference route: the coach roster read.
- Delete what Better Auth replaces and its CUT-AT-REPLACE tests; keep the session-revocation, inactive-account, malformed-claim and fail-closed guarantees (TEST-AUDIT).
- Program additions checked by its verifier: the D15 capability table lives in one module with one table-driven test of every actor by every capability; `lib/auth/session.ts` keeps an exported session read that `lib/auth/viewer.ts` (PR-01) can call.

## Acceptance (you see)

- Scripted HTTP flow on a fresh database: sign-up, sign-in, wrong password refused, 11th rapid attempt rate limited, reset link reused refused, expired reset refused, session revoked after password change, bearer call to the reference route 200 for the coach, 403 for another workspace, 401 without credentials.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3728 against `app_pr05` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-05/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Table-driven roles test (every actor by every capability against the real server check) plus the preserved session and token guards.

## Report

Write `icm/05-build/reports/PR-05.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
