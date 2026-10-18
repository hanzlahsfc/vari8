# Test audit judge brief (J-TA)

You are the judge. You did not produce any of the inputs. Judge claim by claim from source and from the owner rules, never by lane or model. Output: `icm/03-plan/output/TEST-AUDIT.md`, the single list PR-03 and the builders follow.

All paths under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/` unless absolute. Read first: `AGENTS.md` (ICM lanes rule), `icm/03-plan/DECISIONS.md` (D10 ROLES, D11, D12 consent parked, D13 no GitHub CI, D14 keep by value and CUT-AT-REPLACE), `icm/03-plan/output/TA/JUDGE-NOTES.md` (all items), `icm/03-plan/output/PLAN.md` (PR ids).

## Inputs

- Pass 1, file level: `icm/03-plan/output/TA/TA-U00.md`, `TA-U01.md`, `TA-U02.md`, `I00.md`, `TA-I01.md`, `TA-CE.md` (canvas tests and the 47 e2e specs). Ignore `TA-I01.luna-rejected.md`.
- Pass 2, block level: `icm/03-plan/output/TA/TB0.md` to `TB4.md` (worker files `TB*-w*.md` beside them). These cover every pass-1 KEEP and MERGE file.
- Source, read-only: `/home/nexuslink/vari8-worktrees/merge-proto` at `58eb6ed`.

## Method

1. Start from pass 2. For every KEEP block assign one tag:
   - GUARD: breaks a browser walk would not show. Workspace isolation, assigned-coach scoping, validation at trust boundaries, tokens and passwords, dates and timezones, calculations a person would not check by eye, data integrity (transactions, concurrent writes, uniqueness, constraints).
   - VISIBLE: anything a browser walk shows: layout and size limits, labels and copy, what a component renders, navigation, flag-driven visibility of UI. CUT even if it bites.
   - CUT-AT-REPLACE: tests code an owner decision replaces. Every test of today's permission model (`lib/auth/rbac.ts`, `lib/auth/guard.ts`, `authorize`, `resolveScope`, `docs/security/authorization-model.md`) since permissions are redefined from scratch (D10). Auth-library internals if the `AUTH` decision replaces them. Consent and health-data rules (D12). Name the PR that deletes it, from `PLAN.md`.
2. REWIRE list: GUARD blocks that call the old permission code only as setup (to get a scope or session before testing something else). List them with the PR that must rewire them onto the new model.
3. Files with a hardcoded `/Users/apple/...` source path that skip everywhere else: CUT.
4. e2e (47 specs, `TA-CE.md`): the 41 old-UI specs are CUT in PR-03 (owner, D13 context). For the kept auth, invite and password-reset flows, decide GUARD or CUT-AT-REPLACE given the `AUTH` decision.
5. Spot-check the producers in a scratch worktree (never the root checkout; `git -C /home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8 worktree add --detach /home/nexuslink/.hermes/cache/scratch/vari8-jta 58eb6ed`, `npm ci`, `npx prisma generate`; integration files need `createdb -U app app_jta` in container `vari8-db-1` on port 5433). Per TB lane: re-run 2 KEEP mutations and re-read 2 CUT calls. Also try one harder mutation of your own per lane on a GUARD block (the change a careless builder would make). Record each. Remove the worktree and drop the database at the end.

## Output `icm/03-plan/output/TEST-AUDIT.md` (write incrementally)

1. First line: `STATUS: AWAITING OWNER APPROVAL`.
2. Summary table: files, blocks, tests, lines per final tag (GUARD, VISIBLE, CUT-AT-REPLACE, CUT pass 1, CUT pass 2, e2e CUT), with the arithmetic from the 232-file total. State the share kept as GUARD.
3. Per-file action list, one line each: `KEEP-ALL`, `TRIM (keep blocks ...)`, `CUT-FILE`, `CUT-AT-REPLACE in PR-xx`, plus `REWIRE in PR-xx` where it applies. PR-03 deletes everything tagged CUT-FILE, VISIBLE, CUT pass 1 or 2, and e2e CUT.
4. GUARD inventory grouped by category, so builders know what kind of test is welcome.
5. Spot-check table: lane, block, check, result.
6. The local gate (D13): the exact commands, in order, that the verifier runs per PR, and when integration tests run (only when `db/`, `lib/` or `app/api/` changed).
7. `## Self-check`: PASS or FAIL with evidence for (a) every pass-2 block tagged (count per lane reconciles), (b) every pass-1 file has a final action (232), (c) spot checks done per lane, (d) worktree and database removed, (e) only `TEST-AUDIT.md` written.

Plain English, no long dashes. Never commit, push or edit a tracked file.
