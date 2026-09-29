import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // Single worker to keep local runs deterministic and resource-light for the
  // scaffold. Revisit if the suite grows enough to parallelise safely.
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Development-only viewers are enabled for the test server only.
      // A normal production build leaves these unset and the routes return 404.
      ENABLE_DAILY_PROTOTYPE: "1",
      ENABLE_SHEET_VIEWER: "1",
      // Deterministic test-only secret (NOT a real credential). CI/local may
      // override AUTH_SECRET; the fallback keeps the suite self-contained.
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "test-only-auth-secret-not-for-production",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public",
    },
  },
});
