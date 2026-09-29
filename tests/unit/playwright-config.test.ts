import { describe, expect, it } from "vitest";

import config from "../../playwright.config";

// Regression test: pins the deterministic test-only server environment.
const env =
  (config.webServer as { env?: Record<string, string> } | undefined)?.env ?? {};

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
});
