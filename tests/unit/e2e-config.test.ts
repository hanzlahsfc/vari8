import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The canonical e2e contract: browser origin, configured auth origin
// and the server's lane port must agree, a malformed lane port is a
// configuration error, and the proof path never attaches to a stale
// server on the requested port.

type PwConfig = {
  use?: { baseURL?: string; ignoreHTTPSErrors?: boolean };
  webServer?: {
    command: string;
    url?: string;
    port?: number;
    reuseExistingServer?: boolean;
    env?: Record<string, string>;
  }[];
};

async function loadConfig(): Promise<PwConfig> {
  vi.resetModules();
  const mod = (await import("../../playwright.config")).default;
  return mod as unknown as PwConfig;
}

describe("playwright.config e2e origin/port contract", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("defaults the lane port to 3000 with an https browser origin", async () => {
    vi.stubEnv("PLAYWRIGHT_PORT_BASE", "");
    delete process.env.PLAYWRIGHT_PORT_BASE;
    const c = await loadConfig();
    expect(c.use!.baseURL).toBe("https://127.0.0.1:3000");
    expect(c.webServer![0].command).toContain("-p 3001");
    expect(c.webServer![0].env!.BETTER_AUTH_URL).toBe("https://127.0.0.1:3000");
    expect(c.webServer![0].env!.AUTH_URL).toBe("https://127.0.0.1:3000");
  });

  it("honors a requested lane port: origin, server and browser agree", async () => {
    vi.stubEnv("PLAYWRIGHT_PORT_BASE", "3833");
    const c = await loadConfig();
    expect(c.use!.baseURL).toBe("https://127.0.0.1:3833");
    expect(c.webServer![0].command).toContain("-p 3834");
    expect(c.webServer![0].env!.BETTER_AUTH_URL).toBe("https://127.0.0.1:3833");
    expect(c.webServer![1].env!.PLAYWRIGHT_TLS_PORT).toBe("3833");
    expect(c.webServer![1].env!.PLAYWRIGHT_TLS_TARGET).toBe(
      "http://127.0.0.1:3834",
    );
  });

  it.each(["abc", "0", "-1", "1.5", "65536", "3000x", " 3833"])(
    "rejects a malformed or out-of-range lane port %j",
    async (raw) => {
      vi.stubEnv("PLAYWRIGHT_PORT_BASE", raw);
      await expect(loadConfig()).rejects.toThrow(/PLAYWRIGHT_PORT_BASE/);
    },
  );

  it("never reuses an existing server on this proof path", async () => {
    vi.stubEnv("PLAYWRIGHT_PORT_BASE", "3833");
    const c = await loadConfig();
    for (const entry of c.webServer!)
      expect(entry.reuseExistingServer).toBe(false);
  });
});
