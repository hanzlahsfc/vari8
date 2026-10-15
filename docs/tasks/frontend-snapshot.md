# FRONTEND snapshot publication

## Request and scope

Create `FRONTEND` from `main` in `hanzlahsfc/The-great-tracker-` and publish
this workspace's current UI. The user explicitly selected `frontend/` so the
existing full-stack application stays intact. No backend integration, deployment,
merge, authentication, database, or production behavior changes are part of this task.

Base: `c63ddfb01005d0e853906d2ad3e3445ee5e7e3d5`.

## Plan

1. Preserve the original workspace; prepare an isolated sparse `FRONTEND` worktree.
2. Commit this plan before importing files.
3. Copy the runnable UI source, dependencies lockfile, assets, documentation, and
   source tests into `frontend/`. Exclude dependencies, build output, local captures,
   environment files, and version archives.
4. Update `frontend/README.md` with `/coach` and an independent port. Exclude
   `frontend/` from the root TypeScript, ESLint, and Prettier projects. Add a root
   README pointer. Existing app and backend source must remain byte-identical.
5. Compare imported source hashes with the current workspace, run its 62 tests,
   check the staged diff, and obtain a separate read-only packaging review.
6. Commit the reviewed import and push only `refs/heads/FRONTEND` to the requested
   repository. Verify the remote commit and that `main` was not changed.

## Acceptance

- `main` is an ancestor of `FRONTEND`.
- Frontend source/assets match the tested current workspace.
- Root production app, backend, database, workflows, and tests are unchanged.
- Root tooling excludes the independent Next.js 16 frontend subproject.
- `git diff --check` succeeds; frontend tests report 62 passed, zero failed.
- The remote `FRONTEND` SHA equals the local publication commit.

## Verification baseline

The current frontend passed its production build, TypeScript checks, 62 tests,
and browser inspection on desktop and 390px mobile before publication. Imported
source hashes will establish applicability of that build/browser evidence.

## State

Verified snapshot, authorized for publication to `FRONTEND`.

- Imported 188 frontend files, including 186 byte-identical source/assets/config
  files, the frontend README, and the project's UI instructions.
- Exact imported snapshot: production `npm run build` exit 0; TypeScript and
  static route generation passed. Frontend test command from its README: exit 0,
  62 passed, zero failed.
- Source-hash comparison: zero mismatches. Staged path audit: zero dependency,
  build-output, environment, or archive paths. `git diff --cached --check`: exit 0.
- Independent read-only Luna packaging review: PASS. Its sole cleanup finding,
  an unstaged temporary dependency symlink, was removed after verification.
- Existing root app/backend/database/workflows/tests remain unchanged. Only the
  root README and three tooling exclusions change outside the new frontend/docs.
- Plan committed first as `85c3305`; this record accompanies the snapshot commit.
- Publish using a non-forced push of `FRONTEND` only, then verify the remote SHA
  and unchanged `main`. No PR, merge, deployment, or backend integration is requested.
