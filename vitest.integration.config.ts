import { defineConfig } from "vitest/config";

// Integration tests exercise the real migrated PostgreSQL schema. They require a
// disposable database via `S1A_TEST_DATABASE_URL` (see docs/tasks/s1-a-identity-tenancy.md)
// and are intentionally excluded from `npm run test` (unit only).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
