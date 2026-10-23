// BOOT-CHECKS (#167, READINESS B6/B7) — a production boot must refuse to
// start on bad storage or auth-origin config instead of failing on the
// first request. assertMediaStorageConfigured takes the env explicitly;
// assertAuthSecretConfigured reads process.env (stubbed per case, the
// same pattern as tests/integration/pr05-security.test.ts). register()
// in instrumentation.ts is the production exit path: NEXT_RUNTIME=nodejs,
// NODE_ENV=production, a refusal must reach process.exit(1).

import { afterEach, describe, expect, it, vi } from "vitest";

import { assertAuthSecretConfigured } from "../../lib/auth/server";
import { assertMediaStorageConfigured } from "../../lib/storage";

const S3_VARS = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

const FULL_S3: Record<string, string> = {
  S3_BUCKET: "trial-media",
  S3_REGION: "eu-west-1",
  S3_ACCESS_KEY_ID: "AKIA_TEST",
  S3_SECRET_ACCESS_KEY: "test-secret-value",
};

describe("assertMediaStorageConfigured — production refuses s3 with missing vars", () => {
  it.each(S3_VARS)("exits when %s is missing", (missing) => {
    const env: Record<string, string> = {
      NODE_ENV: "production",
      MEDIA_STORAGE_ADAPTER: "s3",
      ...FULL_S3,
    };
    delete env[missing];
    expect(() => assertMediaStorageConfigured(env)).toThrow(
      new RegExp(
        `Refusing to start: MEDIA_STORAGE_ADAPTER=s3.*missing: ${missing}\\.`,
      ),
    );
  });

  it("lists every missing variable name", () => {
    expect(() =>
      assertMediaStorageConfigured({
        NODE_ENV: "production",
        MEDIA_STORAGE_ADAPTER: "s3",
      }),
    ).toThrow(
      /missing: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY\./,
    );
  });

  it("does not print configured values — only missing names", () => {
    const sentinel = "supersecret-sentinel-value";
    try {
      assertMediaStorageConfigured({
        NODE_ENV: "production",
        MEDIA_STORAGE_ADAPTER: "s3",
        S3_SECRET_ACCESS_KEY: sentinel,
      });
      expect.unreachable("must throw");
    } catch (error) {
      const message = String(error);
      expect(message).toContain("S3_BUCKET");
      expect(message).not.toContain(sentinel);
    }
  });

  it("accepts a complete s3 config", () => {
    expect(() =>
      assertMediaStorageConfigured({
        NODE_ENV: "production",
        MEDIA_STORAGE_ADAPTER: "s3",
        ...FULL_S3,
      }),
    ).not.toThrow();
  });

  it("resolves the adapter case-insensitively, like getObjectStorage", () => {
    expect(() =>
      assertMediaStorageConfigured({
        NODE_ENV: "production",
        MEDIA_STORAGE_ADAPTER: "S3",
      }),
    ).toThrow(/Refusing to start/);
  });

  it("mirrors getObjectStorage exactly: only lowercasing, no trim", () => {
    // " s3 " is NOT the s3 adapter — it resolves to the fail-closed null
    // backend, which needs no S3 variables to boot.
    expect(() =>
      assertMediaStorageConfigured({
        NODE_ENV: "production",
        MEDIA_STORAGE_ADAPTER: " s3 ",
      }),
    ).not.toThrow();
  });

  it.each([undefined, "none", "local"])(
    "non-s3 adapter %j needs no S3 vars in production",
    (adapter) => {
      expect(() =>
        assertMediaStorageConfigured({
          NODE_ENV: "production",
          ...(adapter === undefined ? {} : { MEDIA_STORAGE_ADAPTER: adapter }),
        }),
      ).not.toThrow();
    },
  );

  it("is a no-op outside production", () => {
    expect(() =>
      assertMediaStorageConfigured({
        NODE_ENV: "test",
        MEDIA_STORAGE_ADAPTER: "s3",
      }),
    ).not.toThrow();
    expect(() =>
      assertMediaStorageConfigured({
        NODE_ENV: "development",
        MEDIA_STORAGE_ADAPTER: "s3",
      }),
    ).not.toThrow();
  });

  it("is a no-op during the production build phase", () => {
    expect(() =>
      assertMediaStorageConfigured({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        MEDIA_STORAGE_ADAPTER: "s3",
      }),
    ).not.toThrow();
  });
});

describe("assertAuthSecretConfigured — production refuses an http: auth origin", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = [
    "NODE_ENV",
    "NEXT_PHASE",
    "BETTER_AUTH_URL",
    "AUTH_URL",
    "BETTER_AUTH_SECRET",
    "AUTH_SECRET",
  ];

  function stub(env: Record<string, string>) {
    // Delete, not empty-string: "" is not nullish, so a stubbed "" would
    // suppress the AUTH_URL fallback the `??` resolution performs.
    for (const k of KEYS) {
      saved[k] ??= process.env[k];
      delete process.env[k];
    }
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
      delete saved[k];
    }
  });

  const PROD = {
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: "x".repeat(40),
  };

  it("refuses BETTER_AUTH_URL=http: and names the variable, not the value", () => {
    stub({ ...PROD, BETTER_AUTH_URL: "http://app.internal.example" });
    expect(() => assertAuthSecretConfigured()).toThrow(
      /Refusing to start: BETTER_AUTH_URL is an http: origin/,
    );
    try {
      assertAuthSecretConfigured();
      expect.unreachable("must throw");
    } catch (error) {
      expect(String(error)).not.toContain("app.internal.example");
    }
  });

  it("refuses the legacy AUTH_URL=http: fallback origin", () => {
    stub({ ...PROD, AUTH_URL: "http://legacy.example" });
    expect(() => assertAuthSecretConfigured()).toThrow(
      /Refusing to start: AUTH_URL is an http: origin/,
    );
  });

  it("accepts an https: origin", () => {
    stub({ ...PROD, BETTER_AUTH_URL: "https://app.example" });
    expect(() => assertAuthSecretConfigured()).not.toThrow();
  });

  it("accepts an unset origin — Better Auth derives it per request", () => {
    stub({ ...PROD });
    expect(() => assertAuthSecretConfigured()).not.toThrow();
  });

  it("is a no-op outside production", () => {
    stub({
      NODE_ENV: "test",
      BETTER_AUTH_URL: "http://app.internal.example",
      BETTER_AUTH_SECRET: "x".repeat(40),
    });
    expect(() => assertAuthSecretConfigured()).not.toThrow();
  });

  it("is a no-op during the production build phase", () => {
    stub({
      ...PROD,
      NEXT_PHASE: "phase-production-build",
      BETTER_AUTH_URL: "http://app.internal.example",
    });
    expect(() => assertAuthSecretConfigured()).not.toThrow();
  });
});

describe("instrumentation register() — refused config exits the process", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = [
    "NEXT_RUNTIME",
    "NODE_ENV",
    "NEXT_PHASE",
    "MEDIA_STORAGE_ADAPTER",
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
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
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
      delete saved[k];
    }
  });

  it("exits 1 on the s3 refusal and does not leak secret values", async () => {
    const sentinel = "supersecret-sentinel-value";
    stub({
      NEXT_RUNTIME: "nodejs",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "x".repeat(40),
      BETTER_AUTH_URL: "https://app.example",
      MEDIA_STORAGE_ADAPTER: "s3",
      S3_SECRET_ACCESS_KEY: sentinel,
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    // The refusal is reported as one structured `boot_refused` stdout
    // line via lib/log (#168) — same assertion, new sink.
    const outSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const { register } = await import("../../instrumentation");
    await expect(register()).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = outSpy.mock.calls.flat().join(" ");
    expect(printed).toContain("S3_BUCKET");
    expect(printed).not.toContain(sentinel);
  });

  it("exits 1 on the http-origin refusal", async () => {
    stub({
      NEXT_RUNTIME: "nodejs",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "x".repeat(40),
      BETTER_AUTH_URL: "http://app.internal.example",
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { register } = await import("../../instrumentation");
    await expect(register()).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("a valid production config boots without exiting", async () => {
    stub({
      NEXT_RUNTIME: "nodejs",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "x".repeat(40),
      BETTER_AUTH_URL: "https://app.example",
      MEDIA_STORAGE_ADAPTER: "s3",
      ...FULL_S3,
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { register } = await import("../../instrumentation");
    await expect(register()).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
