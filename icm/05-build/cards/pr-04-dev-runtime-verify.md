# PR-04 verify: Make the backend reachable in dev and park the consent gates

Card slug `pr-04-dev-runtime-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-04-dev-runtime-verify` (local branch `beta/pr-04-dev-runtime-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-04/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-04-dev-runtime --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-04-dev-runtime-verify && git fetch origin && git checkout --detach origin/beta/pr-04-dev-runtime`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-04 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr04 LANE_PORT=3714 CARD=PR-04 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-04/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3714 with a fresh `app_verify_pr04` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-04/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-04/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-04/verdict.md`, where the first line is `SHIP PR-04 <head sha>` or `FIX PR-04 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr04`, leave the worktree clean.

## Acceptance to check

- A fresh database signs in as the seeded owner and opens every existing flagged page (clients, review queue, a client's meal plan, training program, dashboard, daily) instead of 404 or forbidden.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-04` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S08-37: S08 UNCONFIGURED: ENABLE_CLIENT_DASHBOARD flag runtime; gates the whole surface (builder entry + client render)
- V3-H4-04: S11 MISSING: No workspace or owner bootstrap
- V3-H4-02: S11 CONFLICT: Runtime-gate gap on exact-1 flags
- V3-H4-03: CONFLICT (S11): No route may grant consent; the assertion fails closed. Parked behind `ENABLE_CONSENT_GATES` (D19).
- S11-23: UNCONFIGURED (S11): Implied consent step. None is required of the canvas (D19).
- G6-102: PARKED-D12: Sensitive consent kinds and grant sources stay in the schema, unextended.

## Backend orphans this PR owns (delete or keep as each line says)

- S12-22: ConsentRecord model. Evidence: `db/schema.prisma:355`. (parked behind ENABLE_CONSENT_GATES, not extended (D19))
- S12-41: Versioned consent service + gates. Evidence: `lib/consent.ts:14`. (parked behind ENABLE_CONSENT_GATES, not extended (D19))
- S12-44: Extraction contracts (sheet artifact types). Evidence: `lib/extraction/contracts.ts:1`. (keep; imported by the catalog importers that seed the catalogs (not R1 work))
- S12-46: Extraction CSS parsing. Evidence: `lib/extraction/css.ts:1`. (keep; imported by the catalog importers that seed the catalogs (not R1 work))
- S12-47: Extraction database parsing. Evidence: `lib/extraction/databases.ts:1`. (keep; imported by the catalog importers that seed the catalogs (not R1 work))
- S12-48: Extraction normalize. Evidence: `lib/extraction/normalize.ts:1`. (keep; imported by the catalog importers that seed the catalogs (not R1 work))
- S12-49: Extraction parse. Evidence: `lib/extraction/parse.ts:1`. (keep; imported by the catalog importers that seed the catalogs (not R1 work))
- S12-54: GDPR boundary (fails closed). Evidence: `lib/gdpr.ts:1`. (parked behind ENABLE_CONSENT_GATES, not extended (D19))
- S12-55: GDPR allowlist export. Evidence: `lib/gdpr/export.ts:1`. (parked behind ENABLE_CONSENT_GATES, not extended (D19))
- S12-56: GDPR retention policy-as-data. Evidence: `lib/gdpr/retention.ts:1`. (parked behind ENABLE_CONSENT_GATES, not extended (D19))
- S12-57: Nutrition catalog importer. Evidence: `lib/nutrition/import.ts:1`. (keep; run by db:fresh)
- S12-58: Exercise catalog importer. Evidence: `lib/exercise/import.ts:1`. (keep; run by db:fresh)
