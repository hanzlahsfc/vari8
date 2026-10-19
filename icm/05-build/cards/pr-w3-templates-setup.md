# PR-W3 build: Wire templates, setup and client preview

Card slug `pr-w3-templates-setup`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-M4, PR-SV1. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-w3-templates-setup`, branch `beta/pr-w3-templates-setup` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw3` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3788. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w3-templates-setup && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-W3] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-W3] Wire templates, setup and client preview" --body-file icm/05-build/cards/pr-w3-templates-setup.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-w3-templates-setup --title "[PR-W3] Wire templates, setup and client preview" --body "Closes #<issue>. Card pr-w3-templates-setup. Plan section PR-W3 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w3-templates-setup && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w3-templates-setup.md > /home/nexuslink/vari8-worktrees/pr-w3-templates-setup.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw3 LANE_PORT=3788 CARD=PR-W3 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w3-templates-setup.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w3-templates-setup.devin.log` and `pr-w3-templates-setup.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

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

## Files

- `components/canvas/data/templates.ts`
- `components/canvas/coach/templates.tsx`
- components/canvas/coach/plans/**(setup only)
- app/api/v1/** routes the screen calls
- their tests

## Build

- Library, editor with save (CAS), publish, duplicate, rename, delete with timed restore, assignment and personalization, preview of the assigned tool, habit and module toggles.
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- Create, save, publish and assign a template; a stale tab's save shows the conflict; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3788 against `app_prw3` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W3/build/`.
- Parity (D32) on: `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s11-client-preview.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W3.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
