# SLIM-1 report

Card `SLIM-1`, issue #141, branch `beta/slim-1` off `origin/Vari8-Beta` (`7d38ad3`), PR #142 into
`Vari8-Beta`. Doc correction plus deletions, no behavior change.

Worktree `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/slim-1`.
Scratch logs `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/scratch/slim-1`.
Lane database `app_slim` on native Postgres 17.10 at `127.0.0.1:5433`.

## 1. Ledger delta

`icm/05-build/BACKEND-REDUCTION.md` moves from the Oct 19 audit basis to the SLIM-0 re-measure at
`7d38ad3`. History sections (the corrections table, the audit's section 1 table) stay in place and
are labelled as the audit basis.

| Row         |              Before |                     After | Reason                                                                 |
| ----------- | ------------------: | ------------------------: | ---------------------------------------------------------------------- |
| Prod base   |        60,588 lines | 65,848 lines in 288 files | Canvas excluded in both. 5,260 lines of growth since the audit.        |
| Total cut   |      23,224 (38.3%) |            26,592 (40.4%) | Rise of 3,368 lines.                                                   |
| Certain     |              18,553 |                    22,190 | F1 carries the tracker undercount.                                     |
| Conditional |               4,671 |                     4,402 | F4 -151, F11 -103, F12 -15.                                            |
| F1          |              10,809 |                    14,472 | 10,725 recomputed plus the 3,747 `app/(tracker)` undercount.           |
| F2          |               5,770 |                     5,851 | Re-measured 6,116 less the three kept components.                      |
| F4          |               2,370 |                     2,219 | `lib/coaching/daily-entry-impact.ts` (136) already deleted.            |
| F6          |                 532 |                       545 | Re-measured.                                                           |
| F7          |                 120 |              0 (NOW-USED) | PR-MEDIA (#128) wired `lib/storage.ts`. Off the PR-R1 file list.       |
| F11         |                 200 |                        97 | Merge happened: 792 to 695. The cut is what remains, and it is parked. |
| F12         |                  15 |                  0 (GONE) | `lib/auth/password-reset-delivery.ts` already deleted.                 |
| F15         | 48 models, 31 enums |       69 models, 38 enums | M-wave added tables. PR-R2's census runs on 69/38.                     |

Arithmetic, re-derived in the shell: certain 14,472 + 5,851 + 1,262 + 545 + 60 = 22,190.
Conditional 1,716 + 2,219 + 192 + 30 + 148 + 97 = 4,402. Total 26,592, which is 40.38 percent of
65,848 against 38.33 percent of 60,588 before. Rise 3,368, base growth 5,260, remaining prod
39,256.

The card states the reason for the rise as "3,747 is an undercount that was always there, 3,368 is
prod-base growth". The 3,747 figure holds. The 3,368 figure is the rise in the cut total, not the
prod-base growth: the base grew 5,260 lines (60,588 to 65,848). Both numbers are in the ledger with
that distinction, because attributing 3,368 to base growth does not reconcile against the base
table.

Prettier re-padded the findings table when the cells grew, so untouched rows appear in the diff as
padding only. Verified with `git diff -w`: content changed in F1, F7, F8, F9, F11, F12, F15 and in
the header, section 1, section 4 and section 5 only.

## 2. Deletions and probes

### 2a. `scripts/live-proof-pr05.mjs`: deleted

343 physical lines, 317 non-blank (the ledger's LOC rule), measured with `grep -cv '^\s*$'`.
No importer anywhere in the tree. Probes, verbatim:

```
## probe 1: db-types in code dirs
grep -rn "db-types" --include=*.ts --include=*.tsx --include=*.mjs lib app components scripts tests tools
exit=1                                   # no matches

## probe 2: live-proof-pr05 in code dirs
scripts/live-proof-pr05.mjs:7: *     node scripts/live-proof-pr05.mjs
exit=0                                   # its own usage comment, no import

## probe 3: live-proof-pr05 in package.json and docs
grep -rn "live-proof-pr05" package.json docs/
exit=1                                   # no matches

## probe 4: live-proof-pr05 anywhere except the file itself and icm
./scripts/live-proof-pr05.mjs:7: *     node scripts/live-proof-pr05.mjs
./scripts/AGENTS.md:5:Top-level files: db-fresh.ts, extract-sheets.ts, import-exercise.ts, import-nutrition.ts, live-proof-pr05.mjs
```

`scripts/AGENTS.md` is a generated directory router, so `npm run index` removed the filename from
it (see gate 2). After the deletion, re-grepping the tree outside `icm/` history returns only that
regenerated line, which no longer names the file.

### 2b. `lib/db-types/`: NOT deleted, two open branches import it

The card's branch probe found real imports. Deleting the directory here would break
`origin/beta/pr-m5-mealplan-payload` and `origin/beta/pr-m9-dashboard-config` when they merge, so
per the card ("if any branch holds a real import, stop and report it on the PR instead of
deleting") the directory stays and the finding goes to the PR.

```
## probe 5: git grep "db-types" on every open dependency branch
-- origin/beta/pr-m1-client-lifecycle      exit=1
-- origin/beta/pr-m2-preferences           exit=1
-- origin/beta/pr-m3-notes-tasks           exit=1
-- origin/beta/pr-m4-template-definitions  exit=1
-- origin/beta/pr-m5-mealplan-payload      exit=0
origin/beta/pr-m5-mealplan-payload:lib/mealplan/payload.ts:18: * (`lib/db-types/saved-meal.ts`) so meals move between plan and library
origin/beta/pr-m5-mealplan-payload:lib/mealplan/payload.ts:40:import type { MealTargets, TargetValue } from "../db-types/meal-targets";
origin/beta/pr-m5-mealplan-payload:lib/mealplan/payload.ts:41:import type { VariantSchedule } from "../db-types/iifym";
origin/beta/pr-m5-mealplan-payload:lib/nutrition/math.ts:22:import type { MealTargets, TargetValue } from "../db-types/meal-targets";
-- origin/beta/pr-m6-training-payload      exit=1
-- origin/beta/pr-m7-habits                exit=1
-- origin/beta/pr-m9-dashboard-config      exit=0
origin/beta/pr-m9-dashboard-config:lib/dashboard/adapter.ts:6: * mirrored for the server in `lib/db-types/dashboard-draft.ts`) is the
origin/beta/pr-m9-dashboard-config:lib/dashboard/adapter.ts:32:import type { DashboardDraft } from "../db-types/dashboard-draft";
origin/beta/pr-m9-dashboard-config:scripts/seed/36-dashboard.seed.ts:9:} from "../../lib/db-types/dashboard-draft";
origin/beta/pr-m9-dashboard-config:scripts/seed/36-dashboard.seed.ts:21: *   (PR-M0 `lib/db-types/dashboard-draft.ts`).
-- origin/beta/pr-sv4-invitations          exit=1
-- origin/beta/auth-client                 exit=1
```

Three of those are real type imports and one is a value import: `pr-m9`'s seed pulls
`dashboardDraft` (the value) plus the `DashboardDraft` type from `lib/db-types/dashboard-draft`,
and `pr-m5` pulls `MealTargets`, `TargetValue` and `VariantSchedule` from `meal-targets` and
`iifym` into two prod modules. Types are enough to break the build, so the directory is load
bearing for both branches.

The directory is 8 files and 248 non-blank lines, which matches SLIM-0 exactly:

```
lib/db-types/client-plans.ts:19     lib/db-types/meal-targets.ts:22
lib/db-types/dashboard-draft.ts:79  lib/db-types/message-links.ts:21
lib/db-types/iifym.ts:34            lib/db-types/saved-meal.ts:28
lib/db-types/index.ts:7             lib/db-types/template-slots.ts:38
TOTAL 248
```

Recommended follow-up, for the parent to route: land `pr-m5` and `pr-m9` first, or move
`meal-targets`, `iifym` and `dashboard-draft` into the modules that use them, then delete the
barrel. Until then 248 lines stay in the ledger and are not on any F row (SLIM-0 section 6, defect
6).

`live-proof-pr05` had no such problem: every hit on the other branches is `icm/` history prose, not
an import. Verbatim for `origin/beta/pr-m1-client-lifecycle` (the other eight branches show the
same shape: `icm/05-build/cards/*`, `icm/05-build/reports/*`, the file itself, and the generated
router line):

```
origin/beta/pr-m1-client-lifecycle:icm/05-build/cards/PR-05-finish.md:20:   - `node scripts/live-proof-pr05.mjs`
origin/beta/pr-m1-client-lifecycle:icm/05-build/reports/PR-05.md:127:## Live proof — `scripts/live-proof-pr05.mjs`
origin/beta/pr-m1-client-lifecycle:scripts/AGENTS.md:5:Top-level files: ... live-proof-pr05.mjs
origin/beta/pr-m1-client-lifecycle:scripts/live-proof-pr05.mjs:7: *     node scripts/live-proof-pr05.mjs
```

## 3. Seed repoint

`scripts/seed/00-workspace.seed.ts` now reads `../../lib/canvas/data/mock-data.json` instead of
`../../frontend/src/data/mock-data.json`, and the doc comment above `canvasClientNames()` names the
surviving copy (`lib/canvas/data/mock-data.json`, surfaced by `components/canvas/coach/model.ts`)
instead of the frontend one.

`cmp` proves the two files are identical before the repoint:

```
-rw-r--r--  20120 frontend/src/data/mock-data.json
-rw-r--r--  20120 lib/canvas/data/mock-data.json
cmp frontend/src/data/mock-data.json lib/canvas/data/mock-data.json
cmp_exit=0
206a95526342fe3fcbf6975579c4f9421ec88a09  frontend/src/data/mock-data.json
206a95526342fe3fcbf6975579c4f9421ec88a09  lib/canvas/data/mock-data.json
```

Both files are 20,120 bytes and share sha1 `206a95526342fe3fcbf6975579c4f9421ec88a09`, so the
repoint cannot change which names the seed writes. `frontend/` is untouched by this card and is
removed by a later one.

## 4. Gates

Every command from the worktree, `nice` and a log file for the long ones, logs in the scratch
directory. `npm ci` in the root and in `frontend/` both exit 0; no `node_modules` symlink.

| #   | Gate                                            | Command                                     | Exit | Log                         |
| --- | ----------------------------------------------- | ------------------------------------------- | ---: | --------------------------- |
| 1   | Root install                                    | `npm ci`                                    |    0 | `npm-ci-root.log`           |
| 1   | Frontend install                                | `npm ci` in `frontend/`                     |    0 | `npm-ci-frontend.log`       |
| 2   | Index generate                                  | `npm run index`                             |    0 | `gate-02-index.log`         |
| 2   | Index check                                     | `npm run index:check`                       |    0 | `gate-02-index-check.log`   |
| 3   | Format                                          | `npx prettier --check .`                    |    0 | `gate-03-prettier.log`      |
| 4   | Typecheck (also the post-delete `tsc --noEmit`) | `npm run typecheck`                         |    0 | `gate-04-typecheck.log`     |
| 4   | Lint                                            | `npm run lint`                              |    0 | `gate-04-lint.log`          |
| 5   | Build, `NODE_ENV` unset                         | `env -u NODE_ENV npm run build`             |    0 | `gate-05-build.log`         |
| 6   | Seed, main tree baseline                        | `seed-run.sh baseline-main <main checkout>` |    0 | `gate-06-seed-baseline.log` |
| 6   | Seed run 1, this branch                         | `seed-run.sh run-1-slim-1 <worktree>`       |    0 | `gate-06-seed-run1.log`     |
| 6   | Seed run 2, this branch                         | `seed-run.sh run-2-slim-1 <worktree>`       |    0 | `gate-06-seed-run2.log`     |

`npm run lint` exits 0 with 81 warnings and 0 errors (the `eslint` output in
`gate-04-lint.log`); no `--write`, no config change. The base-warning count could not be compared:
the main checkout's `node_modules` is out of sync with its `eslint.config.mjs` (`react-hooks`
plugin missing, exit 2), and installing there is not allowed. The warning count is therefore
recorded as measured on this branch only. The deletion cannot have changed it: the removed file
lints clean when restored and checked directly (`eslint scripts/live-proof-pr05.mjs` reports 0
errors and 0 warnings).

### Gate 6 detail, and the one deviation

`npm run db:fresh` shells out to `docker exec vari8-db-1 dropdb/createdb`. There is no docker
daemon on this machine (`dial unix /var/run/docker.sock: no such file`), while the lane database is
native Postgres 17.10 on 5433. So `db:fresh` itself cannot run here, and the gate was executed with
the same sequence driven directly: `drop database app_slim`, `create database app_slim`,
`npx prisma migrate deploy`, `npx tsx scripts/seed/index.ts`, then row counts. The script that does
it is `scratch/slim-1/seed-run.sh`, and it is the only deviation in the gate list. Nothing in the
repo was changed to accommodate it.

`DB_FRESH_SKIP_CATALOGS=1` in every run, because the raw workbook exports are not on this machine,
so `nutrition_catalog_item` and `exercise_catalog_item` stay empty in all three runs and are not
counted. The `SEED_*` credentials come from the environment the script exports, not from a file;
they are synthetic lane values and no secret is written here.

Counts, identical across the baseline (main tree at `7d38ad3`) and both runs on this branch:

| Table              | baseline-main | run-1-slim-1 | run-2-slim-1 |
| ------------------ | ------------: | -----------: | -----------: |
| `workspace`        |             2 |            2 |            2 |
| `client_profile`   |            15 |           15 |           15 |
| `users`            |             7 |            7 |            7 |
| `workspace_member` |             7 |            7 |            7 |
| `client_setup`     |             0 |            0 |            0 |
| `checkin_instance` |           119 |          119 |          119 |

The seed log agrees on the client count: `14 client profile(s) created, 15 total`.

## 5. Files touched

```
M  icm/05-build/BACKEND-REDUCTION.md
M  icm/05-build/reports/SLIM-1.md
M  scripts/AGENTS.md                      (regenerated by npm run index)
D  scripts/live-proof-pr05.mjs
M  scripts/seed/00-workspace.seed.ts
```

`frontend/`, `tools/parity`, `.github/workflows`, `tsconfig.json`, `eslint.config.*`,
`.prettierignore` and `docs/STATUS.md` are byte identical. No dependency added, no formatter change.
`lib/db-types/` stays, for the reason in 2b.
