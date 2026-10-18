# Prototype cards P1 and P2 (throwaway, settle facts before the plan)

Context: `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/03-plan/DECISIONS.md` (D2, D4, D5). Both worktrees are based on `proto/merge-frontend` @ `58eb6ed`: Hanzlah's app at the root, Lilly's canvas in `frontend/`.

Rules for both: work ONLY in your worktree. Commit locally on its branch, never push. No dev server, no browser, no GUI, no database writes. Run long commands in the foreground with a generous timeout (no background jobs, no sleep loops). Kill anything you start. Write your report incrementally (section by section). No secrets.

## P1. Next 16 upgrade of the root app

Worktree `/home/nexuslink/vari8-worktrees/next16-proto` (branch `proto/next16`). Report `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/03-plan/output/P1-next16.md`.

1. Baseline at the root: `npm ci`, `npx prisma generate`, `npm run typecheck`, `npm run build`, `npm run test`. Record exit codes and the test count.
2. Upgrade root `next` to `16.3.8`, `react` and `react-dom` to `19.3.0`, their `@types` to match, `eslint-config-next` to the 16 line. Run `npx @next/codemod@latest upgrade` or the individual Next 16 codemods if the upgrade codemod is unavailable; record what each changed.
3. Re-run typecheck, build, unit tests. For every failure: file:line, the error, the fix you applied, and why. Fix only what the upgrade breaks. Note anything Next 16 changed that the codemods missed (async request APIs `cookies()`, `headers()`, `params`, `searchParams`; `middleware` renamed; Turbopack default; `next lint` removal; Auth.js v5 compatibility).
4. Commit the result. Report: before and after table (command, exit code, counts), the full list of code changes with paths, open risks, and the commit SHA.

## P2. Biome replaces ESLint and the Prettier code formatter

Worktree `/home/nexuslink/vari8-worktrees/biome-proto` (branch `proto/biome`). Report `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/03-plan/output/P2-biome.md`.

1. Baseline: `npm ci`, `npm run lint`, `npm run format:check`. Record exit codes and counts.
2. At the root, install `@biomejs/biome@2.5.15`, write a root `biome.json` that matches `frontend/biome.json` (next and react domains, recommended rules, double quotes) and covers the whole repo including `frontend/`. Keep Prettier only for `*.md`, `*.yml`, `*.yaml` (narrow its scope with `.prettierignore` or the script glob).
3. Run `npx biome check .` before any write: record counts per rule. Then `npx biome check --write .` (safe fixes only). Record: files changed, lines changed (`git diff --shortstat`), remaining diagnostics per rule, and any rule you set to off or warn with the reason.
4. Show the ESLint `@next/next/*` and `react-hooks` coverage gap: list which ESLint rules active today have a Biome equivalent and which do not (cite the Biome rule name), and whether each missing rule matters for an App Router app.
5. Run `npm run typecheck`, `npm run build`, `npm run test` after the reformat. Record exit codes.
6. Commit the config change and the reformat as two separate commits. Report the SHAs.

## Self-check (mandatory)

Re-read your report. List each numbered step as PASS or FAIL with the command and exit code. Confirm `git status --short` in your worktree is empty after your commits and that nothing you started is still running (`ps -eo pid,etime,args | grep -E '[n]ode|[n]ext'`). You are not done until every item is PASS or FAIL with the reason.
