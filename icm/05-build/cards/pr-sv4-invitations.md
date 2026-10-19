# PR-SV4 build: Client invitations

Card slug `pr-sv4-invitations`. Board `vari8`. Track Service. Depends on PR-05. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-sv4-invitations`, branch `beta/pr-sv4-invitations` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prsv4` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3773. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-sv4-invitations && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-SV4] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-SV4] Client invitations" --body-file icm/05-build/cards/pr-sv4-invitations.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-sv4-invitations --title "[PR-SV4] Client invitations" --body "Closes #<issue>. Card pr-sv4-invitations. Plan section PR-SV4 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-sv4-invitations && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-sv4-invitations.md > /home/nexuslink/vari8-worktrees/pr-sv4-invitations.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prsv4 LANE_PORT=3773 CARD=PR-SV4 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-sv4-invitations.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-sv4-invitations.devin.log` and `pr-sv4-invitations.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-SV4` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-20: S01 UNWIRED: Client create, not drawn in canvas (roster has no Add/New control; seed clients only)
- S11-16: S11 UNWIRED: "Onboarding invitation drafts (name · email · Not sent)" list
- S11-17: S11 UNWIRED: Invite acceptance → new client account + profile (canvas implies email-invited clients; draws no accept screen)

## Backend orphans this PR owns (delete or keep as each line says)

- S12-73: Workspace invitations service. Evidence: `lib/workspace/invitations.ts:1`. (keep; routed from the roster)
- S12-74: Invite-acceptance route boundary. Evidence: `lib/workspace/invite-acceptance.ts:12`. (keep; invite acceptance)

## Files

- `lib/workspace/invitations.ts`
- `app/api/v1/invitations/**`
- their tests

## Build

- Create, list and revoke invitations; delivery through the PR-05 mail port; acceptance creates the linked client profile once.
- No `db/` edits (D34).

## Acceptance (you see)

- Invite acceptance creates one client profile even when submitted twice.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3773 against `app_prsv4` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-SV4/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Token guard and exactly-once acceptance under concurrency.

## Report

Write `icm/05-build/reports/PR-SV4.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
