# Vari8 TRACKER recon brief (wave 1)

Read this whole file, then do ONLY your slice (named in your task goal).

## The operation

Vari8 is a coaching tracker app. Two lines of work exist in one GitHub repo (`hanzlahsfc/The-great-tracker-`):

- **Canvas (frontend).** Lilly's UI prototype, branch `FRONTEND`, folder `frontend/`. Next.js 16.3.8, React 19.3, localStorage only, no backend. Read-only checkout: `/home/nexuslink/vari8-worktrees/FRONTEND/frontend/`. Start at `PROJECT_CONTEXT.md`, `src/components/coach/model.ts`, `src/components/coach/store.tsx`, `src/data/mock-data.json`.
- **Backend.** Hanzlah's full-stack app, branch `main` (Next.js 15.5, Prisma + Postgres, Auth.js, RBAC, consent, audit, every feature behind an `ENABLE_*` flag). Read-only checkout: `/home/nexuslink/vari8-worktrees/main/`. His newest branch `feature/training-i1a-r3` is at `/home/nexuslink/vari8-worktrees/r3/` (1 commit on main). Start at `AGENTS.md`, `docs/STATUS.md` (newest first), `docs/product-decisions.md`, `db/schema.prisma`, `lib/`, `app/`.

**The rule the owner set: the frontend dictates everything.** The canvas defines which screens, elements and data exist. The backend must be made to serve the canvas. Backend features with no canvas counterpart are listed, not assumed wanted. Backend security gates (RBAC, consent, audit, health-data rules in `docs/product-decisions.md` and `docs/security/`) stay binding; note any canvas element that collides with them.

## Hard rules

- READ-ONLY on both checkouts. Never edit, commit, checkout, install, or run a dev server in them. Never push. Never open a GUI window or browser.
- Write ONLY your report file(s) under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/01-recon/output/`.
- Write incrementally: write each section to disk as soon as it is done (`write_file`, then append). Never hold the whole report in memory.
- Every claim cites `path:line` (or `path` + symbol). No guesses presented as facts; label inferences `(inferred)`.
- No secrets, no real client data. Plain English, short sentences, no long dashes.

## Slices and report files

| Slice             | Report                 | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 canvas-core    | `H1-canvas-core.md`    | `src/components/coach/` top level: `coach-app.tsx`, `clients.tsx`, `store.tsx`, `model.ts`, `messages.tsx`, `notes.tsx`, `media.tsx`, `check-ins.tsx`, `habits-tab.tsx`, `templates.tsx`, `template-setup.ts`, `tracker-setup.ts`, `appearance-controls.tsx`, `ui.tsx`; `src/app/coach`, `src/data/mock-data.json`                                                                                                                                                                                                                                                        |
| H2 canvas-plans   | `H2-canvas-plans.md`   | `src/components/coach/plans/**` (nutrition, training, domain, CONTRACT.md, types), `client-plan-preview.tsx`, `roadmap-preview.ts`, `muscle-volume.ts`, `MEALPLANS.md`, `src/data/food-database.json` (shape only)                                                                                                                                                                                                                                                                                                                                                        |
| H3 canvas-views   | `H3-canvas-views.md`   | `src/components/coach/builder/**`, `client-tracker-preview/**`, `client-preview.tsx`, `TRACKER-REDESIGN.md`, `src/app/page.tsx`, `src/app/ethereal`, `src/components/ethereal/**` (decide: product surface or design-system studio)                                                                                                                                                                                                                                                                                                                                       |
| H4 unwired        | `H4-unwired-config.md` | Backend only. Everything that exists but is not reachable or not configured: every `ENABLE_*` flag and its default, `APP_ENV` dependence, dev-only consent versions, no seed or registration path, email or delivery stubs, routes with no nav entry, dead or orphaned code, CI workflows (`.github/workflows/`), env vars in `.env.example`                                                                                                                                                                                                                              |
| L1 backend-domain | `L1-backend-domain.md` | Backend only, full domain census: every Prisma model (purpose, key fields, relations), every service in `lib/`, every page and server action in `app/`, roles and permissions (`lib/auth/rbac.ts`), consent kinds, audit events. Then a TYPE-LEVEL comparison against the canvas data shapes in `frontend/src/components/coach/model.ts`, `plans/domain.ts`, `plans/types.ts`, `builder/schema.ts`: which canvas entity maps to which model, field mismatches, canvas entities with no model                                                                              |
| L2 stack-merge    | `L2-stack-merge.md`    | Both trees. Framework and dependency diff (both `package.json`), tooling (biome vs eslint/prettier, vitest/playwright, node version), Tailwind and CSS strategy, theming, auth/session needs, CI workflows. Then 3 merge architectures with tradeoffs: (A) canvas app becomes the root app, backend `lib/ db/ auth` moved in; (B) canvas components ported into the backend app; (C) two apps side by side. Recommend one with the reason. Read `frontend/node_modules`-free docs only; if a Next 16 breaking change matters, cite the Next 16 upgrade notes from the web |

## Canvas slices (H1 to H3) report shape

For each SCREEN or major ELEMENT the canvas has, one row:

`| id | screen/element | where (path:line) | user (coach/client) | what it does | data it reads/writes (entity.field) | persistence today (localStorage key / mock / none) |`

Then a section `## Entities` listing every data shape the slice uses (type name, fields, path:line). Then `## Interactions` listing each user action (create, edit, reorder, publish, etc.).

## Backend lanes (H4, L1) report shape

Tables with `path:line` per row. H4 ends with `## Fix list`: what must be set or built so each existing feature is reachable in a normal run.

## Self-check (mandatory)

Re-read every file you wrote and confirm every row cites a real path. List each acceptance item as PASS or FAIL with evidence:

1. Report file exists at the named path and is non-empty.
2. Every in-scope file of your slice was opened (list them with line counts).
3. Every row has a `path:line` citation.
4. No file outside `icm/01-recon/output/` was written.
   You are not done until every item is PASS or reported FAIL with the reason.
