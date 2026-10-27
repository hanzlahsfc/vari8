// W2-A2 route behaviour tests - the staff plan surfaces called the way
// the coach canvas calls them: real Request objects through the exported
// route handlers, bearer credentials from a real sign-in, and the role
// matrix asserted literally (200 staff, 403 foreign workspace, 403
// client role, 401 without credentials).

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
import { GET as getMealPlanVersion } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/versions/[versionId]/route";
import {
  GET as getPrograms,
  PUT as putPrograms,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/route";
import { GET as getProgram } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/route";
import { POST as publishProgram } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/publish/route";
import { GET as getProgramVersion } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/versions/[versionId]/route";
import { GET as getLibrary } from "../../app/api/v1/workspaces/[workspaceId]/exercise-library/route";
import { GET as getIifym } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/iifym-plans/route";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

type MemberRole = "WORKSPACE_OWNER" | "COACH" | "CLIENT";

describe.skipIf(!enabled)("W2-A2 staff plan routes (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.220.0.${++n}`,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  /** One workspace, one staff member, one client profile with an ACTIVE
   * assignment for the staff member (the write path requires it). */
  async function staffWorkspace(role: MemberRole = "COACH") {
    const tag = `w2a2_${++n}_${Date.now()}`;
    const ws = await prisma.workspace.create({
      data: { name: tag, slug: tag, status: "ACTIVE" },
    });
    const email = `${tag}@example.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: "fixture", name: tag, status: "ACTIVE" },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role, status: "ACTIVE" },
    });
    const client = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: `${tag} client` },
    });
    // The integration harness forces ENABLE_CONSENT_GATES=1, so the plan
    // services resolve their dev consent registry: grant every kind+version
    // the three gated domains require.
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "meal-plan-dev-privacy-v1"],
      ["HEALTH_DATA", "meal-plan-dev-health-v1"],
      ["PRIVACY_NOTICE", "iifym-dev-privacy-v1"],
      ["HEALTH_DATA", "iifym-dev-health-v1"],
      ["PRIVACY_NOTICE", "training-plan-dev-privacy-v1"],
      ["HEALTH_DATA", "training-plan-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId: client.id, kind, version },
      });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: client.id,
        coachMemberId: member.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    return { ws, email, member, client };
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
  const programs = (ws: string, cp: string) =>
    `/workspaces/${ws}/clients/${cp}/training-programs`;

  const MEAL_DRAFT = {
    name: "Nutrition plan",
    startDate: "2026-10-19",
    activeVariantId: "v1",
    schedule: { mode: "manual", selectedVariantId: "v1" },
    variants: [
      {
        id: "v1",
        label: "TD",
        meals: [
          {
            id: "m1",
            label: "Breakfast",
            time: "08:00",
            portions: [{ foodId: "food-001", quantity: 50 }],
          },
        ],
      },
    ],
  };

  const TRAINING_DRAFT = {
    programMode: "WEEK_BASED",
    sessions: [{ id: "s1", name: "Lower strength" }],
    exercises: [
      {
        id: "e1",
        sessionId: "s1",
        name: "Deadlift",
        muscle: "hamstrings",
      },
    ],
    sessionOrder: { "1": ["s1"] },
    exerciseOrder: { s1: { "1": ["e1"] } },
    sessionPresence: { s1: { "1": true } },
    exercisePresence: { "s1/e1": { "1": true } },
    sessionNames: {},
    fieldCells: {
      "s1/e1/sets": { "1": 4 },
      "s1/e1/reps": { "1": "4-5" },
    },
    setRows: {
      "s1/e1": {
        "1": [
          {
            id: "d1",
            reps: 4,
            tempo: "",
            type: "Working",
            rest: "",
            instructions: "",
          },
        ],
      },
    },
  };

  const FIELD_CONFIG = {
    sets: true,
    fixedReps: true,
    repRanges: true,
    tempo: true,
    setType: true,
    restPause: true,
    instructions: true,
    progressionNotes: true,
  };

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

  it("meal plan: PUT creates the draft and GET returns it (coach 200)", async () => {
    const { ws, email, client } = await staffWorkspace("COACH");
    const token = await signInToken(email);
    const params = {
      workspaceId: ws.id,
      clientProfileId: client.id,
    };
    const put = await putMealPlan(
      req(meal(ws.id, client.id), {
        method: "PUT",
        token,
        body: {
          expectedRevision: 0,
          title: "Nutrition plan",
          timezone: "Europe/Copenhagen",
          draft: MEAL_DRAFT,
        },
      }),
      { params: Promise.resolve(params) },
    );
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({
      planId: expect.any(String),
      revision: 1,
    });
    const get = await getMealPlan(req(meal(ws.id, client.id), { token }), {
      params: Promise.resolve(params),
    });
    expect(get.status).toBe(200);
    const body = (await get.json()) as {
      plan: { title: string; draftRevision: number; draft: unknown };
      versions: unknown[];
      canWrite: boolean;
    };
    expect(body.plan.title).toBe("Nutrition plan");
    expect(body.plan.draftRevision).toBe(1);
    expect((body.plan.draft as { name?: string }).name).toBe("Nutrition plan");
    expect(body.versions).toEqual([]);
    expect(body.canWrite).toBe(true);
  });

  it("meal plan: publish mints version 1 and the detail read returns its payload", async () => {
    const { ws, email, client } = await staffWorkspace("COACH");
    const token = await signInToken(email);
    const params = {
      workspaceId: ws.id,
      clientProfileId: client.id,
    };
    await putMealPlan(
      req(meal(ws.id, client.id), {
        method: "PUT",
        token,
        body: {
          expectedRevision: 0,
          title: "Nutrition plan",
          timezone: "Europe/Copenhagen",
          draft: MEAL_DRAFT,
        },
      }),
      { params: Promise.resolve(params) },
    );
    const pub = await publishMealPlan(
      req(`${meal(ws.id, client.id)}/publish`, {
        method: "POST",
        token,
        body: { expectedRevision: 1, effectiveDate: "2026-10-19" },
      }),
      { params: Promise.resolve(params) },
    );
    expect(pub.status).toBe(200);
    const pubBody = (await pub.json()) as {
      versionId: string;
      versionSeq: number;
    };
    expect(pubBody.versionSeq).toBe(1);
    const detail = await getMealPlanVersion(
      req(`${meal(ws.id, client.id)}/versions/${pubBody.versionId}`, { token }),
      {
        params: Promise.resolve({ ...params, versionId: pubBody.versionId }),
      },
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      payload: { variants: { id: string }[] };
    };
    expect(detailBody.payload.variants[0]?.id).toBe("v1");
  });

  it("meal plan: role matrix is literal (foreign 403, client 403, unauth 401)", async () => {
    const { ws, client } = await staffWorkspace("COACH");
    const foreign = await staffWorkspace("COACH");
    const foreignToken = await signInToken(foreign.email);
    const params = {
      workspaceId: ws.id,
      clientProfileId: client.id,
    };
    const res = await getMealPlan(
      req(meal(ws.id, client.id), { token: foreignToken }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(403);
    const clientSide = await staffWorkspace("CLIENT");
    const clientToken = await signInToken(clientSide.email);
    const resClient = await getMealPlan(
      req(meal(clientSide.ws.id, clientSide.client.id), {
        token: clientToken,
      }),
      {
        params: Promise.resolve({
          workspaceId: clientSide.ws.id,
          clientProfileId: clientSide.client.id,
        }),
      },
    );
    expect(resClient.status).toBe(403);
    const resAnon = await getMealPlan(req(meal(ws.id, client.id)), {
      params: Promise.resolve(params),
    });
    expect(resAnon.status).toBe(401);
  });

  it("training program: PUT creates, GET lists and details, publish mints version 1", async () => {
    const { ws, email, client } = await staffWorkspace("COACH");
    const token = await signInToken(email);
    const params = {
      workspaceId: ws.id,
      clientProfileId: client.id,
    };
    const put = await putPrograms(
      req(programs(ws.id, client.id), {
        method: "PUT",
        token,
        body: {
          expectedRevision: 0,
          title: "Strength foundation",
          startDate: "2026-09-14",
          weekCount: 8,
          fieldConfig: FIELD_CONFIG,
          timezone: "Europe/Vienna",
          draft: TRAINING_DRAFT,
        },
      }),
      { params: Promise.resolve(params) },
    );
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      programId: string;
      revision: number;
    };
    expect(putBody.revision).toBe(1);
    const list = await getPrograms(req(programs(ws.id, client.id), { token }), {
      params: Promise.resolve(params),
    });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      programs: { programId: string; title: string; state: string }[];
      canWrite: boolean;
    };
    expect(listBody.programs).toHaveLength(1);
    expect(listBody.programs[0]?.title).toBe("Strength foundation");
    expect(listBody.programs[0]?.state).toBe("draft");
    const detail = await getProgram(
      req(`${programs(ws.id, client.id)}/${putBody.programId}`, { token }),
      {
        params: Promise.resolve({ ...params, programId: putBody.programId }),
      },
    );
    expect(detail.status).toBe(200);
    const pub = await publishProgram(
      req(`${programs(ws.id, client.id)}/${putBody.programId}/publish`, {
        method: "POST",
        token,
        body: { expectedRevision: 1, effectiveDate: "2026-09-14" },
      }),
      { params: Promise.resolve({ ...params, programId: putBody.programId }) },
    );
    expect(pub.status).toBe(200);
    const pubBody = (await pub.json()) as {
      versionId: string;
      versionSeq: number;
      replayed: boolean;
    };
    expect(pubBody.versionSeq).toBe(1);
    const version = await getProgramVersion(
      req(
        `${programs(ws.id, client.id)}/${putBody.programId}/versions/${pubBody.versionId}`,
        { token },
      ),
      {
        params: Promise.resolve({
          ...params,
          programId: putBody.programId,
          versionId: pubBody.versionId,
        }),
      },
    );
    expect(version.status).toBe(200);
    const versionBody = (await version.json()) as {
      payload: { weekCount: number; weeks: { sessions: { id: string }[] }[] };
    };
    expect(versionBody.payload.weekCount).toBe(8);
    expect(versionBody.payload.weeks[0]?.sessions[0]?.id).toBe("s1");
  });

  it("exercise library: staff 200, foreign 403, client 403, unauth 401", async () => {
    const { ws, email, member } = await staffWorkspace("COACH");
    const token = await signInToken(email);
    await prisma.exerciseLibraryItem.create({
      data: {
        workspaceId: ws.id,
        name: "Back squat",
        muscle: "quadriceps",
        secondaryMuscles: ["glutes"],
        notes: "Brace before each rep.",
        createdByMemberId: member.id,
      },
    });
    const res = await getLibrary(
      req(`/workspaces/${ws.id}/exercise-library`, { token }),
      { params: Promise.resolve({ workspaceId: ws.id }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; muscle: string }[];
    expect(body).toEqual([
      {
        id: expect.any(String),
        name: "Back squat",
        muscle: "quadriceps",
        secondaryMuscles: ["glutes"],
        notes: "Brace before each rep.",
      },
    ]);
    const foreign = await staffWorkspace("COACH");
    const foreignToken = await signInToken(foreign.email);
    const resForeign = await getLibrary(
      req(`/workspaces/${ws.id}/exercise-library`, { token: foreignToken }),
      { params: Promise.resolve({ workspaceId: ws.id }) },
    );
    expect(resForeign.status).toBe(403);
    const clientSide = await staffWorkspace("CLIENT");
    const clientToken = await signInToken(clientSide.email);
    const resClient = await getLibrary(
      req(`/workspaces/${clientSide.ws.id}/exercise-library`, {
        token: clientToken,
      }),
      { params: Promise.resolve({ workspaceId: clientSide.ws.id }) },
    );
    expect(resClient.status).toBe(403);
    const resAnon = await getLibrary(
      req(`/workspaces/${ws.id}/exercise-library`),
      { params: Promise.resolve({ workspaceId: ws.id }) },
    );
    expect(resAnon.status).toBe(401);
  });

  it("staff iifym: existing route answers the provider's new fetch (200, empty)", async () => {
    const { ws, email, client } = await staffWorkspace("COACH");
    const token = await signInToken(email);
    const res = await getIifym(
      req(`/workspaces/${ws.id}/clients/${client.id}/iifym-plans`, { token }),
      {
        params: Promise.resolve({
          workspaceId: ws.id,
          clientProfileId: client.id,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: unknown; canWrite: boolean };
    expect(body.plan).toBeNull();
    expect(body.canWrite).toBe(true);
  });
});
