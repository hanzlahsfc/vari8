# PR-W8 verify: Wire training

Card slug `pr-w8-training-verify`. Independent verifier on a different model than the builder (devin/swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w8-training-verify` (local branch `beta/pr-w8-training-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W8/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-w8-training --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w8-training-verify && git fetch origin && git checkout --detach origin/beta/pr-w8-training`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W8 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw8 LANE_PORT=3804 CARD=PR-W8 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W8/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3804 with a fresh `app_verify_prw8` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W8/<role>-<width>.png`.
4. Parity (D32) on `s07-training-editor.png`, `s07-exercise-library.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W8/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W8/verdict.md`, where the first line is `SHIP PR-W8 <head sha>` or `FIX PR-W8 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw8`, leave the worktree clean.

## Acceptance to check

- The coach publishes a per-set plan and the client sees the current week with the canvas volume numbers; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W8` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-39: S01 PARTIAL: Store slices: client.plans, habits, retiredHabits, entries, exerciseLibrary, coach-level plan (owned by plans/habits/daily surfaces)
- S07-01: S07 PARTIAL: Plans & targets "Training" module row: lifecycle status, plan name, start date, "N sessions · N weeks / Ongoing" detail
- S07-02: S07 PARTIAL: Plan meta: name input, "Starts" date picker, active-plan line; toolbar History/Preview draft/Save draft/Review & activate
- S07-03: S07 UNCONFIGURED: Draft persistence + unsaved-changes guard + "Saved draft and active client content are separate"
- S07-04: S07 PARTIAL: Activation-time validation error list + Review preview dialog
- S07-05: S07 PARTIAL: Activated plan history dialog: versions, retained prescription view, Discard draft, Archive active plan, Create replacement
- S07-06: S07 UNCONFIGURED: Week-based program structure + program length 1-52 + "overrides retained" note
- S07-07: S07 MISSING: Evergreen program mode ("Ongoing program", edits apply across program)
- S07-08: S07 UNCONFIGURED: Week nav strip W1..W52 + carry-forward override semantics ("edits apply until next override")
- S07-09: S07 PARTIAL: Session cards: add/rename/reorder/duplicate/remove
- S07-10: S07 PARTIAL: Exercise rows: name, muscle allocation select, library cue + snapshot banner, reorder/duplicate/remove
- S07-11: S07 PARTIAL: Per-set rows: index, reps, rep-range "Up to", tempo, type, rest selects, per-set instructions, add/remove set
- S07-12: S07 PARTIAL: Template-driven prescription field config (8 toggles + volume + breakdown + presentation)
- S07-13: S07 MISSING: Template option vocabularies + starting defaults for setType/progression/tempo/rest dropdowns
- S07-14: S07 PARTIAL: Exercise library: manage form (name, primary muscle enum, secondary groups multi-select, coaching notes), searchable picker, 10-item starter
- S07-15: S07 CONFLICT: Weekly muscle volume panel: per-group working-set counts, unassigned row, Table or Heatmap presentation, total prescribed sets
- S07-16: S07 PARTIAL: Prescription read view: coach preview column, preview/history dialogs, client "Prescription for <date>" picker
- S07-20: S07 MISSING: "Training Program" module visibility gate on the assigned setup (hidden module shows Empty, data retained)
- S07-22: S07 MISSING: Activation records into check-in review draft (kind, versionId, name, startDate appended on activate when route.review)
- V3-CP13: S07 CONFLICT: Muscle volume table
- V3-CP14: S07 MISSING: Training session logbook
- R3-19: S07 PARTIAL: Render server, CAS, timezone and publish errors, not only local validation
- V3-CP12: S09 MISSING: Body map heatmap
