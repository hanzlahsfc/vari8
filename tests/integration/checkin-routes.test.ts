import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  POST as postInstance,
  GET as getCalendar,
} from "../../app/api/v1/workspaces/[workspaceId]/checkins/instances/route";
import { POST as postRule } from "../../app/api/v1/workspaces/[workspaceId]/checkins/schedule-rules/route";
import { POST as postGenerate } from "../../app/api/v1/workspaces/[workspaceId]/checkins/schedule-rules/[ruleId]/generate/route";

/**
 * PR-W6 transport rules a browser cannot see (D11/D14). Real Request objects,
 * real bearer credentials from a real sign-in, real PostgreSQL, the real
 * capability matrix. Nothing here re-implements the services.
 *
 * 1. CLIENT cannot start a custom check-in (owner ruling O4): the route denies
 *    before the service and writes zero rows.
 * 2. A denied caller is 403, never 200 with an empty body.
 * 3. The calendar read round-trips a scheduled instance with its dueAt.
 * 4. Creation alone generates nothing (D30); generate is explicit and a second
 *    generate never double-creates.
 */

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function call(
  handler: (
    request: Request,
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<Response>,
  workspaceId: string,
  path: string,
  params: Record<string, string>,
  init?: RequestInit,
) {
  return handler(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/checkins${path}`,
      init,
    ),
    { params: Promise.resolve({ workspaceId, ...params }) },
  );
}

describe.skipIf(!enabled)("check-in routes (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_schedule_rule","checkin_feedback","checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
    // Trusted dev/test runtime + flag "1" → the shared resolver opens.
    process.env.ENABLE_CHECK_INS = "1";
  });
  afterAll(async () => {
    delete process.env.ENABLE_CHECK_INS;
    await prisma?.$disconnect();
  });

  const uid = () => `w6r${++n}_${Date.now()}`;

  async function identity(
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
    workspaceId?: string,
  ) {
    const tag = uid();
    const user = await prisma.user.create({
      data: {
        email: `${tag}@example.test`,
        passwordHash: "fixture",
        name: tag,
        status: "ACTIVE",
      },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    const ws =
      workspaceId ??
      (
        await prisma.workspace.create({
          data: { name: tag, slug: tag, status: "ACTIVE" },
        })
      ).id;
    await prisma.workspaceMember.create({
      data: { workspaceId: ws, userId: user.id, role, status: "ACTIVE" },
    });
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.211.0.${++n}`,
        },
        body: JSON.stringify({
          email: `${tag}@example.test`,
          password: PASSWORD,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return { userId: user.id, workspaceId: ws, token: token as string };
  }

  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  });

  async function clientProfile(workspaceId: string) {
    const tag = uid();
    const user = await prisma.user.create({
      data: {
        email: `${tag}@example.test`,
        passwordHash: "fixture",
        name: tag,
      },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: user.id, role: "CLIENT", status: "ACTIVE" },
    });
    return prisma.clientProfile.create({
      data: { workspaceId, userId: user.id, name: `Client ${tag}` },
    });
  }

  async function publishedForm(ownerUserId: string, workspaceId: string) {
    const session = { user: { id: ownerUserId } };
    const created = await createCheckInForm(
      session,
      { workspaceId, name: `Form ${uid()}` },
      prisma as never,
    );
    const saved = await saveCheckInFormDraft(
      session,
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: 1,
        draft: {
          title: "Weekly",
          fields: [
            {
              kind: "shortText",
              label: "How are you?",
              required: true,
              order: 0,
            },
          ],
        },
      },
      prisma as never,
    );
    const published = await publishCheckInForm(
      session,
      { workspaceId, formId: created.formId, expectedRevision: saved.revision },
      prisma as never,
    );
    return { formId: created.formId, versionSeq: published.versionSeq };
  }

  function dueAtIn(days: number) {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCHours(9, 0, 0, 0);
    return d.toISOString();
  }

  it("denies a CLIENT the one-off instance route with a closed 403 and writes nothing", async () => {
    const owner = await identity("WORKSPACE_OWNER");
    const client = await identity("CLIENT", owner.workspaceId);
    const profile = await clientProfile(owner.workspaceId);
    const form = await publishedForm(owner.userId, owner.workspaceId);

    const res = await call(
      postInstance,
      owner.workspaceId,
      "/instances",
      {},
      {
        method: "POST",
        headers: headers(client.token),
        body: JSON.stringify({
          clientProfileId: profile.id,
          formId: form.formId,
          formVersionId: `${form.formId}:1`,
          dueAt: dueAtIn(3),
        }),
      },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: { code: "forbidden" },
    });
    expect(
      await prisma.checkInInstance.count({
        where: { clientProfileId: profile.id },
      }),
    ).toBe(0);
  });

  it("is 401 without credentials, never a silent empty list", async () => {
    const owner = await identity("WORKSPACE_OWNER");
    const profile = await clientProfile(owner.workspaceId);
    const res = await call(
      getCalendar,
      owner.workspaceId,
      `/instances?clientProfileId=${profile.id}&from=2026-10-01T00:00:00Z&to=2026-10-10T00:00:00Z`,
      {},
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: "unauthenticated" },
    });
  });

  it("round-trips a scheduled instance through the calendar read", async () => {
    const owner = await identity("WORKSPACE_OWNER");
    const coach = await identity("COACH", owner.workspaceId);
    const profile = await clientProfile(owner.workspaceId);
    const form = await publishedForm(owner.userId, owner.workspaceId);
    const coachMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId, userId: coach.userId },
    });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: owner.workspaceId,
        clientProfileId: profile.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    const version = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId: form.formId },
      orderBy: { versionSeq: "desc" },
      select: { id: true },
    });

    const dueAt = dueAtIn(4);
    const created = await call(
      postInstance,
      owner.workspaceId,
      "/instances",
      {},
      {
        method: "POST",
        headers: headers(coach.token),
        body: JSON.stringify({
          clientProfileId: profile.id,
          formId: form.formId,
          formVersionId: version.id,
          dueAt,
          coachNote: "Extra session",
        }),
      },
    );
    expect(created.status).toBe(200);
    const instance = (await created.json()) as { instanceId: string };

    const day = dueAt.slice(0, 10);
    const res = await call(
      getCalendar,
      owner.workspaceId,
      `/instances?clientProfileId=${profile.id}&from=${day}T00:00:00Z&to=${day}T23:59:59Z`,
      {},
      { headers: headers(coach.token) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { instanceId: string; dueAt: string; coachNote: string | null }[];
    };
    const found = body.items.find(
      (item) => item.instanceId === instance.instanceId,
    );
    expect(found?.dueAt).toBe(dueAt);
    expect(found?.coachNote).toBe("Extra session");
  });

  it("creates zero instances on rule create; two parallel generates never double-create", async () => {
    const owner = await identity("WORKSPACE_OWNER");
    const profile = await clientProfile(owner.workspaceId);
    const form = await publishedForm(owner.userId, owner.workspaceId);

    const startDate = dueAtIn(1).slice(0, 10);
    const weekday = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ][new Date(`${startDate}T00:00:00Z`).getUTCDay()];

    const created = await call(
      postRule,
      owner.workspaceId,
      "/schedule-rules",
      {},
      {
        method: "POST",
        headers: headers(owner.token),
        body: JSON.stringify({
          clientProfileId: profile.id,
          formId: form.formId,
          weekday,
          localTimeMinutes: 540,
          timezone: "UTC",
          startDate,
        }),
      },
    );
    expect(created.status).toBe(200);
    const rule = (await created.json()) as { status: string; ruleId: string };
    expect(rule.status).toBe("created");
    expect(
      await prisma.checkInInstance.count({
        where: { clientProfileId: profile.id },
      }),
    ).toBe(0);

    const generate = () =>
      call(
        postGenerate,
        owner.workspaceId,
        `/schedule-rules/${rule.ruleId}/generate`,
        { ruleId: rule.ruleId },
        {
          method: "POST",
          headers: headers(owner.token),
          body: JSON.stringify({ clientProfileId: profile.id }),
        },
      );

    const [a, b] = await Promise.all([generate(), generate()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const results = [
      (await a.json()) as { created: number },
      (await b.json()) as { created: number },
    ];
    const rows = await prisma.checkInInstance.count({
      where: { clientProfileId: profile.id },
    });
    expect(rows).toBeGreaterThan(0);
    expect(results.reduce((sum, r) => sum + r.created, 0)).toBe(rows);
    expect(Math.max(...results.map((r) => r.created))).toBe(rows);
  });
});
