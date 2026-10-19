# RUNBOOK: Vari8-Beta lanes

How every lane runs on this machine. Cards point here. Facts measured on 2026-10-19 between 02:10 and 02:55.

## Paths

| What                                                        | Path                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| Root checkout (read-only for lanes, no installs, no builds) | `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8`       |
| Integration worktree, branch `Vari8-Beta`                   | `/home/nexuslink/vari8-worktrees/beta`                    |
| Card worktrees, branch `beta/<card-slug>`                   | `/home/nexuslink/vari8-worktrees/<card-slug>`             |
| Evidence (outside git, per PR id)                           | `/home/nexuslink/vari8-worktrees/_evidence/<PR-id>/`      |
| Merge log and fast-gate logs                                | `/home/nexuslink/vari8-worktrees/_live/`                  |
| Locks (integration, Devin slots, e2e)                       | `/home/nexuslink/vari8-worktrees/.locks/`                 |
| Card bodies and the board id map                            | `icm/05-build/cards/`, `icm/05-build/cards/board-ids.tsv` |

Branches that existed before the program (the GATE-CLEAN baseline): `main`, `FRONTEND`, `TRACKER`, `Vari8-Beta`, and the remote feature branches listed by `git branch -r` at `55a0f08`.

## Worktrees

The kanban dispatcher reuses an existing worktree at a path outside a git repo but cannot create one there (`hermes_cli/kanban_db_workspace.py`). Create them first, from the latest `origin/Vari8-Beta`:

```bash
cd /home/nexuslink/vari8-worktrees/beta && icm/05-build/tools/prep-worktrees.sh
```

Idempotent; skips cards that already shipped and reuses the in-flight worktrees (`parity-harness`, `system-index`, `pr-05-auth-api`, `pr-03-test-audit`, `pr-03-react-hooks`).

## Database per lane

Postgres runs in Docker container `vari8-db-1` on `127.0.0.1:5433`, user `app`. The password lives in the root `.env` (`POSTGRES_PASSWORD`); never print it.

- Each lane owns one database named `app_<taskid>`: build `app_pr01`, verify `app_verify_pr01`, merge `app_merge_pr01`. Names must match `^app_[a-z0-9_]+$`. `app_dev` belongs to the owner and no lane touches it.
- Create: `docker exec vari8-db-1 createdb -U app app_pr01`. Drop at the end: `docker exec vari8-db-1 dropdb -U app --if-exists app_pr01`.
- URL: `postgresql://app:$POSTGRES_PASSWORD@127.0.0.1:5433/app_pr01?schema=public`.
- Schema: `npx prisma migrate deploy`. Only PR-05, PR-M0 and PR-R2 may change `db/` (D34); `verify-local.sh` fails any other branch that does.

## Ports

Each card gets three ports from the generator (build, verify, merge), printed in the card header; PR-01 uses 3716, 3717, 3718. The parity harness uses the lane port plus one. Before PR-03 the Playwright specs use fixed ports 3000, 3101 and 3102, so `verify-local.sh` serializes browser runs with `.locks/e2e.lock`.

## Dev user before PR-04

Until PR-04 lands `npm run db:fresh`, create the sign-in user on a lane database with:

```bash
DATABASE_URL=postgresql://app:$POSTGRES_PASSWORD@127.0.0.1:5433/app_pr01?schema=public \
DEV_USER_EMAIL=owner@vari8.test DEV_USER_PASSWORD=<choose one, keep it out of git> \
npx tsx icm/05-build/tools/dev-user.ts
```

It upserts "Liliana Mansfeld", status ACTIVE, role WORKSPACE_OWNER of one workspace. Synthetic data only.

## Running the apps

| App                                             | Command                                                                                                | Notes                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Root app (backend and, after PR-01, the canvas) | `npm ci && npx prisma generate && PORT=<lane port> npm run dev`                                        | needs `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`) |
| Canvas today (`frontend/`)                      | `cd frontend && npm ci && npm run dev -- --port <port>`                                                | parity baseline until PR-R1 deletes it                          |
| Parity harness (PR-P1)                          | `npm run parity` (`PARITY_PORT`, or `PARITY_URL` for a running app); `-- --update-baseline` recaptures | report at `tools/parity/out/report.html`                        |
| System index (PR-X1)                            | `npm run index`, `npm run index:check`                                                                 | deterministic; check fails on drift                             |

Node: `/usr/bin/node` is v26.7.0; `frontend/.nvmrc` says 24. TEST-AUDIT ran green on 26. `REQUIRE_NODE24=1` makes the gate refuse other versions once `mise install node@24` has run.

## Local check (D13)

Both `verify-local.sh` and `integrate.sh` read the database password from `POSTGRES_PASSWORD` and stop with exit 2 when it is unset; no default is compiled in. Load it without printing it: `set -a; . /home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.env; set +a`.

```bash
BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_pr01 LANE_PORT=3716 CARD=PR-01 \
  icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-01-canvas-takeover.check.log 2>&1; echo EXIT=$?
```

Steps: format check on changed files, typecheck, lint, unit tests, integration tests when `db/`, `lib/` or `app/api/` changed, build, the D34 schema guard, e2e flow specs, and the parity regression once the harness is on the branch. It creates and drops `LANE_DB` (`KEEP_DB=1` keeps it), refuses the root checkout, and prints a PASS or FAIL summary block for the PR comment. Exit 0 pass, 1 a step failed, 2 setup error. A pass is not a verdict: the verifier's live receipt and parity evidence still decide.

## Devin builders

Max 5 at once (RAM). Every launch goes through the slot wrapper, which counts every running `devin` binary (including runs started outside the graph) and holds a flock slot:

```bash
cd <worktree> && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap \
  devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/<card-slug>.md \
  > /home/nexuslink/vari8-worktrees/<card-slug>.devin.log 2>&1
```

The yamato driver blocks until Devin exits, then runs the local check. Gear: the card names the SOUL and skills Devin loads (kakashi architecture, itachi UI wiring, gowther data and seeds, jiraiya docs, zenitsu parity).

## GitHub pipeline (02:25 and 02:35 rules)

1. Issue first, label `vari8-beta`, title `[<PR-id>] <title>` (the driver step searches before creating).
2. Branch `beta/<card-slug>` off the latest `origin/Vari8-Beta`; push early; draft PR against `Vari8-Beta` that says `Closes #<issue>`.
3. Local check output in a PR comment. The verifier comments `SHIP <PR-id> <head sha>` or `FIX <PR-id> <head sha>` with its evidence.
4. Merge only through `icm/05-build/tools/integrate.sh <PR-id> beta/<card-slug>` from the merge card worktree: one lock, SHIP check for the current head, test merge with the base, fast gate on `app_merge_<id>`, `gh pr merge --merge --match-head-commit`, issue closed, remote and local branches deleted, worktrees removed, `git worktree prune`. Exit 3 conflict, 4 no SHIP for this head, 5 fast gate red; each comments `FIX` on the PR. `INTEGRATE_DRY_RUN=1` stops before the merge.
5. Actions stay manual-only. Never trigger a workflow.

## Board

```bash
hermes kanban --board vari8 list                       # 146 cards
python3 icm/05-build/tools/board.py --dry-run           # print the create commands
python3 icm/05-build/tools/board.py                     # create missing cards (idempotent), ids in cards/board-ids.tsv
python3 icm/05-build/tools/board.py --sync              # make cards match graph.json: body, model, parent links
python3 icm/05-build/tools/board.py --release --dry-run # list what a release would unblock
python3 icm/05-build/tools/board.py --release --watch   # orchestrator go step: release as parents finish
```

Every card was created blocked so nothing dispatches before the graph check. `--release` unblocks only blocked cards whose every parent is done and reads each status back; cards with open parents stay blocked, and `--watch` repeats the release every 60 seconds. In-flight external builds have no assignee and are never released; the orchestrator completes them with `hermes kanban --board vari8 complete <id> --result "<PR url> <head sha>"` when their builders exit. Measured on a throwaway board: `hermes kanban unblock` sends a card with an open parent to todo, not ready; the script does not depend on that.

## Regenerating the plan

```bash
python3 icm/05-build/tools/program.py && python3 icm/05-build/tools/plan_v2.py
```

`program_data.py` is the single source. The generator writes the cards, `graph.json`, `graph-summary.json`, `coverage-ledger.csv` and `timeline.md`, and exits 1 on any unmapped ledger row, cycle, missing build, verify or merge card, or a verifier on the builder's model.
