# PR-04 build: Make the backend reachable in dev and park the consent gates

Card slug `pr-04-dev-runtime`. Board `vari8`. Track Foundation. Depends on none. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-04-dev-runtime`, branch `beta/pr-04-dev-runtime` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_pr04` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3713. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-04-dev-runtime && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-04] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-04] Make the backend reachable in dev and park the consent gates" --body-file icm/05-build/cards/pr-04-dev-runtime.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-04-dev-runtime --title "[PR-04] Make the backend reachable in dev and park the consent gates" --body "Closes #<issue>. Card pr-04-dev-runtime. Plan section PR-04 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-04-dev-runtime && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-04-dev-runtime.md > /home/nexuslink/vari8-worktrees/pr-04-dev-runtime.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_pr04 LANE_PORT=3713 CARD=PR-04 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-04-dev-runtime.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-04-dev-runtime.devin.log` and `pr-04-dev-runtime.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/gowther/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/gowther/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/spec-driven-implementation/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/sql-queries/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/verification-before-completion/SKILL.md`

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

## Files

- `.env.example`
- `scripts/seed/index.ts`
- `scripts/seed/*.seed.ts`
- package.json (scripts `seed:dev`, `db:fresh` only)
- `lib/consent.ts`
- `lib/*/consent.ts`
- `lib/gdpr*.ts`
- `lib/*/gate.ts`
- `lib/runtime.ts`
- `docs/dev/runtime.md`
- vitest.config.ts (test env only)

## Build

- Document every flag the gates read in `.env.example`, including the three missing ones (`ENABLE_CLIENT_DASHBOARD`, `ENABLE_MEAL_PLANS`, `ENABLE_TRAINING_PLANS`).
- Add the trusted-runtime check to every exact-1 flag gate (V3-H4-02): a flag only counts in development or test runtimes.
- `scripts/seed/index.ts` loads every `scripts/seed/*.seed.ts` in name order (one file per domain, D34). It refuses to run unless the runtime is development or test. `00-workspace.seed.ts` creates the canvas demo workspace, an owner (Liliana Mansfeld, as the canvas shows), one coach and the canvas demo clients (synthetic names from `frontend/src/components/coach/model.ts`), with passwords taken from environment variables, never committed.
- `npm run db:fresh` creates `app_<lane>`, migrates, runs the catalog imports (`import:nutrition`, `import:exercise`) and the seed.
- Consent and health-data gates read `ENABLE_CONSENT_GATES`, unset by default (D19). Gates allow when it is off. The test environment sets it to 1 in `vitest.config.ts` so the existing consent suites keep testing the parked code until PR-T2 deletes them.
- List every gate turned off with file and line in the PR report; PLAN v2 `## Parked: consent and health data` gets the same list at merge.
- Merge the five consent gate files into one gate behind the flag where that is a pure move (BACKEND-REDUCTION F11) and inline the empty reset-delivery adapter registry only if PR-05 has not already replaced it (F12).

## Acceptance (you see)

- A fresh database signs in as the seeded owner and opens every existing flagged page (clients, review queue, a client's meal plan, training program, dashboard, daily) instead of 404 or forbidden.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3713 against `app_pr04` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-04/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): One test per gate kind: a gate with `ENABLE_CONSENT_GATES` unset allows, and a flag set to 1 in a production runtime stays off. Both bite.

## Report

Write `icm/05-build/reports/PR-04.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
