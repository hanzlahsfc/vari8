# Owner decisions for the TRACKER program

Every PR in `PLAN.md` follows these. One home: other files point here.

## D1. The canvas drives the database

The canvas data model (`frontend/src/components/coach/model.ts`, `plans/domain.ts`, `plans/types.ts`, `builder/schema.ts`) is the source for the Prisma schema. Canvas entities with no table get one. Canvas fields with no column get one. Security, consent, audit and health-data decisions stay binding (see `AGENTS.md`, source authority 0).

## D2. Next.js 16 lands on TRACKER

TRACKER upgrades the app from Next 15.5 and React 19.1 to the canvas versions (Next 16.3, React 19.3) before canvas screens are ported. Work continues from TRACKER after that.

## D3. Port the canvas into the app (architecture B)

The canvas screens move into the one Next app at the repo root, which keeps the database, Auth.js, RBAC, consent, audit and CI. `frontend/` stays as the visual reference until every screen is ported. Source: `icm/01-recon/output/L2-stack-merge.md`.

## D4. Biome for code, Prettier for Markdown and YAML only

Biome 2 lints and formats TypeScript, TSX, JSON and CSS in one tool, with the `next` and `react` rule domains on (canvas config `frontend/biome.json`). ESLint and the Prettier code formatting retire in one mechanical reformat commit. Prettier stays only for `*.md`, `*.yml` and `*.yaml`, which Biome does not format.

## D5. Target stack

| Layer     | Choice                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| Runtime   | Node 24 LTS (root CI moves from 22 to match `frontend/.nvmrc`)                                      |
| Framework | Next.js 16, App Router, React 19.3, TypeScript strict                                               |
| UI        | Tailwind CSS 4.3, Base UI primitives, CVA and `cn`, Lucide icons, Motion, the canvas CSS and themes |
| Data      | PostgreSQL 16, Prisma 6 (a Prisma major upgrade is a separate later PR)                             |
| Auth      | Auth.js v5 (`next-auth@5.0.0-beta.32`, peer range includes Next 16)                                 |
| Checks    | Biome, `tsc`, Vitest, Playwright, live browser verification                                         |

## D6. One HTTP API under every screen (mobile-ready)

Every canvas surface is wired through versioned JSON route handlers (`app/api/v1/**`) with Zod schemas at the boundary, not through server actions. The web app and the later iOS and Android apps share that one contract. Auth gains bearer tokens next to the cookie session (Auth.js is documented as not for native apps). Mobile shell is Capacitor 8 wrapping the same UI, with a PWA as the interim mobile experience. Source: `output/R1-mobile.md`.

## D7. Toolchain

Biome 2.5 (D4), TypeScript 7 native compiler as the only `typescript` dependency (measured 2.00 s to 0.80 s typecheck on this tree, 0 errors), Turbopack for every build including the canvas (drop `--webpack`), npm kept. No oxlint, oxfmt, Rspack, Vite, Bun runtime, Bend or Three.js. Sources: `output/R2-tooling.md`, `output/P1-next16.md`, `output/P2-biome.md`.

## D8. Libraries (smallest set)

Add `zod` 4 for every API boundary. Media goes to S3-compatible object storage behind the existing `lib/storage.ts` port (vendor still open). Charts reuse the canvas's own SVG component (`smooth-trend.tsx`), no chart library. Forms stay `useActionState` plus Base UI Form. Dates stay `Intl`. Offline sync (Electric or PowerSync) and TanStack Query are chosen at mobile time, not now. Source: `output/R3-libraries.md`.

## D9. Issues first, then one PR per issue

The approved plan becomes GitHub issues in `hanzlahsfc/The-great-tracker-`, visible to the whole team. One issue per plan PR section (the section is the issue body and acceptance contract) and one `decision` issue per owner question; build issues name their blockers as "Blocked by #n". Labels per phase (`foundation`, `model`, `service`, `wiring`, `mobile`, `decision`), one milestone per phase. Each issue becomes one branch `<type>/<issue#>-<slug>` off `TRACKER` in its own worktree, Devin builds, a different model verifies, the PR targets `TRACKER` with `Closes #n`. TRACKER is not the default branch, so the issue is closed by hand at merge. Issues are generated from `PLAN.md` by `icm/03-plan/tools/plan-to-issues.mjs` (idempotent, keyed by the plan id), only after owner approval and after TRACKER is pushed. Making TRACKER `main` is the owner's call to Hanzlah when the program completes.
