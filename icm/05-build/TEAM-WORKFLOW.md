# Vari8 beta: team workflow

This file has everything you need to pick up beta work alongside us: how to set up, how the repo is organised, the workflow every change follows, and the tasks per contributor. It is written so you can hand it to your own agents as-is. When your PRs and ours are merged into `Vari8-Beta`, the four of us have the call and walk through the beta live.

## 1. The branch

- **`Vari8-Beta`** is the integration branch for the beta. Every task branches off it and merges back into it by PR.
- **`main`** stays untouched until you, us and Marcel have gone through the whole beta together.
- **`FRONTEND`** holds Lilly's canvas as the fixed visual reference. Don't commit to it.

## 2. Get set up

```
git fetch origin
git switch -c beta/<card-slug> origin/Vari8-Beta
cp .env.example .env                  # then fill BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d                  # PostgreSQL on 127.0.0.1:5433
npm ci && (cd frontend && npm ci)     # two installs: the root app and the canvas
npm run db:fresh                      # migrations plus seed data
npm run dev
```

Full details are in `README.md`, under "Local setup", "Environment variables" and "Authentication".

The seed creates sign-in accounts for owner, coach and client in the demo workspace, plus a coach in a second workspace. The seed needs all 8 `SEED_*` variables set. `.env.example` currently lists only two of them, and we fix that in the next PR that touches the file.

## 3. How the repo is organised (ICM)

We run the project on ICM (Interpretable Context Methodology). The repo is a set of stages. Each one reads the previous stage's output and writes its own.

- **Read down and stop early:**
  1. Root `AGENTS.md`: the rules.
  2. Root `CONTEXT.md`: which stage to open for a given task.
  3. That stage's `CONTEXT.md`: its inputs, process and outputs.
  4. Only the files that stage names.

  Nobody crawls the tree, people or agents.

- **Stages** under `icm/`:
  - `01-recon`: what the canvas and the backend each have
  - `02-gap-matrix`: what is wired, unwired or missing
  - `03-plan`: the approved program, PR order and gates
  - `05-build`: cards, reports, tools
  - `05-verify`: checks before merge
- **Status is what exists in each stage's `output/`.** No status file is kept by hand.
- **One fact, one home.** A rule lives in one file and everything else links to it:
  - decisions in `icm/03-plan/DECISIONS.md`
  - owner rulings O1 to O16 in `docs/product-decisions.md`
  - the canvas-to-backend map in `icm/03-plan/output/WIRING-SPEC.md`
  - the program in `icm/03-plan/output/PLAN.md`
- **Every task is a card:** `icm/05-build/cards/<slug>.md`. Each card has its read-first list, the files it owns, what to build, the acceptance list and the checks.
  - The "Driver steps" and "Gear" sections, and any local machine paths, belong to our tooling. Skip them.
  - The acceptance list is the contract.
- **Every PR leaves a report:** `icm/05-build/reports/<card id>.md`. It holds the head commit, the changed paths, every command run with its exit code, and anything you could not do.
- **The system index:** `docs/index/` is a generated map of the repo. Run `npm run index` after you change files and `npm run index:check` before you push, so the map never goes stale.

## 4. The workflow every change follows

1. **Issue first.** Create a GitHub issue labelled `vari8-beta`, titled with the card id, for example `[PR-31] PWA install and the Capacitor 8 scope`. The acceptance list goes in the body. Check first that it doesn't already exist: `gh issue list --label vari8-beta --search "[PR-31] in:title" --state all`.
2. **Branch** `beta/<card-slug>` off the latest `origin/Vari8-Beta`.
3. **PR early.** Push the first commit and open the PR into `Vari8-Beta` straight away, titled `[<card id>] <title>`, with `Closes #<issue>` in the body. Keep the body current: what changed, why, and what is still open.
4. **Build to the card.** Small commits, explicit file paths, push after every meaningful commit.
5. **Stay current.** Before you call it done, merge the latest `origin/Vari8-Beta` into your branch and resolve conflicts at the root.
6. **Run the gates** in section 5, all exit 0, and write the report file.
7. **Mark the PR ready** (not draft) and tell Marcel. Then the checks on our side run:
   - **The live app:** the card's acceptance driven in a browser at 1440 and 390 px.
   - **Security:** for anything that reads data, a check that one workspace or client cannot see another's.
   - **The canvas comparison:** for anything that renders.
   - **Your tests:** we break the code your tests guard on purpose, to confirm the tests catch it.
   - **On demand:** you can also ask @Hermes in Slack (`#vari8-project`) to run a review of your PR with Devin on Marcel's MacBook. Post the PR link and the findings come back in the thread. Use it as an early check while you work, as well as at the end.
8. **Review.** The verdict is either **SHIP** (we merge) or **FIX** (a PR comment with file and line). On FIX, you push the fix to the same branch and it gets checked again. After three FIX rounds the card stops and Marcel decides.
9. **Merge and clean up.** We merge with a merge commit, delete the branch on GitHub (auto-delete is off in this repo), and close the issue.

Nobody merges their own PR: the person who built a change never verifies it. That applies to our PRs as well.

## 5. Before you push

All of these must exit 0:

```
npx prettier --check .
npm run typecheck
npm run lint
npm run index && npm run index:check
npx vitest run <the test files your change touches>
npm run build
```

If your change touches what a screen shows, also run the canvas comparison and attach before and after screenshots at 1440 and 390 px:

```
PARITY_AA_TOLERANCE=0 npm run parity      # must print: parity PASS: 0 problem(s)
```

The full gate is `icm/05-build/tools/verify-local.sh`. It needs `BASE_SHA` (the merge base with `origin/Vari8-Beta`) and `LANE_DB` (a database name of your own). The header of the script lists the rest.

## 6. Rules, and why

- **Commit with explicit file paths.** Never use `git add -A`. Parallel work leaves stray files that don't belong in your PR.
- **Never trigger GitHub Actions.** All checks run locally, and the workflows are manual on purpose.
- **Don't edit `docs/STATUS.md`.** It is the history file, and several branches writing to it at once conflicts on every merge.
- **Don't change what Lilly's canvas looks like.** It is the fixed reference, and the comparison fails on a single changed pixel. Wire data into the canvas, never redesign it.
- **The database follows the canvas.** A field exists because a canvas screen shows it.
- **Workspace isolation is not optional.** Every read is scoped to the signed-in workspace, and a test proves a foreign workspace sees nothing.
- **Don't commit secrets.** Real values stay in `.env`, and `.env.example` gets placeholders only.

## 7. For your agents

Paste this block at the top of any agent task:

> Repo hanzlahsfc/The-great-tracker-. Integration branch `Vari8-Beta`, never `main`. Read the root `AGENTS.md`, then `CONTEXT.md`, then only the stage and card files they name; do not crawl the tree. Your task is card `icm/05-build/cards/<slug>.md`. Skip its "Driver steps" and "Gear" sections and any local machine paths. Its acceptance list is the contract. Work on branch `beta/<slug>` off the latest `origin/Vari8-Beta`. The issue is labelled `vari8-beta`, and the PR goes into `Vari8-Beta` with `Closes #<issue>`. Commit small with explicit file paths, push early, run every command in section 5 of the team workflow file to exit 0, write `icm/05-build/reports/<card id>.md`, and mark the PR ready. Never change the canvas look, never trigger GitHub Actions, never edit `docs/STATUS.md`, never commit secrets, never merge your own PR.

## 8. Your tasks, in order

| #   | Card                                                                              | What it delivers                                                                                                                                                                                   | Can start                                                                          |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `pr-31-pwa-mobile`                                                                | The app installs as a PWA, and the Capacitor 8 shell is set up for iOS and Android. Native sign-in uses the bearer token (ruling O1); web keeps the cookie session.                                | **Now.** The auth foundation (#69) and identity (#134) are merged.                 |
| 2   | `pr-sv2-daily-series`                                                             | The server read model for daily-entry number history. The client tracker trends read from it.                                                                                                      | When the client data model PR #106 merges. We expect that tonight.                 |
| 3   | `pr-sv3-widget-feeds`                                                             | The server feeds behind the coach dashboard widgets.                                                                                                                                               | After your SV2, plus the meal plan, training and habits models (#114, #116, #118). |
| 4   | `pr-r1-delete-superseded`, then `pr-r2-schema-reduction`, then `pr-r3-flags-deps` | Remove the old UI pages the canvas replaced, then the database models nobody reads anymore, then unused flags and dependencies. These mostly touch your original code, so you know best what goes. | Second wave, after the last canvas screen is wired.                                |

Our tracker screen builds on your SV2 and our dashboard builds on your SV3. If you can't start SV2 within a day of #106 merging, tell Marcel and we'll take it, so the screens aren't blocked.

## 9. What we finish on our side

- The remaining data-model PRs (#106 to #124), media upload (#128), the restyled sign-in pages (#130) and messaging.
- The roster and calendar read model (SV1) and invitations (SV4).
- Every canvas screen wired to the backend: roster and profile, templates, tracker, habits, check-ins, nutrition, training, dashboard, notes and appearance.
- README, setup guide and the final system index, after your reduction PRs.

## 10. Open item

The client settings screen waits on Lilly's design (ruling O3). Nobody builds it until that design lands.
