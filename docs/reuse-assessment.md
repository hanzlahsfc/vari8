# Prime State reuse / adapt / omit assessment

Source considered: `/Users/apple/Documents/Codex/2026-09-15/https-live-body-mind-transformation-com/work/PRIME-STATE-TRACKER/` (read-only).

Prime State is a **technical foundation only**. It is a different product with its own brand,
data, formulas, seed records, UI, business rules, and security assumptions. None of those are
inherited. The new app ("App") reproduces the PRGRSS 2.0 workbook layouts and data; Prime
State is used only where its infrastructure is generic and stack-aligned.

Stack observed in Prime State: Next.js `15.5.25`, React `19.1.0`, `next-auth`
`^5.0.0-beta.32` (Nodemailer **magic-link**, JWT sessions), Prisma `^6.19.3`, Tailwind CSS
`^4` (CSS-first, no JS config), Vitest `^5.0.1`, Playwright `^1.63.0`, ESLint `^9` (flat
config), Prettier `^3.9.6`, npm.

## REUSE — port near-verbatim (rename product references only)

| Path in Prime State | Reusable content | Why it is safe to reuse |
|---|---|---|
| `tsconfig.json` | `strict: true`, `moduleResolution: "bundler"`, `@/*` alias, next plugin | Pure compiler configuration |
| `eslint.config.mjs` | Flat config extending `next/core-web-vitals` + `next/typescript` + ignores | Stack-standard linting |
| `postcss.config.mjs` | `@tailwindcss/postcss` plugin only | Tailwind 4 requires exactly this |
| `.prettierrc.json`, `.prettierignore` | Formatting contract (`singleQuote:false`, `trailingComma:"all"`) | No product semantics |
| `vitest.config.ts`, `vitest.integration.config.ts` | Node-env unit/integration split, include globs | Test-runner config |
| `playwright.config.ts` | `testDir: tests/e2e`, `workers: 1`, webServer pattern | Test-runner config (adapt `baseURL`) |
| `lib/db.ts` | Prisma client singleton with `globalThis` dev caching | Standard Prisma pattern |
| `package.json` script **shape** | `dev`, `build`, `typecheck`, `lint`, `test`, `verify` | Script names/flow, not product logic |
| `.gitignore` shape, `.github/workflows/ci.yml` shape | CI runs `npm ci && npm run verify` | Generic CI flow |

## ADAPT — useful only after changing brand / product / security assumptions

| Path in Prime State | Assumption to change | Planned App version |
|---|---|---|
| `auth.config.ts`, `auth.ts` | Nodemailer magic-link provider; BMT audit entities | **Credentials** provider + password hashing; keep JWT session, secure-cookie, `pages.signIn` shape. No hard-coded accounts |
| `docker-compose.yml` | Project name `prime-state`, plus MinIO/Mailpit | Rename to App; **Postgres only** for the scaffold |
| `.env.example` | BMT URLs, `prime_state_*` DB/bucket names, mail keys | App naming, `DATABASE_URL`, `AUTH_SECRET`; strip BMT-specific keys |
| `app/globals.css` | Single dark theme; BMT tokens (`--brand-red:#ba0000`, `#0e0e0d`) | Reuse the **semantic-token + `@theme inline` architecture**; new `pro-dark`/`pro-white` values selected by `data-theme` on `<html>`; Golos Text |
| `scripts/init-dev-db.sql` | `prime_state_app/admin`, dev/shadow DB names | Rename to App |
| `middleware.ts` | Composes Auth.js with next-intl | Keep the Auth.js route matcher; **drop i18n** |
| `AGENTS.md`, `docs/agentic/*` | BMT product rules and examples | Port the **discipline** (verify gates, test-first, independent review, scoped commits), rebrand to App |
| `lib/log.ts`, `lib/crypto/health.ts`, `lib/gdpr/*` | Product/health deny-lists and table maps | Reuse the *pattern* only if a later phase needs logging/encryption; **not ported in this task** |

## OMIT — do not carry over

- **Data/domain models:** all `db/schema.prisma` models and enums except a minimal `User`
  scaffold (id, email, password hash, timestamps). No `Client`, `DailyLog`, `Food`, `Program`,
  `Ped`, `Supplement`, `TimelineEvent`, score, bloodwork, habit, etc.
- **Domain logic:** all of `lib/` domain modules (`score*`, `baseline*`, `habits*`,
  `nutrition/`, `training/`, `bloodwork/`, `gdpr/`, `ped/`, `metrics/`, `gamification/`,
  `shopping/`, `reports/`, `coach/`, `onboarding*`, `timeline.ts`, `daily-log*`, `weekly*`).
- **App surface:** all `app/**` product pages/components and `app/actions/**`.
- **Seeds / data:** `db/seed/**`, `assets/data/*.json`, `scripts/seed-*.ts`.
- **Brand/identity:** `public/brand/**`, `public/fonts/**`, `assets/brand/**`, BMT colors,
  Avenir/Oswald/Mulish fonts, `README.md`, `icm/**`, `sources/**`, `docs/en/**`,
  `docs/briefing/**`, `messages/*.json`.
- **Auth specifics:** magic-link provider, Mailpit, Resend/`lib/auth/magic-link.ts`, rate-limit
  tuning tied to magic links.
- **Secrets:** live `.env` / `.env.local` are never copied.

## Privacy carry-over rule

Prime State's health-data handling (encrypted fields, PED coach-only, audit logging, GDPR
export/erasure) is **not** ported as code. The new app's scaffold stores only `User` auth
fields. The workbook's real client data is redacted from all committed artifacts (see
`docs/redaction-policy.md`).

## Reuse log

Recorded so the final delivery can state exactly what was reused, adapted, or left behind:
- **Reused:** build/test/lint/format configs, Prisma singleton, script shape, CI shape.
- **Adapted:** auth provider (magic-link → credentials), docker-compose (Postgres-only),
  theme architecture (new tokens/themes), dev-DB script, process docs, middleware.
- **Left behind:** all product identity, data, formulas, seeds, UI, and security assumptions.
