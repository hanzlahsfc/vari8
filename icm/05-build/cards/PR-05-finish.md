# PR-05 finish: integrate, push, open the PR (issue #58)

Your build commit `b1daefe` is local only. No branch has been pushed and no PR exists. Finish the pipeline in `/home/nexuslink/vari8-worktrees/pr-05-auth-api` on branch `beta/pr-05-auth-api`.

1. **Merge the latest `origin/Vari8-Beta` (`ea8f514`).**
   - It now contains PR-03a (#64), which deleted the VISIBLE and CUT tests from the same audit. Your CUT-AT-REPLACE deletions and trims overlap some of those files.
   - Resolve every conflict by the audit: `icm/03-plan/output/TEST-AUDIT.md`. A file deleted on either side stays deleted when the audit says so; GUARD blocks always survive.
   - Do not resurrect anything PR-03a removed.
2. **Contract checks.** The program lead wrote these after you started; make sure the branch satisfies them.
   - **Roles.** The capability matrix in `lib/auth/roles.ts` must match D15 and owner answer Q3 (`icm/03-plan/OWNER-ANSWERS-1018.md`): owner and coach are workspace staff and may edit a client's training plan; the client is self-scoped and may not edit their own plan. `tests/unit/roles.test.ts` must assert exactly that for every role and capability against the real server check.
   - **Session export for the canvas wiring (PR-01).** There must be one documented server function or `/api/v1` route that returns the current session (user id, workspace id, role, capabilities) so canvas screens can gate UI. If it is missing, add the minimum. Document it in your report.
3. **`AGENTS.md`.** Keep it reverted (no `nextjs-agent-rules` block).
4. **Re-run every gate after the merge, on your own DB `app_pr05` at 127.0.0.1:5433:**
   - typecheck
   - lint
   - unit
   - integration
   - build
   - `cd frontend && npm run build`
   - `node scripts/live-proof-pr05.mjs`
   - the kept e2e specs (`invite-acceptance`, `password-reset`)
5. **Update `icm/05-build/reports/PR-05.md`** with an "Integration" section: conflicts and how each was resolved, new gate numbers, and the session export.
6. **Commit with explicit pathspecs, then push and open the PR.**
   - Push: `git push -u origin beta/pr-05-auth-api`
   - Open: `gh pr create --repo hanzlahsfc/The-great-tracker- --base Vari8-Beta --head beta/pr-05-auth-api --title "PR-05: Better Auth + /api/v1 foundation (#58)"`
   - Use the report summary as the body, with "Closes #58".
   - Do not merge.
