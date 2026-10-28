// W2-N7 client own-scope meal-plan read: a bound client reads only its own
// published plan over the API, a foreign clientProfileId is denied before
// any read (no audit row), staff callers keep the staff shape, and an
// anonymous request is refused. Target behaviour: the GET route branches on
// scope "own" and calls readOwnMealPlan.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET as getMealPlan,
  PUT as putMealPlan,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/route";
import { POST as publishMealPlan } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/publish/route";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

describe.skipIf(!enabled)("W2-N7 client own meal-plan read (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.230.0.${++n}`,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  /** One workspace, a coach with an ACTIVE assignment, a client user bound
   * to its own clientProfile, and an unbound foreign profile in the same
   * workspace. Every gated domain gets its dev consent rows. */
  async function clientBoundWorkspace() {
    const tag = `w2n7_${++n}_${Date.now()}`;
    const workspace = await prisma.workspace.create({
      data: { name: tag, slug: tag, status: "ACTIVE" },
    });

    const coachEmail = `${tag}_coach@example.test`;
    const coachUser = await prisma.user.create({
      data: {
        email: coachEmail,
        passwordHash: "fixture",
        name: `${tag} coach`,
        status: "ACTIVE",
      },
    });
    await prisma.account.create({
      data: {
        userId: coachUser.id,
        accountId: coachUser.id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    const coachMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: coachUser.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });

    const profile = await prisma.clientProfile.create({
      data: { workspaceId: workspace.id, name: "Meal Plan Client" },
    });
    const foreignProfile = await prisma.clientProfile.create({
      data: { workspaceId: workspace.id, name: "Foreign Client" },
    });
    // The integration harness forces ENABLE_CONSENT_GATES=1, so the meal-plan
    // services resolve their dev consent registry: both profiles must carry
    // every kind+version the gated domains require.
    for (const clientProfileId of [profile.id, foreignProfile.id])
      for (const [kind, version] of [
        ["PRIVACY_NOTICE", "meal-plan-dev-privacy-v1"],
        ["HEALTH_DATA", "meal-plan-dev-health-v1"],
      ] as const)
        await prisma.consentRecord.create({
          data: { clientProfileId, kind, version },
        });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: workspace.id,
        clientProfileId: profile.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });

    const clientEmail = `${tag}_client@example.test`;
    const clientUser = await prisma.user.create({
      data: {
        email: clientEmail,
        passwordHash: "fixture",
        name: `${tag} client`,
        status: "ACTIVE",
      },
    });
    await prisma.account.create({
      data: {
        userId: clientUser.id,
        accountId: clientUser.id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: clientUser.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    await prisma.clientProfile.update({
      where: { id: profile.id },
      data: { userId: clientUser.id },
    });

    return {
      workspace,
      coachUser,
      coachEmail,
      clientUser,
      clientEmail,
      profile,
      foreignProfile,
    };
  }

  function req(
    path: string,
    init: { method?: string; token?: string; body?: unknown } = {},
  ) {
    return new Request(`${BASE}/api/v1${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  const meal = (ws: string, cp: string) =>
    `/workspaces/${ws}/clients/${cp}/meal-plans`;

  const MEAL_DRAFT = {
    name: "Meal plan",
    startDate: "2026-10-19",
    activeVariantId: "v1",
    schedule: { mode: "manual", selectedVariantId: "v1" },
    variants: [
      {
        id: "v1",
        label: "Training day",
        meals: [
          {
            id: "m1",
            label: "Breakfast",
            time: "08:00",
            frequency: "Daily",
            portions: [{ foodId: "food-001", quantity: 50 }],
          },
        ],
      },
    ],
  };

  /** Coach seeds a draft then publishes version 1 at 2026-10-19. */
  async function seedPublishedPlan(
    workspaceId: string,
    clientProfileId: string,
    token: string,
  ) {
    const params = { workspaceId, clientProfileId };
    const put = await putMealPlan(
      req(meal(workspaceId, clientProfileId), {
        method: "PUT",
        token,
        body: {
          expectedRevision: 0,
          title: "Meal plan",
          timezone: "Europe/Copenhagen",
          draft: MEAL_DRAFT,
        },
      }),
      { params: Promise.resolve(params) },
    );
    expect(put.status).toBe(200);
    const pub = await publishMealPlan(
      req(`${meal(workspaceId, clientProfileId)}/publish`, {
        method: "POST",
        token,
        body: { expectedRevision: 1, effectiveDate: "2026-10-19" },
      }),
      { params: Promise.resolve(params) },
    );
    expect(pub.status).toBe(200);
  }

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","consent_record","training_program_version","training_program","iifym_plan_version","iifym_plan","meal_plan_version","meal_plan","exercise_library_item","client_assignment","client_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("client reads its own meal plan over the API", async () => {
    const { workspace, coachEmail, clientEmail, profile } =
      await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);
    await seedPublishedPlan(workspace.id, profile.id, coachToken);

    const clientToken = await signInToken(clientEmail);
    const params = { workspaceId: workspace.id, clientProfileId: profile.id };
    const res = await getMealPlan(
      req(meal(workspace.id, profile.id), { token: clientToken }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      current: {
        versionSeq: number;
        effectiveDate: string;
        effectiveTimezone: string;
        payload: { variants: { id: string }[] };
      } | null;
      upcoming: unknown;
      plan?: unknown;
    };
    expect(body.current?.versionSeq).toBe(1);
    expect(body.current?.effectiveDate).toBe("2026-10-19");
    expect(body.current?.effectiveTimezone).toBe("Europe/Copenhagen");
    expect(body.current?.payload.variants[0]?.id).toBe("v1");
    expect(body.upcoming).toBeNull();
    expect(body.plan).toBeUndefined();
  });

  it("denies a foreign clientProfileId with 403 before any read", async () => {
    const { workspace, coachEmail, clientEmail, profile, foreignProfile } =
      await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);
    await seedPublishedPlan(workspace.id, profile.id, coachToken);

    const clientToken = await signInToken(clientEmail);
    const res = await getMealPlan(
      req(meal(workspace.id, foreignProfile.id), { token: clientToken }),
      {
        params: Promise.resolve({
          workspaceId: workspace.id,
          clientProfileId: foreignProfile.id,
        }),
      },
    );
    expect(res.status).toBe(403);
    const audited = await prisma.auditEvent.count({
      where: { subjectClientProfileId: foreignProfile.id, action: "READ" },
    });
    expect(audited).toBe(0);
  });

  it("staff caller keeps the staff shape", async () => {
    const { workspace, coachEmail, profile } = await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);
    await seedPublishedPlan(workspace.id, profile.id, coachToken);

    const res = await getMealPlan(
      req(meal(workspace.id, profile.id), { token: coachToken }),
      {
        params: Promise.resolve({
          workspaceId: workspace.id,
          clientProfileId: profile.id,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plan: { title: string };
      versions: unknown;
      canWrite: unknown;
    };
    expect(body.plan.title).toBe("Meal plan");
    expect(Array.isArray(body.versions)).toBe(true);
    expect(typeof body.canWrite).toBe("boolean");
  });

  it("unauthenticated request gets 401", async () => {
    const { workspace, profile } = await clientBoundWorkspace();
    const res = await getMealPlan(req(meal(workspace.id, profile.id)), {
      params: Promise.resolve({
        workspaceId: workspace.id,
        clientProfileId: profile.id,
      }),
    });
    expect(res.status).toBe(401);
  });
});
