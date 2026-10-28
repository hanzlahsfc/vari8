import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET as getCoachTasks,
  POST as postCoachTask,
} from "../../app/api/v1/workspaces/[workspaceId]/coach-tasks/route";
import {
  DELETE as deleteCoachTask,
  PATCH as patchCoachTask,
} from "../../app/api/v1/workspaces/[workspaceId]/coach-tasks/[coachTaskId]/route";

/**
 * W2-A4 coach to-do routes on real PostgreSQL: workspace rows (clientProfileId
 * null) versus client rows, complete and reopen both stamping the caller
 * member, soft delete writing deletedAt plus a seven day restoreUntil, CAS
 * conflicts as 409, and the role matrix (coach 200, foreign member 403,
 * client 403, no credentials 401).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

function listCall(
  workspaceId: string,
  headers: Record<string, string> = {},
  clientProfileId?: string,
) {
  const query = clientProfileId
    ? `?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "";
  return getCoachTasks(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/coach-tasks${query}`,
      { method: "GET", headers },
    ),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function createCall(
  workspaceId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return postCoachTask(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/coach-tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function patchTask(
  workspaceId: string,
  coachTaskId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return patchCoachTask(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/coach-tasks/${coachTaskId}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, coachTaskId }) },
  );
}

function deleteTask(
  workspaceId: string,
  coachTaskId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return deleteCoachTask(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/coach-tasks/${coachTaskId}`,
      {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, coachTaskId }) },
  );
}

describe.skipIf(!enabled)("W2-A4 coach task routes (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.214.0.${++n}`,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  async function userWithPassword(tag: string) {
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
    return { user, email };
  }

  async function workspaceWith(
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT" | "ASSISTANT_COACH",
  ) {
    const tag = `tk${++n}_${Date.now()}`;
    const ws = await prisma.workspace.create({
      data: { name: tag, slug: tag, status: "ACTIVE" },
    });
    const { user, email } = await userWithPassword(tag);
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role, status: "ACTIVE" },
    });
    return { ws, user, member, email };
  }

  async function addMember(
    workspaceId: string,
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT" | "ASSISTANT_COACH",
  ) {
    const tag = `tm${++n}_${Date.now()}`;
    const { user, email } = await userWithPassword(tag);
    const member = await prisma.workspaceMember.create({
      data: { workspaceId, userId: user.id, role, status: "ACTIVE" },
    });
    return { user, member, email };
  }

  async function clientProfile(workspaceId: string, name: string) {
    const clientUser = await prisma.user.create({
      data: {
        email: `tcp${++n}_${Date.now()}@example.test`,
        name,
        status: "ACTIVE",
      },
    });
    return prisma.clientProfile.create({
      data: { workspaceId, userId: clientUser.id, name },
    });
  }

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({
      datasources: { db: { url: url as string } },
    });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "message_read","message_draft","message","conversation","coach_task","client_task","audit_event","client_week_note","client_phase","coach_note","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","sessions","accounts","rate_limit","verifications","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("POST creates a workspace to-do and a client to-do with the literal view", async () => {
    const { ws, member, email } = await workspaceWith("COACH");
    const cp = await clientProfile(ws.id, "Task Client");
    const token = await signInToken(email);

    const workspaceLevel = await createCall(ws.id, authed(token), {
      title: "  Order bands  ",
    });
    expect(workspaceLevel.status).toBe(200);
    const first = (await workspaceLevel.json()) as {
      coachTask: Record<string, unknown>;
    };
    expect(first.coachTask).toEqual({
      id: expect.any(String),
      clientProfileId: null,
      title: "Order bands",
      completedAt: null,
      completedByMemberId: null,
      createdByMemberId: member.id,
      revision: 1,
    });
    expect(
      await prisma.coachTask.findUniqueOrThrow({
        where: { id: first.coachTask.id as string },
      }),
    ).toMatchObject({ workspaceId: ws.id, title: "Order bands", revision: 1 });

    const clientLevel = await createCall(ws.id, authed(token), {
      title: "Review check-in",
      clientProfileId: cp.id,
    });
    expect(clientLevel.status).toBe(200);
    const second = (await clientLevel.json()) as {
      coachTask: Record<string, unknown>;
    };
    expect(second.coachTask).toEqual({
      id: expect.any(String),
      clientProfileId: cp.id,
      title: "Review check-in",
      completedAt: null,
      completedByMemberId: null,
      createdByMemberId: member.id,
      revision: 1,
    });

    const blank = await createCall(ws.id, authed(token), { title: "   " });
    expect(blank.status).toBe(400);
    const tooLong = await createCall(ws.id, authed(token), {
      title: "t".repeat(121),
    });
    expect(tooLong.status).toBe(400);
    const foreignClient = await createCall(ws.id, authed(token), {
      title: "Not mine",
      clientProfileId: "no-such-profile",
    });
    expect(foreignClient.status).toBe(403);
    expect(await foreignClient.json()).toEqual({
      error: { code: "not_available" },
    });
  });

  it("GET splits workspace rows from a client's rows", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await clientProfile(ws.id, "Scope Client");
    const token = await signInToken(email);

    for (const title of ["Workspace A", "Workspace B"]) {
      expect((await createCall(ws.id, authed(token), { title })).status).toBe(
        200,
      );
    }
    expect(
      (
        await createCall(ws.id, authed(token), {
          title: "Client A",
          clientProfileId: cp.id,
        })
      ).status,
    ).toBe(200);

    const workspaceList = await listCall(ws.id, authed(token));
    expect(workspaceList.status).toBe(200);
    const workspaceBody = (await workspaceList.json()) as {
      coachTasks: { title: string; clientProfileId: string | null }[];
    };
    expect(workspaceBody.coachTasks.map((t) => t.title)).toEqual([
      "Workspace A",
      "Workspace B",
    ]);
    expect(
      workspaceBody.coachTasks.every((t) => t.clientProfileId === null),
    ).toBe(true);

    const clientList = await listCall(ws.id, authed(token), cp.id);
    expect(clientList.status).toBe(200);
    const clientBody = (await clientList.json()) as {
      coachTasks: { title: string; clientProfileId: string | null }[];
    };
    expect(clientBody.coachTasks.map((t) => t.title)).toEqual(["Client A"]);
    expect(clientBody.coachTasks[0]!.clientProfileId).toBe(cp.id);
  });

  it("PATCH completes and reopens in both directions, stamping the caller", async () => {
    const { ws, member, email } = await workspaceWith("COACH");
    const token = await signInToken(email);
    const created = (await (
      await createCall(ws.id, authed(token), { title: "Complete me" })
    ).json()) as { coachTask: { id: string } };

    const done = await patchTask(ws.id, created.coachTask.id, authed(token), {
      completed: true,
    });
    expect(done.status).toBe(200);
    const doneBody = (await done.json()) as {
      coachTask: Record<string, unknown>;
    };
    expect(doneBody.coachTask).toEqual({
      id: created.coachTask.id,
      clientProfileId: null,
      title: "Complete me",
      completedAt: expect.any(String),
      completedByMemberId: member.id,
      createdByMemberId: member.id,
      revision: 2,
    });
    const row = await prisma.coachTask.findUniqueOrThrow({
      where: { id: created.coachTask.id },
    });
    expect(row.completedAt?.toISOString()).toBe(
      doneBody.coachTask.completedAt as string,
    );
    expect(row.completedByMemberId).toBe(member.id);

    // Replaying the same state is a no-op, not a second revision.
    const again = await patchTask(ws.id, created.coachTask.id, authed(token), {
      completed: true,
    });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { coachTask: { revision: number } }).coachTask.revision).toBe(2);

    const reopen = await patchTask(ws.id, created.coachTask.id, authed(token), {
      completed: false,
    });
    expect(reopen.status).toBe(200);
    const reopened = (await reopen.json()) as {
      coachTask: Record<string, unknown>;
    };
    expect(reopened.coachTask).toEqual({
      id: created.coachTask.id,
      clientProfileId: null,
      title: "Complete me",
      completedAt: null,
      completedByMemberId: null,
      createdByMemberId: member.id,
      revision: 3,
    });
    const afterReopen = await prisma.coachTask.findUniqueOrThrow({
      where: { id: created.coachTask.id },
    });
    expect(afterReopen.completedAt).toBeNull();
    expect(afterReopen.completedByMemberId).toBeNull();
  });

  it("DELETE soft deletes with a D24 restore window and hides the row", async () => {
    const { ws, member, email } = await workspaceWith("COACH");
    const token = await signInToken(email);
    const created = (await (
      await createCall(ws.id, authed(token), { title: "Delete me" })
    ).json()) as { coachTask: { id: string } };

    const res = await deleteTask(ws.id, created.coachTask.id, authed(token), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      coachTask: {
        id: created.coachTask.id,
        clientProfileId: null,
        title: "Delete me",
        completedAt: null,
        completedByMemberId: null,
        createdByMemberId: member.id,
        revision: 2,
      },
    });

    const row = await prisma.coachTask.findUniqueOrThrow({
      where: { id: created.coachTask.id },
    });
    expect(row.deletedAt).not.toBeNull();
    expect(row.restoreUntil).not.toBeNull();
    expect(row.restoreUntil!.getTime() - row.deletedAt!.getTime()).toBe(
      30_000,
    );

    const list = await listCall(ws.id, authed(token));
    expect(await list.json()).toEqual({ coachTasks: [] });

    // A soft deleted row is not available again.
    const second = await deleteTask(
      ws.id,
      created.coachTask.id,
      authed(token),
      {},
    );
    expect(second.status).toBe(403);
    expect(await second.json()).toEqual({ error: { code: "not_available" } });
  });

  it("returns 409 on a stale expectedRevision for PATCH and DELETE", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const token = await signInToken(email);
    const created = (await (
      await createCall(ws.id, authed(token), { title: "Contended" })
    ).json()) as { coachTask: { id: string } };

    const patchConflict = await patchTask(
      ws.id,
      created.coachTask.id,
      authed(token),
      { completed: true, expectedRevision: 99 },
    );
    expect(patchConflict.status).toBe(409);
    expect(await patchConflict.json()).toEqual({ error: { code: "conflict" } });
    expect(
      (
        await prisma.coachTask.findUniqueOrThrow({
          where: { id: created.coachTask.id },
        })
      ).revision,
    ).toBe(1);

    const deleteConflict = await deleteTask(
      ws.id,
      created.coachTask.id,
      authed(token),
      { expectedRevision: 99 },
    );
    expect(deleteConflict.status).toBe(409);
    expect(await deleteConflict.json()).toEqual({ error: { code: "conflict" } });

    // The current revision goes through.
    const ok = await patchTask(ws.id, created.coachTask.id, authed(token), {
      completed: true,
      expectedRevision: 1,
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { coachTask: { revision: number } }).coachTask.revision).toBe(2);
  });

  it("enforces the role matrix and never answers 404", async () => {
    const a = await workspaceWith("COACH");
    const b = await workspaceWith("COACH");
    const clientMember = await addMember(a.ws.id, "CLIENT");
    const assistant = await addMember(a.ws.id, "ASSISTANT_COACH");
    const cp = await clientProfile(a.ws.id, "Matrix Client");

    const coachToken = await signInToken(a.email);
    const foreignToken = await signInToken(b.email);
    const clientToken = await signInToken(clientMember.email);
    const assistantToken = await signInToken(assistant.email);

    const created = (await (
      await createCall(a.ws.id, authed(coachToken), {
        title: "Guarded",
        clientProfileId: cp.id,
      })
    ).json()) as { coachTask: { id: string } };

    expect((await listCall(a.ws.id, authed(coachToken))).status).toBe(200);

    const clientList = await listCall(a.ws.id, authed(clientToken));
    expect(clientList.status).toBe(403);
    expect(await clientList.json()).toEqual({ error: { code: "forbidden" } });

    const clientCreate = await createCall(a.ws.id, authed(clientToken), {
      title: "Nope",
    });
    expect(clientCreate.status).toBe(403);

    const assistantCreate = await createCall(a.ws.id, authed(assistantToken), {
      title: "Nope",
    });
    expect(assistantCreate.status).toBe(403);

    const foreignList = await listCall(a.ws.id, authed(foreignToken));
    expect(foreignList.status).toBe(403);
    const foreignCreate = await createCall(a.ws.id, authed(foreignToken), {
      title: "Nope",
    });
    expect(foreignCreate.status).toBe(403);
    const foreignPatch = await patchTask(
      a.ws.id,
      created.coachTask.id,
      authed(foreignToken),
      { completed: true },
    );
    expect(foreignPatch.status).toBe(403);

    const anonList = await listCall(a.ws.id);
    expect(anonList.status).toBe(401);
    expect(await anonList.json()).toEqual({
      error: { code: "unauthenticated" },
    });
    expect((await createCall(a.ws.id, {}, { title: "Nope" })).status).toBe(401);
    expect(
      (await patchTask(a.ws.id, created.coachTask.id, {}, { completed: true }))
        .status,
    ).toBe(401);
    expect((await deleteTask(a.ws.id, created.coachTask.id, {}, {})).status).toBe(
      401,
    );

    // Unknown ids stay 403 not_available, never 404.
    const unknown = await patchTask(a.ws.id, "no-such-task", authed(coachToken), {
      completed: true,
    });
    expect(unknown.status).toBe(403);
    expect(await unknown.json()).toEqual({ error: { code: "not_available" } });
  });
});
