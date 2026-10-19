import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * P-025-A Check-In schema contract — asserted directly against real
 * PostgreSQL catalog. Synthetic fixtures only. The P-025-B slice later
 * added the instance/submission/answer trio (reviewed); the
 * `checkin_review` table remains absent — P-025-C.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("P-025-A schema — tables/columns/constraints", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("composite member-FK enforces same-workspace provenance", async () => {
    // Seed two workspaces + members; a version row whose
    // published_by_member_id belongs to ANOTHER workspace must violate the
    // composite (member, workspace) foreign key.
    const wsA = await prisma.workspace.create({
      data: { name: "A", slug: `p25s-a-${Date.now()}`, status: "ACTIVE" },
    });
    const wsB = await prisma.workspace.create({
      data: { name: "B", slug: `p25s-b-${Date.now()}`, status: "ACTIVE" },
    });
    const u = await prisma.user.create({
      data: {
        email: `p25s-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "U",
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    const mA = await prisma.workspaceMember.create({
      data: {
        workspaceId: wsA.id,
        userId: u.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const mB = await prisma.workspaceMember.create({
      data: {
        workspaceId: wsB.id,
        userId: u.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const form = await prisma.checkInForm.create({
      data: {
        workspaceId: wsA.id,
        name: "F",
        createdByMemberId: mA.id,
        draft: { title: "F", fields: [] },
      },
    });
    await expect(
      prisma.checkInFormVersion.create({
        data: {
          workspaceId: wsA.id,
          formId: form.id,
          versionSeq: 1,
          definition: { title: "F", fields: [] },
          publishOriginRevision: 1,
          // mB belongs to wsB — cross-workspace provenance must fail.
          publishedByMemberId: mB.id,
        },
      }),
    ).rejects.toThrow();
    const count = await prisma.checkInFormVersion.count({
      where: { formId: form.id },
    });
    expect(count).toBe(0);
  });
});
