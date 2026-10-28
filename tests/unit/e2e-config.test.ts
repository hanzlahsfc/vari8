import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";

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
    // The backend binds loopback only — never the wildcard/LAN.
    expect(c.webServer![0].command).toContain("-H 127.0.0.1");
    expect(c.webServer![0].env!.BETTER_AUTH_URL).toBe("https://127.0.0.1:3833");
    expect(c.webServer![1].env!.PLAYWRIGHT_TLS_PORT).toBe("3833");
    expect(c.webServer![1].env!.PLAYWRIGHT_TLS_TARGET).toBe(
      "http://127.0.0.1:3834",
    );
  });

  it("accepts the last usable port pair (TLS 65534 -> backend 65535)", async () => {
    vi.stubEnv("PLAYWRIGHT_PORT_BASE", "65534");
    const c = await loadConfig();
    expect(c.use!.baseURL).toBe("https://127.0.0.1:65534");
    expect(c.webServer![0].command).toContain("-p 65535");
  });

  it.each(["abc", "0", "-1", "1.5", "65535", "65536", "3000x", " 3833"])(
    "rejects a malformed, out-of-range or pair-unusable lane port %j",
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

const PROXY = "tests/e2e/tls-proxy.mjs";

function tlsDirs(): Set<string> {
  return new Set(
    fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("vari8-e2e-tls-")),
  );
}

async function waitForPort(port: number, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const s = net.connect(port, "127.0.0.1");
      s.on("connect", () => {
        s.end();
        resolve(true);
      });
      s.on("error", () => resolve(false));
    });
    if (open) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`127.0.0.1:${port} never listened`);
}

describe("tls-proxy process contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("openssl failure: nonzero exit, its dir removed, no key material", () => {
    const before = tlsDirs();
    const out = spawnSync(process.execPath, [PROXY], {
      // PATH without openssl makes cert generation fail after mkdtemp;
      // the inherited TMPDIR keeps the child's os.tmpdir() equal to ours.
      env: {
        ...process.env,
        PATH: "/nonexistent",
        PLAYWRIGHT_TLS_PORT: "34999",
        PLAYWRIGHT_TLS_TARGET: "http://127.0.0.1:35000",
      },
      encoding: "utf8",
    });
    expect(out.status).not.toBe(0);
    // The task-owned temp dir was created then removed; unrelated
    // pre-existing dirs are untouched.
    const after = tlsDirs();
    expect([...after].filter((d) => !before.has(d))).toEqual([]);
    for (const d of before) expect(after.has(d)).toBe(true);
    expect(out.stderr).not.toMatch(/PRIVATE KEY/);
  });

  it("running proxy removes its temp dir on SIGTERM", async () => {
    const before = tlsDirs();
    const child = spawn(process.execPath, [PROXY], {
      env: {
        ...process.env,
        TMPDIR: os.tmpdir(),
        PLAYWRIGHT_TLS_PORT: "34998",
        PLAYWRIGHT_TLS_TARGET: "http://127.0.0.1:35001",
      },
      stdio: "ignore",
    });
    try {
      await waitForPort(34998);
      // The proxy deletes the key/cert dir as soon as the server holds
      // the credentials in memory — nothing is on disk while running.
      expect([...tlsDirs()].filter((d) => !before.has(d))).toEqual([]);
    } finally {
      child.kill("SIGTERM");
    }
    await new Promise<void>((r) => child.on("exit", () => r()));
    expect([...tlsDirs()].filter((d) => !before.has(d))).toEqual([]);
  });
});
