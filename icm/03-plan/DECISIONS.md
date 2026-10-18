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
