# Development runtime, flags and seed (PR-04)

How the development runtime is classified, what every `ENABLE_*` flag means,
and how to build a seeded lane database. All of it lives in `lib/runtime.ts`.

## Trusted runtime classification

`classifyRuntime(env)` resolves one of `development`, `test`, `production`:

1. An explicit `APP_ENV` wins when set, allowlisted to exactly
   `development` or `test`. Any other explicit value is `production`.
2. With `APP_ENV` unset the baked-in `NODE_ENV` applies the same allowlist.
3. Missing or unknown values resolve `production` (fail closed).

`next dev` runs `NODE_ENV=development`; `next start` always runs
`NODE_ENV=production`. A disposable test/proof server started with
`next start` must set `APP_ENV=test` explicitly or every flag stays off.

## Flag contract (V3-H4-02)

An `ENABLE_*` flag counts ONLY when it is exactly `1` AND the runtime
classifies as trusted development/test (`devFlagEnabled`). A flag set in a
production runtime stays off — production can never opt into a development
surface. These flags are development controls, never a substitute for the
server-side authorization every operation performs.

| Flag                              | Surface                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `ENABLE_DAILY_PROTOTYPE`          | read-only `/daily` prototype                            |
| `ENABLE_SHEET_VIEWER`             | `/sheets` developer viewer                              |
| `ENABLE_ONBOARDING_ASSIGNMENTS`   | staff onboarding assignment surface                     |
| `ENABLE_COACHING_TEMPLATES`       | parameter library + coaching templates                  |
| `ENABLE_CLIENT_SETUP`             | staff client-setup surface                              |
| `ENABLE_PARAMETER_CLASSIFICATION` | parameter classification control                        |
| `ENABLE_CLIENT_SETUP_TRANSITIONS` | template upgrade/rollback (needs `ENABLE_CLIENT_SETUP`) |
| `ENABLE_DAILY_ENTRY`              | client daily-entry persistence                          |
| `ENABLE_ONBOARDING_SUBMISSION`    | client onboarding submission flow                       |
| `ENABLE_CHECK_INS`                | Check-In forms/instances surfaces                       |
| `ENABLE_CLIENT_DASHBOARD`         | persisted client dashboard layouts                      |
| `ENABLE_MEAL_PLANS`               | client meal-plan surface                                |
| `ENABLE_TRAINING_PLANS`           | client training-program surface                         |

## Parked consent and health-data gates (D19)

`ENABLE_CONSENT_GATES` is unset (off) in every environment. With the flag
off every consent and health-data gate allows the operation and writes no
consent record; messages and media are never gated by consent and no
consent UI exists. Beta data is synthetic only.

Setting it to `1` re-enables the parked machinery, and only in a trusted
development/test runtime (the same flag contract as every other `ENABLE_*`
flag). `vitest.config.ts` and `vitest.integration.config.ts` set it so the
existing consent suites keep covering the parked code until PR-T2 deletes
them.

Gates that read the flag: the consent service
(`grantOwnConsent`, `revokeOwnConsent`, `authorizeHealthOperation` in
`lib/consent.ts`), each domain's `checkRequiredConsent`/
`checkReviewConsent`/`checkConsentIntersection` helper in
`lib/checkin/instances.ts`, `lib/checkin/tracker-context.ts`,
`lib/daily-entry/service.ts`, `lib/mealplan/service.ts`,
`lib/trainingprogram/service.ts`, `lib/onboarding/submissions.ts` and
`lib/onboarding/review.ts`, the external-exposure assertions
`assertConsentMutationsExternallyExposable` (`lib/consent.ts`),
`assertGdprExternallyExposable` (`lib/gdpr.ts`) and
`assertAutomaticRetentionConfigured` (`lib/gdpr/retention.ts`).

## Lane databases and the seed

`npm run db:fresh` builds a fresh lane database in one step:

1. validates the runtime is development/test and `DATABASE_URL` names a
   lane database (`app_<lane>`, never `app_dev`),
2. drops and recreates the database in the dockerized PostgreSQL
   (`vari8-db-1`),
3. runs `prisma migrate deploy`,
4. runs the catalog imports (`import:nutrition`, `import:exercise`),
5. runs the seed (`scripts/seed/index.ts`).

`npm run seed:dev` runs only the seed. `scripts/seed/index.ts` loads every
`scripts/seed/*.seed.ts` in name order — one file per domain (D34) — and
refuses outside a trusted development/test runtime.

`00-workspace.seed.ts` creates the canvas demo workspace (`canvas-demo`,
"Liliana Mansfeld Coaching"), the owner the canvas account block names
(Liliana Mansfeld, `WORKSPACE_OWNER`), one coach (Sofia Miller, the canvas
brand coach), and the canvas demo clients as `ClientProfile` rows whose
synthetic names come from the frontend roster data. All writes are
idempotent upserts.

Credentials are environment variables, never committed:

- `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` — the owner sign-in.
- `SEED_COACH_EMAIL`, `SEED_COACH_PASSWORD` — the coach sign-in.

Catalog sources are raw workbook exports kept outside version control.
Point `SHEETS_SOURCE_DIR` at the folder containing
`Nutrition Database.html` and `Exercise Database.html`, or set
`NUTRITION_SOURCE` / `EXERCISE_SOURCE` file paths. When no catalog source
exists, `DB_FRESH_SKIP_CATALOGS=1` skips the imports explicitly; the seed
still runs.
