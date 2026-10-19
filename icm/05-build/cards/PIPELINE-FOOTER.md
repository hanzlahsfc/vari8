# Pipeline footer (every Vari8-Beta card)

Repo: hanzlahsfc/The-great-tracker-. Integration branch `Vari8-Beta`. GitHub Actions are manual-only (D13): never trigger them; run checks locally.

1. Your issue and branch already exist (named in the card). Work only in your worktree. Commit small, with explicit pathspecs (never `git add -A`), and push your branch early and after every meaningful commit: `git push -u origin HEAD`.
2. Open the PR against `Vari8-Beta` as soon as the first commit is pushed: `gh pr create --repo hanzlahsfc/The-great-tracker- --base Vari8-Beta --title "<card id>: <title>" --body "Closes #<issue>. ..."`. Keep the PR body current: what changed, why, local check output with exit codes, evidence.
3. Before you say done: rebase or merge the latest `origin/Vari8-Beta` into your branch, resolve conflicts at the root cause, re-run the checks, push. Local checks (D13): `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` at the root, `cd frontend && npm run build`, plus integration tests (`npm run test:integration` or the repo's equivalent) when you touched `db/`, `lib/` or `app/api/`, using your own database `app_<card>` on 127.0.0.1:5433 (user app; credentials in `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.env`; never print secrets), dropped at the end.
4. Canvas rule: Lilly's frontend (`frontend/`) must look exactly as it does today. Never change its markup, styles or visible copy unless the card says so. If your work touches what a screen shows, attach before/after screenshots at 1440 and 390 px.
5. Write `icm/05-build/reports/<card id>.md` in your branch: what changed, every command with exit code, what you could not do. Do not merge your own PR; an independent verifier on a different model decides SHIP or FIX.
6. End clean: stop every server and process you started, drop your databases, leave the worktree with no uncommitted changes.
7. No em dashes in docs. Never touch `docs/STATUS.md`.

- Since PR #65 (7072404): after merging origin/Vari8-Beta and before every push, run `npm run index` and make sure `npm run index:check` exits 0. Commit the regenerated `docs/index` and `AGENTS.md` routers with explicit pathspecs.
