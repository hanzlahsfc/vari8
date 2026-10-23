// LOGGING (#168, READINESS B8) — one JSON line on stdout per event, with
// request id, route and status on a v1 500, and a redaction contract that
// can never emit a token, cookie, email, secret value, URL credential or
// raw body. Mocked viewer/membership drives the real defineApiV1Route
// boundary; register() drives the real boot-refusal path.

import { createHmac, randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, defineApiV1Route, reportV1Failure } from "../../lib/api/v1";
import { logError, redactString, REDACTED, trustedId } from "../../lib/log";

/** Set per test — the mocked mediaObject lookup throws it when present. */
const mediaFault = vi.hoisted(() => ({ current: null as Error | null }));

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
    mediaObject: {
      findFirst: async () => {
        if (mediaFault.current) throw mediaFault.current;
        return null;
      },
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

  it("error name and code are scrubbed, not just message and cause", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const error = new Error("boom");
    error.name = "LeakError for admin@x.test";
    (error as { code?: string }).code =
      "tok_" + "z".repeat(40) + " for victim@x.test";
    logError("test_event", { error });
    const line = String(spy.mock.calls[0][0]);
    expect(line).not.toContain("admin@x.test");
    expect(line).not.toContain("victim@x.test");
    expect(line).not.toContain("z".repeat(40));
    const parsed = JSON.parse(line);
    expect(parsed.error.name).toContain("[email]");
    expect(parsed.error.code).toContain("[email]");
  });

  it("caps object key counts and the total serialized line", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 100; i += 1) wide[`k${i}`] = i;
    logError("test_event", { wide });
    const parsed = JSON.parse(String(spy.mock.calls[0][0]));
    expect(parsed.wide.__keys_omitted).toBe(36);
    spy.mockClear();

    const big = new Error("fat");
    big.stack = "Error: fat\n" + "at frame (x.js:1:1)\n".repeat(5000);
    logError("test_event", { error: big });
    const line = String(spy.mock.calls[0][0]);
    expect(line.length).toBeLessThanOrEqual(32_769);
    const shrunk = JSON.parse(line);
    expect(shrunk.error.stack).toMatch(/…\[truncated\]$/);
  });

  it("oversized errors stay valid JSON, byte-bounded, correlation kept", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logError("api_v1_request_failed", {
      requestId: trustedId("t".repeat(32)),
      method: "GET",
      route: "/api/v1/workspaces/ws-1/session",
      status: 500,
      error: new Error("x ".repeat(30_000)),
    });
    const line = String(spy.mock.calls[0][0]);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32_768);
    const parsed = JSON.parse(line);
    expect(parsed.requestId).toBe("t".repeat(32));
    expect(parsed.method).toBe("GET");
    expect(parsed.route).toBe("/api/v1/workspaces/ws-1/session");
    expect(parsed.status).toBe(500);
    expect(parsed.error.message).toMatch(/…\[truncated\]$/);
    expect(line).not.toContain("x ".repeat(30_000));
  });

  it("multibyte text is byte-bounded without splitting a surrogate pair", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const error = new Error("💥".repeat(20_000));
    error.name = "💥".repeat(200) + "Name";
    logError("test_event", { error });
    const line = String(spy.mock.calls[0][0]);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32_768);
    const parsed = JSON.parse(line);
    expect(parsed.error.message).toMatch(/…\[truncated\]$/);
    expect(parsed.error.name).toMatch(/…\[truncated\]$/);
    // no lone surrogate escaped into the output
    expect(line).not.toMatch(/\\ud[89a-f][0-9a-f]{2}/i);
  });

  it("a nested giant cause is bounded and keeps the correlation fields", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    logError("api_v1_request_failed", {
      requestId: trustedId("c".repeat(32)),
      method: "PUT",
      route: "/api/v1/media/object",
      status: 500,
      error: new Error("outer", { cause: new Error("y ".repeat(20_000)) }),
    });
    const line = String(spy.mock.calls[0][0]);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32_768);
    const parsed = JSON.parse(line);
    expect(parsed.requestId).toBe("c".repeat(32));
    expect(parsed.error.cause.message).toMatch(/…\[truncated\]$/);
  });

  it("the minimal fallback keeps safe request-correlation fields", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const fat: Record<string, unknown> = {};
    for (let i = 0; i < 60; i += 1) fat[`k${i}`] = "v ".repeat(1000);
    logError("api_v1_request_failed", {
      requestId: trustedId("d".repeat(32)),
      method: "GET",
      route: "/api/v1/media/object",
      status: 500,
      fat,
    });
    const line = String(spy.mock.calls[0][0]);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32_768);
    const parsed = JSON.parse(line);
    expect(parsed.truncated).toBe("[event-exceeded-size-limit]");
    expect(parsed.requestId).toBe("d".repeat(32));
    expect(parsed.method).toBe("GET");
    expect(parsed.route).toBe("/api/v1/media/object");
    expect(parsed.status).toBe(500);
  });

  it("a trustedId marker cannot smuggle an oversized or unsafe string", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    // trustedId self-validates: outside the grammar the value takes the
    // normal redaction path — the long-token scrub still applies.
    logError("api_v1_request_failed", {
      requestId: trustedId("x".repeat(10_000)),
      method: "GET",
      route: "/api/v1/media/object",
      status: 500,
    });
    const line = String(spy.mock.calls[0][0]);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32_768);
    expect(JSON.parse(line).requestId).toBe(REDACTED);
  });

  it("a throwing getter plus a dead sink still cannot throw", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw new Error("EPIPE");
    });
    expect(() =>
      logError("test_event", {
        get boom(): never {
          throw new Error("getter explosion admin@x.test");
        },
      }),
    ).not.toThrow();
    spy.mockRestore();
  });

  it("a dead stdout sink never throws and never loses the response", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw new Error("EPIPE");
    });
    expect(() => logError("test_event", { requestId: "r1" })).not.toThrow();
    // through the funnel: the 500 response must still be produced
    const GET = defineApiV1Route({
      capability: "own.read",
      params: z.object({ workspaceId: z.string().min(1) }),
      handler: async () => {
        throw new Error("still exploding");
      },
    });
    const res = await GET(
      new Request("http://app.test/api/v1/workspaces/ws-1/session"),
      { params: Promise.resolve({ workspaceId: "ws-1" }) },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal" } });
    spy.mockRestore();
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

  it.each([
    ["short proxy id", "proxy-req-001", "proxy-req-001"],
    ["uuid", "7f4c9b12-3e54-4ab8-9d2f-1a2b3c4d5e6f", "same"],
    ["32-char token", "a".repeat(32), "same"],
    ["64-char token", "b".repeat(64), "same"],
    ["oversized (65)", "c".repeat(65), "minted"],
    ["unsafe shape", 'forged {"level":"info"} a=b', "minted"],
  ])(
    "request id %s: logged correlation id equals the returned one",
    async (_label, inbound, expected) => {
      const GET = route();
      const spy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const res = await GET(
        new Request("http://app.test/api/v1/workspaces/ws-1/session", {
          headers: { "x-request-id": inbound },
        }),
        { params: Promise.resolve({ workspaceId: "ws-1" }) },
      );
      expect(res.status).toBe(500);
      const line = String(spy.mock.calls[0][0]);
      const parsed = JSON.parse(line);
      const echoed = res.headers.get("x-request-id");
      // The client always gets exactly the id that was logged.
      expect(parsed.requestId).toBe(echoed);
      if (expected === "same") {
        expect(parsed.requestId).toBe(inbound);
      } else if (expected === "minted") {
        expect(parsed.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(line).not.toContain(inbound);
      }
      spy.mockRestore();
    },
  );

  it("reportV1Failure re-validates its requestId argument", async () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const res = reportV1Failure(
      new Request("http://app.test/api/v1/media/object"),
      'unvalidated {"level":"info"} a=b',
      new Error("x"),
    );
    expect(res.status).toBe(500);
    const parsed = JSON.parse(String(spy.mock.calls[0][0]));
    expect(parsed.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-request-id")).toBe(parsed.requestId);
    expect(String(spy.mock.calls[0][0])).not.toContain("unvalidated");
    spy.mockRestore();
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

describe("api_v1_request_failed — media/object (signature, not session)", () => {
  const SECRET = "synthetic-logging-signing-secret-00000000";
  const KEY = "workspace/ws-log/client/cp-log/obj-log";

  function signedUrl(op: "get" | "put") {
    const e = Math.floor(Date.now() / 1000) + 600;
    const signature = createHmac("sha256", SECRET)
      .update(`${op}\n${KEY}\n${e}`)
      .digest("hex");
    const url =
      `http://app.test/api/v1/media/object?op=${op}` +
      `&key=${encodeURIComponent(KEY)}&e=${e}&s=${signature}`;
    return { url, signature };
  }

  function stubLocal() {
    vi.stubEnv("MEDIA_STORAGE_ADAPTER", "local");
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mediaFault.current = null;
  });

  it("an unhandled GET fault logs one redacted line and returns the safe body", async () => {
    stubLocal();
    mediaFault.current = new Error(
      "pg://u:hunter2@db.internal:5432/app refused contact ops@x.test",
    );
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("../../app/api/v1/media/object/route");
    const { url, signature } = signedUrl("get");
    const res = await GET(
      new Request(url, { headers: { "x-request-id": "media-req-42" } }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal" } });
    expect(res.headers.get("x-request-id")).toBe("media-req-42");
    // exactly one structured event — the app path emits nothing else
    expect(spy).toHaveBeenCalledTimes(1);
    expect(errSpy).not.toHaveBeenCalled();
    const line = String(spy.mock.calls[0][0]);
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe("api_v1_request_failed");
    expect(parsed.requestId).toBe("media-req-42");
    expect(parsed.method).toBe("GET");
    expect(parsed.route).toBe("/api/v1/media/object");
    expect(parsed.status).toBe(500);
    // no signed query, signature, secret or email reaches the line
    expect(line).not.toContain(signature);
    expect(line).not.toContain(SECRET);
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("ops@x.test");
    expect(line).not.toContain(KEY);
  });

  it("an unhandled PUT fault takes the same path", async () => {
    stubLocal();
    mediaFault.current = new Error("disk sentinel media-secret-99");
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const { PUT } = await import("../../app/api/v1/media/object/route");
    const { url } = signedUrl("put");
    const res = await PUT(new Request(url, { method: "PUT", body: "abcd" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal" } });
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(String(spy.mock.calls[0][0]));
    expect(parsed.event).toBe("api_v1_request_failed");
    expect(parsed.method).toBe("PUT");
    expect(parsed.route).toBe("/api/v1/media/object");
    // request ids are still correlation-consistent on this route
    expect(parsed.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(spy.mock.calls[0][0])).toContain("media-secret-99");
  });

  it("expected responses (invalid signature, non-local backend) stay silent", async () => {
    stubLocal();
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const { GET } = await import("../../app/api/v1/media/object/route");
    const e = Math.floor(Date.now() / 1000) + 600;
    const bad =
      `http://app.test/api/v1/media/object?op=get` +
      `&key=${encodeURIComponent(KEY)}&e=${e}&s=${"0".repeat(64)}`;
    const r403 = await GET(new Request(bad));
    expect(r403.status).toBe(403);
    expect(await r403.json()).toEqual({
      error: { code: "invalid_signature" },
    });
    expect(spy).not.toHaveBeenCalled();

    vi.stubEnv("MEDIA_STORAGE_ADAPTER", "none");
    const { url } = signedUrl("get");
    const r404 = await GET(new Request(url));
    expect(r404.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });
});
