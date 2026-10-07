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
        AUTH_SECRET:
          process.env.AUTH_SECRET ?? "test-only-auth-secret-not-for-production",
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public",
      },
    },
  ],
});
