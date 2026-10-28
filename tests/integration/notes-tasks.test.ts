import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { AccessDeniedError } from "../../lib/auth/guard";
import { hashPassword } from "../../lib/password";
import { listClientVisibleNotes } from "../../lib/notes/service";
import {
  listTrackerComments,
  saveTrackerComment,
} from "../../lib/tracker-comments/service";
import {
  GET as notesGET,
  POST as notesPOST,
} from "../../app/api/v1/workspaces/[workspaceId]/notes/route";
import {
  PATCH as notePATCH,
  DELETE as noteDELETE,
} from "../../app/api/v1/workspaces/[workspaceId]/notes/[noteId]/route";
import { POST as noteRestorePOST } from "../../app/api/v1/workspaces/[workspaceId]/notes/[noteId]/restore/route";
import {
  GET as tasksGET,
  POST as tasksPOST,
} from "../../app/api/v1/workspaces/[workspaceId]/coach-tasks/route";
import { PATCH as taskPATCH } from "../../app/api/v1/workspaces/[workspaceId]/coach-tasks/[taskId]/route";

/**
 * PR-M3 behaviour test — drives the note and coach-task routes the way a
 * caller does (real Request, bearer credential from a real sign-in) and
 * asserts the literal contract: staff read/write, client 403 on every
 * route (D26), foreign workspace 403, unauthenticated 401, the GENERAL-
 * note client rule, the D24 delete/restore window, and audit metadata
 * carrying ids + `changed` markers only — never body or title text.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function call(
  handler: (
    request: Request,
    routeCtx: { params: Promise<unknown> },
  ) => Promise<Response>,
  path: string,
  params: Record<string, string>,
  init: { method?: string; token?: string; body?: unknown; qs?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return handler(
    new Request(`${BASE}${path}${init.qs ?? ""}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    { params: Promise.resolve(params) },
  );
}

describe.skipIf(!enabled)("PR-M3 notes + coach tasks (real PG)", () => {
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

  async function workspaceWith(role: "WORKSPACE_OWNER" | "COACH" | "CLIENT") {
    const tag = `w${++n}_${Date.now()}`;
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
    return { ws, user, member, email };
  }

  const profile = (workspaceId: string, name = `C ${++n}`) =>
    prisma.clientProfile.create({ data: { workspaceId, name } });

  const param = (workspaceId: string, memberId: string) =>
    prisma.parameterDefinition.create({
      data: {
        workspaceId,
        key: `p_${++n}_${Date.now()}`,
        kind: "MEASUREMENT",
        label: `L ${n}`,
        createdByMemberId: memberId,
        updatedByMemberId: memberId,
      },
    });

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "rate_limit","verifications","sessions","accounts","tracker_comment","coach_task","coach_note","parameter_definition","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("staff create and list notes; a client gets 403 on every note route", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await profile(ws.id);
    const token = await signInToken(email);
    const path = `/api/v1/workspaces/${ws.id}/notes`;
    const params = { workspaceId: ws.id };

    const created = await call(notesPOST, path, params, {
      method: "POST",
      token,
      body: {
        clientProfileId: cp.id,
        visibility: "PRIVATE",
        body: "Check knee valgus on split squats.",
      },
    });
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.revision).toBe(1);
    const noteId = createdBody.id as string;

    // The workspace-level GET without a query answers the canvas
    // { notes: [{ id, text }] } envelope for clientProfileId-null notes
    // only; the client note lists under the ?clientProfileId= read.
    const listed = await call(
      notesGET,
      `${path}?clientProfileId=${cp.id}`,
      params,
      {
        token,
      },
    );
    expect(listed.status).toBe(200);
    const list = await listed.json();
    expect(list.hasMore).toBe(false);
    expect(list.notes).toHaveLength(1);
    expect(list.notes[0]).toMatchObject({
      id: noteId,
      clientProfileId: cp.id,
      visibility: "PRIVATE",
      body: "Check knee valgus on split squats.",
      revision: 1,
    });

    // A CLIENT member of the same workspace: 403 on every note route.
    const client = await workspaceWith("CLIENT");
    await prisma.workspaceMember.delete({ where: { id: client.member.id } });
    const clientMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: client.user.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    expect(clientMember.role).toBe("CLIENT");
    const clientToken = await signInToken(client.email);
    for (const res of [
      await call(notesGET, path, params, { token: clientToken }),
      await call(notesPOST, path, params, {
        method: "POST",
        token: clientToken,
        body: { visibility: "PRIVATE", body: "sneaky" },
      }),
      await call(
        notePATCH,
        `${path}/${noteId}`,
        {
          workspaceId: ws.id,
          noteId,
        },
        {
          method: "PATCH",
          token: clientToken,
          body: { body: "x", expectedRevision: 1 },
        },
      ),
      await call(
        noteDELETE,
        `${path}/${noteId}`,
        {
          workspaceId: ws.id,
          noteId,
        },
        { method: "DELETE", token: clientToken, qs: "?expectedRevision=1" },
      ),
      await call(
        noteRestorePOST,
        `${path}/${noteId}/restore`,
        {
          workspaceId: ws.id,
          noteId,
        },
        { method: "POST", token: clientToken },
      ),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden" } });
    }
  });

  it("rejects a GENERAL note without a client; audit carries no body text", async () => {
    const { ws, email } = await workspaceWith("WORKSPACE_OWNER");
    const token = await signInToken(email);
    const path = `/api/v1/workspaces/${ws.id}/notes`;

    const bad = await call(
      notesPOST,
      path,
      { workspaceId: ws.id },
      {
        method: "POST",
        token,
        body: { visibility: "GENERAL", body: "no client named" },
      },
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: { code: "invalid_input" },
    });

    const cp = await profile(ws.id);
    const good = await call(
      notesPOST,
      path,
      { workspaceId: ws.id },
      {
        method: "POST",
        token,
        body: {
          clientProfileId: cp.id,
          visibility: "GENERAL",
          body: "Prefers morning training.",
        },
      },
    );
    expect(good.status).toBe(200);
    const { id } = await good.json();

    const events = await prisma.auditEvent.findMany({
      where: { workspaceId: ws.id, resourceType: "coach_note" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "CREATE",
      resourceId: id,
      subjectClientProfileId: cp.id,
      result: "ALLOW",
    });
    // Structural only: the meta literal and no body text anywhere on the row.
    expect(events[0].meta).toEqual({ changed: true });
    expect(JSON.stringify(events[0])).not.toContain(
      "Prefers morning training.",
    );
  });

  it("foreign workspace member and signed-out caller fail closed", async () => {
    const { ws } = await workspaceWith("COACH");
    const outsider = await workspaceWith("WORKSPACE_OWNER");
    const token = await signInToken(outsider.email);
    const path = `/api/v1/workspaces/${ws.id}/notes`;

    const res = await call(notesGET, path, { workspaceId: ws.id }, { token });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden" } });

    const anon = await call(notesGET, path, { workspaceId: ws.id });
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({
      error: { code: "unauthenticated" },
    });
  });

  it("edit, soft delete and restore round-trip a note (D24)", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await profile(ws.id);
    const token = await signInToken(email);
    const base = `/api/v1/workspaces/${ws.id}/notes`;

    const created = await call(
      notesPOST,
      base,
      { workspaceId: ws.id },
      {
        method: "POST",
        token,
        body: { clientProfileId: cp.id, visibility: "PRIVATE", body: "v1" },
      },
    );
    const { id } = await created.json();
    const params = { workspaceId: ws.id, noteId: id };

    const edited = await call(notePATCH, `${base}/${id}`, params, {
      method: "PATCH",
      token,
      body: { body: "v2 body", expectedRevision: 1 },
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({ revision: 2, changed: true });

    // Stale revision is a closed conflict, not a silent write.
    const stale = await call(notePATCH, `${base}/${id}`, params, {
      method: "PATCH",
      token,
      body: { body: "stale", expectedRevision: 1 },
    });
    expect(stale.status).toBe(409);

    const deleted = await call(noteDELETE, `${base}/${id}`, params, {
      method: "DELETE",
      token,
      qs: "?expectedRevision=2",
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ revision: 3, changed: true });

    // Deleted rows leave every list.
    const emptyList = await call(
      notesGET,
      `${base}?clientProfileId=${cp.id}`,
      { workspaceId: ws.id },
      {
        token,
      },
    );
    expect((await emptyList.json()).notes).toHaveLength(0);

    const restored = await call(
      noteRestorePOST,
      `${base}/${id}/restore`,
      params,
      {
        method: "POST",
        token,
      },
    );
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ revision: 4, changed: true });

    const back = await call(
      notesGET,
      `${base}?clientProfileId=${cp.id}`,
      { workspaceId: ws.id },
      { token },
    );
    const backBody = await back.json();
    expect(backBody.notes).toHaveLength(1);
    expect(backBody.notes[0].body).toBe("v2 body");
  });

  it("staff create and complete coach tasks; a client gets 403 on every task route", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await profile(ws.id);
    const token = await signInToken(email);
    const base = `/api/v1/workspaces/${ws.id}/coach-tasks`;

    const created = await call(
      tasksPOST,
      base,
      { workspaceId: ws.id },
      {
        method: "POST",
        token,
        body: { clientProfileId: cp.id, title: "Prepare feedback video" },
      },
    );
    expect(created.status).toBe(200);
    // POST answers the { coachTask } envelope the canvas adapter reads.
    const createdTask = (await created.json()) as { coachTask: { id: string } };
    const id = createdTask.coachTask.id;

    const done = await call(
      taskPATCH,
      `${base}/${id}`,
      {
        workspaceId: ws.id,
        taskId: id,
      },
      {
        method: "PATCH",
        token,
        body: { complete: true, expectedRevision: 1 },
      },
    );
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({
      revision: 2,
      complete: true,
      changed: true,
    });
    // Idempotent replay writes nothing.
    const replay = await call(
      taskPATCH,
      `${base}/${id}`,
      {
        workspaceId: ws.id,
        taskId: id,
      },
      {
        method: "PATCH",
        token,
        body: { complete: true, expectedRevision: 2 },
      },
    );
    expect(await replay.json()).toEqual({
      revision: 2,
      complete: true,
      changed: false,
    });

    const events = await prisma.auditEvent.findMany({
      where: { workspaceId: ws.id, resourceType: "coach_task" },
    });
    expect(events).toHaveLength(2); // CREATE + completion UPDATE only
    for (const event of events) {
      expect(event.meta).toEqual({ changed: true });
      expect(JSON.stringify(event)).not.toContain("Prepare feedback video");
    }

    const client = await workspaceWith("CLIENT");
    await prisma.workspaceMember.delete({ where: { id: client.member.id } });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: client.user.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    const clientToken = await signInToken(client.email);
    for (const res of [
      await call(
        tasksGET,
        base,
        { workspaceId: ws.id },
        { token: clientToken },
      ),
      await call(
        tasksPOST,
        base,
        { workspaceId: ws.id },
        {
          method: "POST",
          token: clientToken,
          body: { title: "sneaky" },
        },
      ),
      await call(
        taskPATCH,
        `${base}/${id}`,
        {
          workspaceId: ws.id,
          taskId: id,
        },
        {
          method: "PATCH",
          token: clientToken,
          body: { complete: false, expectedRevision: 2 },
        },
      ),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden" } });
    }
  });

  it("own-scope reads return GENERAL notes only, on the caller's own profile", async () => {
    const { ws, member } = await workspaceWith("WORKSPACE_OWNER");
    const clientUser = await prisma.user.create({
      data: {
        email: `c${++n}_${Date.now()}@example.test`,
        name: "Client",
        status: "ACTIVE",
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: clientUser.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    const cp = await profile(ws.id, "Own Client");
    await prisma.clientProfile.update({
      where: { id: cp.id },
      data: { userId: clientUser.id },
    });
    const otherCp = await profile(ws.id, "Other Client");

    await prisma.coachNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        visibility: "PRIVATE",
        body: "staff only",
        authorMemberId: member.id,
      },
    });
    await prisma.coachNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        visibility: "GENERAL",
        body: "client visible",
        authorMemberId: member.id,
      },
    });
    await prisma.coachNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: otherCp.id,
        visibility: "GENERAL",
        body: "foreign client general",
        authorMemberId: member.id,
      },
    });

    const caller = {
      userId: clientUser.id,
      workspaceId: ws.id,
      scope: "own" as const,
    };
    const visible = await listClientVisibleNotes(caller);
    expect(visible.notes).toHaveLength(1);
    expect(visible.notes[0]).toMatchObject({
      clientProfileId: cp.id,
      visibility: "GENERAL",
      body: "client visible",
    });

    // A foreign profile id can never resolve through the own-scope path.
    await expect(
      listClientVisibleNotes(caller, { clientProfileId: otherCp.id }),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // Staff scope cannot use the client-visible path either.
    await expect(
      listClientVisibleNotes({
        userId: member.userId,
        workspaceId: ws.id,
        scope: "workspace",
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("tracker comments: staff save/list, empty body deletes, foreign reads denied", async () => {
    const { ws, member } = await workspaceWith("COACH");
    const cp = await profile(ws.id);
    const p = await param(ws.id, member.id);
    const staff = {
      userId: member.userId,
      workspaceId: ws.id,
      scope: "workspace" as const,
    };

    const saved = await saveTrackerComment(staff, {
      clientProfileId: cp.id,
      entryDate: "2026-10-19",
      parameterId: p.id,
      body: "Watch the last rep.",
    });
    expect(saved.outcome).toBe("created");

    const listed = await listTrackerComments(staff, {
      clientProfileId: cp.id,
    });
    expect(listed.comments).toHaveLength(1);
    expect(listed.comments[0]).toMatchObject({
      clientProfileId: cp.id,
      entryDate: "2026-10-19",
      parameterId: p.id,
      body: "Watch the last rep.",
    });

    // Empty body deletes (canvas onSaveComment semantics).
    const cleared = await saveTrackerComment(staff, {
      clientProfileId: cp.id,
      entryDate: "2026-10-19",
      parameterId: p.id,
      body: "   ",
    });
    expect(cleared.outcome).toBe("deleted");
    expect(
      (await listTrackerComments(staff, { clientProfileId: cp.id })).comments,
    ).toHaveLength(0);

    // A comment on a client outside the workspace never resolves.
    const other = await workspaceWith("COACH");
    const foreignCp = await profile(other.ws.id);
    await expect(
      saveTrackerComment(staff, {
        clientProfileId: foreignCp.id,
        entryDate: "2026-10-19",
        parameterId: p.id,
        body: "nope",
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    const events = await prisma.auditEvent.findMany({
      where: { workspaceId: ws.id, resourceType: "tracker_comment" },
    });
    expect(events).toHaveLength(2); // CREATE + DELETE only
    for (const event of events) {
      expect(event.meta).toEqual({ changed: true, date: "2026-10-19" });
      expect(JSON.stringify(event)).not.toContain("Watch the last rep.");
    }
  });
});
