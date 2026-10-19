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
