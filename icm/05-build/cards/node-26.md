# NODE-26: runtime moves from Node 24 to Node 26

Owner ruling O18 (Marcel, 2026-10-21). Node 26 becomes Active LTS on 2026-10-28 (supported to 2029-04-30).
Today's Node security release fixes 10 CVEs, 4 high: Brotli decoder RCE CVE-2026-111497, TLS hostname bypasses
CVE-2026-105483 and CVE-2026-106069, DNS NUL truncation CVE-2026-105482. The patched 26 line is 26.12.1, so
26.12.1 is the floor. This Mac already runs v26.12.1, so no runtime install is needed.

Repo `hanzlahsfc/The-great-tracker-`. Branch `beta/node-26` off the latest `origin/Vari8-Beta`.
Worktree `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/node-26`.
Pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding. Lane database `app_node26` on
127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first). Dev port 3940. May touch `db/`: no.

## Change (one PR, explicit pathspecs, never `git add -A`)

1. `frontend/.nvmrc` 24 -> 26. Add a root `.nvmrc` containing 26 as well.
2. `engines.node` to `">=26.12.1"` in `frontend/package.json`, and add the same `engines` block to the root
   `package.json`. Regenerate both lockfiles' engine fields with `npm install --package-lock-only` (no other
   dependency changes). `frontend/scripts/agent-context.mjs:117-136` checks that `.nvmrc`, engines and lock
   agree; it must exit 0.
3. `@types/node` to the 26 line in both package.json files. Root is `^24.13.4` (caret style), frontend is
   `24.19.1` (pinned style). Keep each file's existing pin style. Typecheck must stay 0; fix only what the
   new types actually break.
4. `icm/05-build/tools/verify-local.sh`: replace `REQUIRE_NODE24` with `REQUIRE_NODE26` (refuse anything
   below 26.12.1), update the header comment at line 7, and change the node-version WARN step to compare
   against 26.
5. `.github/workflows/ci.yml:35` `node-version: 22` -> `26`. File edit only. NEVER trigger Actions, never
   push to a branch that runs them.
6. `icm/03-plan/DECISIONS.md` D5 Runtime row: "Node 26 LTS (26.12.1 or newer; owner ruling O18, 2026-10-21)".
   Update the current-state lines in `icm/05-build/RUNBOOK.md:63` and `icm/05-build/BLACKBOARD.md:32`.
   Leave historical reports and audits untouched; they record what ran at the time.
7. Breaking changes 24 -> 26 to check with `git grep` and fix if used: `http.Server.prototype.writeHeader`,
   legacy `_stream_*` modules, `--experimental-transform-types`, `module.register()` (now deprecated).
   Report each with its hit count, zero included.

## Acceptance (all on Node 26.12.1, `node -v` recorded in the report)

- `npx prettier --check .`, `npm run typecheck`, `npm run lint`, `npm run index` then `npm run index:check`
  = 0, `npm run test`, `npm run test:integration` (its own disposable DB `app_node26_it`), `npm run build`
  with `NODE_ENV` unset, `cd frontend && npm run build`, and the e2e suite if it runs locally. All exit 0.
  Paste the literal exit code of each.
- The agent-context check (`node frontend/scripts/agent-context.mjs`, or whatever npm script wraps it)
  exits 0.
- `icm/05-build/tools/verify-local.sh` with `REQUIRE_NODE26=1` passes on 26.12.1 and refuses on a simulated
  older version. Show both outcomes.
- `npm audit --omit=dev` high count reported before and after (no change expected; do NOT run `audit fix`).
- Report at `icm/05-build/reports/NODE-26.md` with every command and exit code.

READY line goes in `$HOME/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/READY.log`:
`READY node-26 PR#<n> <head-sha>`. Do not merge your own PR. An independent verifier decides SHIP or FIX.
