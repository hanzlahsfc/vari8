# PR-W10 verify: Wire notes, to-dos, appearance and preferences

Card slug `pr-w10-notes-appearance-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w10-notes-appearance-verify` (local branch `beta/pr-w10-notes-appearance-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W10/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-w10-notes-appearance --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w10-notes-appearance-verify && git fetch origin && git checkout --detach origin/beta/pr-w10-notes-appearance`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W10 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw10 LANE_PORT=3810 CARD=PR-W10 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W10/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3810 with a fresh `app_verify_prw10` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W10/<role>-<width>.png`.
4. Parity (D32) on `s02-notes-todos.png`, `s01-profile-notes.png`, `s10-appearance.png`, `s11-preferences.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W10/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W10/verdict.md`, where the first line is `SHIP PR-W10 <head sha>` or `FIX PR-W10 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw10`, leave the worktree clean.

## Acceptance to check

- A client gets 403 on the coach-note route; the accent persists per workspace after reload; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W10` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-06: S01 MISSING: Sidebar collapse toggle with persisted state
- S01-10: S01 MISSING: Workspace preferences dialog: accent picker, logo upload, availability text, in-app notification toggles, reset-mockup
- S01-31: S01 MISSING: Notes & tasks tab: private coach notes (visible only in workspace) + general coaching notes
- S01-32: S01 MISSING: Coach to-dos per client (checkbox list, add)
- S01-40: S01 MISSING: Store slices: coachNotes + coachTodos top-level (owned by notes surface)
- S02-17: S02 MISSING: Notes toolbar: search box + scope select ("Everyone & workspace" / "Workspace only" / per athlete)
- S02-18: S02 MISSING: Private notes column, workspace scope: list, count, edit/delete
- S02-19: S02 MISSING: Client-linked private notes: same list rows with athlete owner chip; stored on client.internalNotes
- S02-20: S02 MISSING: Workspace to-dos: Open/Completed/All status tabs, checkbox toggle, edit/delete
- S02-21: S02 PARTIAL: Client-linked to-dos (client.coachTasks {id,title,complete}) in the same column with athlete owner chip
- S02-22: S02 MISSING: Add/Edit dialog for notes and to-dos: "Keep in" destination select (workspace vs athlete), textarea, Save; delete with undo toast
- S02-23: S02 UNWIRED: Owner chip on note/todo rows linking to the athlete profile
- V3-L1-CoachTask: S02 MISSING: CoachTask and coachTodos have no backend model
- V3-L1-ClientNote: S02 MISSING: ClientNote, internalNotes and generalNotes have no backend model
- S10-01: S10 PARTIAL: /coach Appearance > Color mode switch (light/dark, role=switch)
- S10-02: S10 MISSING: /coach Accent color (native picker, hex input, 4 suggestion swatches, Reset accent)
- S10-03: S10 MISSING: Workspace logo upload (PNG/JPG/WebP <=2MB, canvas-resize to <=512px data URL, preview, remove)
- S10-05: S10 PARTIAL: Ethereal appearance provider: {mode,accent,font} state, localStorage coaching-ethereal-appearance-v1, themeVariables() contrast-safe derivat
- S10-06: S10 PARTIAL: AppearanceScreen "01 Light" segmented mode control
- S10-07: S10 MISSING: AppearanceScreen "02 Accent": color well picker, hex field, 6 named swatches, validity feedback
- S10-08: S10 MISSING: AppearanceScreen "03 Typography": 5-option font radio list (sans/serif/condensed/mono/rounded) with live specimens
- S10-09: S10 MISSING: Appearance reset + "Saved automatically on this device" note
- S10-10: S10 MISSING: Appearance preview panel: Roomy/Compact density toggle, live BodyweightTrend + NutritionTargets specimens, summary chips, sample profile car
- S11-09: S11 MISSING: Coach-only internal notes ("Internal note · Coach-only"; privateCoachNotes.visibility=coach_only)
- S11-10: S11 MISSING: General/shared notes "Visible to you and your coach"
- S11-12: S11 MISSING: Coach personal to-dos linked to a client ("Coach to-do" / coachTasks)
- S11-22: S11 PARTIAL: Workspace preferences dialog: logo upload, availability string, notification toggles, theme

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-040: Input sanitization everywhere a user can type (UNVERIFIED): live probe: save `<img onerror>` and `=HYPERLINK(...)` into note fields and view them escaped
