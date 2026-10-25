import { defineConfig } from "@playwright/test";

// PLAYWRIGHT_PORT_BASE (verify-local passes the lane port) picks the
// browser-facing port so lanes run side by side; default stays 3000.
// A malformed or out-of-range value is a configuration error, never a
// silent fallback.
function lanePort(raw: string | undefined): number {
  if (raw === undefined) return 3000;
  if (!/^\d+$/.test(raw))
    throw new Error(
      `PLAYWRIGHT_PORT_BASE must be a decimal integer, got ${JSON.stringify(raw)}`,
    );
  const n = Number(raw);
  if (n < 1 || n > 65535)
    throw new Error(`PLAYWRIGHT_PORT_BASE out of TCP range 1-65535: ${raw}`);
  // TLS_PORT + 1 is the backend port — 65535 is unusable as a pair.
  if (n > 65534)
    throw new Error(
      `PLAYWRIGHT_PORT_BASE ${raw} leaves no backend port (needs ${raw}+1)`,
    );
  return n;
}

// Two processes: `next start` on a private http port, and a disposable
// local TLS terminator (tests/e2e/tls-proxy.mjs) on the lane port. The
// browser only ever sees the https origin — the same origin configured
// on the app — so the configured-origin contract is exercised for real
// (no derived-origin shortcut) while `next start` itself stays a plain
// production boot.
const TLS_PORT = lanePort(process.env.PLAYWRIGHT_PORT_BASE);
const BACKEND_PORT = TLS_PORT + 1;
const ORIGIN = `https://127.0.0.1:${TLS_PORT}`;

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
    // Disposable self-signed cert generated per run by tls-proxy.mjs —
    // never committed, never trusted outside this browser context.
    ignoreHTTPSErrors: true,
  },
  webServer: [
    {
      command: `npm run build && npm run start -- -p ${BACKEND_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${BACKEND_PORT}`,
      // Canonical proof path: never attach to a process that happens to
      // own the port — an occupied port must fail.
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        // P-023-I1-R2: `next start` is NODE_ENV=production, so the trusted
        // dev/test boundary requires an explicit APP_ENV=test — PR-05's
        // consent-boundary checks rely on this classification. It does NOT
        // relax the production auth assertions.
        APP_ENV: "test",
        // The configured auth origin equals the https address the browser
        // sees — both names set to the same value (the pair-refusal
        // contract), overriding any inherited AUTH_URL pointing at
        // another port or scheme. Secure cookies stay Secure end to end.
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
    {
      command: "node tests/e2e/tls-proxy.mjs",
      // TCP-level readiness — the readiness check must not TLS-verify the
      // disposable self-signed cert.
      port: TLS_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PLAYWRIGHT_TLS_PORT: String(TLS_PORT),
        PLAYWRIGHT_TLS_TARGET: `http://127.0.0.1:${BACKEND_PORT}`,
      },
    },
  ],
});
