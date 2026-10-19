# PR-W3 verify: Wire templates, setup and client preview

Card slug `pr-w3-templates-setup-verify`. Independent verifier on a different model than the builder (devin/swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w3-templates-setup-verify` (local branch `beta/pr-w3-templates-setup-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W3/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-w3-templates-setup --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w3-templates-setup-verify && git fetch origin && git checkout --detach origin/beta/pr-w3-templates-setup`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W3 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw3 LANE_PORT=3789 CARD=PR-W3 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W3/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3789 with a fresh `app_verify_prw3` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W3/<role>-<width>.png`.
4. Parity (D32) on `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s11-client-preview.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W3/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W3/verdict.md`, where the first line is `SHIP PR-W3 <head sha>` or `FIX PR-W3 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw3`, leave the worktree clean.

## Acceptance to check

- Create, save, publish and assign a template; a stale tab's save shows the conflict; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W3` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-26: S01 PARTIAL: Overview "Client setup" card: assigned template summary (name, views, nutrition mode, habits on/off) + "Preview assigned tool"
- S01-27: S01 PARTIAL: "Assign template" / "Change assignment" dialog with setup review and Assign & personalize
- S01-36: S01 UNCONFIGURED: Store slice: templates + editorDrafts (owned by templates surface)
- S04-09: S04 PARTIAL: Template-level "Include Habit Tracker" toggle + preview + gating of the client Habits tab on variant.habits; "Habits: enabled/off" shown in
- S05-01: S05 PARTIAL: Template library screen: search box, count, template cards showing name, description, view/habit/nutrition tags, assigned-client count, edit
- S05-02: S05 PARTIAL: Add template + "Resume draft" chips across drafts
- S05-03: S05 MISSING: Duplicate template ("Independent copy created")
- S05-04: S05 UNCONFIGURED: Rename template dialog
- S05-05: S05 CONFLICT: Delete template with undo toast; assigned clients keep their snapshot
- S05-06: S05 PARTIAL: Preview template dialog (full multi-tab client preview)
- S05-07: S05 PARTIAL: Assign dialog: client picker (search, non-archived), config summary, "Assign & personalize"; also inline assign in client profile
- S05-08: S05 PARTIAL: Editor shell: name input, unsaved-draft state, save (Cmd+S), restore saved, discard, leave/exit guard, section nav
- S05-09: S05 MISSING: Tabs section: description textarea + per-tab toggles (Dashboard, Tracker, Timeline/Roadmap, Nutrition, Training Program, Check-In) + Habits
- S05-11: S05 PARTIAL: Tracker "Daily fields": ordered list, add/remove/reorder rows
- S05-12: S05 PARTIAL: Per-field settings: unit Select from parameter.units, choice-labels textarea (field.options override), period-start note
- S05-13: S05 PARTIAL: "Add parameter" library browser: grouped by category, search, availability counts, per-item Add
- S05-14: S05 PARTIAL: "Include cycle tracking" toggle, auto-adds bleeding-level + period-start, hides cycle params when off
- S05-15: S05 MISSING: "Daily overview" metric pins: up to 4 numeric fields, reorder/remove, add via select
- S05-16: S05 MISSING: Roadmap config: per-compatible-field toggle, calculation select (Weekly average/Trend/Target vs actual/Adherence), comparison flag
- S05-17: S05 MISSING: Phase selection toggle + comma-separated phase options
- S05-18: S05 MISSING: Nutrition mode segmented control (Meal plan / IIFYM macro targets)
- S05-19: S05 PARTIAL: Training section: eight prescription-field checkboxes
- S05-20: S05 MISSING: Reusable set choices: editable option lists + default per setType/progression/tempo/rest
- S05-21: S05 MISSING: Volume display toggle, breakdown label ("Muscle groups / week"), presentation Table/Heatmap
- S05-22: S05 PARTIAL: Check-In section: question CRUD (label, type, options, required, reorder, duplicate), included-summaries checkboxes, form preview (Full form
- S05-23: S05 MISSING: Habits section: Include Habit Tracker toggle, preview, "Include habit status in check-ins"
- S05-24: S05 CONFLICT: Variant machinery: variants[], defaultVariant, legacyConfigurations, Assignment.variantId, switchVariant, templateSetup/normalizeTemplateSet
- S05-25: S05 MISSING: Whole-state persistence: localStorage STORAGE_KEY, isCoachState validation, migrate + normalize on hydrate, "kept on this device" copy
- S11-07: S11 PARTIAL: "Preview assigned tool" → coach renders the client's own tool (dashboard/tracker/roadmap/nutrition/training/check-in/habits)
- S11-08: S11 PARTIAL: Preview write isolation ("changes stay inside preview") + dormant role switch "Log data" vs "Coach notes"
- S11-27: S11 PARTIAL: Coach assigns the tool/template to a client directly ("Assign template")
- V2-H4: CONFLICT (S05): Goal picker cycle parameters. Wired like any parameter (D19).
