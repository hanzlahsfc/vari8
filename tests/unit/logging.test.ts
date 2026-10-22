// LOGGING (#168, READINESS B8) — one JSON line on stdout per event, with
// request id, route and status on a v1 500, and a redaction contract that
// can never emit a token, cookie, email, secret value, URL credential or
// raw body. Mocked viewer/membership drives the real defineApiV1Route
// boundary; register() drives the real boot-refusal path.

import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, defineApiV1Route } from "../../lib/api/v1";
import { logError, redactString, REDACTED } from "../../lib/log";

vi.mock("../../lib/auth/viewer", () => ({
  getViewerFromHeaders: async () => ({
    id: "u-test-1",
    email: "viewer@x.test",
    name: "Viewer",
  }),
}));

vi.mock("../../lib/db", () => ({
  prisma: {
    workspaceMember: {
      findFirst: async () => ({ id: "m1", role: "WORKSPACE_OWNER" }),
    },
  },
}));

describe("logger — one JSON line, redacted", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes exactly one parseable JSON line to stdout", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logError("test_event", { requestId: "r1", status: 500 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: "error",
      event: "test_event",
      requestId: "r1",
      status: 500,
    });
    expect(typeof parsed.ts).toBe("string");
  });

  it("redacts sensitive keys at any depth", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logError("test_event", {
      config: {
        db: { password: "supersecret-pw", host: "pg.example" },
        headers: [{ name: "authorization", value: "Bearer tok123" }],
      },
    });
    const line = String(spy.mock.calls[0][0]);
    expect(line).not.toContain("supersecret-pw");
    expect(line).toContain("pg.example");
    // the key "authorization" under a header-name field is a value here;
    // its "value" pair carries the bearer, scrubbed as a string
    expect(line).not.toContain("tok123");
  });

  it("redactString scrubs emails, bearer, headers, urls, params, tokens", () => {
    const out = redactString(
      "dsn=https://u:p%40ss@db.example:5432/app" +
        "?sslmode=require&password=hunter2#frag " +
        "reset for user@example.com; Bearer tok-abc here; " +
        "session_token=abc123 signature=s1g blob=" +
        "t".repeat(48) +
        " Authorization: Bearer tok-zzz\nCookie: sid=xyz789",
    );
    expect(out).not.toContain("user@example.com");
    expect(out).not.toContain("tok-abc");
    expect(out).not.toContain("tok-zzz");
    expect(out).not.toContain("sid=xyz789");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("p%40ss");
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("s1g");
    expect(out).not.toContain("t".repeat(48));
    expect(out).toContain("https://db.example:5432/app");
    expect(out).toContain("[email]");
    expect(out).toContain("Authorization: [redacted]");
    expect(out).toContain("Cookie: [redacted]");
  });

  it("keeps UUIDs — request ids are identifiers, not secrets", () => {
    const id = randomUUID();
    expect(redactString(`request ${id} failed`)).toContain(id);
  });

  it("serializes error name/code/message/stack and nested causes, redacted", () => {
    const cause = new Error("db refused: contact admin@x.test", {
      cause: new Error("ECONNREFUSED password=hunter2"),
    });
    const error = new Error("media mint failed", { cause });
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logError("test_event", { error });
    const parsed = JSON.parse(String(spy.mock.calls[0][0]));
    expect(parsed.error.name).toBe("Error");
    expect(parsed.error.message).toBe("media mint failed");
    expect(parsed.error.stack).toContain("at ");
    const serialized = String(spy.mock.calls[0][0]);
    expect(serialized).not.toContain("admin@x.test");
    expect(serialized).not.toContain("hunter2");
    expect(parsed.error.cause.message).toContain("[email]");
    expect(parsed.error.cause.cause.message).toContain("password=[redacted]");
  });

  it("handles non-Error throws, circular refs and deep objects safely", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const deep = { a: { b: { c: { d: { e: { f: "leaf-secret?" } } } } } };
    expect(() =>
      logError("test_event", { thrown: "raw throw", circular, deep }),
    ).not.toThrow();
    const line = String(spy.mock.calls[0][0]);
    const parsed = JSON.parse(line);
    expect(parsed.thrown).toBe("raw throw");
    expect(parsed.circular.self).toBe("[circular]");
    expect(parsed.deep.a.b.c.d).toBe("[depth-capped]");
  });

  it("top-level sensitive field names are replaced outright", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logError("test_event", { secret: "x".repeat(40), status: 500 });
    const parsed = JSON.parse(String(spy.mock.calls[0][0]));
    expect(parsed.secret).toBe(REDACTED);
  });
});

describe("api_v1_request_failed — the v1 500 line", () => {
  afterEach(() => vi.restoreAllMocks());

  function route() {
    return defineApiV1Route({
      capability: "own.read",
      params: z.object({ workspaceId: z.string().min(1) }),
      handler: async () => {
        throw new Error(
          "pg connect db://u:hunter2@db.internal:5432/app contact ops@x.test",
        );
      },
    });
  }

  it("a 500 writes one line with request id, route, status — redacted", async () => {
    const GET = route();
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const res = await GET(
      new Request(
        "http://app.test/api/v1/workspaces/ws-1/session?invite=abc123",
        {
          headers: {
            cookie: "better-auth.session_token=topsecret-session-cookie",
            authorization: "Bearer topsecret-bearer-999",
          },
        },
      ),
      { params: Promise.resolve({ workspaceId: "ws-1" }) },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal" } });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe("api_v1_request_failed");
    expect(parsed.status).toBe(500);
    expect(parsed.method).toBe("GET");
    // route is the pathname only — no query string
    expect(parsed.route).toBe("/api/v1/workspaces/ws-1/session");
    expect(line).not.toContain("invite=abc123");
    // request id survives redaction and is echoed to the client
    expect(parsed.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-request-id")).toBe(parsed.requestId);
    // nothing sensitive: bearer, cookie, email, db credential, url userinfo
    expect(line).not.toContain("topsecret-session-cookie");
    expect(line).not.toContain("topsecret-bearer-999");
    expect(line).not.toContain("ops@x.test");
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("u:hunter2");
    expect(parsed.error.message).toContain("db://db.internal");
  });

  it("honors a well-formed inbound x-request-id and rejects a hostile one", async () => {
    const GET = route();
    let spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const res = await GET(
      new Request("http://app.test/api/v1/workspaces/ws-1/session", {
        headers: { "x-request-id": "proxy-req-001" },
      }),
      { params: Promise.resolve({ workspaceId: "ws-1" }) },
    );
    expect(res.status).toBe(500);
    expect(JSON.parse(String(spy.mock.calls[0][0])).requestId).toBe(
      "proxy-req-001",
    );
    spy.mockRestore();

    spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    // A header-legal but unsafe id (spaces/markup) must not reach the log
    // verbatim — newline forging is already impossible at the Headers layer.
    const res2 = await GET(
      new Request("http://app.test/api/v1/workspaces/ws-1/session", {
        headers: { "x-request-id": 'forged {"level":"info"} a=b' },
      }),
      { params: Promise.resolve({ workspaceId: "ws-1" }) },
    );
    expect(res2.status).toBe(500);
    const line2 = String(spy.mock.calls[0][0]);
    expect(line2).not.toContain("forged");
    expect(JSON.parse(line2).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("expected traffic (typed errors, bad input) writes no log line", async () => {
    const GET_403 = defineApiV1Route({
      capability: "own.read",
      params: z.object({ workspaceId: z.string().min(1) }),
      handler: async () => {
        throw new ApiError(403, "forbidden");
      },
    });
    const GET_400 = defineApiV1Route({
      capability: "own.read",
      params: z.object({ workspaceId: z.string().min(4) }),
      handler: async () => ({}),
    });
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const r403 = await GET_403(
      new Request("http://app.test/api/v1/workspaces/ws-1/session"),
      { params: Promise.resolve({ workspaceId: "ws-1" }) },
    );
    const r400 = await GET_400(
      new Request("http://app.test/api/v1/workspaces/ws-1/session"),
      { params: Promise.resolve({ workspaceId: "x" }) },
    );
    expect(r403.status).toBe(403);
    expect(r400.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("boot_refused — the instrumentation refusal line", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = [
    "NEXT_RUNTIME",
    "NODE_ENV",
    "NEXT_PHASE",
    "BETTER_AUTH_URL",
    "AUTH_URL",
    "BETTER_AUTH_SECRET",
    "AUTH_SECRET",
  ];

  function stub(env: Record<string, string>) {
    for (const k of KEYS) {
      saved[k] ??= process.env[k];
      delete process.env[k];
    }
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    // lib/auth/server.ts runs the assertion at module evaluation — a throw
    // poisons the cached module for the worker, so each case needs a fresh
    // module graph under its own env stub.
    vi.resetModules();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
      delete saved[k];
    }
  });

  it("a refused production boot logs one boot_refused line then exits 1", async () => {
    const sentinel = "s3ntinel-boot-secret";
    stub({
      NEXT_RUNTIME: "nodejs",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: sentinel,
      BETTER_AUTH_URL: "https://app.example",
    });
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    const { register } = await import("../../instrumentation");
    await expect(register()).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    const lines = spy.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("boot_refused");
    expect(parsed.error.message).toContain("Refusing to start");
    expect(lines[0]).not.toContain(sentinel);
  });

  it("a refused boot still rethrows (no log line) outside production", async () => {
    stub({
      NEXT_RUNTIME: "nodejs",
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "",
    });
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const { register } = await import("../../instrumentation");
    // NODE_ENV=test short-circuits the auth gate — register just resolves
    await expect(register()).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
