import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests exercise the real migrated PostgreSQL schema. They require a
// dedicated disposable database via `INTEGRATION_DATABASE_URL` (never the
// application/E2E database) and are intentionally excluded from `npm run test`.
export default defineConfig({
  resolve: {
    alias: {
      // "@/*" tsconfig path — needed for tests importing app/* entrypoints.
      "@": path.resolve(import.meta.dirname),
      // PR-05: better-auth's Next integration reads next/headers (+ next/server
      // in route helpers); stub them so the real auth pipeline runs under vitest.
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
    // Inline better-auth so the next/headers + next/server aliases above apply
    // inside its packages (externalized deps would bypass vite aliasing).
    server: {
      deps: { inline: [/^better-auth/, /^@better-auth/, /^better-call/] },
    },
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      // Global `lib/db` Prisma and the wired auth instance must target the
      // disposable integration database, not the app database.
      ...(process.env.INTEGRATION_DATABASE_URL
        ? { DATABASE_URL: process.env.INTEGRATION_DATABASE_URL }
        : {}),
      // Test-only auth secret for the real Better Auth pipeline. Synthetic.
      BETTER_AUTH_SECRET: "integration-test-auth-secret-not-for-production",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      // D19: the PR-05 CUT-AT-REPLACE blocks still exercise the parked
      // gates; the flag is unset (off) in every other environment.
      ENABLE_CONSENT_GATES: "1",
      // Mailbox output for reset flows lands under a disposable path when a
      // test sets DEV_MAILBOX_FILE; the dev-file adapter is the default
      // outside production.
    },
  },
});
