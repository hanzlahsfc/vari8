import { defineConfig } from "@playwright/test";

// PLAYWRIGHT_PORT_BASE (verify-local passes the lane port) picks the
// webServer/browser port so lanes run side by side; default stays 3000.
const PORT = process.env.PLAYWRIGHT_PORT_BASE
  ? Number(process.env.PLAYWRIGHT_PORT_BASE)
  : 3000;
const ORIGIN = `http://127.0.0.1:${PORT}`;

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
    baseURL: ORIGIN,
  },
  webServer: [
    {
      command: `npm run build && npm run start -- -p ${PORT}`,
      url: ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        // P-023-I1-R2: `next start` is NODE_ENV=production, so the trusted
        // dev/test boundary requires an explicit APP_ENV=test — PR-05's
        // consent-boundary checks rely on this classification.
        APP_ENV: "test",
        // The configured auth origin equals the address this config serves —
        // both names set to the same value (the pair-refusal contract),
        // overriding any inherited AUTH_URL pointing at another port.
        BETTER_AUTH_URL: ORIGIN,
        AUTH_URL: ORIGIN,
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
