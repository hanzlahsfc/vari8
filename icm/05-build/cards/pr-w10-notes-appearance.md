# PR-W10 build: Wire notes, to-dos, appearance and preferences

Card slug `pr-w10-notes-appearance`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-M2, PR-M3, PR-MEDIA. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-w10-notes-appearance`, branch `beta/pr-w10-notes-appearance` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw10` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3809. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w10-notes-appearance && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-W10] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-W10] Wire notes, to-dos, appearance and preferences" --body-file icm/05-build/cards/pr-w10-notes-appearance.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-w10-notes-appearance --title "[PR-W10] Wire notes, to-dos, appearance and preferences" --body "Closes #<issue>. Card pr-w10-notes-appearance. Plan section PR-W10 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w10-notes-appearance && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w10-notes-appearance.md > /home/nexuslink/vari8-worktrees/pr-w10-notes-appearance.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw10 LANE_PORT=3809 CARD=PR-W10 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w10-notes-appearance.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w10-notes-appearance.devin.log` and `pr-w10-notes-appearance.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W10` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

Owner ruling O3 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): no client settings screen is wired until Lilly's canvas design lands; this card keeps the coach-side settings only.
Owner ruling O13 (owner, 2026-10-20, same source): general coaching notes render to the client; private coach notes and coach to-dos stay staff-only (D26).
Owner ruling O16 (owner, 2026-10-20, same source): the generic sign-in, sign-up, reset and invite-acceptance pages are kept, excluded from parity, and this card owns their restyle to canvas tokens, type, spacing and components.

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

## Files

- `components/canvas/data/notes.ts`
- `components/canvas/data/appearance.ts`
- `components/canvas/coach/notes.tsx`
- `components/canvas/coach/appearance-controls.tsx`
- `components/canvas/ethereal/appearance-views.tsx`
- app/api/v1/** routes the screen calls
- their tests

## Build

- Notes and to-dos section and profile tab, workspace preferences dialog with logo upload, appearance studio, sidebar collapse, all saved per workspace (D25).
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- A client gets 403 on the coach-note route; the accent persists per workspace after reload; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3809 against `app_prw10` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W10/build/`.
- Parity (D32) on: `s02-notes-todos.png`, `s01-profile-notes.png`, `s10-appearance.png`, `s11-preferences.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W10.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
