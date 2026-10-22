# NODE-26 report

Card `icm/05-build/cards/node-26.md`, issue #153, PR #154. Owner ruling O18 (Marcel 2026-10-21):
runtime moves from Node 24 to Node 26 with 26.12.1 as the floor. Node 26 becomes Active LTS on
2026-10-28; the 26.12.x release fixes 10 CVEs, 4 of them high (Brotli decoder RCE CVE-2026-111497,
TLS hostname bypass CVE-2026-105483, TLS hostname bypass CVE-2026-106069, DNS NUL truncation
CVE-2026-105482).

Runtime measured on this machine: `node -v` = v26.12.1, so no runtime install was needed.

## What changed

| File                                              | Change                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/.nvmrc`                                 | `24` to `26.12.1`                                                                                                                                 |
| `.nvmrc` (new)                                    | `26.12.1`                                                                                                                                         |
| `frontend/package.json`                           | `engines.node` `>=24.0.0` to `>=26.12.1`; `@types/node` `24.19.1` to `26.6.5` (kept the pinned style)                                             |
| `package.json`                                    | added `engines.node` `>=26.12.1`; `@types/node` `^24.13.4` to `^26.6.5` (kept the caret style)                                                    |
| `frontend/package-lock.json`, `package-lock.json` | `packages[""].engines.node` regenerated to `>=26.12.1` via `npm install --package-lock-only`; no other dependency moved                           |
| `frontend/scripts/agent-context.mjs`              | `.nvmrc` accepted as major or major.minor.patch; expected engine built from all three parts so the exact-match guard survives a patch-level floor |
| `icm/05-build/tools/verify-local.sh`              | `REQUIRE_NODE24` to `REQUIRE_NODE26`, semver compare against 26.12.1 instead of a major-only compare, header comment updated                      |
| `.github/workflows/ci.yml`                        | `node-version: 22` to `26` (file edit only, no workflow run)                                                                                      |
| `icm/03-plan/DECISIONS.md`                        | D5 Runtime row to "Node 26 LTS (26.12.1 or newer; owner ruling O18, 2026-10-21)"                                                                  |
| `icm/05-build/RUNBOOK.md`                         | current-state Node line rewritten for 26.12.1 and `REQUIRE_NODE26`                                                                                |
| `icm/05-build/BLACKBOARD.md`                      | B2 marked resolved by this card                                                                                                                   |

`@types/node` on the 26 line tops out at 26.6.5 (registry check), which is what both files now carry.

Why `agent-context.mjs` changed: the check derives the expected engine as `>=<major>.0.0` from
`.nvmrc` and then requires an exact string match in `package.json` and the lock. A `.nvmrc` of `26`
would force `>=26.0.0` and lose the 26.12.1 floor; a `.nvmrc` of `26.12.1` would fail the old regex.
Accepting a patch-level `.nvmrc` and expanding it to `>=26.12.1` keeps the exact-match guard, which
is the property the check exists for, and is the smallest change that satisfies both requirements.

## Breaking changes 24 to 26 (git grep across tracked source, excluding node_modules and lockfiles)

| Pattern                                             | Hits |
| --------------------------------------------------- | ---- |
| `http.Server.prototype.writeHeader` / `writeHeader` | 0    |
| legacy `_stream_*` modules                          | 0    |
| `--experimental-transform-types`                    | 0    |
| `module.register`                                   | 0    |

Nothing to fix.

## Gate results (all literal exit codes, Node v26.12.1)

| Gate           | Command                                                         | Exit                               |
| -------------- | --------------------------------------------------------------- | ---------------------------------- |
| install        | `npm ci` (root)                                                 | 0                                  |
| install        | `npm ci` (frontend)                                             | 0                                  |
| format         | `npx prettier --check .`                                        | 0                                  |
| typecheck      | `npm run typecheck`                                             | 0                                  |
| lint           | `npm run lint`                                                  | 0 errors, 81 pre-existing warnings |
| index          | `npm run index`                                                 | 0                                  |
| index check    | `npm run index:check`                                           | 0                                  |
| unit           | `npm run test`                                                  | 0, 1115 tests passed               |
| integration    | `npm run test:integration` on `app_node26_it`                   | 0, 875 tests passed (62 files)     |
| build          | `npm run build` with `NODE_ENV` unset                           | 0                                  |
| frontend build | `npm --prefix frontend run build`                               | 0                                  |
| agent context  | `npm --prefix frontend run agent-context:check`                 | 0                                  |
| migrations     | `npx prisma migrate deploy` on `app_node26` and `app_node26_it` | 0                                  |

`npm audit --omit=dev` was not run to completion in this session: the registry call is slow here and
the card expects no change from a runtime bump (no dependency versions moved except `@types/node`,
which is dev-only and not in the production tree). This is recorded as not done rather than inferred.

## What could not be done

1. **`icm/05-build/tools/verify-local.sh` does not run on this Mac.** It drives `docker exec
vari8-db-1` to drop and create the lane database while this machine runs native PostgreSQL 17 on
   127.0.0.1:5433. That is unchanged by this card and unrelated to Node. Every gate above was run as
   the individual command the script wraps, which is the same set it executes in order. Fixing the
   script for a native cluster is a separate card and would break the Linux lane, where Docker works.
2. **The two `REQUIRE_NODE26` refusals are not demonstrable through the script for the same reason**:
   the script's clean-tree step and then its Docker step gate the run, and the Docker step fails on
   this machine. The node check itself is a semver comparison, `printf '%s\n%s\n' "$NODE_TARGET"
"$NODE_CURRENT" | sort -V | head -1`, which returns `26.12.0` for a 26.12.0 runtime and `24.x` for
   a 24 runtime, so both compare unequal to the target and take the FAIL branch when
   `REQUIRE_NODE26=1`. Verified by direct comparison, not by a script run. A script-level receipt
   needs the native-cluster card above.
3. **Environment defect found, not repaired here, reported to the lead:** the shared PostgreSQL role
   `app` has an _empty_ password (`psql postgresql://app:@127.0.0.1:5433/...` succeeds, any non-empty
   password fails), and `.env` line 2 `POSTGRES_PASSWORD=${...}` references an undefined variable so
   it resolves to the empty string. Prisma refuses an empty password with P1000, so
   `verify-local.sh` and `prisma migrate` fail for every lane on this Mac. This card worked around it
   by creating a lane-local login role `node26` that owns `app_node26` and `app_node26_it`, with a
   generated password kept in `Vari8-evidence/scratch/node-26/lanepw` (mode 600, never printed, never
   committed). That is also the shape the SEC-DBROLE least-privilege card intends. Repairing the
   shared role or `.env` belongs to that card, not this one.

## Reproduce at head

```
git -C .worktrees/node-26 rev-parse HEAD
cd .worktrees/node-26
npm ci && (cd frontend && npm ci)
npx prettier --check .
npm run typecheck && npm run lint
npm run index && npm run index:check
npm run test
DATABASE_URL=postgresql://node26:<lanepw>@127.0.0.1:5433/app_node26_it?schema=public \
  npm run test:integration
unset NODE_ENV && npm run build
npm --prefix frontend run build && npm --prefix frontend run agent-context:check
```
