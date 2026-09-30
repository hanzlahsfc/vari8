import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests exercise the real migrated PostgreSQL schema. They require a
// dedicated disposable database via `INTEGRATION_DATABASE_URL` (never the
// application/E2E database) and are intentionally excluded from `npm run test`.
export default defineConfig({
  resolve: {
    alias: {
      // next-auth's index imports these Next server-only modules; stub them so
      // the real exported `auth()`/`handlers` pipeline runs under vitest.
      "next/headers": path.resolve(
        import.meta.dirname,
        "tests/integration/stubs/next-headers.ts",
      ),
      "next/server": path.resolve(
        import.meta.dirname,
        "tests/integration/stubs/next-server.ts",
      ),
    },
  },
  test: {
    environment: "node",
    // Inline next-auth so the next/headers + next/server aliases above apply
    // inside its package (externalized deps would bypass vite aliasing).
    server: { deps: { inline: ["next-auth"] } },
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      // Global `lib/db` Prisma and the wired `authNodeCallbacks` must target
      // the disposable integration database, not the app database.
      ...(process.env.INTEGRATION_DATABASE_URL
        ? { DATABASE_URL: process.env.INTEGRATION_DATABASE_URL }
        : {}),
      // Test-only JWT secret for the real Auth.js cookie pipeline. Synthetic.
      AUTH_SECRET: "integration-test-auth-secret-not-for-production",
      AUTH_TRUST_HOST: "true",
    },
  },
});
