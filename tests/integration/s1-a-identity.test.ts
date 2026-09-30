import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authorizeCredentials } from "../../lib/credentials";

/**
 * S1-A identity/tenancy tests. These run against the REAL migrated PostgreSQL
 * schema in a dedicated disposable database supplied via `INTEGRATION_DATABASE_URL`
 * (never the application/E2E database). Synthetic fixtures only; no shared or
 * development database is reset or dropped here.
 */
const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof baseUrl === "string" && baseUrl.length > 0;

const INIT_MIGRATION = "db/migrations/20260929000000_init/migration.sql";
const S1A_MIGRATION =
  "db/migrations/20260929120000_stage1_identity_tenancy/migration.sql";

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function runPrisma(args: string[], env: Record<string, string> = {}): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

function unique(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

describe.skipIf(!enabled)("S1-A identity & tenancy (real PostgreSQL)", () => {
  const url = baseUrl as string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Proves the migrations apply (init + S1-A) on this database.
    runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    // Clean the disposable DB for repeatable runs (dedicated database only).
    await prisma.$executeRawUnsafe(
      'TRUNCATE "client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function makeUser(tag: string) {
    return prisma.user.create({
      data: {
        email: `${tag}.${unique("u")}@example.test`,
        passwordHash: "scrypt$synthetic$hash",
      },
    });
  }
  async function makeWorkspace(tag: string) {
    return prisma.workspace.create({ data: { name: tag, slug: unique(tag) } });
  }
  async function makeMember(
    workspaceId: string,
    userId: string,
    role: "COACH" | "WORKSPACE_OWNER",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }

  it("applied both migrations", async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string }>
    >(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );
    const names = rows.map((r) => r.migration_name);
    expect(names.some((n) => n.includes("20260929000000_init"))).toBe(true);
    expect(
      names.some((n) => n.includes("20260929120000_stage1_identity_tenancy")),
    ).toBe(true);
  });

  it("rejects a duplicate WorkspaceMember(workspaceId, userId)", async () => {
    const ws = await makeWorkspace("ws");
    const user = await makeUser("dup");
    await makeMember(ws.id, user.id, "COACH");
    await expect(makeMember(ws.id, user.id, "COACH")).rejects.toThrow();
  });

  it("makes a ClientProfile without a workspace impossible", async () => {
    await expect(
      prisma.clientProfile.create({
        data: { workspaceId: unique("missing"), name: "X" },
      }),
    ).rejects.toThrow();
  });

  it("allows the same client User to be linked in different workspaces", async () => {
    const user = await makeUser("shared");
    const wsA = await makeWorkspace("wsA");
    const wsB = await makeWorkspace("wsB");
    const a = await prisma.clientProfile.create({
      data: { workspaceId: wsA.id, userId: user.id, name: "A" },
    });
    const b = await prisma.clientProfile.create({
      data: { workspaceId: wsB.id, userId: user.id, name: "B" },
    });
    expect(a.id).not.toBe(b.id);
  });

  it("rejects a cross-workspace ClientAssignment at the database", async () => {
    const wsA = await makeWorkspace("wsA");
    const wsB = await makeWorkspace("wsB");
    const clientUser = await makeUser("client");
    const coachUser = await makeUser("coach");
    const client = await prisma.clientProfile.create({
      data: { workspaceId: wsA.id, userId: clientUser.id, name: "C" },
    });
    const memberB = await makeMember(wsB.id, coachUser.id, "COACH");
    await expect(
      prisma.clientAssignment.create({
        data: {
          workspaceId: wsA.id,
          clientProfileId: client.id,
          coachMemberId: memberB.id,
          role: "COACH",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects an assignment whose workspace differs from the client's workspace", async () => {
    const wsA = await makeWorkspace("wsA");
    const wsB = await makeWorkspace("wsB");
    const clientUser = await makeUser("client");
    const coachUser = await makeUser("coach");
    const client = await prisma.clientProfile.create({
      data: { workspaceId: wsA.id, userId: clientUser.id, name: "C" },
    });
    const memberB = await makeMember(wsB.id, coachUser.id, "COACH");
    // workspaceId matches the coach's workspace (member FK ok) but not the client's.
    await expect(
      prisma.clientAssignment.create({
        data: {
          workspaceId: wsB.id,
          clientProfileId: client.id,
          coachMemberId: memberB.id,
          role: "COACH",
        },
      }),
    ).rejects.toThrow();
  });

  it("has the composite same-workspace FKs and the active-primary partial index", async () => {
    const fks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      "SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname IN ('client_assignment_client_workspace_fkey','client_assignment_member_workspace_fkey')",
    );
    expect(fks.map((r) => r.conname).sort()).toEqual([
      "client_assignment_client_workspace_fkey",
      "client_assignment_member_workspace_fkey",
    ]);
    const idx = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'client_assignment_one_active_primary_key'",
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toContain("UNIQUE");
    expect(idx[0].indexdef).toContain("ACTIVE");
    expect(idx[0].indexdef).toContain("PRIMARY");
    expect(idx[0].indexdef).toContain("WHERE");
  });

  it("accepts multiple assigned coaches and rejects a duplicate assignment", async () => {
    const ws = await makeWorkspace("ws");
    const client = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "C" },
    });
    const coach1 = await makeMember(ws.id, (await makeUser("c1")).id, "COACH");
    const coach2 = await makeMember(ws.id, (await makeUser("c2")).id, "COACH");
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: client.id,
        coachMemberId: coach1.id,
        role: "COACH",
      },
    });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: client.id,
        coachMemberId: coach2.id,
        role: "COACH",
      },
    });
    await expect(
      prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: client.id,
          coachMemberId: coach1.id,
          role: "COACH",
        },
      }),
    ).rejects.toThrow();
  });

  it("allows only one ACTIVE PRIMARY assignment per client", async () => {
    const ws = await makeWorkspace("ws");
    const client = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "C" },
    });
    const coach1 = await makeMember(ws.id, (await makeUser("p1")).id, "COACH");
    const coach2 = await makeMember(ws.id, (await makeUser("p2")).id, "COACH");
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: client.id,
        coachMemberId: coach1.id,
        role: "PRIMARY",
      },
    });
    await expect(
      prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: client.id,
          coachMemberId: coach2.id,
          role: "PRIMARY",
        },
      }),
    ).rejects.toThrow();
    // A second coach may still be an ACTIVE non-primary assignment.
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: client.id,
        coachMemberId: coach2.id,
        role: "COACH",
      },
    });
  });

  it("keeps the ClientProfile when an assignment is removed", async () => {
    const ws = await makeWorkspace("ws");
    const client = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "C" },
    });
    const coach = await makeMember(ws.id, (await makeUser("rm")).id, "COACH");
    const assignment = await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: client.id,
        coachMemberId: coach.id,
        role: "COACH",
      },
    });
    await prisma.clientAssignment.update({
      where: { id: assignment.id },
      data: { status: "REMOVED" },
    });
    expect(
      await prisma.clientProfile.findUnique({ where: { id: client.id } }),
    ).not.toBeNull();
  });

  it("introduces no health/audit/token/product tables", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const names = rows.map((r) => r.table_name);
    for (const forbidden of [
      "audit_log",
      "daily_entry",
      "food",
      "exercise",
      "meal",
      "program",
    ]) {
      expect(names.some((n) => n.includes(forbidden))).toBe(false);
    }
    // Identity/tenancy (S1-A), versioned consent (S1-D), audit events (S1-E),
    // access tokens (S1-F1).
    expect(names.sort()).toEqual(
      [
        "_prisma_migrations",
        "access_token",
        "audit_event",
        "client_assignment",
        "client_profile",
        "coach_profile",
        "consent_record",
        "users",
        "workspace",
        "workspace_member",
      ].sort(),
    );
  });
});

describe.skipIf(!enabled)(
  "S1-A migration preserves existing User and authentication",
  () => {
    const url = baseUrl as string;
    const scratchName = unique("s1a_pre");
    let scratchUrl = "";
    let admin: PrismaClient;
    let scratch: PrismaClient;
    const password = "synthetic-pass-123";
    const email = "preserve@example.test";

    beforeAll(async () => {
      admin = new PrismaClient({
        datasources: { db: { url: withDatabase(url, "postgres") } },
      });
      await admin.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
      scratchUrl = withDatabase(url, scratchName);
      // Pre-S1-A: apply only the initial migration, then insert an existing user.
      runPrisma([
        "db",
        "execute",
        "--url",
        scratchUrl,
        "--file",
        INIT_MIGRATION,
      ]);
      const { hashPassword } = await import("../../lib/password");
      const hash = await hashPassword(password);
      scratch = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
      await scratch.$executeRawUnsafe(
        `INSERT INTO "users" ("id","email","password_hash","name","created_at","updated_at") VALUES ($1,$2,$3,$4,NOW(),NOW())`,
        "existing-user-1",
        email,
        hash,
        "Existing User",
      );
      // Apply the S1-A migration on top of the existing data.
      runPrisma([
        "db",
        "execute",
        "--url",
        scratchUrl,
        "--file",
        S1A_MIGRATION,
      ]);
    });

    afterAll(async () => {
      await scratch?.$disconnect();
      await admin?.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${scratchName}"`,
      );
      await admin?.$disconnect();
    });

    it("keeps the existing User row and password hash, with safe defaults", async () => {
      const rows = await scratch.$queryRawUnsafe<
        Array<{
          email: string;
          password_hash: string;
          platform_role: string;
          status: string;
        }>
      >(
        'SELECT email, password_hash, platform_role, status FROM "users" WHERE id = $1',
        "existing-user-1",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(email);
      expect(rows[0].platform_role).toBe("USER");
      expect(rows[0].status).toBe("ACTIVE");
    });

    it("still authorizes the existing credentials", async () => {
      const result = await authorizeCredentials(
        { email, password },
        (lookupEmail) =>
          scratch.user.findUnique({
            where: { email: lookupEmail },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              status: true,
            },
          }),
      );
      expect(result?.email).toBe(email);
      expect(
        await authorizeCredentials(
          { email, password: "wrong" },
          (lookupEmail) =>
            scratch.user.findUnique({
              where: { email: lookupEmail },
              select: {
                id: true,
                email: true,
                name: true,
                passwordHash: true,
                status: true,
              },
            }),
        ),
      ).toBeNull();
    });
  },
);
