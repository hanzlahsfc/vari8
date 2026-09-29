import { defineConfig } from "vitest/config";

// Integration tests exercise the real migrated PostgreSQL schema. They require a
// dedicated disposable database via `INTEGRATION_DATABASE_URL` (never the
// application/E2E database) and are intentionally excluded from `npm run test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
