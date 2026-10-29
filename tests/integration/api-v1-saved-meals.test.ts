import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { GET as GET_LIBRARY } from "../../app/api/v1/saved-meals/[workspaceId]/route";
import { PUT as PUT_SAVED_MEAL } from "../../app/api/v1/saved-meals/[workspaceId]/[savedMealId]/route";
import { POST as POST_ASSIGN } from "../../app/api/v1/saved-meals/[workspaceId]/[savedMealId]/assignments/route";
import { GET as GET_ASSIGNED } from "../../app/api/v1/saved-meals/[workspaceId]/assigned/route";

/**
 * T7 (R6) end-to-end contract on real PG: the staff saved-meal library
 * upsert and list under `library.manage`, the assign write that produces a
 * new client-owned meal row with its own id detached from the library row,
 * and the client-visible assigned list under `clientData.read` (own scope,
 * cross-client denial).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function authed(
  path: string,
  method: string,
  token: string | null,
  body?: unknown,
) {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const getLibrary = (workspaceId: string, token: string | null) =>
  GET_LIBRARY(authed(`/api/v1/saved-meals/${workspaceId}`, "GET", token), {
    params: Promise.resolve({ workspaceId }),
  });

const putSavedMeal = (
  workspaceId: string,
  id: string,
  token: string | null,
  body: unknown,
) =>
  PUT_SAVED_MEAL(
    authed(`/api/v1/saved-meals/${workspaceId}/${id}`, "PUT", token, body),
    { params: Promise.resolve({ workspaceId, savedMealId: id }) },
  );

const postAssign = (
  workspaceId: string,
  id: string,
  token: string | null,
  clientProfileId: string,
) =>
  POST_ASSIGN(
    authed(
      `/api/v1/saved-meals/${workspaceId}/${id}/assignments`,
      "POST",
      token,
      {
        clientProfileId,
      },
    ),
    { params: Promise.resolve({ workspaceId, savedMealId: id }) },
  );

const getAssigned = (
  workspaceId: string,
  token: string | null,
  clientProfileId?: string,
) =>
  GET_ASSIGNED(
    authed(
      `/api/v1/saved-meals/${workspaceId}/assigned${clientProfileId ? `?clientProfileId=${clientProfileId}` : ""}`,
      "GET",
      token,
    ),
    { params: Promise.resolve({ workspaceId }) },
  );

function mealPayload(id: string) {
  return {
    id,
    label: "Breakfast",
    time: "08:00",
    portions: [{ foodId: "oats", quantity: 80 }],
  };
}

describe.skipIf(!enabled)(
  "T7 /api/v1/saved-meals library + assignment (real PG)",
  () => {
    let prisma: PrismaClient;
    let n = 0;
    const PASSWORD = "fixture-pass-1";

    async function signInToken(email: string) {
      const res = await auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.240.0.${++n}`,
          },
          body: JSON.stringify({ email, password: PASSWORD }),
        }),
      );
      expect(res.status).toBe(200);
      const token = res.headers.get("set-auth-token");
      expect(token).toBeTruthy();
      return token as string;
    }

    async function member(
      workspaceId: string,
      role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
      clientName?: string,
    ) {
      const tag = `m${++n}_${Date.now()}`;
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
      await prisma.workspaceMember.create({
        data: { workspaceId, userId: user.id, role, status: "ACTIVE" },
      });
      const clientProfile = clientName
        ? await prisma.clientProfile.create({
            data: { workspaceId, userId: user.id, name: clientName },
          })
        : null;
      return { user, email, clientProfile };
    }

    async function workspace() {
      const tag = `ws${++n}_${Date.now()}`;
      return prisma.workspace.create({
        data: { name: tag, slug: tag, status: "ACTIVE" },
      });
    }

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: url },
        stdio: "pipe",
      });
      prisma = new PrismaClient({ datasources: { db: { url } } });
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("staff upserts and lists a library saved meal", async () => {
      const ws = await workspace();
      const owner = await member(ws.id, "WORKSPACE_OWNER");
      const token = await signInToken(owner.email);

      const put = await putSavedMeal(ws.id, "sm_one", token, {
        name: "High protein breakfast",
        sortOrder: 3,
        meal: mealPayload("m_inner_1"),
      });
      expect(put.status).toBe(200);
      const putBody = await put.json();
      expect(putBody.savedMeal.id).toBe("sm_one");
      expect(putBody.savedMeal.name).toBe("High protein breakfast");

      const list = await getLibrary(ws.id, token);
      expect(list.status).toBe(200);
      const listBody = await list.json();
      expect(listBody.items).toHaveLength(1);
      expect(listBody.items[0].id).toBe("sm_one");
      expect(listBody.items[0].assignedClientProfileIds).toEqual([]);

      const update = await putSavedMeal(ws.id, "sm_one", token, {
        name: "Renamed",
        meal: mealPayload("m_inner_1"),
      });
      expect(update.status).toBe(200);
      const relist = await (await getLibrary(ws.id, token)).json();
      expect(relist.items[0].name).toBe("Renamed");
    });

    it("assign produces a new client-owned meal with its own id; library row unchanged", async () => {
      const ws = await workspace();
      const owner = await member(ws.id, "WORKSPACE_OWNER");
      const client = await member(ws.id, "CLIENT", "Ana");
      const token = await signInToken(owner.email);

      await putSavedMeal(ws.id, "sm_a", token, {
        name: "Meal A",
        meal: mealPayload("m_inner_a"),
      });
      const before = await prisma.savedMeal.findUniqueOrThrow({
        where: { id_workspaceId: { id: "sm_a", workspaceId: ws.id } },
      });

      const res = await postAssign(
        ws.id,
        "sm_a",
        token,
        client.clientProfile!.id,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const copy = body.clientMeal;
      expect(copy.id).toBeTruthy();
      expect(copy.id).not.toBe("sm_a");
      expect(copy.clientProfileId).toBe(client.clientProfile!.id);
      expect(copy.sourceSavedMealId).toBe("sm_a");
      expect(copy.name).toBe("Meal A");
      expect(copy.meal.id).not.toBe("m_inner_a");
      expect(copy.meal.portions).toEqual(mealPayload("x").portions);

      const after = await prisma.savedMeal.findUniqueOrThrow({
        where: { id_workspaceId: { id: "sm_a", workspaceId: ws.id } },
      });
      expect(after.name).toBe(before.name);
      expect(after.meal).toEqual(before.meal);
      expect(after.revision).toBe(before.revision);
      expect(after.clientProfileId).toBeNull();
    });

    it("re-assigning produces a second independent client-owned row", async () => {
      const ws = await workspace();
      const owner = await member(ws.id, "WORKSPACE_OWNER");
      const client = await member(ws.id, "CLIENT", "Ben");
      const token = await signInToken(owner.email);

      await putSavedMeal(ws.id, "sm_b", token, {
        name: "Meal B",
        meal: mealPayload("m_inner_b"),
      });
      const r1 = await (
        await postAssign(ws.id, "sm_b", token, client.clientProfile!.id)
      ).json();
      const r2 = await (
        await postAssign(ws.id, "sm_b", token, client.clientProfile!.id)
      ).json();
      expect(r1.clientMeal.id).not.toBe(r2.clientMeal.id);

      const rows = await prisma.savedMeal.findMany({
        where: {
          workspaceId: ws.id,
          clientProfileId: client.clientProfile!.id,
        },
      });
      expect(rows).toHaveLength(2);
      const ids = new Set(rows.map((row) => row.id));
      expect(ids.size).toBe(2);

      const lib = await prisma.savedMeal.findUniqueOrThrow({
        where: { id_workspaceId: { id: "sm_b", workspaceId: ws.id } },
      });
      expect(lib.clientProfileId).toBeNull();
    });

    it("client read is own-scoped: own copies visible, other clients denied", async () => {
      const ws = await workspace();
      const owner = await member(ws.id, "WORKSPACE_OWNER");
      const clientA = await member(ws.id, "CLIENT", "Cat");
      const clientB = await member(ws.id, "CLIENT", "Dan");
      const ownerToken = await signInToken(owner.email);
      const tokenA = await signInToken(clientA.email);
      const tokenB = await signInToken(clientB.email);

      await putSavedMeal(
        ws.id,
        "sm_c",
        tokenA === "" ? ownerToken : ownerToken,
        {
          name: "Meal C",
          meal: mealPayload("m_inner_c"),
        },
      );
      await postAssign(ws.id, "sm_c", ownerToken, clientA.clientProfile!.id);

      const ownList = await getAssigned(ws.id, tokenA);
      expect(ownList.status).toBe(200);
      const ownBody = await ownList.json();
      expect(ownBody.items).toHaveLength(1);
      expect(ownBody.items[0].name).toBe("Meal C");
      expect(ownBody.items[0].sourceSavedMealId).toBe("sm_c");

      const otherList = await getAssigned(ws.id, tokenB);
      expect(otherList.status).toBe(200);
      const otherBody = await otherList.json();
      expect(otherBody.items).toHaveLength(0);

      const spoof = await getAssigned(ws.id, tokenA, clientB.clientProfile!.id);
      expect(spoof.status).toBe(403);

      const staffPreview = await getAssigned(
        ws.id,
        ownerToken,
        clientA.clientProfile!.id,
      );
      expect(staffPreview.status).toBe(200);
      const staffBody = await staffPreview.json();
      expect(staffBody.items).toHaveLength(1);
    });

    it("write paths deny clients and cross-workspace targets", async () => {
      const ws = await workspace();
      const ws2 = await workspace();
      const owner = await member(ws.id, "WORKSPACE_OWNER");
      const client = await member(ws.id, "CLIENT", "Eli");
      const foreign = await member(ws2.id, "CLIENT", "Far");
      const ownerToken = await signInToken(owner.email);
      const clientToken = await signInToken(client.email);

      const clientPut = await putSavedMeal(ws.id, "sm_d", clientToken, {
        name: "Nope",
        meal: mealPayload("m_inner_d"),
      });
      expect(clientPut.status).toBe(403);

      const clientAssign = await postAssign(
        ws.id,
        "sm_d",
        clientToken,
        client.clientProfile!.id,
      );
      expect(clientAssign.status).toBe(403);

      await putSavedMeal(ws.id, "sm_d", ownerToken, {
        name: "Meal D",
        meal: mealPayload("m_inner_d"),
      });
      const missing = await postAssign(
        ws.id,
        "sm_missing",
        ownerToken,
        client.clientProfile!.id,
      );
      expect(missing.status).toBe(404);

      const foreignClient = await postAssign(
        ws.id,
        "sm_d",
        ownerToken,
        foreign.clientProfile!.id,
      );
      expect(foreignClient.status).toBe(404);

      const unauth = await getLibrary(ws.id, null);
      expect(unauth.status).toBe(401);
    });

    it("PUT on a client-owned copy row is not found through the library route", async () => {
      const ws = await workspace();
      const owner = await member(ws.id, "WORKSPACE_OWNER");
      const client = await member(ws.id, "CLIENT", "Fox");
      const token = await signInToken(owner.email);

      await putSavedMeal(ws.id, "sm_e", token, {
        name: "Meal E",
        meal: mealPayload("m_inner_e"),
      });
      const res = await postAssign(
        ws.id,
        "sm_e",
        token,
        client.clientProfile!.id,
      );
      const body = await res.json();
      const copyId = body.clientMeal.id;

      const putCopy = await putSavedMeal(ws.id, copyId, token, {
        name: "Tamper",
        meal: mealPayload("m_inner_e"),
      });
      expect(putCopy.status).toBe(404);

      const assignCopy = await postAssign(
        ws.id,
        copyId,
        token,
        client.clientProfile!.id,
      );
      expect(assignCopy.status).toBe(404);
    });
  },
);
