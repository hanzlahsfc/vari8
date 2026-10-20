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
        // P-023-I1-R2: `next start` is NODE_ENV=production, so the trusted
        // dev/test boundary requires an explicit APP_ENV=test — PR-05's
        // consent-boundary checks rely on this classification.
        APP_ENV: "test",
        // Deterministic test-only secret (NOT a real credential). CI/local may
        // override via BETTER_AUTH_SECRET (the legacy AUTH_SECRET value is
        // honored as a fallback); the default keeps the suite self-contained.
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ??
          process.env.AUTH_SECRET ??
          "test-only-auth-secret-not-for-production",
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public",
      },
    },
  ],
});
