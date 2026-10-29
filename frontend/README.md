# Coaching UI Studio

A standalone Next.js coaching UI prototype built with React, Tailwind CSS, shadcn/ui, and Motion for React. The primary workspace is `/coach`; `/ethereal` remains the component and appearance studio. Examples use illustrative data, with workspace state stored in this browser.

## Run locally

Use Node.js 24, as recorded in `.nvmrc`. From the repository root:

```sh
npm ci
npm run preview:up
```

Open [http://127.0.0.1:3000/coach](http://127.0.0.1:3000/coach). The runner keeps the development preview available after the command exits. Reports under `reports/` are available at [http://127.0.0.1:3001](http://127.0.0.1:3001); the report server does not expose other project files.

Check, start, and stop the project-owned preview with `npm run preview:status`, `npm run preview:up`, and `npm run preview:down`. The runner records PIDs and logs under ignored `.agent-runs/local-preview/`, reuses only its own healthy services, and refuses occupied ports without stopping their listeners. Use `npm run dev` when you specifically need a foreground server. Next.js 16 writes development output to `.next/dev`, separate from the production `.next` build output, so running `npm run build` does not require restarting the development preview.

## Current app

`/coach` opens the coach workspace for templates, clients, check-ins, messages, notes, and plan editing. `/` and `/ethereal` open the Ethereal component studio. Client previews and sample readings are illustrative. The coach workspace saves locally in browser storage; this preview has no backend connection, account system, or server-enforced authorization.

## Development commands

```sh
npm run lint       # Biome checks
npm run typecheck  # Next.js type generation and TypeScript checks
npm run build      # Production build
npm run preview:test # Local preview runner safety checks
npm run format     # Format files in place
npm run agent-context:check # Validate scoped project context and mappings
npm run agent-context:test  # Test context handoff failure and privacy cases
```

`package-lock.json` records the dependency versions installed by `npm ci`. Development and production builds use Next.js's Webpack option.

## Repository contents

`src/app/` defines the routes, `src/components/` contains the interface components, `src/lib/` contains shared data and appearance logic, and `public/` holds fonts and other static assets.

The repository contains the current coaching UI and its configuration. Previous app editions and their commit history have been removed. Local version archives, snapshots, review captures, dependency folders, build output, environment files, and per-run agent evidence are excluded from Git and normal lint discovery. See [AGENTS.md](AGENTS.md) for the portable agent entrypoint, [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the product boundary and source map, and [docs/PR-WORKFLOW.md](docs/PR-WORKFLOW.md) for opening feature-branch PRs into `FRONTEND`; Hanzlah owns the later `FRONTEND` to `main` promotion.
