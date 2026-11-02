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
} from "../../app/api/v1/workspaces/[workspaceId]/coach-tasks/[taskId]/route";
import { POST as restoreCoachTask } from "../../app/api/v1/workspaces/[workspaceId]/coach-tasks/[taskId]/restore/route";

/**
 * Coach to-do routes on real PostgreSQL (Beta contract): workspace rows
 * (clientProfileId null) versus client rows, explicit complete/reopen via
 * `complete` + `expectedRevision`, soft delete with the 30 second D24 undo
 * window and the restore route, CAS conflicts as 409, and the role matrix
 * (owner/coach 200, client + assistant + foreign member 403, anonymous 401,
 * unknown or cross-workspace task id 404 not_available).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

type Headers = Record<string, string>;
type TaskView = {
  id: string;
  clientProfileId: string | null;
  title: string;
  complete: boolean;
  completedAt: string | null;
  createdByMemberId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

const base = (workspaceId: string) =>
  `${BASE}/api/v1/workspaces/${workspaceId}/coach-tasks`;

function listCall(
  workspaceId: string,
  headers: Headers = {},
  clientProfileId?: string,
) {
  const query = clientProfileId
    ? `?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "";
  return getCoachTasks(
    new Request(`${base(workspaceId)}${query}`, { method: "GET", headers }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function createCall(
  workspaceId: string,
  headers: Headers = {},
  body?: unknown,
) {
  return postCoachTask(
    new Request(base(workspaceId), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function patchTask(
  workspaceId: string,
  taskId: string,
  headers: Headers = {},
  body?: unknown,
) {
  return patchCoachTask(
    new Request(`${base(workspaceId)}/${taskId}`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId, taskId }) },
  );
}

function deleteTask(
  workspaceId: string,
  taskId: string,
  headers: Headers = {},
  expectedRevision?: number,
) {
  const query =
    expectedRevision === undefined
      ? ""
      : `?expectedRevision=${expectedRevision}`;
  return deleteCoachTask(
    new Request(`${base(workspaceId)}/${taskId}${query}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ workspaceId, taskId }) },
  );
}

function restoreTask(
  workspaceId: string,
  taskId: string,
  headers: Headers = {},
) {
  return restoreCoachTask(
    new Request(`${base(workspaceId)}/${taskId}/restore`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ workspaceId, taskId }) },
  );
}

describe.skipIf(!enabled)("coach task routes (real PG)", () => {
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

  async function create(
    workspaceId: string,
    token: string,
    body: unknown,
  ): Promise<{ id: string; revision: number }> {
    const res = await createCall(workspaceId, authed(token), body);
    expect(res.status).toBe(200);
    return (await res.json()) as { id: string; revision: number };
  }

  async function list(
    workspaceId: string,
    token: string,
    clientProfileId?: string,
  ) {
    const res = await listCall(workspaceId, authed(token), clientProfileId);
    expect(res.status).toBe(200);
    return (await res.json()) as { tasks: TaskView[]; hasMore: boolean };
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

    const first = await create(ws.id, token, { title: "  Order bands  " });
    expect(first).toEqual({ id: expect.any(String), revision: 1 });
    expect(
      await prisma.coachTask.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({
      workspaceId: ws.id,
      clientProfileId: null,
      title: "Order bands",
      revision: 1,
      createdByMemberId: member.id,
    });

    const second = await create(ws.id, token, {
      title: "Review check-in",
      clientProfileId: cp.id,
    });
    expect(second.revision).toBe(1);

    const { tasks } = await list(ws.id, token);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(byId.get(first.id)).toEqual({
      id: first.id,
      clientProfileId: null,
      title: "Order bands",
      complete: false,
      completedAt: null,
      createdByMemberId: member.id,
      revision: 1,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(byId.get(second.id)).toEqual({
      id: second.id,
      clientProfileId: cp.id,
      title: "Review check-in",
      complete: false,
      completedAt: null,
      createdByMemberId: member.id,
      revision: 1,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const blank = await createCall(ws.id, authed(token), { title: "   " });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: { code: "invalid_input" } });
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
      error: { code: "forbidden" },
    });
  });

  it("GET lists every live row, or only one client's rows with ?clientProfileId", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await clientProfile(ws.id, "Scope Client");
    const token = await signInToken(email);

    await create(ws.id, token, { title: "Workspace A" });
    await create(ws.id, token, { title: "Workspace B" });
    await create(ws.id, token, { title: "Client A", clientProfileId: cp.id });

    // Beta: the unfiltered list returns workspace and client rows together;
    // the split is the clientProfileId field (null = workspace-level).
    const all = await list(ws.id, token);
    expect(all.hasMore).toBe(false);
    expect(all.tasks.map((t) => [t.title, t.clientProfileId]).sort()).toEqual([
      ["Client A", cp.id],
      ["Workspace A", null],
      ["Workspace B", null],
    ]);
    expect(
      all.tasks
        .filter((t) => t.clientProfileId === null)
        .map((t) => t.title)
        .sort(),
    ).toEqual(["Workspace A", "Workspace B"]);

    const forClient = await list(ws.id, token, cp.id);
    expect(forClient.tasks.map((t) => t.title)).toEqual(["Client A"]);
    expect(forClient.tasks[0]!.clientProfileId).toBe(cp.id);

    const foreign = await listCall(ws.id, authed(token), "no-such-profile");
    expect(foreign.status).toBe(403);
  });

  it("PATCH completes and reopens in both directions, stamping the caller", async () => {
    const { ws, member, email } = await workspaceWith("COACH");
    const token = await signInToken(email);
    const task = await create(ws.id, token, { title: "Complete me" });

    const done = await patchTask(ws.id, task.id, authed(token), {
      complete: true,
      expectedRevision: 1,
    });
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({
      revision: 2,
      complete: true,
      changed: true,
    });
    const row = await prisma.coachTask.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(row.completedAt).not.toBeNull();
    expect(row.completedByMemberId).toBe(member.id);
    const listed = (await list(ws.id, token)).tasks[0]!;
    expect(listed).toMatchObject({
      id: task.id,
      complete: true,
      completedAt: row.completedAt!.toISOString(),
      revision: 2,
    });

    // Replaying the same desired state is a no-op, not a second revision.
    const again = await patchTask(ws.id, task.id, authed(token), {
      complete: true,
      expectedRevision: 2,
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      revision: 2,
      complete: true,
      changed: false,
    });

    const reopen = await patchTask(ws.id, task.id, authed(token), {
      complete: false,
      expectedRevision: 2,
    });
    expect(reopen.status).toBe(200);
    expect(await reopen.json()).toEqual({
      revision: 3,
      complete: false,
      changed: true,
    });
    const afterReopen = await prisma.coachTask.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(afterReopen.completedAt).toBeNull();
    expect(afterReopen.completedByMemberId).toBeNull();

    const retitle = await patchTask(ws.id, task.id, authed(token), {
      title: "  Renamed  ",
      expectedRevision: 3,
    });
    expect(retitle.status).toBe(200);
    expect(await retitle.json()).toEqual({ revision: 4, changed: true });
    expect((await list(ws.id, token)).tasks[0]!.title).toBe("Renamed");

    const empty = await patchTask(ws.id, task.id, authed(token), {
      expectedRevision: 4,
    });
    expect(empty.status).toBe(400);
  });

  it("DELETE soft deletes with the 30 second undo window, restore reverses it", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const token = await signInToken(email);
    const task = await create(ws.id, token, { title: "Delete me" });

    const res = await deleteTask(ws.id, task.id, authed(token), 1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 2, changed: true });

    // Beta window is 30 s (RESTORE_WINDOW_MS), not the old 7 days.
    const row = await prisma.coachTask.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(row.deletedAt).not.toBeNull();
    expect(row.restoreUntil!.getTime() - row.deletedAt!.getTime()).toBe(30_000);
    expect((await list(ws.id, token)).tasks).toEqual([]);

    // Replaying delete at the current revision is a no-op.
    const replay = await deleteTask(ws.id, task.id, authed(token), 2);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ revision: 2, changed: false });

    // A deleted row cannot be edited.
    const edit = await patchTask(ws.id, task.id, authed(token), {
      complete: true,
      expectedRevision: 2,
    });
    expect(edit.status).toBe(404);
    expect(await edit.json()).toEqual({ error: { code: "not_available" } });

    const restored = await restoreTask(ws.id, task.id, authed(token));
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ revision: 3, changed: true });
    const back = await prisma.coachTask.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(back.deletedAt).toBeNull();
    expect(back.restoreUntil).toBeNull();
    expect((await list(ws.id, token)).tasks.map((t) => t.id)).toEqual([
      task.id,
    ]);

    // Once the window closes the row cannot come back.
    const gone = await create(ws.id, token, { title: "Too late" });
    expect((await deleteTask(ws.id, gone.id, authed(token), 1)).status).toBe(
      200,
    );
    await prisma.coachTask.update({
      where: { id: gone.id },
      data: {
        deletedAt: new Date(Date.now() - 60_000),
        restoreUntil: new Date(Date.now() - 30_000),
      },
    });
    const late = await restoreTask(ws.id, gone.id, authed(token));
    expect(late.status).toBe(404);
    expect(await late.json()).toEqual({ error: { code: "not_available" } });
  });

  it("returns 409 on a stale expectedRevision for PATCH and DELETE", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const token = await signInToken(email);
    const task = await create(ws.id, token, { title: "Contended" });

    const patchConflict = await patchTask(ws.id, task.id, authed(token), {
      complete: true,
      expectedRevision: 99,
    });
    expect(patchConflict.status).toBe(409);
    expect(await patchConflict.json()).toEqual({ error: { code: "conflict" } });
    expect(
      (await prisma.coachTask.findUniqueOrThrow({ where: { id: task.id } }))
        .revision,
    ).toBe(1);

    const deleteConflict = await deleteTask(ws.id, task.id, authed(token), 99);
    expect(deleteConflict.status).toBe(409);
    expect(await deleteConflict.json()).toEqual({
      error: { code: "conflict" },
    });
    expect(
      (await prisma.coachTask.findUniqueOrThrow({ where: { id: task.id } }))
        .deletedAt,
    ).toBeNull();

    // The current revision goes through.
    const ok = await patchTask(ws.id, task.id, authed(token), {
      complete: true,
      expectedRevision: 1,
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      revision: 2,
      complete: true,
      changed: true,
    });
  });

  it("enforces the role matrix: 401, 403 for non-staff, 404 only for unknown ids", async () => {
    const a = await workspaceWith("COACH");
    const b = await workspaceWith("COACH");
    const owner = await addMember(a.ws.id, "WORKSPACE_OWNER");
    const clientMember = await addMember(a.ws.id, "CLIENT");
    const assistant = await addMember(a.ws.id, "ASSISTANT_COACH");
    const cp = await clientProfile(a.ws.id, "Matrix Client");

    const coachToken = await signInToken(a.email);
    const ownerToken = await signInToken(owner.email);
    const foreignToken = await signInToken(b.email);
    const clientToken = await signInToken(clientMember.email);
    const assistantToken = await signInToken(assistant.email);

    const task = await create(a.ws.id, coachToken, {
      title: "Guarded",
      clientProfileId: cp.id,
    });

    // Owner has staff access too.
    expect((await listCall(a.ws.id, authed(ownerToken))).status).toBe(200);
    const ownerEdit = await patchTask(a.ws.id, task.id, authed(ownerToken), {
      complete: true,
      expectedRevision: 1,
    });
    expect(ownerEdit.status).toBe(200);

    const forbidden = { error: { code: "forbidden" } };
    for (const token of [clientToken, assistantToken, foreignToken]) {
      const h = authed(token);
      const calls = [
        await listCall(a.ws.id, h),
        await createCall(a.ws.id, h, { title: "Nope" }),
        await patchTask(a.ws.id, task.id, h, {
          complete: false,
          expectedRevision: 2,
        }),
        await deleteTask(a.ws.id, task.id, h, 2),
        await restoreTask(a.ws.id, task.id, h),
      ];
      for (const res of calls) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual(forbidden);
      }
    }
    // The denied calls changed nothing.
    expect(
      await prisma.coachTask.findUniqueOrThrow({ where: { id: task.id } }),
    ).toMatchObject({ revision: 2, deletedAt: null });

    const anonList = await listCall(a.ws.id);
    expect(anonList.status).toBe(401);
    expect(await anonList.json()).toEqual({
      error: { code: "unauthenticated" },
    });
    expect((await createCall(a.ws.id, {}, { title: "Nope" })).status).toBe(401);
    expect(
      (
        await patchTask(
          a.ws.id,
          task.id,
          {},
          {
            complete: true,
            expectedRevision: 2,
          },
        )
      ).status,
    ).toBe(401);
    expect((await deleteTask(a.ws.id, task.id, {}, 2)).status).toBe(401);
    expect((await restoreTask(a.ws.id, task.id)).status).toBe(401);

    // Beta answers 404 not_available for an unknown id, and for another
    // workspace's task id used by a coach of this workspace.
    const unknown = await patchTask(
      a.ws.id,
      "no-such-task",
      authed(coachToken),
      { complete: true, expectedRevision: 1 },
    );
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: { code: "not_available" } });
    const foreignTask = await create(b.ws.id, foreignToken, {
      title: "Theirs",
    });
    const cross = await patchTask(a.ws.id, foreignTask.id, authed(coachToken), {
      complete: true,
      expectedRevision: 1,
    });
    expect(cross.status).toBe(404);
    expect(
      (
        await prisma.coachTask.findUniqueOrThrow({
          where: { id: foreignTask.id },
        })
      ).revision,
    ).toBe(1);
  });
});
