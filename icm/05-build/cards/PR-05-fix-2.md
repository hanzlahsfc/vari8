# PR-05 fix 2: close the last function findings

PR #69, branch `beta/pr-05-auth-api`, worktree `/home/nexuslink/vari8-worktrees/pr-05-auth-api`, head `bf93d2a`. Gate round 2 of 3.

Inputs (read all first):

- Function verify 2: `icm/05-build/reports/PR-05-verify-2.md` (FIX, F1 to F5). Untracked in your worktree.
- Security verify 2: `icm/05-build/reports/PR-05-secverify-2.md` (SHIP, 74/74, notes O1 and O3). Untracked in your worktree.
- Commit both reports first, as they are, with explicit pathspecs.

Do exactly these, each with a check that fails before your change and passes after:

1. **F1 env name.** `tests/integration/pr05-security.test.ts:357` asserts `AUTH_URL`, but the app prefers `BETTER_AUTH_URL` (`lib/auth/server.ts:174-176`) and `.env.example:21` sets `BETTER_AUTH_URL`. Make the test follow the app. The integration suite must pass with an environment built only from `.env.example` names (no `AUTH_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST` set).
2. **O3 conflicting aliases.** If both `BETTER_AUTH_URL` and `AUTH_URL` are set and differ (same for `BETTER_AUTH_SECRET` and `AUTH_SECRET`), every auth call answers 403 INVALID_ORIGIN today. Fail at startup instead, with an error naming both variables, in the same place the secret check lives. Document in `.env.example` that only the `BETTER_AUTH_*` names are supported and the `AUTH_*` aliases must be unset or equal.
3. **O1 no secret keeps the process alive.** Without a valid secret the server logs a refusal and answers 500 on every route, but `next start` keeps running with the port open (Next 16 catches the instrumentation error). In production, exit the process with a non-zero code after logging the refusal. Proof: `next start` with the secret unset, and again with a too-short secret, exits non-zero within 10 s and the port is free; with a valid secret it serves 200. Do not change dev or test behavior beyond what the check needs.
4. **F2 ledger.** `icm/05-build/reports/PR-05-test-reconciliation.md`: the password-reset-boundary rows (around `:159-163`) say "restored verbatim" for 11 titles that were rewritten. Mark them rewritten, with the invariant each still asserts. Add rows for the 4 touched files with GUARD blocks that have no row (the verify report names them). Counts must still reconcile.
5. **F3 STATUS.md.** Revert every change this PR makes to `docs/STATUS.md`, so `git diff origin/Vari8-Beta -- docs/STATUS.md` is empty. Lanes never write that file.
6. **Password rule cleanup (issue #3, owner rule already recorded).** In `docs/product-decisions.md` decision #23, remove the base clause that says there is no number requirement (lines around 107-108), so the decision reads: minimum 10 characters, at least one ASCII digit on every password-setting surface (invite setup, reset completion, change password), no other composition rule, sign-in performs no policy check. Add the same hint the invite and reset forms carry ("At least 10 characters and at least one digit (0-9).") to `app/signup/signup-form.tsx`. No change to `lib/password-policy.ts`.

Then: merge the latest `origin/Vari8-Beta` into your branch, resolve conflicts at the root cause, run `npm run index` and confirm `npm run index:check` exits 0, run every local check from the footer (typecheck, lint, test, test:integration with your own DB `app_pr05_fix2`, build, frontend build), push. Append a "Fix pass 2" section to `icm/05-build/reports/PR-05.md` with each item, the failing-before and passing-after evidence, and every command with its exit code. Update the PR body.

Known base defect not from this PR: TS2307 in `icm/05-build/evidence/PR-03b-verify-3/probes/` breaks typecheck and build until PR #75 merges. If it still blocks after the merge, say so in the report with the exact error and continue.

Follow `icm/05-build/cards/PIPELINE-FOOTER.md`. Never write `docs/STATUS.md` (item 5 only reverts this PR's own changes to it). Long commands in the background with logs; never block a tool call over 4 minutes. End with a clean worktree and every server stopped.
