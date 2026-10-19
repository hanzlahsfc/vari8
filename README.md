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
PostgreSQL · Better Auth (email+password) · Vitest · Playwright · ESLint · Prettier · npm.

## Prerequisites

- Node.js 22+
- npm 11+
- Docker (for local PostgreSQL)

## Local setup

```sh
# 1. Environment (never commit real secrets)
cp .env.example .env
# set BETTER_AUTH_SECRET in .env, e.g.:
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

| Variable                                              | Purpose                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                        | Prisma connection string for local PostgreSQL                                              |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Used by `docker-compose.yml`                                                               |
| `BETTER_AUTH_SECRET`                                  | Auth signing secret, ≥32 chars — required in production (`openssl rand -base64 32`)         |
| `BETTER_AUTH_URL`                                     | Canonical base URL — session cookies and reset-link origins are built from this only        |
| `AUTH_TRUSTED_IP_HEADER`                              | Optional trusted client-IP header for rate limiting (e.g. `x-real-ip`); unset = trust none  |
| `MAIL_DELIVERY_ADAPTER`                               | Outbound mail adapter; production requires it (mail-gated routes fail closed without it)    |
| `DEV_MAILBOX_FILE`                                    | Dev-file adapter sink for reset mail in development                                        |

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

- [Better Auth](https://www.better-auth.com) (`lib/auth/server.ts`) with the Prisma adapter —
  database sessions in the `session` table (revocation is row deletion), credentials on
  `account` rows. The design record is `icm/05-build/AUTH-DECISION.md`; `auth.ts` keeps the
  `auth()`/`signIn`/`signOut` call-site contract for server actions.
- Email + password only. Coach self-signup (`/signup`) creates user + workspace + owner
  membership atomically (`lib/auth/signup.ts`); clients join through workspace invitations
  (`/invite`). Better Auth's own `/sign-up/email` endpoint is disabled.
- Passwords are hashed with Node's built-in `scrypt` KDF (`lib/password.ts`). Only the
  derived hash and a random per-password salt are stored; plaintext is never stored or
  logged. Sign-in returns a single generic failure for both unknown email and wrong
  password, so callers cannot tell whether an account exists.
- Password reset (`/reset-request`, `/reset`) mails a 60-minute single-use token.
  `verification` rows store only the SHA-256 digest of the token identifier
  (`storeIdentifier: "hashed"`); a new request supersedes earlier tokens, and a completed
  reset clears every outstanding reset token plus all sessions.
- Rate limiting is layered: a per-account throttle on normalized email/user id (10/min
  sign-in, 3/min reset request, 10/min change-password, 10/min sign-up) applies to every
  path including the server actions; the built-in IP limiter additionally engages ONLY
  when `AUTH_TRUSTED_IP_HEADER` names the proxy header — unset means no forwarding header
  is trusted and IP limiting is off.
- In production the process refuses to serve when `BETTER_AUTH_SECRET` is missing or
  shorter than 32 characters. Deactivated users are refused on every session-bearing
  auth endpoint and their session rows are deleted.
- `GET /api/v1/workspaces/:id/session` and `GET /api/v1/workspaces/:id/clients` accept the
  session cookie or `Authorization: Bearer <token>` (`bearer()` plugin) and enforce the
  owner-decided role matrix (`lib/auth/roles.ts`).
- Sign-in UI: `/login`.

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
