import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { GET as getConversations } from "../../app/api/v1/workspaces/[workspaceId]/conversations/route";
import {
  GET as getThread,
  POST as postMessage,
} from "../../app/api/v1/workspaces/[workspaceId]/conversations/[clientProfileId]/route";
import { POST as markRead } from "../../app/api/v1/workspaces/[workspaceId]/conversations/[clientProfileId]/read/route";
import { PUT as putDraft } from "../../app/api/v1/workspaces/[workspaceId]/conversations/[clientProfileId]/draft/route";

/**
 * W2-A4 staff message center on real PostgreSQL. Calls the conversation routes
 * the way the coach canvas does (real Request against the imported handler,
 * bearer credential from a real sign-in) and asserts the literal JSON
 * contract: list ordering, per-caller unread counts from MessageRead rows,
 * thread read flags, staff send, idempotent mark-read, one draft row per
 * author, and the role matrix (coach 200, foreign workspace 403, client 403,
 * no credentials 401).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

function listCall(workspaceId: string, headers: Record<string, string> = {}) {
  return getConversations(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/conversations`, {
      method: "GET",
      headers,
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function threadCall(
  method: "GET" | "POST",
  workspaceId: string,
  clientProfileId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  const fn = method === "GET" ? getThread : postMessage;
  return fn(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/conversations/${clientProfileId}`,
      {
        method,
        headers: body
          ? { ...headers, "content-type": "application/json" }
          : headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function readCall(
  workspaceId: string,
  clientProfileId: string,
  headers: Record<string, string> = {},
) {
  return markRead(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/conversations/${clientProfileId}/read`,
      { method: "POST", headers },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function draftCall(
  workspaceId: string,
  clientProfileId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return putDraft(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/conversations/${clientProfileId}/draft`,
      {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

describe.skipIf(!enabled)("W2-A4 staff message routes (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.213.0.${++n}`,
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
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
  ) {
    const tag = `wm${++n}_${Date.now()}`;
    const ws = await prisma.workspace.create({
      data: { name: tag, slug: tag, status: "ACTIVE" },
    });
    const { user, email } = await userWithPassword(tag);
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role, status: "ACTIVE" },
    });
    return { ws, user, member, email };
  }

  async function addStaff(
    workspaceId: string,
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT" = "COACH",
  ) {
    const tag = `sf${++n}_${Date.now()}`;
    const { user, email } = await userWithPassword(tag);
    const member = await prisma.workspaceMember.create({
      data: { workspaceId, userId: user.id, role, status: "ACTIVE" },
    });
    return { user, member, email };
  }

  async function clientProfile(
    workspaceId: string,
    name: string,
    userId?: string,
  ) {
    let ownerId = userId;
    if (!ownerId) {
      const clientUser = await prisma.user.create({
        data: {
          email: `cp${++n}_${Date.now()}@example.test`,
          name,
          status: "ACTIVE",
        },
      });
      ownerId = clientUser.id;
    }
    return prisma.clientProfile.create({
      data: { workspaceId, userId: ownerId, name },
    });
  }

  /** Conversation plus messages; sentAt is explicit so ordering is fixed. */
  async function thread(
    workspaceId: string,
    clientProfileId: string,
    rows: {
      senderKind: "CLIENT" | "STAFF";
      body: string;
      sentAt: Date;
      clientRequestId: string;
      priority?: boolean;
      senderUserId?: string | null;
    }[],
  ) {
    const conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        clientProfileId,
        lastMessageAt: rows.length
          ? rows[rows.length - 1]!.sentAt
          : null,
      },
    });
    const messages = [];
    for (const row of rows) {
      messages.push(
        await prisma.message.create({
          data: {
            workspaceId,
            conversationId: conversation.id,
            senderKind: row.senderKind,
            senderUserId: row.senderUserId ?? null,
            body: row.body,
            priority: row.priority ?? false,
            clientRequestId: row.clientRequestId,
            sentAt: row.sentAt,
          },
        }),
      );
    }
    return { conversation, messages };
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
      'TRUNCATE "message_read","message_draft_attachment","message_draft","message_attachment","message","conversation","coach_task","client_task","audit_event","client_week_note","client_phase","coach_note","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","sessions","accounts","rate_limit","verifications","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("GET /conversations lists one row per thread, newest first, with caller unread counts", async () => {
    const { ws, user, email } = await workspaceWith("COACH");
    const ana = await clientProfile(ws.id, "Ana Client");
    const bo = await clientProfile(ws.id, "Bo Client");
    // No conversation for this client, so the list must not invent a row.
    await clientProfile(ws.id, "Idle Client");

    const t1 = new Date("2026-10-01T09:00:00Z");
    const t2 = new Date("2026-10-01T10:00:00Z");
    const t3 = new Date("2026-10-01T11:00:00Z");
    const t4 = new Date("2026-10-02T09:00:00Z");
    const t5 = new Date("2026-10-02T10:00:00Z");

    const anaThread = await thread(ws.id, ana.id, [
      {
        senderKind: "CLIENT",
        body: "Can you review my macros?",
        sentAt: t1,
        clientRequestId: "ana-1",
        senderUserId: ana.userId,
      },
      {
        senderKind: "STAFF",
        body: "Reviewed, all good.",
        sentAt: t2,
        clientRequestId: "ana-2",
        senderUserId: user.id,
      },
      {
        senderKind: "CLIENT",
        body: "X".repeat(200),
        sentAt: t3,
        clientRequestId: "ana-3",
        priority: true,
        senderUserId: ana.userId,
      },
    ]);
    await thread(ws.id, bo.id, [
      {
        senderKind: "CLIENT",
        body: "First one",
        sentAt: t4,
        clientRequestId: "bo-1",
        senderUserId: bo.userId,
      },
      {
        senderKind: "CLIENT",
        body: "Z".repeat(200),
        sentAt: t5,
        clientRequestId: "bo-2",
        senderUserId: bo.userId,
      },
    ]);
    // The coach already read Ana's first client message; the rest stay unread.
    await prisma.messageRead.create({
      data: {
        messageId: anaThread.messages[0]!.id,
        userId: user.id,
        readAt: new Date(),
      },
    });

    const token = await signInToken(email);
    const res = await listCall(ws.id, authed(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversations: [
        {
          clientProfileId: bo.id,
          clientName: "Bo Client",
          lastMessageAt: t5.toISOString(),
          lastMessagePreview: "Z".repeat(140),
          unreadCount: 2,
          hasPriority: false,
        },
        {
          clientProfileId: ana.id,
          clientName: "Ana Client",
          lastMessageAt: t3.toISOString(),
          lastMessagePreview: "X".repeat(140),
          unreadCount: 1,
          hasPriority: true,
        },
      ],
    });
  });

  it("GET thread returns messages with read flags plus the caller's draft", async () => {
    const { ws, user, email } = await workspaceWith("COACH");
    const cp = await clientProfile(ws.id, "Read Flag Client");
    const t1 = new Date("2026-10-03T09:00:00Z");
    const t2 = new Date("2026-10-03T10:00:00Z");
    const t3 = new Date("2026-10-03T11:00:00Z");
    const { messages } = await thread(ws.id, cp.id, [
      {
        senderKind: "CLIENT",
        body: "Client asks",
        sentAt: t1,
        clientRequestId: "rf-1",
        senderUserId: cp.userId,
      },
      {
        senderKind: "STAFF",
        body: "Coach replies",
        sentAt: t2,
        clientRequestId: "rf-2",
        priority: true,
        senderUserId: user.id,
      },
      {
        senderKind: "CLIENT",
        body: "Another ask",
        sentAt: t3,
        clientRequestId: "rf-3",
        senderUserId: cp.userId,
      },
    ]);
    // CLIENT message read by the staff caller, STAFF message read by the client.
    await prisma.messageRead.createMany({
      data: [
        { messageId: messages[0]!.id, userId: user.id, readAt: new Date() },
        { messageId: messages[1]!.id, userId: cp.userId!, readAt: new Date() },
        { messageId: messages[1]!.id, userId: user.id, readAt: new Date() },
      ],
    });
    const token = await signInToken(email);
    const res = await threadCall("GET", ws.id, cp.id, authed(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      clientProfileId: cp.id,
      messages: [
        {
          id: messages[0]!.id,
          body: "Client asks",
          senderKind: "CLIENT",
          sentAt: t1.toISOString(),
          clientRequestId: "rf-1",
          read: true,
          priority: false,
          links: null,
          attachments: [],
        },
        {
          id: messages[1]!.id,
          body: "Coach replies",
          senderKind: "STAFF",
          sentAt: t2.toISOString(),
          clientRequestId: "rf-2",
          read: true,
          priority: true,
          links: null,
          attachments: [],
        },
        {
          id: messages[2]!.id,
          body: "Another ask",
          senderKind: "CLIENT",
          sentAt: t3.toISOString(),
          clientRequestId: "rf-3",
          read: false,
          priority: false,
          links: null,
          attachments: [],
        },
      ],
      draft: null,
    });
  });

  it("GET thread on a client with no conversation is empty, not an error", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await clientProfile(ws.id, "No Thread Client");
    const token = await signInToken(email);
    const res = await threadCall("GET", ws.id, cp.id, authed(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      clientProfileId: cp.id,
      messages: [],
      draft: null,
    });
  });

  it("POST creates the thread and returns the literal STAFF message view", async () => {
    const { ws, user, email } = await workspaceWith("COACH");
    const cp = await clientProfile(ws.id, "Send Client");
    const token = await signInToken(email);

    const res = await threadCall("POST", ws.id, cp.id, authed(token), {
      body: "  Hello there  ",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: Record<string, unknown>;
    };
    expect(body.message).toEqual({
      id: expect.any(String),
      body: "Hello there",
      senderKind: "STAFF",
      sentAt: expect.any(String),
      clientRequestId: expect.any(String),
      read: false,
      priority: false,
      links: null,
      attachments: [],
    });

    const row = await prisma.message.findUniqueOrThrow({
      where: { id: body.message.id as string },
    });
    expect(row.senderKind).toBe("STAFF");
    expect(row.senderUserId).toBe(user.id);
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: ws.id,
          clientProfileId: cp.id,
        },
      },
    });
    expect(conversation.lastMessageAt?.toISOString()).toBe(
      row.sentAt.toISOString(),
    );

    const empty = await threadCall("POST", ws.id, cp.id, authed(token), {
      body: "   ",
    });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: { code: "invalid_input" } });
    expect(
      await prisma.message.count({ where: { conversationId: conversation.id } }),
    ).toBe(1);
  });

  it("POST /read marks every unread client message once", async () => {
    const { ws, user, email } = await workspaceWith("COACH");
    const cp = await clientProfile(ws.id, "Mark Read Client");
    const { messages } = await thread(ws.id, cp.id, [
      {
        senderKind: "CLIENT",
        body: "One",
        sentAt: new Date("2026-10-04T09:00:00Z"),
        clientRequestId: "mr-1",
        senderUserId: cp.userId,
      },
      {
        senderKind: "CLIENT",
        body: "Two",
        sentAt: new Date("2026-10-04T10:00:00Z"),
        clientRequestId: "mr-2",
        senderUserId: cp.userId,
      },
    ]);
    const token = await signInToken(email);

    const first = await readCall(ws.id, cp.id, authed(token));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ marked: 2 });
    expect(
      await prisma.messageRead.count({ where: { userId: user.id } }),
    ).toBe(2);

    const second = await readCall(ws.id, cp.id, authed(token));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ marked: 0 });

    const unreadThread = await clientProfile(ws.id, "Untouched Client");
    const none = await readCall(ws.id, unreadThread.id, authed(token));
    expect(none.status).toBe(200);
    expect(await none.json()).toEqual({ marked: 0 });
    expect(messages).toHaveLength(2);
  });

  it("PUT /draft upserts one row per author and bumps its own revision", async () => {
    const { ws, user, email } = await workspaceWith("COACH");
    const other = await addStaff(ws.id, "COACH");
    const cp = await clientProfile(ws.id, "Draft Client");
    await prisma.conversation.create({
      data: { workspaceId: ws.id, clientProfileId: cp.id },
    });
    const token = await signInToken(email);
    const otherToken = await signInToken(other.email);

    const first = await draftCall(ws.id, cp.id, authed(token), {
      body: "first draft",
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      draft: { body: "first draft", revision: 1 },
    });

    const second = await draftCall(ws.id, cp.id, authed(token), {
      body: "second draft",
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      draft: { body: "second draft", revision: 2 },
    });

    // A different author gets their own row starting at revision 1.
    const theirs = await draftCall(ws.id, cp.id, authed(otherToken), {
      body: "their draft",
    });
    expect(theirs.status).toBe(200);
    expect(await theirs.json()).toEqual({
      draft: { body: "their draft", revision: 1 },
    });
    expect(
      await prisma.messageDraft.count({
        where: { authorUserId: { in: [user.id, other.user.id] } },
      }),
    ).toBe(2);

    // Empty body upserts "" instead of deleting the row.
    const cleared = await draftCall(ws.id, cp.id, authed(token), { body: "" });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({
      draft: { body: "", revision: 3 },
    });
    expect(
      await prisma.messageDraft.count({ where: { authorUserId: user.id } }),
    ).toBe(1);

    // The thread read returns the caller's own draft only.
    const read = await threadCall("GET", ws.id, cp.id, authed(token));
    expect(await read.json()).toEqual({
      clientProfileId: cp.id,
      messages: [],
      draft: { body: "", revision: 3 },
    });

    // No conversation yet means no draft to attach to.
    const noThread = await clientProfile(ws.id, "Draftless Client");
    const missing = await draftCall(ws.id, noThread.id, authed(token), {
      body: "orphan",
    });
    expect(missing.status).toBe(403);
    expect(await missing.json()).toEqual({
      error: { code: "not_available" },
    });
  });

  it("enforces the role matrix: coach 200, foreign 403, client 403, anonymous 401", async () => {
    const a = await workspaceWith("COACH");
    const b = await workspaceWith("COACH");
    const cp = await clientProfile(a.ws.id, "Matrix Client");
    // A CLIENT member of the same workspace: role denial, not workspace denial.
    const clientMember = await addStaff(a.ws.id, "CLIENT");
    await clientProfile(a.ws.id, "Self Client", clientMember.user.id);

    const coachToken = await signInToken(a.email);
    const foreignToken = await signInToken(b.email);
    const clientToken = await signInToken(clientMember.email);

    expect((await listCall(a.ws.id, authed(coachToken))).status).toBe(200);

    const clientList = await listCall(a.ws.id, authed(clientToken));
    expect(clientList.status).toBe(403);
    expect(await clientList.json()).toEqual({ error: { code: "forbidden" } });

    const foreignList = await listCall(a.ws.id, authed(foreignToken));
    expect(foreignList.status).toBe(403);

    const anonList = await listCall(a.ws.id);
    expect(anonList.status).toBe(401);
    expect(await anonList.json()).toEqual({
      error: { code: "unauthenticated" },
    });

    // A client holds message.write at "own" scope, so the gate lets it in and
    // the staff binding inside the service denies it.
    const clientSend = await threadCall("POST", a.ws.id, cp.id, authed(clientToken), {
      body: "not allowed",
    });
    expect(clientSend.status).toBe(403);
    expect(await clientSend.json()).toEqual({ error: { code: "forbidden" } });

    const foreignSend = await threadCall("POST", a.ws.id, cp.id, authed(foreignToken), {
      body: "not allowed",
    });
    expect(foreignSend.status).toBe(403);
    expect(await foreignSend.json()).toEqual({ error: { code: "forbidden" } });

    const anonSend = await threadCall("POST", a.ws.id, cp.id, {}, {
      body: "not allowed",
    });
    expect(anonSend.status).toBe(401);

    expect((await readCall(a.ws.id, cp.id)).status).toBe(401);
    expect(
      (await draftCall(a.ws.id, cp.id, {}, { body: "anon" })).status,
    ).toBe(401);
    expect(
      (await threadCall("GET", a.ws.id, cp.id)).status,
    ).toBe(401);
  });
});
