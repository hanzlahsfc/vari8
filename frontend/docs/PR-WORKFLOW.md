# FRONTEND pull request workflow

This guide updates the standalone UI in the GitHub publication clone of
`hanzlahsfc/The-great-tracker-`. The local `ui sys` source workspace is a
separate checkout with unrelated Git history. Copy only the mapped product and
context files into the publication clone; never sync, branch, or push the target
repository from the source workspace's Git history or `origin` remote.

`FRONTEND` is the shared UI integration branch. Contributors create a feature
branch from `great-tracker/FRONTEND` and open a pull request from that feature
branch into `FRONTEND`. Hanzlah owns the later promotion from `FRONTEND` to
`main`. Do not push directly to `FRONTEND` or merge `main` into a feature branch.
Use the explicitly configured `great-tracker` remote for all target operations;
`origin` may point at another repository.

## Start a feature branch

Run these commands from a clean publication checkout. Stop if the worktree is
dirty or the remote URL differs from the target. Commit or resolve existing
work before continuing; do not stash or discard it.

```sh
git status --short --branch
git remote get-url great-tracker
```

The remote URL must be `https://github.com/hanzlahsfc/The-great-tracker-.git`.
Fetch only the shared integration branch, then create a task-specific feature
branch from it:

```sh
git fetch great-tracker \
  refs/heads/FRONTEND:refs/remotes/great-tracker/FRONTEND
git switch --detach great-tracker/FRONTEND
git switch -c codex/my-frontend-change
```

If `FRONTEND` advances while the feature is in progress, fetch its explicit ref
again and merge `great-tracker/FRONTEND` into the feature branch. Do not merge
`main`, rebase or rewrite shared history, or push the shared `FRONTEND` branch.
Resolve conflicts by reviewing both sides.

## Refresh and verify the frontend

The source UI maps into `frontend/` as documented in
[`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md). Overlay additively: preserve
target-only tests and configuration, and keep the standalone frontend README.
Exclude dependencies, `.next`, environment files, local run data, and capture
archives. Do not modify the root full-stack workflow for a frontend-only change.

From the repository root, run:

```sh
cd frontend
npm ci
npm run check
```

`npm run check` discovers `*.test.*` and `*.checks.*` files under `src/` and
`scripts/`, including TypeScript tests. It also checks the ICM context contract,
typechecks, runs Biome, and builds the production frontend. The focused context
test can be run with `npm run agent-context:test`; check references and mappings
with `npm run agent-context:check`. After changing UI behavior, inspect the actual
`/coach` flow at desktop and mobile widths and record what you exercised.

Before committing, return to the repository root and run:

```sh
cd ..
git diff --check
git status --short --branch
```

Review the complete diff and ensure no credentials, local data, generated files,
or unrelated paths are included. Commit only the intended changes with explicit
paths; never use `git add -A` for this repository.

## Push and open a draft PR

Push only the task-specific feature branch to the explicit target remote. A
non-forced push stops if the remote branch changed unexpectedly.

```sh
git push -u great-tracker codex/my-frontend-change
gh pr create --draft \
  --repo hanzlahsfc/The-great-tracker- \
  --base FRONTEND \
  --head codex/my-frontend-change \
  --title "feat(frontend): describe the change" \
  --body-file /path/to/reviewed-pr-body.md
```

Check for an existing PR before opening another:

```sh
gh pr list --repo hanzlahsfc/The-great-tracker- \
  --head codex/my-frontend-change --base FRONTEND
```

The `Frontend / verify` workflow runs for frontend changes on PRs to
`FRONTEND` or `main`, and pushes to `main` or `FRONTEND`. The existing root `CI`
workflow retains its full trigger and jobs. After review and passing checks,
merge the feature PR into `FRONTEND` using the repository's allowed method.
Hanzlah owns any later promotion from `FRONTEND` to `main`; contributors must not
open a PR from `FRONTEND` to `main` or push to `main`.
