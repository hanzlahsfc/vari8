# PR-SUPP build: Supplement plan per client

Card slug `pr-supp-plan`. Board `vari8`. Track Service. Depends on PR-M1. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue #161.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-supp-plan`, branch `beta/pr-supp-plan` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prsupp` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3833. May touch `db/`: yes (D34 schema writer).

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-supp-plan && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-SUPP] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-SUPP] Supplement plan per client" --body-file icm/05-build/cards/pr-supp-plan.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-supp-plan --title "[PR-SUPP] Supplement plan per client" --body "Closes #<issue>. Card pr-supp-plan. Plan section PR-SUPP in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-supp-plan && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-supp-plan.md > /home/nexuslink/vari8-worktrees/pr-supp-plan.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prsupp LANE_PORT=3833 CARD=PR-SUPP icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-supp-plan.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-supp-plan.devin.log` and `pr-supp-plan.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-SUPP` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- `db/schema.prisma`
- `db/migrations/<timestamp>_supplement_plan/**`
- `lib/supplements/{model,gate,service,boundary}.ts`
- lib/audit.ts (resource type)
- lib/auth/rbac.ts (resource cell)
- lib/consent.ts (parked registry)
- `app/workspace/[workspaceId]/clients/[clientProfileId]/supplements/actions.ts`
- `.env.example`
- `tests/unit/supplements-plan.test.ts`
- `tests/integration/supplements-plan.test.ts`

## Build

- Contract source: `frontend/docs/supplements-frontend-execution-brief.md` and `frontend/src/components/coach/supplements/{model,draft,editor,plan-view}.ts(x)` on FRONTEND 51fa6a2 (PR #151; beta sync is PR #160, unmerged at card creation).
- One saved supplement plan per client; the coach edits name and ordered items with explicit Save/Cancel; the client reads the saved plan only. No draft/active/history lifecycle, no dates, weekdays, cycles or pause states.
- Each item embeds the product snapshot (brand, name, reference quantity/unit, declared amount/unit, URL) plus quantity, dose unit, free-text timing and notes, and status in {must-have, optional, none}. Snapshots stay readable when the catalogue later changes; there is no backend-managed catalogue.
- Validation mirrors the frontend model: positive finite quantity, catalogue-compatible dose unit, safe http(s) product URL (hostname, no credentials), exact status union, unknown keys rejected. Missing composition stays null; never persist derived dosage; no check-off, adherence, dose logic or PED/HRT behavior.
- One `supplement_plan` + `supplement_plan_item` migration pair with hand-authored down.sql, composite same-workspace coherence FKs in raw SQL (Prisma cannot express them), expected-revision CAS under advisory lock and serializable transaction, re-resolved authorization inside the transaction.
- Access reuses the closed `plan.read`/`plan.write` capability cells exactly as `mealPlans`; no new capability, no broadened permission. Client reads own; unassigned staff and foreign workspace/client are non-disclosing.
- Actions follow the established order: feature gate `ENABLE_SUPPLEMENT_PLAN`, session, bounded input validation, service boundary, `revalidatePath`. Closed safe errors; `supplement_plan` audit resource with structural metadata only (no payload bodies).

## Acceptance (you see)

- A coach saves a named plan with ordered items and the client reads exactly the saved data; a second stale save fails without writes; a foreign workspace or client sees the same not-found as an absent plan.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3833 against `app_prsupp` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-SUPP/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Literal validation cases (quantities, units, URLs, statuses, unknown keys, null versus zero composition) and integration cases for ordering, CAS, role matrix, audit and flag-off, each failing when the guard breaks.

## Report

Write `icm/05-build/reports/PR-SUPP.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
