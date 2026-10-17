# FRONTEND pull request workflow

This guide updates the standalone UI in the GitHub publication clone of
`hanzlahsfc/The-great-tracker-`. The local `ui sys` source workspace is a
separate checkout with unrelated Git history. Copy only the mapped product and
context files into the publication clone; never sync, branch, or push the target
repository from the source workspace's Git history or `origin` remote. The
published feature branch is `FRONTEND`, and pull requests from it target `main`.
The `origin` remote may point at a different repository; use the explicitly
configured `great-tracker` remote for all target operations.

## Start from a clean publication checkout

Run these commands from the repository root. Stop if the worktree is dirty,
the current branch is not `FRONTEND`, or the remote URL differs from the target.
Commit or resolve existing work before continuing; do not stash or discard it.

```sh
git status --short --branch
git branch --show-current
git remote get-url great-tracker
```

The remote URL must be `https://github.com/hanzlahsfc/The-great-tracker-.git`.
Fetch the two target refs explicitly, then merge the latest `main` into
`FRONTEND`. This preserves the published branch history; do not rebase the
shared branch or merge unrelated source-workspace history.

```sh
git fetch great-tracker \
  refs/heads/main:refs/remotes/great-tracker/main \
  refs/heads/FRONTEND:refs/remotes/great-tracker/FRONTEND
git merge --ff-only great-tracker/FRONTEND
git merge --no-edit great-tracker/main
```

If the remote branch advanced concurrently and the merge or later push is
rejected, fetch the explicit refs again, inspect the new history, and merge
`great-tracker/main` again. Resolve conflicts by reviewing both sides; never
force-push or reset the published branch.

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

Push only `FRONTEND` to the explicit target remote. A non-forced push will stop
if the target branch changed unexpectedly.

```sh
git push great-tracker FRONTEND
gh pr create --draft \
  --repo hanzlahsfc/The-great-tracker- \
  --base main \
  --head FRONTEND \
  --title "feat(frontend): refresh coaching workspace" \
  --body-file /path/to/reviewed-pr-body.md
```

Check for an existing PR before opening another:

```sh
gh pr list --repo hanzlahsfc/The-great-tracker- --head FRONTEND --base main
```

The `Frontend / verify` workflow runs for frontend changes on PRs to `main` and
pushes to `main` or `FRONTEND`. The existing root `CI` workflow retains its full
trigger and jobs. This guide does not change repository branch protection or
mark a status as required. Do not merge the PR; wait for review and CI, then let
the repository owner decide how to complete it.
