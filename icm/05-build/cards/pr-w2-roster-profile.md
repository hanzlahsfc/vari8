# PR-W2 build: Wire the roster and the client profile

Card slug `pr-w2-roster-profile`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-SV1, PR-SV2, PR-SV4, PR-M1. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-w2-roster-profile`, branch `beta/pr-w2-roster-profile` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw2` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3785. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w2-roster-profile && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-W2] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-W2] Wire the roster and the client profile" --body-file icm/05-build/cards/pr-w2-roster-profile.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-w2-roster-profile --title "[PR-W2] Wire the roster and the client profile" --body "Closes #<issue>. Card pr-w2-roster-profile. Plan section PR-W2 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w2-roster-profile && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w2-roster-profile.md > /home/nexuslink/vari8-worktrees/pr-w2-roster-profile.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw2 LANE_PORT=3785 CARD=PR-W2 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w2-roster-profile.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w2-roster-profile.devin.log` and `pr-w2-roster-profile.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W2` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

Owner ruling O6 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the submitted onboarding form creates the client record, replacing invite-first profile creation; PR-SV4 owns the backend change and this card wires the roster/profile side.
Owner ruling O8 (owner, 2026-10-20, same source): a narrow D32 parity exception grants exactly one Add or invite-client control in the coach roster; no other new chrome.
Owner ruling O14 (owner, 2026-10-20, same source): the assigned coach may complete a client task (supersedes the staff bar in decision #109); "overdue" derives from the due date (`taskDueState`).

## Matrix rows this PR closes

- S01-11: S01 MISSING: Toast notice with Undo action
- S01-14: S01 PARTIAL: Client roster list: all non-archived clients with avatar, name, label, phase/week, assignment, next check-in, attention signals
- S01-15: S01 MISSING: Roster search box (matches name, label, phase, assigned template name)
- S01-16: S01 MISSING: Roster filter select: All athletes / Needs attention / Unread messages
- S01-17: S01 MISSING: Roster sort select: Name / Attention / Next check-in
- S01-18: S01 MISSING: Table vs card view toggle
- S01-19: S01 PARTIAL: Roster columns "Assigned template" and "Next check-in", card "Coaching since"
- S01-21: S01 MISSING: Client edit/archive: canvas stores archived (consumed by roster/messages/notes filters) and name; no edit UI drawn
- S01-22: S01 PARTIAL: Client profile header: avatar, name, label, phase, week, email, coaching since, height cm, next check-in summary
- S01-23: S01 PARTIAL: Profile header actions: "Check-in calendar" and "Open chat" with unread count
- S01-24: S01 PARTIAL: Profile tab bar: Overview / Plans / Check-ins / Notes & tasks / Onboarding (via ?tab=)
- S01-25: S01 UNCONFIGURED: Overview "Client setup" card: current bodyweight stat
- S01-33: S01 PARTIAL: Client-assigned tasks: add (dueDate = today+7 fixed), list with checkbox, overdue/completed counts
- S01-35: S01 UNCONFIGURED: Onboarding tab: submitted onboarding Q&A retained with the profile
- V1-C6: S01 MISSING: Empty roster state, “No athletes match” with Clear filters
- V1-C7: S01 MISSING: Athlete not found state with Back to athletes
- S10-19: S10 UNWIRED: Clients studio page: roster (search, signals, attention), client profile editor, per-client tracker preview, onboarding invitation drafts, r
- S11-05: S11 PARTIAL: Client roster of "your athletes" (card/table list with phase, week, unread, overdue tasks, check-in state)
- S11-06: S11 PARTIAL: Client identity fields on profile header (email, coaching since, height)
- S11-11: S11 UNCONFIGURED: Client tasks assigned by coach, completed by client (due dates, open/overdue/complete)
- S11-15: S11 UNCONFIGURED: "Submitted onboarding" tab, client-submitted Q&A retained on the profile, coach reads them
- S11-21: S11 PARTIAL: Archived clients hidden from the roster

## Backend orphans this PR owns (delete or keep as each line says)

- S12-13: Onboarding form library + create/edit/preview. Evidence: `app/workspace/[workspaceId]/onboarding/forms/page.ts (keep; serves the canvas onboarding tab)
- S12-14: Onboarding form CRUD server actions. Evidence: `app/workspace/[workspaceId]/onboarding/actions.ts:158`. (keep; serves the canvas onboarding tab)
- S12-15: Onboarding form assignments + actions. Evidence: `app/workspace/[workspaceId]/onboarding/assignments/page.tsx: (keep; serves the canvas onboarding tab)
- S12-16: Staff onboarding-submission review. Evidence: `app/workspace/[workspaceId]/clients/[clientProfileId]/onboardin (keep; serves the canvas onboarding tab)
- S12-59: Onboarding form service. Evidence: `lib/onboarding/forms.ts:126`. (keep; serves the canvas onboarding tab)
- S12-60: Onboarding form boundary. Evidence: `lib/onboarding/forms-boundary.ts:1`. (keep; serves the canvas onboarding tab)
- S12-61: Onboarding assignment service. Evidence: `lib/onboarding/assignments.ts:237`. (keep; serves the canvas onboarding tab)
- S12-62: Onboarding assignment boundary. Evidence: `lib/onboarding/assignments-boundary.ts:80`. (keep; serves the canvas onboarding tab)
- S12-63: Onboarding assignment gate. Evidence: `lib/onboarding/assignments-gate.ts:1`. (keep; serves the canvas onboarding tab)
- S12-64: Onboarding submission review service. Evidence: `lib/onboarding/review.ts:379`. (keep; serves the canvas onboarding tab)
- S12-65: Onboarding review boundary. Evidence: `lib/onboarding/review-boundary.ts:83`. (keep; serves the canvas onboarding tab)

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-025: Apostrophes in names (UNVERIFIED): live probe: create a client named Siobhan O'Brien-Nunez with accents, view the profile and every list

## Files

- `components/canvas/data/clients.ts`
- `components/canvas/coach/clients.tsx`
- `components/canvas/ethereal/clients/**`
- app/api/v1/** routes the screen calls
- their tests

## Build

- Roster, search, filter, sort, card and table views, profile header and tabs, client tasks, onboarding answers, archive with timed restore (D24, D27), the Ethereal clients studio (D21).
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- Seed the demo clients, archive one, reload: it leaves the roster and restores from the toast; parity passes on the profile screens.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3785 against `app_prw2` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W2/build/`.
- Parity (D32) on: `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-onboarding.png`, `s10-clients-studio.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W2.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
