import { describe, expect, it, vi } from "vitest";

import type { AuthorizationContext } from "../../lib/auth/guard";
import { AccessDeniedError } from "../../lib/auth/guard";
import {
  AuditError,
  buildAuditEvent,
  listAuditEvents,
  sanitizeAuditMeta,
  writeAuditEvent,
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
  ])("rejects $label", ({ meta }) => {
    expect(() => sanitizeAuditMeta(meta as never)).toThrowError(
      /audit_metadata_forbidden/,
    );
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

describe("writeAuditEvent", () => {
  it("writes via the transaction client delegate", async () => {
    const create = vi.fn(async () => ({ id: "e1" }));
    const tx = { auditEvent: { create } } as never;
    await writeAuditEvent(tx, ctx(), {
      action: "REVOKE",
      resourceType: "consent",
      subjectClientProfileId: "c1",
      meta: { kind: "CYCLE", count: 2 },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const args = (create.mock.calls[0] as unknown[])[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).toMatchObject({
      workspaceId: "w1",
      actorUserId: "u1",
      action: "REVOKE",
      result: "ALLOW",
    });
  });

  it("fails closed when the event is invalid", async () => {
    const create = vi.fn();
    const tx = { auditEvent: { create } } as never;
    await expect(
      writeAuditEvent(tx, ctx(), {
        action: "GRANT",
        resourceType: "consent",
        meta: { password: "x" },
      } as never),
    ).rejects.toMatchObject({ code: "audit_metadata_forbidden" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("listAuditEvents", () => {
  function fakePrisma(overrides: Record<string, unknown> = {}) {
    const delegates = {
      user: {
        findUnique: vi.fn(async () => ({
          id: "u1",
          platformRole: "USER",
          status: "ACTIVE",
        })),
      },
      workspace: {
        findUnique: vi.fn(async () => ({ id: "w1", status: "ACTIVE" })),
      },
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        })),
      },
      clientProfile: { findFirst: vi.fn(async () => null) },
      clientAssignment: { findFirst: vi.fn(async () => null) },
      auditEvent: { findMany: vi.fn(async () => []) },
      ...overrides,
    };
    return { client: delegates as never, delegates };
  }

  it("lets the workspace owner read own-workspace events, bounded", async () => {
    const { client, delegates } = fakePrisma();
    await listAuditEvents(
      { user: { id: "u1" } },
      { workspaceId: "w1", limit: 500 },
      client,
    );
    const call = (
      delegates.auditEvent.findMany.mock.calls[0] as unknown[]
    )[0] as {
      where: Record<string, unknown>;
      take: number;
      orderBy: unknown;
    };
    expect(call.where).toMatchObject({ workspaceId: "w1" });
    expect(call.take).toBe(101);
    expect(call.orderBy).toEqual({ id: "asc" });
  });

  it("denies non-owner members and fails closed on non-workspace scope", async () => {
    const { client } = fakePrisma({
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "COACH",
          status: "ACTIVE",
        })),
      },
    });
    await expect(
      listAuditEvents({ user: { id: "u1" } }, { workspaceId: "w1" }, client),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
