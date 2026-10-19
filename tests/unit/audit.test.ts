import { describe, expect, it, vi } from "vitest";

import type { AuthorizationContext } from "../../lib/auth/guard";
import {
  AuditError,
  buildAccountAuditEvent,
  buildAuditEvent,
  listAccountAuditEvents,
  sanitizeAuditMeta,
  writeAccountAuditEvent,
  type AuditMeta,
} from "../../lib/audit";

const ctx = (
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext & { workspaceId: string } => ({
  userId: "u1",
  platformRole: "USER",
  workspaceId: "w1",
  workspaceMemberId: "m1",
  workspaceRole: "CLIENT",
  grantedScope: "own",
  clientProfileId: "c1",
  ...overrides,
});

describe("sanitizeAuditMeta", () => {
  it("accepts the closed set of structural keys", () => {
    expect(
      sanitizeAuditMeta({
        kind: "HEALTH_DATA",
        version: "test-v1",
        changed: true,
        count: 3,
        role: "PRIMARY",
        status: "ACTIVE",
      }),
    ).toEqual({
      kind: "HEALTH_DATA",
      version: "test-v1",
      changed: true,
      count: 3,
      role: "PRIMARY",
      status: "ACTIVE",
    });
  });

  it("accepts undefined and empty metadata", () => {
    expect(sanitizeAuditMeta(undefined)).toBeUndefined();
    expect(sanitizeAuditMeta({})).toEqual({});
  });

  it.each([
    ["password", "hunter2"],
    ["token", "abc123"],
    ["secret", "s3cr3t"],
    ["email", "a@b.test"],
    ["name", "Jane Doe"],
    ["note", "felt tired"],
    ["body", "free text"],
    ["payload", "{}"],
    ["request", "raw body"],
    ["value", 120],
    ["health", "ok"],
    ["anythingElse", "x"],
  ])("rejects the forbidden/unknown key %s", async (key, v) => {
    expect(() => sanitizeAuditMeta({ [key]: v } as never)).toThrowError(
      AuditError,
    );
    expect(() => sanitizeAuditMeta({ [key]: v } as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
  });

  it.each([
    { meta: { kind: { nested: true } }, label: "nested object" },
    { meta: { kind: ["HEALTH_DATA"] }, label: "array value" },
    { meta: { version: "client@example.test" }, label: "email-shaped string" },
    { meta: { version: `x`.repeat(65) }, label: "oversized string" },
    {
      meta: { version: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def" },
      label: "jwt-like",
    },
    {
      meta: { version: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" },
      label: "hex-token-like",
    },
    { meta: { count: 1.5 }, label: "non-integer count" },
    { meta: { count: -1 }, label: "negative count" },
    { meta: { changed: "yes" }, label: "non-boolean changed" },
    { meta: { role: "SUPERUSER" }, label: "unknown role" },
    { meta: { status: "DELETED" }, label: "unknown status" },
    { meta: { status: "SUPERSEDED" }, label: "unknown archive-like status" },
    { meta: { status: "draft" }, label: "lowercase non-status" },
  ])("rejects $label", ({ meta }) => {
    expect(() => sanitizeAuditMeta(meta as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
  });

  it("accepts ARCHIVED status (P-008 archive marker)", () => {
    // Archive events must carry a truthful marker — REMOVED misrepresents the
    // lifecycle state; ARCHIVED is an approved value in the closed allowlist.
    expect(sanitizeAuditMeta({ status: "ARCHIVED" })).toEqual({
      status: "ARCHIVED",
    });
  });

  it("accepts PUBLISHED status with a structural version identifier", () => {
    // Publish events carry the marker + bounded version seq linkage —
    // never definition/title/answers.
    expect(sanitizeAuditMeta({ status: "PUBLISHED", version: "2" })).toEqual({
      status: "PUBLISHED",
      version: "2",
    });
  });

  it("rejects a non-structural version identifier", () => {
    for (const bad of [42, { seq: 1 }, ["1"], null]) {
      expect(() =>
        sanitizeAuditMeta({ status: "PUBLISHED", version: bad as never }),
      ).toThrowError(/audit_metadata_forbidden/);
    }
  });

  it("rejects non-plain-object metadata", () => {
    expect(() => sanitizeAuditMeta("kind=HEALTH_DATA" as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
    expect(() => sanitizeAuditMeta(null as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
    expect(() => sanitizeAuditMeta(42 as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
  });

  // P1 repair: validator lookup must be own-key only — Object.prototype
  // members must never resolve as validators, and exceptions normalize to
  // structural AuditError.
  it.each<{ meta: Record<string, unknown>; label: string }>([
    { meta: { constructor: { health: "bp 120/80" } }, label: "constructor" },
    { meta: { toString: "canary-secret" }, label: "toString" },
    { meta: { valueOf: { nested: true } }, label: "valueOf" },
    { meta: { hasOwnProperty: "x" }, label: "hasOwnProperty" },
    { meta: { isPrototypeOf: ["a"] }, label: "isPrototypeOf" },
    { meta: { propertyIsEnumerable: { leak: 1 } }, label: "propertyIsEnum" },
    { meta: { toLocaleString: "canary" }, label: "toLocaleString" },
  ])("rejects own prototype-member key $label", ({ meta }) => {
    expect(() => sanitizeAuditMeta(meta as never)).toThrowError(AuditError);
    expect(() => sanitizeAuditMeta(meta as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
    // No raw TypeError may leak.
    expect(() => sanitizeAuditMeta(meta as never)).not.toThrowError(TypeError);
  });

  it("rejects an own __proto__ key and never mutates prototypes", () => {
    const meta = JSON.parse('{"__proto__":{"health":"canary"}}');
    expect(() => sanitizeAuditMeta(meta as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
    const probe: Record<string, unknown> = {};
    expect(probe.health).toBeUndefined();
    expect(probe.polluted).toBeUndefined();
  });

  it("rejects inherited enumerable properties", () => {
    const proto = { kind: "HEALTH_DATA" };
    const meta = Object.create(proto);
    meta.version = "v1";
    expect(() => sanitizeAuditMeta(meta as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
  });

  it("accepts null-prototype input with valid keys only", () => {
    const meta = Object.create(null) as Record<string, unknown>;
    meta.kind = "CYCLE";
    meta.version = "test-v1";
    expect(sanitizeAuditMeta(meta as AuditMeta)).toEqual({
      kind: "CYCLE",
      version: "test-v1",
    });
    meta.password = "x";
    expect(() => sanitizeAuditMeta(meta as AuditMeta)).toThrowError(
      /audit_metadata_forbidden/,
    );
  });

  it("normalizes getter/validator exceptions to structural AuditError", () => {
    const meta = {
      get kind() {
        throw new TypeError("getter boom");
      },
    };
    expect(() => sanitizeAuditMeta(meta as never)).toThrowError(AuditError);
    expect(() => sanitizeAuditMeta(meta as never)).not.toThrowError(TypeError);
  });

  it("returns no partial result when a later key is forbidden", () => {
    expect(() =>
      sanitizeAuditMeta({ kind: "CYCLE", password: "x" } as never),
    ).toThrowError(/audit_metadata_forbidden/);
    // The throw is the only observable outcome; nothing partially sanitized
    // can be returned or persisted.
  });
});

describe("buildAuditEvent", () => {
  it("builds a structural ALLOW event from the authorized context", () => {
    const data = buildAuditEvent(ctx(), {
      action: "GRANT",
      resourceType: "consent",
      resourceId: "r1",
      subjectClientProfileId: "c1",
      meta: { kind: "HEALTH_DATA", version: "test-v1" },
    });
    expect(data).toMatchObject({
      workspaceId: "w1",
      actorUserId: "u1",
      actorRole: "CLIENT",
      action: "GRANT",
      resourceType: "consent",
      resourceId: "r1",
      subjectClientProfileId: "c1",
      result: "ALLOW",
      reason: null,
      ip: null,
      meta: { kind: "HEALTH_DATA", version: "test-v1" },
    });
  });

  it("never trusts caller-supplied actor or workspace fields", () => {
    const data = buildAuditEvent(ctx(), {
      action: "ASSIGN",
      resourceType: "client_assignment",
      resourceId: "a1",
      subjectClientProfileId: "c9",
      meta: { role: "COACH", status: "ACTIVE" },
      // Smuggled fields must not pass through.
      actorUserId: "attacker",
      workspaceId: "other-ws",
      reason: "made-up",
    } as never);
    expect(data.actorUserId).toBe("u1");
    expect(data.workspaceId).toBe("w1");
    expect(data).not.toHaveProperty("actorUserId", "attacker");
    expect((data as Record<string, unknown>).reason).toBeNull();
  });

  it.each([
    { input: { action: "HACK" }, label: "unknown action" },
    {
      input: { action: "GRANT", resourceType: "health_record" },
      label: "unknown resource",
    },
    {
      input: { action: "GRANT", resourceType: "consent", meta: { note: "x" } },
      label: "forbidden meta",
    },
  ])("fails closed on $label", ({ input }) => {
    expect(() => buildAuditEvent(ctx(), input as never)).toThrowError(
      AuditError,
    );
  });
});

describe("listAccountAuditEvents (S1-F2B internal primitive)", () => {
  it("is subject-scoped, ACCOUNT-locked, bounded, and minimal", async () => {
    const findMany = vi.fn(async () => []);
    const client = { auditEvent: { findMany } } as never;
    await listAccountAuditEvents(
      { subjectUserId: "subj-1", limit: 500 },
      client,
    );
    const call = (findMany.mock.calls[0] as unknown[])[0] as {
      where: Record<string, unknown>;
      take: number;
      orderBy: unknown;
      select: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({
      scope: "ACCOUNT",
      subjectUserId: "subj-1",
    });
    // No workspace predicate exists on the account path at all.
    expect(call.where).not.toHaveProperty("workspaceId");
    expect(call.take).toBe(101); // limit capped at 100 → take+1
    expect(call.orderBy).toEqual({ id: "asc" });
    // Minimal field selection — no meta, no workspace, no hashes.
    expect(Object.keys(call.select)).toEqual(
      expect.arrayContaining([
        "id",
        "actorUserId",
        "action",
        "resourceType",
        "resourceId",
        "result",
        "at",
      ]),
    );
    expect(call.select).not.toHaveProperty("meta");
    expect(call.select).not.toHaveProperty("workspaceId");
    await expect(
      listAccountAuditEvents({ subjectUserId: "" }, client),
    ).rejects.toBeInstanceOf(AuditError);
  });
});

describe("buildAccountAuditEvent (S1-F2B)", () => {
  it("emits an ACCOUNT-scoped row with null workspace and no fabricated actor", () => {
    const row = buildAccountAuditEvent(
      { subjectUserId: "subj-1" },
      { action: "PASSWORD_RESET", resourceType: "user", resourceId: "r1" },
    );
    expect(row).toMatchObject({
      scope: "ACCOUNT",
      workspaceId: null,
      subjectUserId: "subj-1",
      actorUserId: null,
      actorRole: null,
      action: "PASSWORD_RESET",
      resourceType: "user",
      result: "ALLOW",
    });
    expect(row).not.toHaveProperty("meta");
  });

  it.each([
    ["actorUserId", 123],
    ["actorUserId", { id: "audit-canary" }],
    ["actorRole", "HACKER"],
    ["actorRole", 123],
    ["resourceId", 123],
    ["resourceId", { id: "audit-canary" }],
  ])(
    "rejects malformed account %s instead of silently nulling it",
    (field, value) => {
      const context = {
        subjectUserId: "subj-1",
        ...(field === "resourceId" ? {} : { [field]: value }),
      };
      const input = {
        action: "PASSWORD_RESET" as const,
        resourceType: "user" as const,
        ...(field === "resourceId" ? { resourceId: value } : {}),
      };
      let error: unknown;
      try {
        buildAccountAuditEvent(context as never, input as never);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: "AuditError",
        code: "invalid_input",
      });
      expect(String(error)).not.toContain("audit-canary");
    },
  );

  it.each([
    "WORKSPACE_OWNER",
    "COACH",
    "ASSISTANT_COACH",
    "SUPPORT",
    "CLIENT",
  ] as const)("preserves valid account actor role %s and IDs", (actorRole) => {
    const row = buildAccountAuditEvent(
      { subjectUserId: "subj-1", actorUserId: "actor-1", actorRole },
      { action: "PASSWORD_RESET", resourceType: "user", resourceId: "r1" },
    );
    expect(row).toMatchObject({
      actorUserId: "actor-1",
      actorRole,
      resourceId: "r1",
    });
  });

  it.each([undefined, null])(
    "keeps absent/null account optionals as null (%s)",
    (value) => {
      const row = buildAccountAuditEvent(
        { subjectUserId: "subj-1", actorUserId: value, actorRole: value },
        { action: "PASSWORD_RESET", resourceType: "user", resourceId: value },
      );
      expect(row).toMatchObject({
        actorUserId: null,
        actorRole: null,
        resourceId: null,
      });
    },
  );

  it("captures each input field once — getter mutation cannot bypass the pair rule", () => {
    // meta getter yields undefined first, then resetStage — the builder must
    // read once and produce a metadata-free user-resource row.
    let metaReads = 0;
    const flaky = {
      action: "PASSWORD_RESET" as const,
      resourceType: "user" as const,
      get meta() {
        metaReads++;
        return metaReads === 1
          ? undefined
          : ({ resetStage: "REQUESTED" } as never);
      },
    };
    const row = buildAccountAuditEvent({ subjectUserId: "u1" }, flaky);
    expect(row).toMatchObject({
      scope: "ACCOUNT",
      action: "PASSWORD_RESET",
      resourceType: "user",
    });
    expect(row).not.toHaveProperty("meta");
    expect(metaReads).toBe(1);

    // Inverse: resetStage first, undefined second — still rejected.
    let metaReads2 = 0;
    const flaky2 = {
      action: "PASSWORD_RESET" as const,
      resourceType: "user" as const,
      get meta() {
        metaReads2++;
        return metaReads2 === 1
          ? ({ resetStage: "REQUESTED" } as never)
          : undefined;
      },
    };
    expect(() =>
      buildAccountAuditEvent({ subjectUserId: "u1" }, flaky2),
    ).toThrow("audit_metadata_forbidden");

    // action getter mutating — validate AND build from the captured value.
    let actionReads = 0;
    const flipAction = {
      get action() {
        actionReads++;
        return actionReads === 1 ? "PASSWORD_RESET" : "INVITE";
      },
      resourceType: "access_token" as const,
      meta: { resetStage: "REQUESTED" as const },
    };
    const row2 = buildAccountAuditEvent(
      { subjectUserId: "u1" },
      flipAction as never,
    );
    expect(row2.action).toBe("PASSWORD_RESET");
    expect(actionReads).toBe(1);
  });

  it("throwing getters/proxies produce structural input-free AuditError", async () => {
    const throwingInput = {
      get action(): never {
        throw new Error("trapped-secret-payload");
      },
    };
    const err = await (async () => {
      try {
        buildAccountAuditEvent({ subjectUserId: "u1" }, throwingInput as never);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AuditError);
    expect(String(err)).not.toContain("trapped-secret");

    // Metadata enumeration/proxy failures → audit_metadata_forbidden.
    const proxyMeta = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("proxy-trap-secret");
        },
      },
    );
    const err2 = await (async () => {
      try {
        buildAccountAuditEvent(
          { subjectUserId: "u1" },
          {
            action: "PASSWORD_RESET",
            resourceType: "access_token",
            meta: proxyMeta as never,
          },
        );
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AuditError);
    expect(err2).toBeInstanceOf(AuditError);
    expect(String(err2)).not.toContain("proxy-trap-secret");
  });

  it.each([
    ["actorUserId", 123],
    ["actorRole", "HACKER"],
    ["resourceId", { id: "audit-canary" }],
  ])(
    "writeAccountAuditEvent rejects malformed captured %s before create",
    async (field, value) => {
      const create = vi.fn();
      let reads = 0;
      const input = {
        subjectUserId: "subj-1",
        action: "PASSWORD_RESET" as const,
        resourceType: "user" as const,
        get [field]() {
          reads++;
          return value;
        },
      };
      await expect(
        writeAccountAuditEvent(
          { auditEvent: { create } } as never,
          input as never,
        ),
      ).rejects.toMatchObject({ name: "AuditError", code: "invalid_input" });
      expect(reads).toBe(1);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("writeAccountAuditEvent never reaches create on invalid captured input", async () => {
    let creates = 0;
    const tx = {
      auditEvent: {
        create: async () => {
          creates++;
          return {};
        },
      },
    };
    const throwingInput = {
      subjectUserId: "u1",
      get action(): never {
        throw new Error("hidden");
      },
    };
    await expect(
      writeAccountAuditEvent(tx as never, throwingInput as never),
    ).rejects.toBeInstanceOf(AuditError);
    expect(creates).toBe(0);
  });

  it("rejects non-account actions/resources and missing subject", () => {
    for (const args of [
      [{ subjectUserId: "s" }, { action: "INVITE", resourceType: "user" }],
      [
        { subjectUserId: "s" },
        { action: "PASSWORD_RESET", resourceType: "consent" },
      ],
      [
        { subjectUserId: "s" },
        { action: "PASSWORD_RESET", resourceType: "unknown" },
      ],
      [
        { subjectUserId: "" },
        { action: "PASSWORD_RESET", resourceType: "user" },
      ],
      // S1-F2D repair: resetStage metadata is valid ONLY on
      // PASSWORD_RESET/access_token — never on the user resource.
      [
        { subjectUserId: "s" },
        {
          action: "PASSWORD_RESET",
          resourceType: "user",
          meta: { resetStage: "REQUESTED" },
        },
      ],
      [
        { subjectUserId: "s" },
        {
          action: "PASSWORD_RESET",
          resourceType: "user",
          meta: { resetStage: "COMPLETED" },
        },
      ],
    ] as const) {
      expect(() =>
        buildAccountAuditEvent(args[0] as never, args[1] as never),
      ).toThrow(AuditError);
    }
  });
});
