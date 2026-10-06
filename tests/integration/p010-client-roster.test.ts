import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError, authorize } from "../../lib/auth/guard";
import {
  listAccessibleClientProfiles,
  WorkspaceServiceError,
} from "../../lib/workspace/clients";
import {
  nextRosterHref,
  parseRosterQuery,
  prevRosterHref,
  ROSTER_PAGE_SIZE,
} from "../../lib/workspace/roster-query";

/**
 * P-010 read-only client roster — real-PostgreSQL contract tests.
 *
 * The roster page delegates authorization + scoping entirely to the reviewed
 * `listAccessibleClientProfiles`; these tests pin the exact behaviors the
 * route relies on, plus the pure query seam's interplay with real cursor
 * values. Synthetic fixtures only; dedicated disposable database via
 * INTEGRATION_DATABASE_URL (never the application database).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

type Role =
  | "WORKSPACE_OWNER"
  | "COACH"
  | "ASSISTANT_COACH"
  | "SUPPORT"
  | "CLIENT";

describe.skipIf(!enabled)("P-010 client roster (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","access_token","consent_record","onboarding_form_version","onboarding_form","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p010_${++n}_${Date.now()}`;
  const user = (
    platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
    status: "ACTIVE" | "DEACTIVATED" = "ACTIVE",
  ) =>
    prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$x",
        platformRole,
        status,
      },
    });
  const workspace = () =>
    prisma.workspace.create({ data: { name: `w${++n}`, slug: uid() } });
  const member = (
    workspaceId: string,
    userId: string,
    role: Role,
    status: "ACTIVE" | "SUSPENDED" | "REMOVED" = "ACTIVE",
  ) =>
    prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  const clientProfile = (workspaceId: string, userId: string | null = null) =>
    prisma.clientProfile.create({
      data: { workspaceId, userId, name: `Client ${uid()}` },
    });
  const assign = (
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    status: "ACTIVE" | "REMOVED" = "ACTIVE",
  ) =>
    prisma.clientAssignment.create({
      data: { workspaceId, clientProfileId, coachMemberId, status },
    });
  const s = (id: string) => ({ user: { id } }) as never;

  it("owner lists every client in the workspace and none from another workspace", async () => {
    const owner = await user();
    const wsA = await workspace();
    const wsB = await workspace();
    await member(wsA.id, owner.id, "WORKSPACE_OWNER");
    await member(wsB.id, owner.id, "WORKSPACE_OWNER");
    const a1 = await clientProfile(wsA.id);
    const a2 = await clientProfile(wsA.id);
    await clientProfile(wsB.id);

    const page = await listAccessibleClientProfiles(
      s(owner.id),
      { workspaceId: wsA.id },
      prisma,
    );
    expect(new Set(page.items.map((i) => i.id))).toEqual(
      new Set([a1.id, a2.id]),
    );
    expect(page.items.every((i) => i.workspaceId === wsA.id)).toBe(true);
    // Summary shape: only the approved fields are returned.
    for (const item of page.items)
      expect(Object.keys(item).sort()).toEqual([
        "createdAt",
        "id",
        "name",
        "updatedAt",
        "workspaceId",
      ]);
  });

  it("coach and assistant see only ACTIVE assigned clients; removed/unassigned invisible", async () => {
    const ws = await workspace();
    const coach = await user();
    const coachMember = await member(ws.id, coach.id, "COACH");
    const c1 = await clientProfile(ws.id);
    const c2 = await clientProfile(ws.id);
    const c3 = await clientProfile(ws.id);
    await assign(ws.id, c1.id, coachMember.id, "ACTIVE");
    await assign(ws.id, c2.id, coachMember.id, "REMOVED");

    const list = await listAccessibleClientProfiles(
      s(coach.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(list.items.map((i) => i.id)).toEqual([c1.id]);

    const assistant = await user();
    const assistantMember = await member(ws.id, assistant.id, "ASSISTANT_COACH");
    await assign(ws.id, c3.id, assistantMember.id, "ACTIVE");
    const assistantList = await listAccessibleClientProfiles(
      s(assistant.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(assistantList.items.map((i) => i.id)).toEqual([c3.id]);
  });

  it("a coach with no active assignments gets a valid empty page", async () => {
    const ws = await workspace();
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    await clientProfile(ws.id);
    const list = await listAccessibleClientProfiles(
      s(coach.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(list.items).toEqual([]);
    expect(list.nextCursor).toBeNull();
  });

  it("denies SUPPORT, non-member, suspended and removed memberships, and cross-workspace access", async () => {
    const ws = await workspace();
    const wsB = await workspace();
    await clientProfile(ws.id);
    const support = await user();
    await member(ws.id, support.id, "SUPPORT");
    const nonmember = await user();
    const suspended = await user();
    await member(ws.id, suspended.id, "COACH", "SUSPENDED");
    const removed = await user();
    await member(ws.id, removed.id, "COACH", "REMOVED");
    const foreignOwner = await user();
    await member(wsB.id, foreignOwner.id, "WORKSPACE_OWNER");

    for (const u of [support, nonmember, suspended, removed, foreignOwner]) {
      await expect(
        listAccessibleClientProfiles(
          s(u.id),
          { workspaceId: ws.id },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
  });

  it("denies PLATFORM_ADMIN without membership; a deactivated user is denied", async () => {
    const ws = await workspace();
    await clientProfile(ws.id);
    const admin = await user("PLATFORM_ADMIN");
    const deactivated = await user("USER", "DEACTIVATED");
    await member(ws.id, deactivated.id, "WORKSPACE_OWNER");
    for (const u of [admin, deactivated]) {
      await expect(
        listAccessibleClientProfiles(
          s(u.id),
          { workspaceId: ws.id },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
  });

  it("CLIENT members resolve `own` scope — the route itself stays unreachable via the shell gate", async () => {
    const ws = await workspace();
    const clientUser = await user();
    await member(ws.id, clientUser.id, "CLIENT");
    const own = await clientProfile(ws.id, clientUser.id);
    await clientProfile(ws.id); // other client — never visible

    const list = await listAccessibleClientProfiles(
      s(clientUser.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(list.items.map((i) => i.id)).toEqual([own.id]);

    // The staff shell's own gate denies CLIENT outright — the roster page is
    // unreachable for this role regardless of the service's `own` scope.
    await expect(
      authorize(
        s(clientUser.id),
        {
          resource: "workspaceSettings",
          action: "read",
          workspaceId: ws.id,
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("paginates ROSTER_PAGE_SIZE-sized pages without gaps, duplicates, or overlap", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const total = ROSTER_PAGE_SIZE * 2 + 3;
    const created = await prisma.$transaction(
      Array.from({ length: total }, (_, i) =>
        prisma.clientProfile.create({
          data: { workspaceId: ws.id, name: `Page ${i}` },
        }),
      ),
    );
    const allIds = created.map((c) => c.id).sort();
    expect(new Set(allIds).size).toBe(total);

    // Walk real pages exactly as the route does: parse → service → href.
    const seen: string[] = [];
    let query = parseRosterQuery({});
    expect(query).not.toBeNull();
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      const page = await listAccessibleClientProfiles(
        s(owner.id),
        {
          workspaceId: ws.id,
          limit: ROSTER_PAGE_SIZE,
          cursor: query!.cursor,
        },
        prisma,
      );
      seen.push(...page.items.map((i) => i.id));
      if (page.nextCursor === null) break;
      const href = nextRosterHref("/x", query!, page.nextCursor);
      const parsed = new URL(href, "http://localhost").searchParams;
      query = parseRosterQuery({
        c: parsed.get("c") ?? undefined,
        p: parsed.get("p") ?? undefined,
      });
      expect(query).not.toBeNull();
    }
    expect(seen).toEqual(allIds);
    expect(new Set(seen).size).toBe(total);
    // Exactly 3 pages: 25 + 25 + 3.

    // prevRosterHref rebuilds the previous page's query; walking back yields
    // the same first page.
    const deep = parseRosterQuery({
      c: allIds[2 * ROSTER_PAGE_SIZE - 1],
      p: `-,${allIds[ROSTER_PAGE_SIZE - 1]}`,
    });
    expect(deep).not.toBeNull();
    const back = prevRosterHref("/x", deep!.history);
    expect(back).not.toBeNull();
    const backParams = new URL(back as string, "http://localhost")
      .searchParams;
    const backQuery = parseRosterQuery({
      c: backParams.get("c") ?? undefined,
      p: backParams.get("p") ?? undefined,
    });
    expect(backQuery).not.toBeNull();
    const backPage = await listAccessibleClientProfiles(
      s(owner.id),
      {
        workspaceId: ws.id,
        limit: ROSTER_PAGE_SIZE,
        cursor: backQuery!.cursor,
      },
      prisma,
    );
    expect(backPage.items.map((i) => i.id)).toEqual(
      allIds.slice(ROSTER_PAGE_SIZE, 2 * ROSTER_PAGE_SIZE),
    );
  });

  it("reads write nothing: zero audit events and zero row mutations", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await clientProfile(ws.id);
    await assign(
      ws.id,
      (await clientProfile(ws.id)).id,
      (await member(ws.id, (await user()).id, "COACH")).id,
    );

    const countRows = async () => ({
      audit: await prisma.auditEvent.count(),
      clients: await prisma.clientProfile.count(),
      members: await prisma.workspaceMember.count(),
      assignments: await prisma.clientAssignment.count(),
      tokens: await prisma.accessToken.count(),
      forms: await prisma.onboardingForm.count(),
      versions: await prisma.onboardingFormVersion.count(),
    });
    const before = await countRows();
    await listAccessibleClientProfiles(
      s(owner.id),
      { workspaceId: ws.id },
      prisma,
    );
    await listAccessibleClientProfiles(
      s(owner.id),
      { workspaceId: ws.id, cursor: "zzzz" },
      prisma,
    );
    await expect(
      listAccessibleClientProfiles(
        s((await user()).id),
        { workspaceId: ws.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await countRows()).toEqual(before);
  });

  it("service input validation still fails closed on bad limits", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await expect(
      listAccessibleClientProfiles(
        s(owner.id),
        { workspaceId: ws.id, limit: Number.NaN },
        prisma,
      ),
    ).rejects.toBeInstanceOf(WorkspaceServiceError);
  });
});
