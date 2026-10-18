# Coaching UI frontend

This is the current standalone frontend snapshot. The repository's existing
full-stack application remains at the root; this preview is not wired to its backend.
All people and readings in the preview are illustrative.

## Run the frontend

Use Node.js 24. From the repository root:

```sh
cd frontend
npm ci
npm run dev -- --port 3001
```

Open [the coach workspace](http://127.0.0.1:3001/coach). The template library's
Preview opens the client experience, including the daily tracker, weekly ledger,
trends, and eight weeks of example data. `/ethereal` opens the original design studio.

For a production preview:

```sh
npm run build
npm run start -- --port 3001
```

## Check the frontend

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run check
```

`npm test` discovers `*.test.*` and `*.checks.*` files under `src/` and
`scripts/`, including the TypeScript meal-plan model tests. `npm run check`
runs the same test, project-context, type, lint, and production-build gates used
by frontend CI. `npm run agent-context:test` runs the focused handoff/reference
checker tests; `npm run agent-context:check` verifies the context contract.

## Project context

Read [AGENTS.md](AGENTS.md) and [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before
changing product behavior. Use [the workflow router](docs/agent-workflow/CONTEXT.md)
to select only the relevant stage and role context. The ICM structure is a
file-based context and handoff adaptation; it does not add a runtime framework
or substitute for application authorization. See [the ICM reference](docs/references/icm.md)
for the paper, local mapping, and adaptation limits.

For branch sync, frontend checks, and draft PR commands, follow the
[FRONTEND pull request workflow](docs/PR-WORKFLOW.md). It targets the explicit
`great-tracker` remote and opens feature-branch PRs into `FRONTEND`. Hanzlah
owns the later `FRONTEND` to `main` promotion.

The frontend uses Next.js 16, React 19, Tailwind CSS, shadcn/ui, Motion for React,
and Biome. It owns its dependency lockfile, TypeScript configuration, and local
browser storage. Run its commands from this directory. Root checks exclude this
independent project.

## Contents

`src/` contains the app, `public/` contains fonts/assets, and `scripts/` contains
source-data utilities. `TRACKER-REDESIGN.md` and `MEALPLANS.md` describe the current
UI. Verification screenshots and earlier snapshots remain local and are not
included in this published project. No dependencies, build outputs, environment
files, or local version archives are committed.
