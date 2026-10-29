// B3 route behaviour tests: activity-targets GET under own scope must
// bind the path clientProfileId to the caller's own client profile: a
// foreign path id refuses with the same closed 403 the capability gate
// emits, before any read. The client reading its own id and the assigned
// coach reading a roster client keep 200. Real sign-in, real Request
// objects through the exported handler, real PostgreSQL.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { GET as getActivityTargets } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/activity-targets/route";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

describe.skipIf(!enabled)("B3 activity-targets route (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";
  const uid = () => `atgt${++n}_${Date.now()}`;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","activity_target","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

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

  async function loginUser() {
    const email = `${uid()}@example.test`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: "fixture",
        name: `Fixture ${uid()}`,
        status: "ACTIVE",
      },
    });
    await prisma.account.create({
      data: {
        userId: u.id,
        accountId: u.id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    return { u, email };
  }

  async function member(
    workspaceId: string,
    userId: string,
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }

  const getRoute = (
    workspaceId: string,
    clientProfileId: string,
    token: string,
  ) =>
    getActivityTargets(
      new Request(
        `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/activity-targets`,
        { headers: { authorization: `Bearer ${token}` } },
      ),
      { params: Promise.resolve({ workspaceId, clientProfileId }) },
    );

  /** One workspace: a coach assigned to the caller's client (one seeded
   * steps target), and a second roster client whose id plays the foreign
   * path id. */
  async function setup() {
    const w = await prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `at-${uid()}`, status: "ACTIVE" },
    });
    const coach = await loginUser();
    const coachMember = await member(w.id, coach.u.id, "COACH");
    const client = await loginUser();
    await member(w.id, client.u.id, "CLIENT");
    const cp = await prisma.clientProfile.create({
      data: {
        workspaceId: w.id,
        userId: client.u.id,
        name: `Client ${uid()}`,
      },
    });
    const other = await loginUser();
    await member(w.id, other.u.id, "CLIENT");
    const foreignCp = await prisma.clientProfile.create({
      data: {
        workspaceId: w.id,
        userId: other.u.id,
        name: `Foreign ${uid()}`,
      },
    });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    await prisma.activityTarget.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        metric: "steps",
        kind: "MINIMUM",
        stepMin: 8000,
        effectiveFrom: new Date("2026-10-01T00:00:00Z"),
        createdByMemberId: coachMember.id,
      },
    });
    return { w, coach, client, cp, foreignCp };
  }

  it("a client reading its own path id gets its versions (own 200)", async () => {
    const { w, client, cp } = await setup();
    const res = await getRoute(w.id, cp.id, await signInToken(client.email));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      clientProfileId: string;
      versions: { metric: string; stepMin: number | null }[];
    };
    expect(body.clientProfileId).toBe(cp.id);
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0]).toMatchObject({
      metric: "steps",
      stepMin: 8000,
    });
  });

  it("a client requesting a foreign clientProfileId is refused before any read", async () => {
    const { w, client, foreignCp } = await setup();
    const res = await getRoute(
      w.id,
      foreignCp.id,
      await signInToken(client.email),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden" } });
  });

  it("an assigned coach reading a roster client keeps 200 with that client's versions", async () => {
    const { w, coach, cp } = await setup();
    const res = await getRoute(w.id, cp.id, await signInToken(coach.email));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      clientProfileId: string;
      versions: { metric: string; stepMin: number | null }[];
    };
    expect(body.clientProfileId).toBe(cp.id);
    expect(body.versions).toHaveLength(1);
  });
});
