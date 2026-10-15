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
npm run typecheck
npm run build
node --test src/components/coach/*.test.mjs src/components/coach/*.checks.mjs src/components/coach/client-tracker-preview/*.test.mjs src/components/coach/client-tracker-preview/*.checks.mjs src/components/ethereal/client-tracker/model.test.mjs
```

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
