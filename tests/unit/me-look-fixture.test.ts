import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@prisma/client";

import {
  cleanupMeLookFixtures,
  meLookRateLimitKeys,
  newMeLookOwned,
  setupMeLookFixtures,
  teardownMeLookFixtures,
  type FixtureDb,
  type MeLookDeps,
  type MeLookOwned,
} from "../e2e/me-look-fixture";

/**
 * P716 failure-path proof, second pass: the mock that let a workspace
 * delete succeed while its Restrict-guarding member delete had failed
 * lied about the schema. This fake keeps rows per table, applies every
 * `where` clause for real, and enforces the FK rules that actually hold
 * in db/schema.prisma for these tables:
 *
 *   accessToken.workspaceId|createdByUserId → Restrict (userId → Cascade)
 *   clientProfile.workspaceId → Restrict (userId → SetNull)
 *   workspaceMember.workspaceId|userId → Restrict
 *   clientAssignment.clientProfileId|coachMemberId → Restrict
 *   auditEvent.workspaceId|subjectUserId → Restrict (actorUserId → SetNull)
 *   account.userId / session.userId → Cascade
 *
 * A delete that a real Restrict would reject throws here too, so cleanup
 * order and every delete's filter are verified by what survives — never
 * by a stub that returns success for anything.
 */

type Row = Record<string, unknown>;
type Table =
  | "user"
  | "account"
  | "session"
  | "workspace"
  | "workspaceMember"
  | "clientProfile"
  | "clientAssignment"
  | "accessToken"
  | "auditEvent"
  | "verification"
  | "rateLimit";

const TABLES: Table[] = [
  "user",
  "account",
  "session",
  "workspace",
  "workspaceMember",
  "clientProfile",
  "clientAssignment",
  "accessToken",
  "auditEvent",
  "verification",
  "rateLimit",
];

function cellEq(cell: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === "object") {
    const c = cond as Record<string, unknown>;
    if ("in" in c) return (c.in as unknown[]).includes(cell);
    if ("not" in c) return !cellEq(cell, c.not);
    if ("equals" in c) return cellEq(cell, c.equals);
  }
  return cell === cond;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(row, w)))
        return false;
      continue;
    }
    if (!cellEq(row[key], cond)) return false;
  }
  return true;
}

const restrict = (what: string) =>
  new Error(`Foreign key constraint violated: ${what}`);

function fakeDb() {
  const rows = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as {
    [K in Table]: Row[];
  };
  const calls: string[] = [];
  const whereArgs: Record<string, Record<string, unknown>[]> = {};
  const injectedFailures = new Map<string, string>();
  let nextId = 0;
  const id = (p: string) => `${p}-${++nextId}`;

  /** Real Restrict check: matched parent rows must have no remaining
   * references in `children`, or the delete rejects like Postgres does. */
  const assertNoRestrict = (
    matched: Row[],
    parentKey: string,
    children: [Table, string][],
  ) => {
    for (const parent of matched)
      for (const [table, fk] of children)
        if (rows[table].some((r) => r[fk] === parent[parentKey]))
          throw restrict(`${table}.${fk}`);
  };

  /** Real Cascade/SetNull: applied to child rows when a user goes. */
  const cascadeUserDelete = (userIds: unknown[]) => {
    for (const table of ["account", "session"] as const)
      rows[table] = rows[table].filter((r) => !userIds.includes(r.userId));
    rows.accessToken = rows.accessToken.filter(
      (r) => !userIds.includes(r.userId),
    );
    for (const r of rows.auditEvent)
      if (userIds.includes(r.actorUserId)) r.actorUserId = null;
    for (const r of rows.clientProfile)
      if (userIds.includes(r.userId)) r.userId = null;
  };

  const deleteMany = (table: Table) => {
    whereArgs[`${table}.deleteMany`] = [];
    return vi.fn(async (args: { where: Record<string, unknown> }) => {
      calls.push(`${table}.deleteMany`);
      whereArgs[`${table}.deleteMany`].push(args.where);
      const injected = injectedFailures.get(table);
      if (injected) throw new Error(injected);
      const matched = rows[table].filter((r) => matches(r, args.where));
      if (table === "workspace")
        assertNoRestrict(matched, "id", [
          ["accessToken", "workspaceId"],
          ["clientProfile", "workspaceId"],
          ["workspaceMember", "workspaceId"],
          ["auditEvent", "workspaceId"],
        ]);
      if (table === "workspaceMember")
        assertNoRestrict(matched, "id", [
          ["clientAssignment", "coachMemberId"],
        ]);
      if (table === "clientProfile")
        assertNoRestrict(matched, "id", [
          ["clientAssignment", "clientProfileId"],
        ]);
      if (table === "user")
        assertNoRestrict(matched, "id", [
          ["workspaceMember", "userId"],
          ["auditEvent", "subjectUserId"],
          ["accessToken", "createdByUserId"],
        ]);
      const doomed = new Set(matched);
      rows[table] = rows[table].filter((r) => !doomed.has(r));
      if (table === "user") cascadeUserDelete(matched.map((r) => r.id));
      return { count: matched.length };
    });
  };

  const prisma = {
    user: {
      upsert: vi.fn(async (args: { where: { email: string }; create: Row }) => {
        const existing = rows.user.find((r) => r.email === args.where.email);
        if (existing) return existing;
        const row = { id: id("u"), ...args.create };
        rows.user.push(row);
        return row;
      }),
      deleteMany: deleteMany("user"),
    },
    account: {
      upsert: vi.fn(async (args: { create: Row }) => {
        const row = { id: id("acct"), ...args.create };
        rows.account.push(row);
        return row;
      }),
      deleteMany: deleteMany("account"),
    },
    session: { deleteMany: deleteMany("session") },
    workspace: {
      upsert: vi.fn(async (args: { where: { slug: string }; create: Row }) => {
        const existing = rows.workspace.find((r) => r.slug === args.where.slug);
        if (existing) return existing;
        const row = { id: id("ws"), ...args.create };
        rows.workspace.push(row);
        return row;
      }),
      deleteMany: deleteMany("workspace"),
    },
    workspaceMember: {
      upsert: vi.fn(async (args: { create: Row }) => {
        const row = { id: id("m"), ...args.create };
        rows.workspaceMember.push(row);
        return row;
      }),
      deleteMany: deleteMany("workspaceMember"),
    },
    clientProfile: {
      findFirst: vi.fn(
        async (args: { where: Record<string, unknown> }) =>
          rows.clientProfile.find((r) => matches(r, args.where)) ?? null,
      ),
      create: vi.fn(async (args: { data: Row }) => {
        const row = { id: id("cp"), ...args.data };
        rows.clientProfile.push(row);
        return row;
      }),
      update: vi.fn(async () => ({})),
      deleteMany: deleteMany("clientProfile"),
    },
    accessToken: { deleteMany: deleteMany("accessToken") },
    auditEvent: { deleteMany: deleteMany("auditEvent") },
    verification: { deleteMany: deleteMany("verification") },
    rateLimit: { deleteMany: deleteMany("rateLimit") },
    $disconnect: vi.fn(async () => {}),
  };

  return {
    prisma: prisma as unknown as FixtureDb & Pick<PrismaClient, "$disconnect">,
    calls,
    whereArgs,
    rows,
    seed: (table: Table, entries: Row[]) => rows[table].push(...entries),
    fail: (table: Table, message: string) =>
      injectedFailures.set(table, message),
    unfail: (table: Table) => injectedFailures.delete(table),
  };
}

/** Invitation double that writes the rows the real service would:
 * the access token plus its workspace-scoped audit event. */
const deps = (
  db: ReturnType<typeof fakeDb>,
  createInvitation?: MeLookDeps["createInvitation"],
): MeLookDeps => ({
  hashPassword: vi.fn(async () => "hash"),
  createInvitation:
    createInvitation ??
    vi.fn(
      async (
        o: { user: { id: string } },
        i: { workspaceId: string; targetEmail: string },
      ) => {
        const tokenId = `invite-${db.rows.accessToken.length + 1}`;
        db.seed("accessToken", [
          {
            id: tokenId,
            purpose: "WORKSPACE_INVITE",
            workspaceId: i.workspaceId,
            createdByUserId: o.user.id,
            targetEmail: i.targetEmail,
          },
        ]);
        db.seed("auditEvent", [
          {
            id: `audit-${tokenId}`,
            scope: "WORKSPACE",
            workspaceId: i.workspaceId,
            actorUserId: o.user.id,
            action: "INVITE",
          },
        ]);
        return { invitationId: tokenId, delivery: { rawToken: "tok" } };
      },
    ),
});

/** One unrelated tenant: its own workspace/user tree, audit rows
 * referencing both, and the standalone auth rows (session, reset
 * verification, rate-limit buckets) the owned deletes must spare —
 * including a bucket keyed on the shared E2E coach identity, which no
 * per-invocation cleanup may touch. */
function seedForeignTenant(db: ReturnType<typeof fakeDb>) {
  db.seed("user", [
    { id: "foreign-user", email: "other@s1h-e2e.test" },
    { id: "foreign-owner", email: "other-owner@s1h-e2e.test" },
  ]);
  db.seed("account", [
    { id: "facct", userId: "foreign-user", providerId: "credential" },
  ]);
  db.seed("session", [
    { id: "sess-foreign", userId: "foreign-user", token: "tok-f" },
  ]);
  db.seed("workspace", [{ id: "foreign-ws", slug: "s1h-e2e-other" }]);
  db.seed("workspaceMember", [
    { id: "fm", workspaceId: "foreign-ws", userId: "foreign-owner" },
  ]);
  db.seed("clientProfile", [
    { id: "fcp", workspaceId: "foreign-ws", userId: "foreign-user" },
  ]);
  db.seed("accessToken", [
    { id: "ftok", workspaceId: "foreign-ws", createdByUserId: "foreign-owner" },
  ]);
  db.seed("auditEvent", [
    {
      id: "faudit",
      workspaceId: "foreign-ws",
      actorUserId: "foreign-owner",
      subjectUserId: "foreign-user",
    },
  ]);
  db.seed("verification", [
    { id: "ver-foreign", identifier: "other-hash", value: "foreign-user" },
  ]);
  db.seed("rateLimit", [
    {
      id: "rl-foreign",
      key: meLookRateLimitKeys({
        runId: "zzzzzzzz",
        userIds: [],
        inviteTokenIds: [],
      })[0],
    },
    { id: "rl-coach", key: "acct:sign-in:shared-coach-bucket" },
  ]);
}

/** The rows the spec's browser auth calls leave behind for `owned`:
 * a sign-in session, a reset verification, and the sign-in/reset
 * rate-limit buckets. */
function seedAuthArtifacts(db: ReturnType<typeof fakeDb>, owned: MeLookOwned) {
  const [clientId] = owned.userIds;
  const ownedKeys = meLookRateLimitKeys(owned);
  db.seed("session", [{ id: "sess-run", userId: clientId, token: "tok-run" }]);
  db.seed("verification", [
    { id: "ver-run", identifier: "reset-hash", value: clientId },
  ]);
  db.seed("rateLimit", [
    { id: "rl-1", key: ownedKeys[0] }, // sign-in bucket, run client email
    { id: "rl-2", key: ownedKeys[1] }, // reset-request bucket, run client
  ]);
}

const foreignStillThere = (db: ReturnType<typeof fakeDb>) => {
  for (const [table, count] of [
    ["user", 2],
    ["account", 1],
    ["session", 1],
    ["workspace", 1],
    ["workspaceMember", 1],
    ["clientProfile", 1],
    ["accessToken", 1],
    ["auditEvent", 1],
    ["verification", 1],
    ["rateLimit", 2],
  ] as const)
    expect(db.rows[table as Table], `${table} foreign residue`).toHaveLength(
      count,
    );
};

describe("me-look fixture ownership under partial failure", () => {
  it("second invitation fails → first token and earlier rows owned; cleanup removes only run rows", async () => {
    const db = fakeDb();
    const createInvitation = vi
      .fn()
      .mockImplementationOnce(async (o, i) => {
        db.seed("accessToken", [
          {
            id: "inv-first",
            workspaceId: i.workspaceId,
            createdByUserId: o.user.id,
          },
        ]);
        return { invitationId: "inv-first", delivery: { rawToken: "t1" } };
      })
      .mockRejectedValueOnce(new Error("provider down"));
    const owned = newMeLookOwned();

    await expect(
      setupMeLookFixtures(db.prisma, deps(db, createInvitation), owned),
    ).rejects.toThrow("provider down");

    // Ownership: the committed first invite is tracked, not the failed one.
    expect(owned.inviteTokenIds).toEqual(["inv-first"]);
    expect(owned.workspaceId).toBeDefined();
    expect(owned.userIds).toHaveLength(2);
    expect(owned.clientProfileId).toBeDefined();

    seedForeignTenant(db);
    seedAuthArtifacts(db, owned);
    const errors = await cleanupMeLookFixtures(db.prisma, owned);
    expect(errors).toEqual([]);

    // Restrict-FK children went before their parents.
    expect(db.calls.indexOf("accessToken.deleteMany")).toBeLessThan(
      db.calls.indexOf("workspace.deleteMany"),
    );
    expect(db.calls.indexOf("account.deleteMany")).toBeLessThan(
      db.calls.indexOf("user.deleteMany"),
    );

    // Every run row is gone across every table.
    for (const table of TABLES.filter((t) => t !== "clientAssignment")) {
      for (const row of db.rows[table]) {
        const blob = JSON.stringify(row);
        for (const uid of owned.userIds)
          expect(blob).not.toContain(uid as string);
      }
    }
    expect(db.rows.workspace.some((r) => r.id === owned.workspaceId)).toBe(
      false,
    );
    expect(
      db.rows.user.some((r) => owned.userIds.includes(r.id as string)),
    ).toBe(false);

    // The foreign tenant is untouched — every delete's where clause held.
    foreignStillThere(db);
  });

  it("account.upsert fails → the just-created user is still tracked and deleted", async () => {
    const db = fakeDb();
    (db.prisma.account as { upsert: unknown }).upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error("account write failed"))
      .mockResolvedValue({ id: "acct" });
    const owned = newMeLookOwned();

    await expect(
      setupMeLookFixtures(db.prisma, deps(db), owned),
    ).rejects.toThrow("account write failed");

    expect(owned.userIds).toHaveLength(1);
    seedForeignTenant(db);

    const errors = await cleanupMeLookFixtures(db.prisma, owned);
    expect(errors).toEqual([]);
    expect(db.rows.user.some((r) => r.id === owned.userIds[0])).toBe(false);
    foreignStillThere(db);
  });

  it("a Restrict-blocked member delete fails the parents for real — the old mock lied", async () => {
    const db = fakeDb();
    const owned = newMeLookOwned();
    await setupMeLookFixtures(db.prisma, deps(db), owned);

    // A real Restrict child the fixture legitimately does not sweep:
    // an assignment pinning the run profile and the owner's membership.
    const ownerMember = db.rows.workspaceMember.find(
      (r) => r.userId === owned.userIds[1],
    )!;
    db.seed("clientAssignment", [
      {
        id: "ca-1",
        workspaceId: owned.workspaceId,
        clientProfileId: owned.clientProfileId,
        coachMemberId: ownerMember.id,
      },
    ]);
    seedForeignTenant(db);
    seedAuthArtifacts(db, owned);

    const errors = await cleanupMeLookFixtures(db.prisma, owned);

    // Real schema behavior: the pinned profile and members reject their
    // deletes, and the remaining children reject workspace + user
    // deletes. No step was skipped, and every failure is labeled.
    const labels = errors.map((e) => e.message);
    expect(labels.some((m) => m.startsWith("client profile"))).toBe(true);
    expect(labels.some((m) => m.startsWith("workspace members"))).toBe(true);
    expect(labels.some((m) => m.startsWith("workspace:"))).toBe(true);
    expect(labels.some((m) => m.startsWith("users:"))).toBe(true);
    for (const call of [
      "accessToken.deleteMany",
      "auditEvent.deleteMany",
      "rateLimit.deleteMany",
      "verification.deleteMany",
      "session.deleteMany",
      "account.deleteMany",
    ]) {
      expect(db.calls, `${call} must still be attempted`).toContain(call);
    }

    // Deleted-for-real: everything without a live Restrict blocker.
    expect(db.rows.accessToken.filter((r) => r.id !== "ftok")).toEqual([]);
    expect(db.rows.auditEvent.filter((r) => r.id !== "faudit")).toEqual([]);
    expect(db.rows.verification.filter((r) => r.id !== "ver-foreign")).toEqual(
      [],
    );
    expect(db.rows.session.filter((r) => r.id !== "sess-foreign")).toEqual([]);
    expect(
      db.rows.account.filter((r) => owned.userIds.includes(r.userId as string)),
    ).toEqual([]);
    expect(
      db.rows.rateLimit.filter((r) =>
        meLookRateLimitKeys(owned).includes(r.key as string),
      ),
    ).toEqual([]);

    // Still present: the blocker and the parents it protects.
    expect(db.rows.clientAssignment).toHaveLength(1);
    expect(db.rows.clientProfile.map((r) => r.id)).toContain(
      owned.clientProfileId,
    );
    expect(db.rows.workspaceMember).toHaveLength(3); // 2 run + 1 foreign
    expect(db.rows.workspace.map((r) => r.id)).toContain(owned.workspaceId);
    expect(
      db.rows.user.filter((r) => owned.userIds.includes(r.id as string)),
    ).toHaveLength(2);

    // Remove the blocker → the same cleanup now finishes with no residue.
    db.rows.clientAssignment = [];
    const retry = await cleanupMeLookFixtures(db.prisma, owned);
    expect(retry).toEqual([]);
    expect(db.rows.workspace.map((r) => r.id)).not.toContain(owned.workspaceId);
    expect(
      db.rows.user.filter((r) => owned.userIds.includes(r.id as string)),
    ).toEqual([]);
    foreignStillThere(db);
  });

  it("an injected delete failure never blocks the rest, and workspace is NOT deleted after members fail", async () => {
    const db = fakeDb();
    const owned = newMeLookOwned();
    await setupMeLookFixtures(db.prisma, deps(db), owned);
    seedForeignTenant(db);

    // The storage layer rejects the member delete (deadlock, permission —
    // anything); the fake's real FKs then reject workspace + user for
    // real, where the old mock recorded success.
    db.fail("workspaceMember", "member delete blocked");
    db.fail("user", "user delete blocked");

    const errors = await cleanupMeLookFixtures(db.prisma, owned);

    expect(errors.map((e) => e.message).join(";")).toContain(
      "member delete blocked",
    );
    expect(errors.map((e) => e.message).join(";")).toContain(
      "user delete blocked",
    );
    // The workspace delete really ran and really failed — Restrict —
    // because the member rows still exist.
    expect(db.calls).toContain("workspace.deleteMany");
    expect(db.rows.workspace.map((r) => r.id)).toContain(owned.workspaceId);
    expect(errors.map((e) => e.message).join(";")).toContain("workspace:");
    // Every other safe delete still ran.
    for (const step of [
      "accessToken.deleteMany",
      "clientProfile.deleteMany",
      "auditEvent.deleteMany",
      "verification.deleteMany",
      "rateLimit.deleteMany",
      "session.deleteMany",
      "account.deleteMany",
    ]) {
      expect(db.calls).toContain(step);
    }
  });

  it("cleanup never touches rows outside the owned record", async () => {
    const db = fakeDb();
    const owned = newMeLookOwned();
    // Nothing was created — setup failed before any row existed.
    seedForeignTenant(db);
    // A rate-limit row this run could have left had it reached auth calls:
    // deleting it by exact key is still inside the owned boundary.
    db.seed("rateLimit", [
      { id: "rl-owned", key: meLookRateLimitKeys(owned)[0] },
    ]);

    const errors = await cleanupMeLookFixtures(db.prisma, owned);
    expect(errors).toEqual([]);

    expect(db.calls).not.toContain("user.deleteMany");
    expect(db.calls).not.toContain("workspace.deleteMany");
    expect(db.calls).not.toContain("verification.deleteMany");
    // The rate-limit delete ran with exactly the owned key set — and
    // removed only the run key, never a foreign bucket.
    expect(db.whereArgs["rateLimit.deleteMany"][0]).toEqual({
      key: { in: meLookRateLimitKeys(owned) },
    });
    expect(db.rows.rateLimit.map((r) => r.id)).toEqual([
      "rl-foreign",
      "rl-coach",
    ]);
    foreignStillThere(db);
  });
});

describe("me-look teardown error preservation", () => {
  it("disconnect is attempted in finally; cleanup and disconnect failures are reported together", async () => {
    const db = fakeDb();
    const owned = newMeLookOwned();
    await setupMeLookFixtures(db.prisma, deps(db), owned);
    db.fail("workspaceMember", "member delete blocked");
    (db.prisma.$disconnect as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("socket hangup"),
    );

    await expect(teardownMeLookFixtures(db.prisma, owned)).rejects.toThrow(
      /member delete blocked[\s\S]*disconnect: socket hangup/,
    );
    expect(db.prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it("a lone disconnect failure is still surfaced", async () => {
    const db = fakeDb();
    const owned = newMeLookOwned();
    (db.prisma.$disconnect as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("socket hangup"),
    );

    await expect(teardownMeLookFixtures(db.prisma, owned)).rejects.toThrow(
      "disconnect: socket hangup",
    );
    expect(db.prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it("clean teardown resolves with no error and still disconnects", async () => {
    const db = fakeDb();
    const owned = newMeLookOwned();
    await setupMeLookFixtures(db.prisma, deps(db), owned);

    await expect(
      teardownMeLookFixtures(db.prisma, owned),
    ).resolves.toBeUndefined();
    expect(db.prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
