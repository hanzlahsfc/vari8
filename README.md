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

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma connection string for local PostgreSQL |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Used by `docker-compose.yml` |
| `AUTH_SECRET` | Auth.js signing secret (`openssl rand -base64 32`) |
| `AUTH_URL` | Base URL Auth.js is served from |
| `AUTH_TRUST_HOST` | Trust the host header (local/simple deployments) |

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

| Script | Purpose |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run verify` | `typecheck` + `lint` + `test` |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright e2e (needs PostgreSQL up) |
| `npm run extract:sheets` | Validate + parse the 11 source sheets (non-writing by default) |

## Privacy

Raw source exports and unredacted extraction output are **never** committed (see
`.gitignore` and `docs/redaction-policy.md`). Real client identifiers and health values are
redacted from committed artifacts.

## Extraction (Phases 7–8)

`npm run extract:sheets` reads the read-only source folder from `SHEETS_SOURCE_DIR`, which
defaults to `/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0` and is
overridable via the environment. It parses all 11 exports and prints a coverage report
without writing. Unredacted output requires opt-in `RAW_EXTRACTION_DIR` and fails closed
unless the destination is git-ignored. Committed, redacted `spec/sheets/**` artifacts and
the food/exercise datasets arrive in later phases. See `docs/extraction-contract.md`.
