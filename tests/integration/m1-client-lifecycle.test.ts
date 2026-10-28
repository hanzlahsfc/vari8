import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  archiveClientProfile,
  listAccessibleClientProfiles,
  readClientProfileDetail,
  restoreClientProfile,
  updateClientProfileFields,
} from "../../lib/workspace/clients";
import { deleteClientProfile } from "../../lib/workspace/retention";
import { listWorkspaceClientRoster } from "../../lib/workspace/roster";

/**
 * PR-M1 real-PostgreSQL tests (D27): client profile fields, archive, restore
 * and retention-gated delete through the production services and the real
 * Prisma-backed guard. Synthetic fixtures only.
 * Dedicated disposable database via INTEGRATION_DATABASE_URL.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("PR-M1 client lifecycle", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "client_assignment","coach_profile","client_profile","workspace_member","workspace","users","audit_event" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `m1${++n}_${Date.now()}`;
  async function user(status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$x",
        status,
      },
    });
  }
  async function workspace(retentionDays = 90) {
    return prisma.workspace.create({
      data: { name: `w${++n}`, slug: `ws${n}_${Date.now()}`, retentionDays },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      | "WORKSPACE_OWNER"
      | "COACH"
      | "ASSISTANT_COACH"
      | "SUPPORT"
      | "CLIENT" = "WORKSPACE_OWNER",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }
  async function clientProfile(
    workspaceId: string,
    extra: { userId?: string | null; archivedAt?: Date | null } = {},
  ) {
    return prisma.clientProfile.create({
      data: { workspaceId, name: "Client", ...extra },
    });
  }
  const s = (id: string) => ({ user: { id } }) as never;
  async function staff() {
    const u = await user();
    const ws = await workspace();
    await member(ws.id, u.id, "WORKSPACE_OWNER");
    return { u, ws };
  }
  const auditEvents = (workspaceId: string, resourceId: string) =>
    prisma.auditEvent.findMany({
      where: { workspaceId, resourceId, resourceType: "client_profile" },
      orderBy: { at: "asc" },
    });

  it("writes and reads the canvas profile fields back literally", async () => {
    const { u, ws } = await staff();
    const c = await clientProfile(ws.id);
    const detail = await updateClientProfileFields(
      s(u.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        fields: {
          name: "  Emma Anders  ",
          label: "Lifestyle",
          coachingSince: "2026-08-10",
          heightCm: 170,
          priorityMessagesAllowed: true,
        },
      },
      prisma,
    );
    expect(detail.name).toBe("Emma Anders");
    expect(detail.label).toBe("Lifestyle");
    expect(detail.coachingSince).toEqual(new Date("2026-08-10"));
    expect(detail.heightCm).toBe(170);
    expect(detail.priorityMessagesAllowed).toBe(true);

    const read = await readClientProfileDetail(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: c.id },
      prisma,
    );
    expect(read).toEqual(detail);
  });

  it("rejects a field patch that names no writable field", async () => {
    const { u, ws } = await staff();
    const c = await clientProfile(ws.id);
    await expect(
      updateClientProfileFields(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: c.id, fields: {} },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      updateClientProfileFields(
        s(u.id),
        {
          workspaceId: ws.id,
          clientProfileId: c.id,
          fields: { heightCm: 0 },
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("archive hides the client from both roster queries; includeArchived returns it", async () => {
    const { u, ws } = await staff();
    const keep = await clientProfile(ws.id);
    const gone = await clientProfile(ws.id);

    const result = await archiveClientProfile(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: gone.id, reason: "paused" },
      prisma,
    );
    expect(result.changed).toBe(true);

    const roster = await listAccessibleClientProfiles(
      s(u.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(roster.items.map((i) => i.id)).toEqual([keep.id]);

    const withArchived = await listAccessibleClientProfiles(
      s(u.id),
      { workspaceId: ws.id, includeArchived: true },
      prisma,
    );
    expect(new Set(withArchived.items.map((i) => i.id))).toEqual(
      new Set([keep.id, gone.id]),
    );

    // The /api/v1 roster read hides archived clients too.
    const api = await listWorkspaceClientRoster(
      { userId: u.id, email: "e", name: null },
      {
        workspaceId: ws.id,
        memberId: "m",
        role: "owner",
        scope: "workspace",
      },
      {},
      prisma,
    );
    expect(api.items.map((i) => i.clientProfileId)).toEqual([keep.id]);

    const row = await prisma.clientProfile.findUniqueOrThrow({
      where: { id: gone.id },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row.archiveReason).toBe("paused");
  });

  it("archive and restore are idempotent and audited structurally", async () => {
    const { u, ws } = await staff();
    const c = await clientProfile(ws.id);

    await archiveClientProfile(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: c.id },
      prisma,
    );
    const again = await archiveClientProfile(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: c.id },
      prisma,
    );
    expect(again.changed).toBe(false);

    const restored = await restoreClientProfile(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: c.id },
      prisma,
    );
    expect(restored.changed).toBe(true);
    const restoredAgain = await restoreClientProfile(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: c.id },
      prisma,
    );
    expect(restoredAgain.changed).toBe(false);

    const events = await auditEvents(ws.id, c.id);
    expect(
      events.map((e) => [e.action, (e.meta as { status?: string })?.status]),
    ).toEqual([
      ["UPDATE", "ARCHIVED"],
      ["UPDATE", "ACTIVE"],
    ]);
    for (const e of events) {
      expect(e.result).toBe("ALLOW");
      expect(e.actorUserId).toBe(u.id);
      expect(JSON.stringify(e.meta)).not.toMatch(/Client|paused/);
    }

    const roster = await listAccessibleClientProfiles(
      s(u.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(roster.items.map((i) => i.id)).toEqual([c.id]);
  });

  it("refuses delete while unarchived and inside the retention window", async () => {
    const { u, ws } = await staff();
    const fresh = await clientProfile(ws.id);
    await expect(
      deleteClientProfile(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: fresh.id },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "client_not_archived" });

    const recent = await clientProfile(ws.id, {
      archivedAt: new Date("2026-10-10T00:00:00.000Z"),
    });
    await expect(
      deleteClientProfile(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: recent.id },
        prisma,
        new Date("2026-10-20T00:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "retention_not_elapsed" });
    // The refused profile is untouched.
    expect(
      (
        await prisma.clientProfile.findUniqueOrThrow({
          where: { id: recent.id },
        })
      ).archivedAt,
    ).toEqual(new Date("2026-10-10T00:00:00.000Z"));
  });

  it("retention boundary is a literal date: exactly 90 days deletes, one day inside refuses", async () => {
    const { u, ws } = await staff(); // retentionDays 90
    const now = new Date("2026-10-20T12:00:00.000Z");
    const onBoundary = await clientProfile(ws.id, {
      archivedAt: new Date("2026-07-22T12:00:00.000Z"), // exactly 90 days
    });
    const inside = await clientProfile(ws.id, {
      archivedAt: new Date("2026-07-23T12:00:00.000Z"), // 89 days
    });

    await expect(
      deleteClientProfile(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: inside.id },
        prisma,
        now,
      ),
    ).rejects.toMatchObject({ code: "retention_not_elapsed" });

    const done = await deleteClientProfile(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: onBoundary.id },
      prisma,
      now,
    );
    expect(done).toEqual({ clientProfileId: onBoundary.id, changed: true });
    expect(
      await prisma.clientProfile.findUnique({ where: { id: onBoundary.id } }),
    ).toBeNull();

    const events = await auditEvents(ws.id, onBoundary.id);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("DELETE");
    expect(events[0].result).toBe("ALLOW");
    expect(events[0].resourceId).toBe(onBoundary.id);
  });

  it("honours the per-workspace retentionDays setting", async () => {
    const u = await user();
    const ws = await workspace(10);
    await member(ws.id, u.id, "WORKSPACE_OWNER");
    const c = await clientProfile(ws.id, {
      archivedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    const out = await deleteClientProfile(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: c.id },
      prisma,
      new Date("2026-10-20T00:00:00.000Z"),
    );
    expect(out.changed).toBe(true);
  });

  it("refuses delete when dependent records still reference the profile", async () => {
    const { u, ws } = await staff();
    const c = await clientProfile(ws.id, {
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: u.id },
    });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: ownerMember.id,
        role: "COACH",
      },
    });
    await expect(
      deleteClientProfile(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: c.id },
        prisma,
        new Date("2026-10-20T00:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "client_not_deletable" });
    // Nothing was deleted or audited.
    expect(
      await prisma.clientProfile.findUnique({ where: { id: c.id } }),
    ).not.toBeNull();
    expect(await auditEvents(ws.id, c.id)).toHaveLength(0);
  });

  it("a CLIENT on its own profile is denied archive, field writes and delete", async () => {
    const u = await user();
    const ws = await workspace();
    await member(ws.id, u.id, "CLIENT");
    const c = await clientProfile(ws.id, { userId: u.id });

    await expect(
      archiveClientProfile(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: c.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      updateClientProfileFields(
        s(u.id),
        {
          workspaceId: ws.id,
          clientProfileId: c.id,
          fields: { label: "Prep" },
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      deleteClientProfile(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: c.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("staff of a foreign workspace are denied archive and delete", async () => {
    const { ws } = await staff();
    const c = await clientProfile(ws.id, {
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const outsider = await user();
    const other = await workspace();
    await member(other.id, outsider.id, "WORKSPACE_OWNER");

    await expect(
      archiveClientProfile(
        s(outsider.id),
        { workspaceId: ws.id, clientProfileId: c.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      deleteClientProfile(
        s(outsider.id),
        { workspaceId: ws.id, clientProfileId: c.id },
        prisma,
        new Date("2026-10-20T00:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
