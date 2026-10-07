import { describe, expect, it } from "vitest";

import config from "../../playwright.config";

// Regression test: pins the deterministic test-only server environment.
// webServer is an array — entry 0 is the primary server (P-013 flag ON),
// entry 1 is the flag-OFF server used by the disabled-feature specs.
type WebServerEntry = { env?: Record<string, string>; url?: string };
const servers = (
  Array.isArray(config.webServer) ? config.webServer : [config.webServer]
) as WebServerEntry[];
const env = servers[0]?.env ?? {};
const offEnv = servers[1]?.env ?? {};

describe("playwright web server environment", () => {
  it("supplies a deterministic, non-production AUTH_SECRET", () => {
    expect(typeof env.AUTH_SECRET).toBe("string");
    expect((env.AUTH_SECRET ?? "").length).toBeGreaterThanOrEqual(16);
    expect(env.AUTH_SECRET).not.toMatch(/^(prod|live)/i);
  });

  it("supplies a DATABASE_URL for the test server", () => {
    expect(env.DATABASE_URL ?? "").toMatch(/^postgresql:\/\//);
  });

  it("enables the development-only viewers for the test server", () => {
    expect(env.ENABLE_SHEET_VIEWER).toBe("1");
    expect(env.ENABLE_DAILY_PROTOTYPE).toBe("1");
  });

  it("enables onboarding assignments only on the primary server", () => {
    expect(env.ENABLE_ONBOARDING_ASSIGNMENTS).toBe("1");
    // Pinned empty on the flag-off server — webServer env merges over
    // process.env, so an inherited "1" must not leak into :3101.
    expect(offEnv.ENABLE_ONBOARDING_ASSIGNMENTS).toBe("");
    expect(servers[1]?.url).toContain("3101");
  });

  it("enables client setup only on the primary server", () => {
    expect(env.ENABLE_CLIENT_SETUP).toBe("1");
    // Pinned empty on the flag-off server — an inherited "1" must not leak.
    expect(offEnv.ENABLE_CLIENT_SETUP).toBe("");
  });
});
