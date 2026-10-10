import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // S1-H: migrate + upsert reserved synthetic fixtures before the suite, and
  // remove only those reserved rows afterwards.
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // Single worker to keep local runs deterministic and resource-light for the
  // scaffold. Revisit if the suite grows enough to parallelise safely.
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  webServer: [
    {
      command: "npm run build && npm run start",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        // Development-only viewers are enabled for the test server only.
        // A normal production build leaves these unset and the routes return 404.
        ENABLE_DAILY_PROTOTYPE: "1",
        ENABLE_SHEET_VIEWER: "1",
        // P-013: the staff-only assignment surface is enabled on the primary
        // test server so E2E exercises the real feature-on flows.
        ENABLE_ONBOARDING_ASSIGNMENTS: "1",
        // P-014: parameter + coaching template library enabled on the
        // primary test server only.
        ENABLE_COACHING_TEMPLATES: "1",
        // P-016: staff-only client setup surface enabled on the primary
        // test server so E2E exercises the real feature-on flows.
        ENABLE_CLIENT_SETUP: "1",
        // P-020A: parameter classification control enabled on the primary
        // test server only.
        ENABLE_PARAMETER_CLASSIFICATION: "1",
        // P-020B: template-version transitions enabled on the primary test
        // server only.
        ENABLE_CLIENT_SETUP_TRANSITIONS: "1",
        // P-021: DailyEntry persistence flag on the primary server — with
        // ENABLE_DAILY_PROTOTYPE also on, the resolver is "conflict", so the
        // shell stays up while persistence affordances are unavailable.
        ENABLE_DAILY_ENTRY: "1",
        // P-023: client onboarding submission flag on the primary test
        // server only — the synthetic submit/answer flow runs here.
        ENABLE_ONBOARDING_SUBMISSION: "1",
        // P-025-A: Check-In form-definition surfaces enabled on the
        // primary test server only — the shared resolver requires the flag
        // AND the trusted APP_ENV=test classification set below.
        ENABLE_CHECK_INS: "1",
        // P-023-I1-R2: `next start` is NODE_ENV=production, so the
        // trusted dev/test consent boundary also requires an explicit
        // APP_ENV=test — the flag alone can never configure consent.
        APP_ENV: "test",
        // Deterministic test-only secret (NOT a real credential). CI/local may
        // override AUTH_SECRET; the fallback keeps the suite self-contained.
        AUTH_SECRET:
          process.env.AUTH_SECRET ?? "test-only-auth-secret-not-for-production",
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public",
      },
    },
    {
      // P-013 flag-OFF server: same build, flag unset, so E2E independently
      // proves the 404 / absent-nav / zero-mutation contract on a real
      // browser target. Flag-off specs navigate to this URL explicitly.
      command: "npm run start -- -p 3101",
      url: "http://127.0.0.1:3101",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ENABLE_DAILY_PROTOTYPE: "1",
        ENABLE_SHEET_VIEWER: "1",
        // Explicitly empty: webServer env merges over process.env, so an
        // inherited ENABLE_ONBOARDING_ASSIGNMENTS=1 would otherwise leak in.
        // The gate enables only on the exact value "1".
        ENABLE_ONBOARDING_ASSIGNMENTS: "",
        // P-014 flag-off: explicitly empty so an inherited
        // ENABLE_COACHING_TEMPLATES=1 cannot leak into the proof server.
        ENABLE_COACHING_TEMPLATES: "",
        // P-016 flag-off: explicitly empty so an inherited
        // ENABLE_CLIENT_SETUP=1 cannot leak into the proof server.
        ENABLE_CLIENT_SETUP: "",
        // P-020A flag-off: explicitly empty so an inherited
        // ENABLE_PARAMETER_CLASSIFICATION=1 cannot leak into the proof server.
        ENABLE_PARAMETER_CLASSIFICATION: "",
        // P-020B flag-off: parent gate is also off on this server, so this
        // stays consistent; the dedicated transition flag-off proof server
        // below keeps ENABLE_CLIENT_SETUP on.
        ENABLE_CLIENT_SETUP_TRANSITIONS: "",
        // P-021 flag-off: explicitly empty so an inherited
        // ENABLE_DAILY_ENTRY=1 cannot leak into the proof server — the
        // workspace Daily shell stays fully available with persistence off.
        ENABLE_DAILY_ENTRY: "",
        // P-023 flag-off: explicitly empty so an inherited
        // ENABLE_ONBOARDING_SUBMISSION=1 cannot leak into the proof server.
        ENABLE_ONBOARDING_SUBMISSION: "",
        // P-025-A flag-off: explicitly empty so an inherited
        // ENABLE_CHECK_INS=1 cannot leak into the proof server.
        ENABLE_CHECK_INS: "",
        AUTH_SECRET:
          process.env.AUTH_SECRET ?? "test-only-auth-secret-not-for-production",
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public",
      },
    },
    {
      // P-020B transitions flag-OFF server: parent ENABLE_CLIENT_SETUP stays
      // "1" so the real page renders, but the transitions gate is off — the
      // E2E proof that the control is hidden and the actions refuse.
      // P-021: this server also resolves DailyEntry mode "persistent"
      // (entry flag on, prototype flag explicitly off), so the real
      // save/edit/history client flow runs on a real browser target without
      // a fourth webServer.
      command: "npm run start -- -p 3102",
      url: "http://127.0.0.1:3102",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        // Explicitly empty: persistent mode requires the prototype flag
        // off; an inherited ENABLE_DAILY_PROTOTYPE=1 would flip the server
        // to "conflict".
        ENABLE_DAILY_PROTOTYPE: "",
        // P-021: DailyEntry persistence enabled on this proof server only.
        ENABLE_DAILY_ENTRY: "1",
        ENABLE_SHEET_VIEWER: "1",
        ENABLE_ONBOARDING_ASSIGNMENTS: "",
        ENABLE_COACHING_TEMPLATES: "1",
        ENABLE_CLIENT_SETUP: "1",
        ENABLE_PARAMETER_CLASSIFICATION: "",
        // P-020B flag-off: explicitly empty so an inherited
        // ENABLE_CLIENT_SETUP_TRANSITIONS=1 cannot leak into the proof server.
        ENABLE_CLIENT_SETUP_TRANSITIONS: "",
        // P-023 flag-off: explicitly empty so an inherited
        // ENABLE_ONBOARDING_SUBMISSION=1 cannot leak into the proof server.
        ENABLE_ONBOARDING_SUBMISSION: "",
        // P-025-A flag-off: explicitly empty — this server exercises
        // other feature-on flows, but an inherited ENABLE_CHECK_INS=1
        // must never leak in.
        ENABLE_CHECK_INS: "",
        AUTH_SECRET:
          process.env.AUTH_SECRET ?? "test-only-auth-secret-not-for-production",
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public",
      },
    },
  ],
});
