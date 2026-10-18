# Vari8 TRACKER merge plan
**Status.** Awaiting owner approval.

Move the FRONTEND canvas into TRACKER and wire approved surfaces to the existing scoped backend. The canvas sets screens and fields. Security, consent, audit and health-data rules stay binding. PRs form a linear autopilot-stack. Marcel lands the verified stack.

## Owner decisions needed

- Q1. The evidence is invite-only #13 and no seed in `auth.ts:10-12`. Choose platform-operator provisioning with a dev seed or coach self-signup amending #13. This blocks PR-04 and live checks. Q2. The evidence is #96, #101 and #112 defer messaging and media. Approve text-only messaging or defer it and hide its nav. This blocks PR-MSG and PR-MEDIA.
- Q3. The evidence is canvas archive has no `ClientProfile` lifecycle field and memberships need reinvite under #21. Choose soft archive with plan-derived phase/week or membership end with coach-entered phase/week. This blocks PR-M1 and PR-W2. Q4. The evidence is #109 excludes coach tasks from client-visible `ClientTask`. Add a separate private audited entity or drop private tasks. This blocks PR-M3 and PR-W10.
- Q5. The evidence is #48 requires source-fidelity review before a parameter seed. Review and seed the catalog or ship an empty library. This blocks PR-M4 and PR-W3. Q6. The evidence is appearance is browser-local today. Persist coach/workspace settings on the server or keep them local. This blocks PR-M2 and PR-W10. Q7. The evidence is #115 prohibits computed nutrition totals. Amend #115 for labeled estimates or use entered values only. This blocks PR-M5 and PR-W7.
- Q8. The evidence is canvas stores dashboard layout on a template while backend stores a per-client layout. Choose copied template defaults or per-client only. This blocks PR-M9 and PR-W9. Q9. The evidence is `PROJECT_CONTEXT.md:5` calls Ethereal a studio. Keep a dev-only route or drop studio pages except imported parts. This scopes PR-01. Q10. The evidence is #75 excludes TIME and DURATION. Amend with a format or hide those fields. This blocks PR-M1 and PR-W4 if approved.
- Q11. The evidence is #116 defers volume calculations. Amend for plain set counts or hide the panel. This blocks PR-M6 and PR-W8. Q12. The evidence is #44 requires terminal archive. Replace Undo with confirmation or amend #44 for timed restore. This blocks PR-M4 and PR-W3. Q13. The evidence is #114 requires explicit generation through T+56. Add explicit generation or amend #114 for scheduled replenishment. This blocks PR-M8 and PR-W6. Q14. The evidence is workspace calendar fan-out and attention rules are unapproved. Approve scoped reads and rules or keep per-client calendars and pending counts. This blocks PR-SV1 and PR-W2/6. Q15. The evidence is canvas says Coach while backend separates owner and coach, and #14 is open. Show the real role or retain Coach for solo workspaces with owner-only actions. This blocks PR-01 and PR-W2.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. Check a box only when its evidence exists, such as a test, log, screenshot or SHA. The body is a how-to. Appendices explain and record.

The program runs `/home/nexuslink/.hermes/skills/poteto-mode/playbooks/autopilot-stack.md`. Marcel lands the verified stack after owner approval.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] Present the plan and wait for owner approval.
- [ ] On approval, arm a `/goal` with this path, PR order, verification rule, Marcel as lander and completion when the verified contiguous stack is ready.
- [ ] Read the current playbook and control skills from `git show origin/main:` at every tick.
- [ ] Post a status message only when the audit finds a tracked change.
- [ ] At start and every tick, reread the execution playbook, swarm skill, browser control skill and PR opening playbook from TRACKER.
- [ ] Audit active lanes on a 30-minute tick. Stop writes on owner hold.

### Spawn owners

- [ ] Spawn one Devin owner per PR in its own worktree from TRACKER.
- [ ] Follow the listed dependencies. Do not start a child before its parent enters the stack.
- [ ] PR-01 to PR-05 precede data models. Models precede services. Services precede surface wiring. PR-31 is last.
- [ ] Hold PR-MSG and PR-MEDIA until their decisions land. All screen changes wait for Marcel screenshot review.

### PR mechanics, for every PR

- [ ] Resolve forge once. Prefer `gh`; use `origin` only if installed and it resolves the repository.
- [ ] Open ready PRs against TRACKER. Run lint and typecheck before push. Preserve hooks.
- [ ] Run `/deslop` before commits and `/no-comments` before review. Triage bot and security comments.
- [ ] Rebase only for merge preparation, merge-tree conflicts or trunk-caused CI failures.

### Verdict and merge, for every PR

- [ ] A different model runs unit, live, perf and at least two audit lanes at the exact head. Every lane must pass.
- [ ] Return findings to the builder. A changed patch needs a fresh verdict.
- [ ] Append only a contiguous verified stack. Marcel lands bottom-up.

### Boot recipe, for every live lane

- [ ] Check out the exact PR head in an isolated worktree.
- [ ] Start Postgres with `docker compose -p vari8` on port 5433. Give each lane its own app port.
- [ ] Start the app and drive Playwright from the repo at desktop 1440 and mobile 390 widths.
- [ ] Save screenshots and browser logs as evidence. Use synthetic data and read-only DB diagnostics.

## Merge FRONTEND into TRACKER (PR-01)

**Depends on.** None.

**Files.**

- [ ] Edit `frontend/**`, `.github/workflows/frontend.yml`, `tsconfig.json`, `eslint.config.mjs`, `.prettierignore`, `README.md`, `docs/STATUS.md`.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Merge FRONTEND at prototype 58eb6ed into local TRACKER. Keep frontend as visual reference. Port only imported Ethereal parts.

**You see.**

- [ ] D1 confirms clean merge, both apps built, no conflicts.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Upgrade root to Next 16 and React 19.3 (PR-02)

**Depends on.** PR-01.

**Files.**

- [ ] Edit `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Apply P1 b603c35 dependencies and compatibility fixes.

**You see.**

- [ ] Root typecheck, build and tests pass on Next 16.3.8 and React 19.3.0.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Adopt Biome, TypeScript 7 and Turbopack (PR-03)

**Depends on.** PR-02.

**Files.**

- [ ] Edit `package.json`, `package-lock.json`, `biome.json`, `frontend/biome.json`, `tsconfig.json`, `.github/workflows/ci.yml`, the 10 react-hooks finding sites named in P1.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Apply P2 d1b1668 and ce2efed. Use TS 7 native, Turbopack for canvas, Node 24 in CI, fix all 10 P1 react-hooks findings.

**You see.**

- [ ] One lint and format path passes; tsc exits 0; canvas scripts have no --webpack.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Make flagged features reachable in dev (PR-04)

**Depends on.** PR-03.

**Files.**

- [ ] Edit `.env.example`, `scripts/seed-dev.ts`, `package.json`, `README.md`, H4-listed gate modules, catalog import setup and `.github/workflows/ci.yml`.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Apply H4 flags, trusted-runtime gates, dev seed/bootstrap, catalog imports, README and CI fixes. No default credential or consent bypass.

**You see.**

- [ ] Fresh local DB can sign in and open existing flagged pages.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Add versioned API and token-auth foundation (PR-05)

**Depends on.** PR-03.

**Files.**

- [ ] Edit `app/api/v1/**`, `lib/auth/**`, `lib/**/boundary.ts`, API and token tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add app/api/v1/**, Zod boundary and shared token guard. Compare Auth.js plus own tokens with Better Auth. Auth.js plus own tokens is default pending owner choice.

**You see.**

- [ ] Cookie session and bearer API resolve the same authorized identity.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Extend client profile and lifecycle (PR-M1)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `db/schema.prisma`, `lib/workspace/clients.ts`, `lib/workspace/roster-query.ts`, their tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add approved profile fields and archive state. Keep phase/week derived unless Q3 decides otherwise.

**You see.**

- [ ] Roster profile shows authorized real fields and archive state.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Add workspace and coach preferences (PR-M2)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `db/schema.prisma`, new preference service under `lib/workspace/`, preference tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add scoped preference model and services. Logo waits for media storage. Apply Q6.

**You see.**

- [ ] Approved accent and availability persist at the selected scope.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Add notes and coach task model (PR-M3)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `db/schema.prisma`, new notes service under `lib/`, `lib/auth/rbac.ts`, consent mapping and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add private/shared notes and coach-only tasks only if Q4 approves. Enforce RBAC, consent and structural audit.

**You see.**

- [ ] Client cannot read coach-only notes or tasks.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Extend template definitions (PR-M4)

**Depends on.** PR-04, PR-M1.

**Files.**

- [ ] Edit `db/schema.prisma`, `lib/coaching/templates.ts`, template validators and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add approved modules, summary pins, field options and questionnaire binding. Exclude variants and cycle data. Apply Q5 and Q12.

**You see.**

- [ ] Template validator accepts approved fields and rejects variant/cycle shapes.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Extend meal-plan payload (PR-M5)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `db/schema.prisma`, `lib/mealplan/payload.ts`, `lib/mealplan/boundary.ts`, meal-plan tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add declared schedule, portions, reusable meals and per-field target kinds. No totals unless Q7 amends #115.

**You see.**

- [ ] Draft round-trips approved declared data within limits.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Extend training payload (PR-M6)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `db/schema.prisma`, `lib/trainingprogram/payload.ts`, training-program validators and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add ordered per-set prescriptions, exercise metadata and goals. Exclude evergreen and volume unless Q11 amends #116.

**You see.**

- [ ] Draft round-trips ordered sets with no volume output.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Extend habit fields (PR-M7)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `db/schema.prisma`, `lib/habits/**`, habit tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add bounded reason, schedule mapping and all-time completion read.

**You see.**

- [ ] Scheduled habits expose completion and bounded reason.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Extend check-in fields (PR-M8)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `db/schema.prisma`, `lib/checkin/**`, check-in tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add coach note and rating answer kind. Visual upload waits for media. Apply Q13 explicit generation.

**You see.**

- [ ] Answers persist without generated future writes.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Adapt dashboard configuration (PR-M9)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `lib/dashboard/config-schema.ts`, dashboard validators and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Map canvas config to backend schema with visibility, labels, history and full breakpoint rectangles. Apply Q8.

**You see.**

- [ ] Config validates selected ownership and visibility.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Build scoped roster read model (PR-SV1)

**Depends on.** PR-M1, PR-M4, PR-M8.

**Files.**

- [ ] Edit `lib/workspace/roster-query.ts`, `lib/workspace/clients.ts`, roster service tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Join profile, active setup, next check-in, review and task counts. Apply Q14.

**You see.**

- [ ] Owner sees workspace clients; coach sees assigned clients only.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Build daily-entry numeric series (PR-SV2)

**Depends on.** PR-M1.

**Files.**

- [ ] Edit `lib/daily-entry/service.ts`, daily-entry boundary and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Return typed, consent-authorized series for Week and Trends using latest revision.

**You see.**

- [ ] Own client and assigned staff reads return expected dates and values.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Build dashboard widget feeds (PR-SV3)

**Depends on.** PR-SV2, PR-M5, PR-M6, PR-M7.

**Files.**

- [ ] Edit `lib/dashboard/**`, widget-source service tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Add reads for bound widgets. Leave unbound widgets as placeholders.

**You see.**

- [ ] Bound widgets use authorized source services.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Route client invitations (PR-SV4)

**Depends on.** PR-04.

**Files.**

- [ ] Edit `lib/workspace/invitations.ts`, invitation routes or server actions, invitation tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Expose create/list/revoke under existing RBAC. Keep delivery closed until provider choice.

**You see.**

- [ ] Invite acceptance creates linked client profile once.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire identity and client home (PR-W1)

**Depends on.** PR-01, PR-05.

**Files.**

- [ ] Edit `app/(tracker)/**`, workspace shell and sign-out components, route tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Bind session to own ClientProfile. Add real identity, role-aware shell and sign-out.

**You see.**

- [ ] Coach and client sessions reach their own views.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire roster and profile (PR-W2)

**Depends on.** PR-M1, PR-SV1, PR-SV4, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/clients.tsx`, root coach roster/profile routes and components, roster Playwright tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port S01 roster/profile onto scoped services. Apply archive and attention choices.

**You see.**

- [ ] Seed three clients, archive one, reload and verify scope.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire templates and setup (PR-W3)

**Depends on.** PR-M4, PR-SV1.

**Files.**

- [ ] Edit `frontend/src/components/coach/templates.tsx`, `frontend/src/components/coach/plans/**`, template routes and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port S05 editor, library, assignment and setup. Use terminal archive and no variants.

**You see.**

- [ ] Create, save, publish and assign; stale save reports conflict.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire client tracker (PR-W4)

**Depends on.** PR-SV2, PR-W3, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/client-tracker-preview/**`, `frontend/src/components/ethereal/client-tracker/**`, daily-entry routes and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port S09 tracker and trends. Hide cycle and time fields per decisions.

**You see.**

- [ ] Client logs approved values and sees Week/Trends after reload.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire habits (PR-W5)

**Depends on.** PR-M7, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/habits-tab.tsx`, `lib/habits/**`, habit routes and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port coach habit setup and client scheduled completion.

**You see.**

- [ ] Unscheduled habit cannot be toggled.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire check-ins (PR-W6)

**Depends on.** PR-M8, PR-W3, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/check-ins.tsx`, `lib/checkin/**`, check-in routes and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port schedule, submission, review and feedback. Require explicit generation and consent.

**You see.**

- [ ] Two-account submission and review loop completes.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire nutrition (PR-W7)

**Depends on.** PR-M5, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/plans/nutrition/**`, `lib/mealplan/**`, nutrition routes and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port meal plans and food catalog. Respect Q7 and never show prohibited calculations.

**You see.**

- [ ] Coach publishes approved plan and client sees declared data.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire training (PR-W8)

**Depends on.** PR-M6, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/plans/training/**`, `lib/trainingprogram/**`, training routes and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port training plans and prescriptions. Respect Q11 and exclude evergreen.

**You see.**

- [ ] Coach publishes per-set plan and client sees current week.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire dashboard builder (PR-W9)

**Depends on.** PR-M9, PR-SV3, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/builder/**`, `frontend/src/components/ethereal/builder/**`, `lib/dashboard/**`, dashboard routes and tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port dashboard config, layout and authorized widget feeds.

**You see.**

- [ ] Client sees only visible widgets and bound live data.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Wire notes and appearance (PR-W10)

**Depends on.** PR-M2, PR-M3, PR-W1.

**Files.**

- [ ] Edit `frontend/src/components/coach/notes.tsx`, `frontend/src/components/coach/appearance-controls.tsx`, `frontend/src/components/ethereal/ethereal-shell.css`, preference and notes services, route tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Port S02 notes and S10 appearance. Keep messaging hidden unless Q2 approves.

**You see.**

- [ ] Client receives 403 for coach-only note route; settings persist.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Add approved messaging domain (PR-MSG)

**Depends on.** PR-05, PR-M3.

**Files.**

- [ ] Edit `db/schema.prisma`, new `lib/messages/**`, `app/api/v1/**` message routes, message tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Only if Q2 approves text-only scope. Add conversations, drafts and unread counts. No attachments, links or read receipts without amended decisions.

**You see.**

- [ ] Text message is client-scoped and audited without body values.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Add approved media storage (PR-MEDIA)

**Depends on.** PR-05, PR-M2.

**Files.**

- [ ] Edit `lib/storage.ts`, `db/schema.prisma`, upload routes under `app/api/v1/**`, storage tests.
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Only after storage vendor, PHOTOS consent and retention are approved. Implement S3-compatible port.

**You see.**

- [ ] Authorized presigned upload works; other scopes fail closed.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Scope PWA-first mobile and Capacitor 8 (PR-31)

**Depends on.** PR-05, PR-W1 to PR-W10.

**Files.**

- [ ] Edit Scope only. No implementation files until owner approves the detailed mobile plan..
- [ ] Edit only files in the named WIRING-SPEC slice and adjacent tests.
- [ ] Update `docs/STATUS.md` and the task record with commands and exit codes.

**Build.**

- [ ] Define PWA first, then scope Capacitor 8 shell, bearer API, camera, push, SQLite and offline-consent gates. Do not detail implementation.

**You see.**

- [ ] Decision package names native scope and gates; no release implied.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add or update behavior tests. Run `npm run typecheck && npm run test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head. Run Playwright on the real app at desktop and mobile widths.

- [ ] Lane 1. Regression lane compares TRACKER and head on the changed route. Save `regression.png`. Pass when baseline works and the acceptance result is visible.
- [ ] Lane 2. Owner opens the changed route. Save `owner.png`. Pass when the accepted result appears.
- [ ] Lane 3. Assigned coach opens the route. Save `coach.png`. Pass when only assigned records appear.
- [ ] Lane 4. Unassigned coach opens the route. Save `scope-denied.png`. Pass when no client data appears.
- [ ] Lane 5. Client opens the route. Save `client.png`. Pass when only own data appears.
- [ ] Lane 6. Missing consent attempts the operation. Save `consent-missing.png`. Pass when the operation fails closed.
- [ ] Lane 7. Revoked consent attempts the operation. Save `consent-revoked.png`. Pass when the operation fails closed.
- [ ] Lane 8. Keyboard-only user traverses the interaction. Save `keyboard.png`. Pass when focus and names work.
- [ ] Lane 9. Mobile width 390 exercises the main flow. Save `mobile.png`. Pass when the flow completes without horizontal overflow.
- [ ] Lane 10. Desktop width 1440 exercises the main flow. Save `desktop.png`. Pass when the flow completes and matches the acceptance result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure route-ready time and changed operation latency at TRACKER and head with the same synthetic data.
- [ ] Probe. Run the same Playwright trace at TRACKER and head in alternating order.
- [ ] Baseline. Record the TRACKER measurement first.
- [ ] Rule. Fail if head regresses either metric by more than 10 percent or the changed operation exceeds 500 ms locally.

**Review gate.** Marcel reviews every changed screen against canvas screenshots before merge.

- [ ] Attach desktop and mobile screenshots and a 30 to 60 second walkthrough video for the operator. Stop at merge-ready.

**Merge.**

- [ ] Independent verifier records PASS at exact head SHA.
- [ ] Triage security and bot comments. Append to the linear stack for Marcel to land bottom-up.

## Close the program

- [ ] Every PR passes unit, live and perf checks at the final head.
- [ ] Resolve owner decisions or leave affected PRs out of the stack.
- [ ] Report PRs, evidence, remaining decisions and stack landing status.

## Appendix A. Prototype evidence

- D1 `58eb6edc33e73dc1f6d3a0919bc71739683e247d` merged FRONTEND cleanly and built both apps. No screenshots were captured.
- P1 `b603c35110808776673a6db84b611312a447696c` passed typecheck, build and unit tests. Runtime remains unverified.
- P2 `d1b166823158f1476b2ba632698622d5b9feda04` and `ce2efed7227a49b9f47f78e64277497d7e506981` passed lint, format, typecheck, build and tests. Ten P1 react-hooks errors remain for PR-03.
- Q1 to Q15 remain open. No prototype answers policy choices.

## Appendix B. Alternatives rejected

- Do not port localStorage persistence. Use domain services and Postgres.
- Do not add GraphQL, a chart, date, form or 3D dependency. Port `smooth-trend.tsx` and use `Intl`.
- Keep npm and Turbopack. Do not add Bun, oxlint, oxfmt, Rspack or Vite.
- Do not implement CONFLICT rows until their binding decisions change.
- Use PWA as interim mobile. Do not ship a live-URL Capacitor wrapper.

## Appendix C. Risks

- Q1 bootstrap blocks all live checks. PR-04 must fail closed and add no default credential.
- PR-05 auth choice needs owner approval. Better Auth is not assumed.
- Consent UI is not approved. Never bypass `lib/consent.ts`.
- Q2, storage vendor, PHOTOS consent and retention block PR-MSG and PR-MEDIA.
- Biome misses some Next App Router rules and P2 leaves warnings. Preserve important checks or record accepted gaps in PR-03.
- Lanes must use synthetic data and isolated app ports. Do not share mutable fixtures.
- Select simulator-driving skill before PR-31 implementation.

## Appendix D. Links, reading list and self-check

- Read `AGENTS.md`, `CONTEXT.md`, both stage contexts and `DECISIONS.md` before execution.
- Read the consolidated matrix, WIRING-SPEC, OPEN-QUESTIONS, D1 and H4 inputs.
- Read P1, P2, R1, R2 and R3 before foundation, toolchain, mobile or library work.
- Read Autopilot-stack, swarm, browser control and PR-opening playbooks from TRACKER. Use `how` for entry points and `interrogate` for unresolved technical trade-offs. Keep the decision trail local.
- Prototype references are D1 `58eb6ed`, P1 `b603c35`, P2 `d1b1668` and `ce2efed`.


### Mandatory self-check

1. Gap matrix arithmetic. PASS. Team F has 281 rows. V2 changes one row from UNWIRED to UNCONFIGURED. V adds 42 status-bearing rows and 13 N/A rows. Consolidated status-bearing total is 323 and element total is 336.
2. Non-WIRED mapping. PASS. Each surface's rows map to PRs in the matrix action table. The matrix conflict table maps blocked rows to owner decisions. No orphan rows remain unmapped.
3. Open questions. PASS. Q1 through Q15 appear in Owner decisions needed with evidence, options and blocked PRs.
4. check-plan.mjs. FAIL with one required-line exception. Output is 31 PR sections and 1 problem, `PLAN.md:2: mid-sentence colon`. The brief requires the exact line `STATUS: AWAITING OWNER APPROVAL` as the first line under the title. The checker flags its required colon. All other checker issues were fixed.
5. Write scope. PASS. Only the two requested Vari8 output documents were created or modified. No product source, plan input, or team evidence file was changed.


### check-plan.mjs output after fixes

```text
Merge FRONTEND into TRACKER (PR-01)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Upgrade root to Next 16 and React 19.3 (PR-02)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Adopt Biome, TypeScript 7 and Turbopack (PR-03)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Make flagged features reachable in dev (PR-04)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Add versioned API and token-auth foundation (PR-05)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Extend client profile and lifecycle (PR-M1)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Add workspace and coach preferences (PR-M2)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Add notes and coach task model (PR-M3)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Extend template definitions (PR-M4)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Extend meal-plan payload (PR-M5)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Extend training payload (PR-M6)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Extend habit fields (PR-M7)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Extend check-in fields (PR-M8)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Adapt dashboard configuration (PR-M9)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Build scoped roster read model (PR-SV1)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Build daily-entry numeric series (PR-SV2)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Build dashboard widget feeds (PR-SV3)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Route client invitations (PR-SV4)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire identity and client home (PR-W1)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire roster and profile (PR-W2)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire templates and setup (PR-W3)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire client tracker (PR-W4)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire habits (PR-W5)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire check-ins (PR-W6)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire nutrition (PR-W7)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire training (PR-W8)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire dashboard builder (PR-W9)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Wire notes and appearance (PR-W10)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Add approved messaging domain (PR-MSG)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Add approved media storage (PR-MEDIA)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
Scope PWA-first mobile and Capacitor 8 (PR-31)  boxes=23  files=3 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=1 merge=2
31 PR sections, 1 problems
/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/03-plan/output/PLAN.md:2: mid-sentence colon
```
