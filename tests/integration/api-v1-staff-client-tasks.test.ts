import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET as getStaffTasks,
  POST as postStaffTask,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/tasks/route";
import {
  DELETE as deleteStaffTask,
  PATCH as patchStaffTask,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/tasks/[taskId]/staff/route";

/**
 * W2-A4 staff client-task routes on real PostgreSQL: assign, list, edit title
 * and dueDate, cancel. The staff PATCH body has no status field, so a coach
 * can never complete a client's task through it: completion stays client
 * owned on the own-scope route. Also covers the CAS 409, the role matrix and
 * the foreign profile / unknown task denials (403, never 404).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
// The task dueDate contract is bounded to server-UTC today + 5 years, so the
// fixtures stay relative and always future (dueState "upcoming").
const DAY_MS = 86400000;
const DUE_SOON = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10);
const DUE_LATER = new Date(Date.now() + 60 * DAY_MS).toISOString().slice(0, 10);

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

function listCall(
  workspaceId: string,
  clientProfileId: string,
  headers: Record<string, string> = {},
) {
  return getStaffTasks(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/tasks`,
      { method: "GET", headers },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function createCall(
  workspaceId: string,
  clientProfileId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return postStaffTask(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/tasks`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function patchTask(
  workspaceId: string,
  clientProfileId: string,
  taskId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return patchStaffTask(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/tasks/${taskId}/staff`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId, taskId }) },
  );
}

function deleteTask(
  workspaceId: string,
  clientProfileId: string,
  taskId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return deleteStaffTask(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/tasks/${taskId}/staff`,
      {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId, taskId }) },
  );
}

describe.skipIf(!enabled)("W2-A4 staff client task routes (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.215.0.${++n}`,
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

  async function workspaceWith(role: "WORKSPACE_OWNER" | "COACH" | "CLIENT") {
    const tag = `st${++n}_${Date.now()}`;
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
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
  ) {
    const tag = `sm${++n}_${Date.now()}`;
    const { user, email } = await userWithPassword(tag);
    const member = await prisma.workspaceMember.create({
      data: { workspaceId, userId: user.id, role, status: "ACTIVE" },
    });
    return { user, member, email };
  }

  async function clientProfile(workspaceId: string, name: string) {
    const clientUser = await prisma.user.create({
      data: {
        email: `scp${++n}_${Date.now()}@example.test`,
        name,
        status: "ACTIVE",
      },
    });
    return prisma.clientProfile.create({
      data: { workspaceId, userId: clientUser.id, name },
    });
  }

  async function assignCoach(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
  ) {
    return prisma.clientAssignment.create({
      data: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role: "COACH",
        status: "ACTIVE",
      },
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

  it("POST assigns a task and GET returns the literal staff task view", async () => {
    const { ws, member, email } = await workspaceWith("WORKSPACE_OWNER");
    const cp = await clientProfile(ws.id, "Assigned Client");
    const token = await signInToken(email);

    const created = await createCall(ws.id, cp.id, authed(token), {
      title: "Upload training log",
      dueDate: DUE_SOON,
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as {
      id: string;
      revision: number;
    };
    expect(createdBody).toEqual({ id: expect.any(String), revision: 1 });

    const list = await listCall(ws.id, cp.id, authed(token));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({
      tasks: [
        {
          id: createdBody.id,
          title: "Upload training log",
          dueDate: DUE_SOON,
          status: "OPEN",
          dueState: "upcoming",
          completedAt: null,
          assignedByMemberId: member.id,
          revision: 1,
        },
      ],
      hasMore: false,
    });

    const bad = await createCall(ws.id, cp.id, authed(token), {
      title: "No due date",
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: "invalid_input" } });
  });

  it("PATCH edits title and dueDate but can never complete the task", async () => {
    const { ws, email } = await workspaceWith("WORKSPACE_OWNER");
    const cp = await clientProfile(ws.id, "No Complete Client");
    const token = await signInToken(email);
    const created = (await (
      await createCall(ws.id, cp.id, authed(token), {
        title: "Log weight",
        dueDate: DUE_SOON,
      })
    ).json()) as { id: string };

    // A status field is not in the staff PATCH schema, so it is ignored: the
    // task stays OPEN and nothing changes.
    const statusAttempt = await patchTask(
      ws.id,
      cp.id,
      created.id,
      authed(token),
      {
        status: "COMPLETED",
        expectedRevision: 1,
      },
    );
    expect(statusAttempt.status).toBe(200);
    expect(await statusAttempt.json()).toEqual({ revision: 1, changed: false });
    expect(
      (
        await prisma.clientTask.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).status,
    ).toBe("OPEN");

    const completeAttempt = await patchTask(
      ws.id,
      cp.id,
      created.id,
      authed(token),
      { completed: true, expectedRevision: 1 },
    );
    expect(completeAttempt.status).toBe(200);
    expect(await completeAttempt.json()).toEqual({
      revision: 1,
      changed: false,
    });

    const edited = await patchTask(ws.id, cp.id, created.id, authed(token), {
      title: "Log weight and photos",
      dueDate: DUE_LATER,
      expectedRevision: 1,
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({ revision: 2, changed: true });

    const list = await listCall(ws.id, cp.id, authed(token));
    const body = (await list.json()) as {
      tasks: { title: string; dueDate: string; status: string }[];
    };
    expect(body.tasks[0]).toMatchObject({
      title: "Log weight and photos",
      dueDate: DUE_LATER,
      status: "OPEN",
    });

    // Same values again is a no-op.
    const replay = await patchTask(ws.id, cp.id, created.id, authed(token), {
      title: "Log weight and photos",
      expectedRevision: 2,
    });
    expect(await replay.json()).toEqual({ revision: 2, changed: false });
  });

  it("DELETE cancels the task and is terminal", async () => {
    const { ws, member, email } = await workspaceWith("WORKSPACE_OWNER");
    const cp = await clientProfile(ws.id, "Cancel Client");
    const token = await signInToken(email);
    const created = (await (
      await createCall(ws.id, cp.id, authed(token), {
        title: "Cancel me",
        dueDate: DUE_SOON,
      })
    ).json()) as { id: string };

    const res = await deleteTask(ws.id, cp.id, created.id, authed(token), {
      expectedRevision: 1,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 2, changed: true });

    const row = await prisma.clientTask.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.status).toBe("CANCELLED");
    expect(row.cancelledAt).not.toBeNull();
    expect(row.cancelledByMemberId).toBe(member.id);

    const again = await deleteTask(ws.id, cp.id, created.id, authed(token), {
      expectedRevision: 2,
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ revision: 2, changed: false });

    const editAfterCancel = await patchTask(
      ws.id,
      cp.id,
      created.id,
      authed(token),
      { title: "Too late", expectedRevision: 2 },
    );
    expect(editAfterCancel.status).toBe(403);
    expect(await editAfterCancel.json()).toEqual({
      error: { code: "not_available" },
    });
  });

  it("returns 409 on a stale expectedRevision for PATCH and DELETE", async () => {
    const { ws, email } = await workspaceWith("WORKSPACE_OWNER");
    const cp = await clientProfile(ws.id, "Conflict Client");
    const token = await signInToken(email);
    const created = (await (
      await createCall(ws.id, cp.id, authed(token), {
        title: "Contended",
        dueDate: DUE_SOON,
      })
    ).json()) as { id: string };

    const patchConflict = await patchTask(
      ws.id,
      cp.id,
      created.id,
      authed(token),
      { title: "Stale write", expectedRevision: 99 },
    );
    expect(patchConflict.status).toBe(409);
    expect(await patchConflict.json()).toEqual({ error: { code: "conflict" } });

    const deleteConflict = await deleteTask(
      ws.id,
      cp.id,
      created.id,
      authed(token),
      { expectedRevision: 99 },
    );
    expect(deleteConflict.status).toBe(409);
    expect(await deleteConflict.json()).toEqual({
      error: { code: "conflict" },
    });

    expect(
      (
        await prisma.clientTask.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).revision,
    ).toBe(1);
  });

  it("enforces the role matrix, the assigned coach scope and foreign denials", async () => {
    const a = await workspaceWith("WORKSPACE_OWNER");
    const b = await workspaceWith("WORKSPACE_OWNER");
    const cp = await clientProfile(a.ws.id, "Matrix Client");
    const assignedCoach = await addMember(a.ws.id, "COACH");
    const unassignedCoach = await addMember(a.ws.id, "COACH");
    const clientMember = await addMember(a.ws.id, "CLIENT");
    await assignCoach(a.ws.id, cp.id, assignedCoach.member.id);

    const ownerToken = await signInToken(a.email);
    const foreignToken = await signInToken(b.email);
    const assignedToken = await signInToken(assignedCoach.email);
    const unassignedToken = await signInToken(unassignedCoach.email);
    const clientToken = await signInToken(clientMember.email);

    const created = (await (
      await createCall(a.ws.id, cp.id, authed(ownerToken), {
        title: "Guarded",
        dueDate: DUE_SOON,
      })
    ).json()) as { id: string };

    // The assigned coach manages at assigned scope.
    expect((await listCall(a.ws.id, cp.id, authed(assignedToken))).status).toBe(
      200,
    );
    expect(
      (
        await patchTask(a.ws.id, cp.id, created.id, authed(assignedToken), {
          title: "Coach edit",
          expectedRevision: 1,
        })
      ).status,
    ).toBe(200);

    // A coach with no assignment is denied inside the transaction.
    const unassigned = await listCall(a.ws.id, cp.id, authed(unassignedToken));
    expect(unassigned.status).toBe(403);
    expect(await unassigned.json()).toEqual({ error: { code: "forbidden" } });

    const clientList = await listCall(a.ws.id, cp.id, authed(clientToken));
    expect(clientList.status).toBe(403);
    expect(await clientList.json()).toEqual({ error: { code: "forbidden" } });
    expect(
      (
        await createCall(a.ws.id, cp.id, authed(clientToken), {
          title: "Nope",
          dueDate: DUE_SOON,
        })
      ).status,
    ).toBe(403);

    expect((await listCall(a.ws.id, cp.id, authed(foreignToken))).status).toBe(
      403,
    );
    expect(
      (
        await deleteTask(a.ws.id, cp.id, created.id, authed(foreignToken), {
          expectedRevision: 2,
        })
      ).status,
    ).toBe(403);

    expect((await listCall(a.ws.id, cp.id)).status).toBe(401);
    expect(
      (
        await patchTask(
          a.ws.id,
          cp.id,
          created.id,
          {},
          {
            title: "Anon",
            expectedRevision: 2,
          },
        )
      ).status,
    ).toBe(401);

    // A profile outside the workspace never leaks: the list filters by
    // workspace and comes back empty, and a write against it is denied.
    const foreignProfile = await clientProfile(b.ws.id, "Foreign Client");
    const foreignProfileList = await listCall(
      a.ws.id,
      foreignProfile.id,
      authed(ownerToken),
    );
    expect(foreignProfileList.status).toBe(200);
    expect(await foreignProfileList.json()).toEqual({
      tasks: [],
      hasMore: false,
    });
    const foreignProfilePatch = await patchTask(
      a.ws.id,
      foreignProfile.id,
      "any-task",
      authed(ownerToken),
      { title: "Cross workspace", expectedRevision: 1 },
    );
    expect(foreignProfilePatch.status).toBe(403);
    expect(await foreignProfilePatch.json()).toEqual({
      error: { code: "forbidden" },
    });

    const unknownTask = await patchTask(
      a.ws.id,
      cp.id,
      "no-such-task",
      authed(ownerToken),
      { title: "Ghost", expectedRevision: 2 },
    );
    expect(unknownTask.status).toBe(403);
    expect(await unknownTask.json()).toEqual({
      error: { code: "not_available" },
    });
  });
});
