import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { evaluateRetention } from "../../lib/gdpr/retention";

/**
 * S1-G retention on real PostgreSQL: seeded rows of each existing family are
 * never evaluated as "due" while durations are TODO(human), and the module
 * performs no deletion.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("S1-G retention", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","access_token","consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("seeded rows of every family are never due and nothing is deleted", async () => {
    const ws = await prisma.workspace.create({
      data: { name: "w", slug: `ws_${Date.now()}` },
    });
    const u = await prisma.user.create({
      data: {
        email: `u_${Date.now()}@example.test`,
        passwordHash: "scrypt$x",
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: u.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: u.id, name: "Client" },
    });
    await prisma.consentRecord.create({
      data: {
        clientProfileId: cp.id,
        kind: "HEALTH_DATA",
        version: "v1",
      },
    });
    await prisma.auditEvent.create({
      data: {
        scope: "WORKSPACE",
        workspaceId: ws.id,
        action: "GRANT",
        resourceType: "consent",
        result: "ALLOW",
      },
    });
    await prisma.accessToken.create({
      data: {
        purpose: "PASSWORD_RESET",
        tokenHash: "a".repeat(64),
        userId: u.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect(evaluateRetention(new Date())).toEqual([]);

    const counts = await prisma.$transaction([
      prisma.clientProfile.count(),
      prisma.consentRecord.count(),
      prisma.auditEvent.count(),
      prisma.accessToken.count(),
    ]);
    expect(counts).toEqual([1, 1, 1, 1]);
  });
});
