# App

Foundation and extraction pipeline for a new coaching web app. The data and layouts
come from the 11-sheet PRGRSS 2.0 workbook; the workbook is the product source of truth.
**"App" is a placeholder name** — the final product name is undecided. The repository slug
is not the product name.

This repository currently contains the technical foundation only. Workbook-facing pages,
workbook data, and the sheet-extraction pipeline arrive in later phases (see
`docs/implementation-plan.md`).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Prisma +
PostgreSQL · Auth.js v5 (Credentials) · Vitest · Playwright · ESLint · Prettier · npm.

## Prerequisites

- Node.js 22+
- npm 11+
- Docker (for local PostgreSQL)

## Local setup

```sh
# 1. Environment (never commit real secrets)
cp .env.example .env
# set AUTH_SECRET in .env, e.g.:
#   openssl rand -base64 32

# 2. Start local PostgreSQL (health-checked)
docker compose up -d

# 3. Install dependencies
npm install

# 4. Generate the Prisma client and apply the migration
npx prisma generate
npx prisma migrate deploy

# 5. Run the app
npm run dev            # http://127.0.0.1:3000
```

### Environment variables

| Variable                                              | Purpose                                            |
| ----------------------------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`                                        | Prisma connection string for local PostgreSQL      |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Used by `docker-compose.yml`                       |
| `AUTH_SECRET`                                         | Auth.js signing secret (`openssl rand -base64 32`) |
| `AUTH_URL`                                            | Base URL Auth.js is served from                    |
| `AUTH_TRUST_HOST`                                     | Trust the host header (local/simple deployments)   |

Local defaults in `docker-compose.yml` and `.env.example` are development placeholders
only. Override them for any real environment and never commit `.env`.

### npm install-script approvals

This project runs on npm 11, which blocks dependency install scripts until approved. The
`allowScripts` field in `package.json` records the approved, trusted packages and their
exact versions (`prisma`, `@prisma/client`, `@prisma/engines`, `esbuild`, `unrs-resolver`,
`fsevents`). To re-approve after a dependency bump: `npm install-scripts approve <pkg>`.
Prisma client generation and engine availability are verified by the Phase 6 checks
(`npx prisma generate`, `npx prisma validate`).

## Authentication

- Auth.js v5 **Credentials** provider, for **existing database users only**. There is no
  registration, password reset, seeded account, or default credential in this foundation.
- **Session strategy: JWT.** Credentials requires JWT sessions in Auth.js v5; the signed
  session cookie is HttpOnly. This is documented in `auth.config.ts`.
- Passwords are hashed with Node's built-in `scrypt` KDF (`lib/password.ts`). Only the
  derived hash and a random per-password salt are stored; plaintext is never stored or
  logged. `lib/credentials.ts` returns a single generic failure for both unknown email and
  wrong password, so callers cannot tell whether an account exists.
- Sign-in UI: `/login` (minimal).

## Theming

- All application colors and spacing come from CSS custom properties; hex values live only
  in `themes/pro-dark.css` and `themes/pro-white.css`.
- The active theme is selected by `data-theme` on `<html>`; the initial theme is
  `pro-dark` (set in `app/layout.tsx`).
- `pro-dark` uses the exact PRGRSS 2.0 source colors. `pro-white` is a light counterpart
  with WCAG AA-contrast text colors. Theme switching/persistence is intentionally not
  implemented yet.

## Scripts

| Script                   | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `npm run dev`            | Next dev server                                                |
| `npm run build`          | Production build                                               |
| `npm run start`          | Start production server                                        |
| `npm run verify`         | `typecheck` + `lint` + `test`                                  |
| `npm run format:check`   | Prettier format check                                          |
| `npm run test`           | Vitest unit tests                                              |
| `npm run test:e2e`       | Playwright e2e (needs PostgreSQL up)                           |
| `npm run extract:sheets` | Validate + parse the 11 source sheets (non-writing by default) |
| `npm run parity`         | Canvas visual-parity gate, see below                           |

## Visual parity gate

The canvas in `frontend/` must look exactly as it does on `Vari8-Beta`. The gate replays the 35 click paths in
`icm/04-briefing/shots/index.json` at 1440x900 and 390x844 (70 captures), diffs each capture against the committed
baseline in `tools/parity/baseline/`, and exits 1 on any real change.

```bash
npm run parity                        # next build (production) of the canvas, next start on a free port this run picks, captures, compares, stops it
npm run parity -- --update-baseline   # recaptures into a temp dir; swaps the baseline only if all 70 captures succeed
PARITY_PORT=3640 npm run parity       # pin the port (refused, exit 2, if something already listens there)
PARITY_DEV=1 npm run parity           # debugging only: next dev instead of a production build
```

- Exit 0: every screen matches. Exit 1: a pixel, geometry or text change, a missing screen, or a click path that did
  not resolve or matched more than one element.
- Exit 2, nothing compared: `PARITY_AA_TOLERANCE`, `PARITY_MAX_DIFF_PIXELS` or `PARITY_PORT` is not a valid number, the
  pinned port is in use, or the process answering on the chosen port is not the server this run started.
- Report: `tools/parity/out/report.html` (gitignored; failing screens show baseline, current, and a red diff).
- `PARITY_URL=http://127.0.0.1:3630` reuses a running server instead of building one. The ownership check is skipped for
  that server: it is yours by declaration, so the comparison is only as good as the tree it was built from.

What is pinned, so an unchanged tree reruns green:

- `capture.mjs`: fresh browser context per screen; `Europe/Vienna`; clock frozen at 2026-10-19T10:00+02:00; seeded
  `Math.random` and `crypto.randomUUID`; empty localStorage seed; CSS animations, transitions, and caret off; fonts
  awaited; DOM quiet for 400 ms before the screenshot.
- Ambiguous recipe steps: every step must resolve to exactly one element. `STEP_SCOPES` in `capture.mjs` scopes the
  steps that match more than one element (a container, optionally filtered by text or a target selector). A step that
  still matches more than one element fails the capture.
- `compare.mjs`: pixel tolerance is 0 by default (the reference host is bit-exact). `PARITY_AA_TOLERANCE` overrides it
  for other hosts. `PARITY_MAX_DIFF_PIXELS` allows a count (default 0). An override that is not a whole number in range
  is refused (exit 2), never treated as 0 or as "no limit". Geometry: visible elements added, removed, or moved by more
  than 0.5 px. Text: each element's own text is compared, so text inside scroll-clipped content (the 390 px roster
  Attention column) is covered even where no pixel shows it.
- Inner scrollers: every element that actually scrolls in both axes is scrolled through its full range and screenshotted
  at each step (clipped to its own box), so paint inside clipped content (a colour on an off-screen row) is compared,
  not just its text. The sweep runs after the main capture, so it cannot change it.
- Raster: Chromium runs with `--disable-partial-raster`. Partial raster re-rasters only the invalidated part of a tile,
  so an anti-aliased edge on a sub-pixel-positioned element rasterises differently under CPU load. Full raster is
  deterministic and changes no baseline pixel.
- Capture retry: under heavy CPU load Chromium can drop a navigation or a screenshot. A failed capture is replayed
  once, after a fresh browser launch and a server-readiness wait; the run line and the report show `retried=N`. A
  pixel or geometry comparison is never retried: only a capture that produced no image.
- Mobile labels: the 390 px layout shows shorter tab names (`02 Dashboard` is `Dashboard`, `Training Program` is
  `Training`). `mobileFallback` in `capture.mjs` covers those labels and is used only at 390; the manifest records
  the label that was clicked.
- Production build of `frontend/` is served by `next start`; `run.mjs` restores `frontend/AGENTS.md`, which Next
  rewrites on start, so the canvas tree stays clean.

Self-test (as run for issue #61, see `icm/05-build/reports/parity-harness.md`):

- Unchanged tree: ten consecutive `npm run parity` runs exit 0, plus three under CPU load (busy loops), 70 of 70
  screens ok each time.
- Deliberate changes, each reverted after the run: a text label, the `--cd-muted` colour token (`#ababab` to
  `#a0a0a0`), a 1 px shift at 390, text inside a clipped header, and a colour on an off-screen row inside a clipped
  scroller. Every one exits 1. Revert with `git checkout -- <file>`; the runner that applies them reverts in a trap.

Baseline: 70 screen PNGs plus 101 inner-scroller PNGs (13.9 MB, 14.2 MB with geometry and `manifest.json`;
limit 15 MB) captured from this branch's tree (canvas identical to `Vari8-Beta` at `f02a6d6`) with
`npm run parity -- --update-baseline`.

## Privacy

Raw source exports and unredacted extraction output are **never** committed (see
`.gitignore` and `docs/redaction-policy.md`). Real client identifiers and health values are
redacted from committed artifacts.

## Extraction (Phases 7–9)

`npm run extract:sheets` reads the read-only source folder from `SHEETS_SOURCE_DIR`, which
defaults to `/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0` and is
overridable via the environment.

- default / `--dry-run` — parse all 11 exports and print a coverage report (no writes).
- `--data-only` — write the committed reference databases `spec/data/foods.json` (599
  records) and `spec/data/exercises.json` (546 records).
- `--raw` — write **unredacted** artifacts to a git-ignored `RAW_EXTRACTION_DIR` (fails
  closed otherwise).

Committed, redacted `spec/sheets/**` artifacts and the summaries/theme/cross-sheet outputs
arrive in later phases. See `docs/extraction-contract.md`.

## Development-only viewers

The raw sheet viewer (`/sheets`, `/sheets/[slug]`) and the Daily Tracker prototype (`/daily`)
are **development/reference tools**, not product pages. Both fail closed (404) unless their flag
is set:

- `ENABLE_SHEET_VIEWER=1` — raw/redacted workbook viewer.
- `ENABLE_DAILY_PROTOTYPE=1` — in-memory Daily Tracker prototype.

They are reached directly (not linked in navigation) so no dead links are baked into builds.

## Daily Tracker prototype (development-only, Phase B0)

`/daily` is a **client-side, in-memory** Daily Tracker entry prototype. It performs no
persistence (no DB, storage, cookies, or network writes) and entries disappear on refresh.

It is enabled **only** when `ENABLE_DAILY_PROTOTYPE=1`; otherwise the route returns 404. It is
reached directly at `/daily` (not linked in navigation, so no dead link is baked into static
builds). Leave the flag unset in any real deployment — persistent health data,
roles/ownership, consent/audit, and access policy are undecided (see
`docs/tasks/phase-b0.md`).

## Standalone frontend preview

The current UI snapshot is in [`frontend/`](frontend/README.md). It runs as an
independent project on port 3001; the full-stack application above remains intact.
See the frontend README for installation, preview routes, and checks.
