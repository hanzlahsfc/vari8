// W2-N9 temporary meal-plan entries: a coach creates and lists a refeed or
// diet break over the API, input and same-source overlap are rejected,
// a bound client reads only its own rows (a foreign clientProfileId is
// denied before any read), an entry is deleted once, and an anonymous
// request is refused.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET as getTemporary,
  POST as postTemporary,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/temporary/route";
import { DELETE as deleteTemporary } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/temporary/[temporaryPlanId]/route";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

type TemporaryInput = {
  kind: "refeed" | "diet-break" | "custom";
  label: string;
  startDate: string;
  endDate: string;
  source: "mealPlan" | "iifym";
  plan: Record<string, unknown>;
};

type TemporaryRow = {
  id: string;
  kind: string;
  label: string;
  startDate: string;
  endDate: string;
  source: string;
  plan: Record<string, unknown>;
  createdAt: string;
};

describe.skipIf(!enabled)("W2-N9 temporary meal-plan entries (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.231.0.${++n}`,
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
    const tag = `w2n9_${++n}_${Date.now()}`;
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
      data: { workspaceId: workspace.id, name: "Temporary Plan Client" },
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

  const temporary = (ws: string, cp: string) =>
    `/workspaces/${ws}/clients/${cp}/meal-plans/temporary`;

  function input(overrides: Partial<TemporaryInput> = {}): TemporaryInput {
    return {
      kind: "refeed",
      label: "Refeed weekend",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      source: "mealPlan",
      plan: { some: "payload" },
      ...overrides,
    };
  }

  function createTemporary(
    workspaceId: string,
    clientProfileId: string,
    token: string,
    body: TemporaryInput,
  ) {
    return postTemporary(
      req(temporary(workspaceId, clientProfileId), {
        method: "POST",
        token,
        body,
      }),
      { params: Promise.resolve({ workspaceId, clientProfileId }) },
    );
  }

  function listTemporary(
    workspaceId: string,
    clientProfileId: string,
    token?: string,
  ) {
    return getTemporary(
      req(temporary(workspaceId, clientProfileId), { token }),
      { params: Promise.resolve({ workspaceId, clientProfileId }) },
    );
  }

  function removeTemporary(
    workspaceId: string,
    clientProfileId: string,
    temporaryPlanId: string,
    token?: string,
  ) {
    return deleteTemporary(
      req(`${temporary(workspaceId, clientProfileId)}/${temporaryPlanId}`, {
        method: "DELETE",
        token,
      }),
      {
        params: Promise.resolve({
          workspaceId,
          clientProfileId,
          temporaryPlanId,
        }),
      },
    );
  }

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","consent_record","training_program_version","training_program","iifym_plan_version","iifym_plan","meal_plan_version","meal_plan","temporary_nutrition_plan","exercise_library_item","client_assignment","client_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("staff creates a temporary entry and lists it back", async () => {
    const { workspace, coachEmail, profile } = await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);

    const created = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input(),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { temporary: TemporaryRow };
    const row = createdBody.temporary;
    expect(typeof row.id).toBe("string");
    expect(row.id.length).toBeGreaterThan(0);
    expect(row.kind).toBe("refeed");
    expect(row.label).toBe("Refeed weekend");
    expect(row.startDate).toBe("2026-11-01");
    expect(row.endDate).toBe("2026-11-03");
    expect(row.source).toBe("mealPlan");
    expect(row.plan).toEqual({ some: "payload" });
    expect(Number.isNaN(Date.parse(row.createdAt))).toBe(false);

    const listed = await listTemporary(workspace.id, profile.id, coachToken);
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { temporary: TemporaryRow[] };
    expect(listedBody.temporary).toHaveLength(1);
    expect(listedBody.temporary[0]?.id).toBe(row.id);
    expect(listedBody.temporary[0]?.label).toBe("Refeed weekend");

    const stored = await prisma.temporaryNutritionPlan.findUnique({
      where: { id: row.id },
    });
    expect(stored?.kind).toBe("REFEED");
  });

  it("rejects invalid input with 400 invalid_input", async () => {
    const { workspace, coachEmail, profile } = await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);

    const cases: [string, TemporaryInput][] = [
      ["bad calendar date", input({ startDate: "2026-13-40" })],
      [
        "endDate before startDate",
        input({ startDate: "2026-11-05", endDate: "2026-11-03" }),
      ],
      ["blank label", input({ label: "   " })],
      [
        "range of 29 days",
        input({ startDate: "2026-11-01", endDate: "2026-11-29" }),
      ],
      [
        "range over 28 days",
        input({ startDate: "2026-11-01", endDate: "2026-11-30" }),
      ],
    ];

    for (const [name, body] of cases) {
      const res = await createTemporary(
        workspace.id,
        profile.id,
        coachToken,
        body,
      );
      expect({ name, status: res.status }).toEqual({ name, status: 400 });
      const errorBody = (await res.json()) as { error: { code: string } };
      expect({ name, code: errorBody.error.code }).toEqual({
        name,
        code: "invalid_input",
      });
    }

    const rows = await prisma.temporaryNutritionPlan.count({
      where: { clientProfileId: profile.id },
    });
    expect(rows).toBe(0);
  });

  it("rejects same-source overlap but allows cross-source and adjacent", async () => {
    const { workspace, coachEmail, profile } = await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);

    const first = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input(),
    );
    expect(first.status).toBe(200);

    const overlapping = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input({ startDate: "2026-11-03", endDate: "2026-11-05" }),
    );
    expect(overlapping.status).toBe(400);
    const overlapBody = (await overlapping.json()) as {
      error: { code: string };
    };
    expect(overlapBody.error.code).toBe("invalid_input");

    const otherSource = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input({
        source: "iifym",
        label: "Diet break",
        kind: "diet-break",
        startDate: "2026-11-02",
        endDate: "2026-11-04",
      }),
    );
    expect(otherSource.status).toBe(200);

    const adjacent = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input({ startDate: "2026-11-04", endDate: "2026-11-05" }),
    );
    expect(adjacent.status).toBe(200);

    // Inclusive 28-day boundary: exactly 28 days is the maximum accepted
    // span; 29 days is already rejected in the invalid-input test.
    const maxSpan = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input({ startDate: "2026-11-28", endDate: "2026-12-25" }),
    );
    expect(maxSpan.status).toBe(200);
  });

  it("client own scope reads its own temporary rows", async () => {
    const { workspace, coachEmail, clientEmail, profile } =
      await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);
    const created = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input(),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { temporary: TemporaryRow };

    const clientToken = await signInToken(clientEmail);
    const res = await listTemporary(workspace.id, profile.id, clientToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { temporary: TemporaryRow[] };
    expect(body.temporary).toHaveLength(1);
    expect(body.temporary[0]?.id).toBe(createdBody.temporary.id);
    expect(body.temporary[0]?.startDate).toBe("2026-11-01");
  });

  it("denies a foreign clientProfileId with 403 before any read", async () => {
    const { workspace, coachEmail, clientEmail, profile, foreignProfile } =
      await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);
    const created = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input(),
    );
    expect(created.status).toBe(200);

    const clientToken = await signInToken(clientEmail);
    const res = await listTemporary(
      workspace.id,
      foreignProfile.id,
      clientToken,
    );
    expect(res.status).toBe(403);
    const audited = await prisma.auditEvent.count({
      where: { subjectClientProfileId: foreignProfile.id, action: "READ" },
    });
    expect(audited).toBe(0);
  });

  it("deletes a temporary entry once, then refuses the same id", async () => {
    const { workspace, coachEmail, profile } = await clientBoundWorkspace();
    const coachToken = await signInToken(coachEmail);
    const created = await createTemporary(
      workspace.id,
      profile.id,
      coachToken,
      input(),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { temporary: TemporaryRow };
    const id = createdBody.temporary.id;

    const deleted = await removeTemporary(
      workspace.id,
      profile.id,
      id,
      coachToken,
    );
    expect(deleted.status).toBe(200);

    const listed = await listTemporary(workspace.id, profile.id, coachToken);
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { temporary: TemporaryRow[] };
    expect(body.temporary).toHaveLength(0);

    const again = await removeTemporary(
      workspace.id,
      profile.id,
      id,
      coachToken,
    );
    expect(again.status).toBe(403);
  });

  it("unauthenticated request gets 401", async () => {
    const { workspace, profile } = await clientBoundWorkspace();
    const res = await listTemporary(workspace.id, profile.id);
    expect(res.status).toBe(401);
  });
});
