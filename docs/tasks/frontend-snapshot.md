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

## 2026-10-17 — refresh and review workflow

The user authorized preparing a PR from `FRONTEND` to `main` for the current UI.
Preserve published history by merging the latest `great-tracker/main` into
`FRONTEND`; never merge the separate source workspace's commit history. Refresh
the bounded snapshot by overlaying the UI source into `frontend/`:

- `src/`, `public/`, `scripts/`, and `prompts/` map to their matching paths under
  `frontend/`.
- `MEALPLANS.md` and `TRACKER-REDESIGN.md` map to `frontend/`.
- Keep the published `frontend/README.md`, which documents the standalone preview.
- Keep published-only tests when overlaying source; do not delete by mirroring.
- Exclude dependency trees, build output, environment files, local snapshots, and
  verification artifacts.

Run `npm ci` and `npm run check` from `frontend/` before opening or updating the
PR. The `Frontend` GitHub Actions workflow runs the same gates for changes under
`frontend/` on PRs to `main` and on pushes to `main` or `FRONTEND`. The existing
root `CI` workflow remains unchanged and continues to run its full-stack checks.

## 2026-10-18 — PR workflow and ICM context follow-up plan

### State before this follow-up plan

The source UI overlay and initial frontend workflow already exist as uncommitted
changes in the publication worktree. They were created before this plan update;
this plan records only the remaining integration work and does not represent that
earlier overlay as plan-first work. The published `FRONTEND` history is intact,
the latest `great-tracker/main` is already merged, and a safety ref records the
pre-sync branch. The source workspace remains a detached working tree and is the
authoritative current UI snapshot, including its tracked edits and intended
untracked product files.

### Follow-up scope

Keep changes confined to `frontend/` plus this task record. Preserve root backend
configuration and `.github/workflows/ci.yml`. The current UI maps additively from
the source workspace as follows:

- `src/`, `public/`, `scripts/`, and `prompts/` → `frontend/src/`,
  `frontend/public/`, `frontend/scripts/`, and `frontend/prompts/`.
- `MEALPLANS.md` and `TRACKER-REDESIGN.md` → the matching paths under
  `frontend/`.
- Local project context and ICM adaptation → `frontend/AGENTS.md`,
  `frontend/CLAUDE.md`, `frontend/DEVIN.md`, `frontend/PROJECT_CONTEXT.md`,
  `frontend/docs/agent-workflow/**`, `frontend/docs/references/icm.md`,
  and the pinned conductor reference/provenance under
  `frontend/docs/conductor-generic/`.
- `scripts/agent-context.mjs` and its test → `frontend/scripts/`, with the
  context-check and test commands included in frontend verification only after
  the source checker’s final contract and test pass review.
- Durable branch lifecycle → `frontend/docs/PR-WORKFLOW.md`, including the
  exact remote/branch preflight, safe sync, local gate, push, and draft PR commands.

Keep the published `frontend/README.md` as the canonical runnable-preview
guide; update it with the source-context entrypoints rather than replacing it
with the source workspace README. Preserve the target’s existing frontend-only
tests and configuration. Do not copy `.git`, `node_modules`, `.next`, credentials,
environment data, local run outputs, screenshots/artifact archives, or
unrelated source-workspace files. Keep root backend workflows and their trigger
behavior unchanged.

### Ordered plan and acceptance

1. Recheck the publication branch, safety ref, target `main` and `FRONTEND` refs,
   and source worktree status. Use only the explicit `great-tracker` remote for
   the target repository. Preserve a manifest and diff evidence under `/private/tmp`.
2. Finalize and independently inspect the source context checker, stage contracts,
   ICM reference, and portable handoff output before copying those files. Keep
   project-specific requirements grounded in the target tree; distinguish this
   standalone preview from full-stack authorization and audit gates.
3. Overlay only the mapped files listed above and add
   `frontend/docs/PR-WORKFLOW.md`. Add the context checker’s
   deterministic test and local check commands to the frontend gate after its
   fixtures and path/link checks pass. Keep the frontend CI workflow path-filtered
   and leave the root CI workflow byte-identical.
4. Run `npm ci`, `npm run test`, `npm run typecheck`, `npm run lint`,
   `npm run build`, context-check/test commands, `git diff --check`, and the
   required browser inspection on the exact final tree. Include the 15 preserved
   publication tests; report any baseline/backend checks separately.
5. Obtain independent review of the final diff/workflow and UI visual evidence.
   Repair findings and rerun affected gates. Do not claim browser, accessibility,
   or security review evidence that was not actually collected.
6. Commit the implementation and publish only `FRONTEND` to the explicit target
   repository. Open a draft PR from `FRONTEND` to `main` with
   `gh pr create --draft --repo hanzlahsfc/The-great-tracker- --base main --head FRONTEND`.
   This workflow targets `main`; it does not use `FRONTEND` as a PR base. Do not
   merge the PR.

Acceptance requires all frontend and context gates to pass on the final tree,
all intended source files to match the source snapshot, all 15 publication-only
tests to remain present and pass, no generated/runtime/secret paths in the diff,
the root CI workflow to remain unchanged, independent review and browser evidence
to be recorded, and the draft PR to reference the verified target branch heads.
