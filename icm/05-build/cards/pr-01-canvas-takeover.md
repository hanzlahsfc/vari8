# PR-01 build: Take over the whole canvas into the root app

Card slug `pr-01-canvas-takeover`. Board `vari8`. Track Foundation. Depends on PR-02. Builder: Devin swe-2-max driven by yamato. Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-01-canvas-takeover`, branch `beta/pr-01-canvas-takeover` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_pr01` on 127.0.0.1:5433 user `app`; dev port 3716. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-01-canvas-takeover && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-01] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-01] Take over the whole canvas into the root app" --body-file icm/05-build/cards/pr-01-canvas-takeover.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-01-canvas-takeover --title "[PR-01] Take over the whole canvas into the root app" --body "Closes #<issue>. Card pr-01-canvas-takeover. Plan section PR-01 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-01-canvas-takeover && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-01-canvas-takeover.md > /home/nexuslink/vari8-worktrees/pr-01-canvas-takeover.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_pr01 LANE_PORT=3716 CARD=PR-01 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-01-canvas-takeover.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-01-canvas-takeover.devin.log` and `pr-01-canvas-takeover.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-01` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-01: S01 PARTIAL: /coach page mounts the whole workspace client-side inside Suspense
- S01-02: S01 PARTIAL: Sidebar brand: uploaded logo image or "infinity." wordmark plus "COACH WORKSPACE" label
- S01-03: S01 PARTIAL: Section nav: Clients, Templates, Check-ins, Messages, Notes & to-dos
- S01-05: S01 PARTIAL: Account block: initials avatar, coach name, "Coach" role, opens preferences dialog
- S01-07: S01 PARTIAL: Utility header breadcrumb: Workspace / Section / Editor
- S01-08: S01 PARTIAL: Dark/light mode toggle in header
- S01-09: S01 MISSING: "Local demo" / "Session only" storage indicator
- S01-12: S01 PARTIAL: Client-side route model ?section&client&editor&review&plan&tab + navigation guard ref
- S01-41: S01 PARTIAL: Shared canvas UI primitives + polish styles (Button, IconButton, Avatar, SearchBox, Select, Toggle, Empty, Dialog, PageTitle, Surface, Trans
- R3-1: S01 MISSING: Global user reduced-motion policy (MotionConfig at the root)
- S10-04: S10 MISSING: Ethereal studio shell: routes / (re-export) and /ethereal, sticky island header, 5-page segmented nav, hash routing #appearance
- S10-11: S10 MISSING: Foundations specimen gallery (type/numbers, actions/states, text+validation, choices+tabs, compact health fields incl. BP mask, confirm/empt
- S10-12: S10 MISSING: Ethereal primitive library (Avatar, StatusLabel, LabelTag, Segmented, SelectControl, TextInput, CheckboxControl, SwitchControl, Tabs, Widget
- S10-13: S10 UNWIRED: BodyweightTrend + NutritionTargets specimen components (SVG monotone chart, period select 7/14/30, metrics strip, macro target bars, add-sam
- S10-21: S10 PARTIAL: Ethereal theme token layer: eg-root data-mode vars (--canvas/--surface/--text/--muted/--border/--success/--warning/--danger/--accent-*) + at
- S11-01: S11 UNWIRED: Signed-in coach identity chip: avatar initials, "Liliana Mansfeld", "Coach" role label in sidebar
- S11-02: S11 UNWIRED: Implied authenticated coach session (whole /coach app assumes a signed-in coach; canvas has zero auth UI)
- S11-03: S11 UNWIRED: No sign-out affordance in canvas

## Files

- `app/coach/**`
- `app/ethereal/**`
- `app/page.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `components/canvas/**`
- `lib/auth/viewer.ts`
- proxy.ts or middleware.ts
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `postcss.config.mjs`

## Build

- Move every canvas route into the root app with its path unchanged: `/coach`, `/ethereal` and `/` (which re-exports the studio today). Move `frontend/src/components/{coach,ethereal,ui}` and `frontend/src/lib` under `components/canvas/` and `lib/canvas/` with `git mv` history where possible; `frontend/` stays as the parity baseline until PR-R1.
- Merge the canvas dependencies into the root `package.json` at the canvas versions; one Tailwind 4 and PostCSS setup; carry every canvas CSS file (`globals.css`, `tracker.css`, `weight.css`, `ethereal-*.css`) byte for byte. Do not port the dead `appearance.css` rules beyond `.ap-screen` (S10-21), only if parity stays green.
- Point the PR-P1 harness at the root app (`tools/parity/run.mjs` starts the root dev server instead of `frontend/` and signs in as the dev user when a route needs a session); the baseline stays the one captured from `frontend/`.
- Behavior stays browser-local exactly as today (the canvas store and its localStorage keys). No screen reads the database yet except identity.
- Gate `/coach`, `/ethereal` and `/` behind the existing session: signed out goes to `/login`.
- Add the identity seam `lib/auth/viewer.ts` (`getViewer()`: name, initials, workspace, real role `Owner` or `Coach`, D18). It reads the session only through the existing `lib/auth/session.ts` and `lib/auth/route-guard.ts` exports, never `next-auth` directly, so PR-05's Better Auth swap (in flight, #58) changes one module, not the screens. If PR-05 merges first, build on its session API instead. The account block shows the viewer instead of the hardcoded coach; add sign-out to the account block's existing menu or dialog without new visible chrome.
- Until PR-04 lands, create a local dev user per `icm/05-build/RUNBOOK.md` section 'Dev user before PR-04'.

## Acceptance (you see)

- Signed in as the seed owner, all 35 screens render on the root app and pass the D32 parity check at 1440 and 390, with the account block showing the real name and role; sign-out returns to `/login`.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3716 against `app_pr01` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-01/build/`.
- Parity (D32) on: `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`.
- Unit (D11, D14): None needed, proven live by the parity gate and the sign-in round trip.

## Report

Write `icm/05-build/reports/PR-01.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
