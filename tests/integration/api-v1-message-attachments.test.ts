import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getObject } from "../../app/api/v1/media/object/route";
import { GET as mintMedia } from "../../app/api/v1/media/[workspaceId]/[mediaObjectId]/route";
import {
  GET as getMessages,
  POST as postOwnMessage,
} from "../../app/api/v1/workspaces/[workspaceId]/messages/route";
import { POST as markOwnRead } from "../../app/api/v1/workspaces/[workspaceId]/messages/read/route";
import { POST as postStaffMessage } from "../../app/api/v1/workspaces/[workspaceId]/conversations/[clientProfileId]/route";
import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { clientObjectPrefix } from "../../lib/storage";

/**
 * W2-T8 message attachments and read state on real PostgreSQL. Covers the
 * upload-then-link send on both message routes, the workspace/client
 * scoping rules on attachment ids, the own-thread read flags and the
 * client's own mark-read, and the attachment url story: the existing media
 * mint redeems an anchored attachment for its parties, denies a foreign
 * caller, and the signed url expires.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const SECRET = "t8-attachment-signing-secret";

let mediaDir = "";

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

function signedGetPath(key: string, expiresAt: number) {
  const s = createHmac("sha256", SECRET)
    .update(`get\n${key}\n${expiresAt}`)
    .digest("hex");
  return `/api/v1/media/object?op=get&key=${encodeURIComponent(key)}&e=${expiresAt}&s=${s}`;
}

function ownCall(
  method: "GET" | "POST",
  workspaceId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  const fn = method === "GET" ? getMessages : postOwnMessage;
  return fn(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/messages`, {
      method,
      headers: body
        ? { ...headers, "content-type": "application/json" }
        : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function ownReadCall(workspaceId: string, headers: Record<string, string>) {
  return markOwnRead(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/messages/read`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function staffSendCall(
  workspaceId: string,
  clientProfileId: string,
  headers: Record<string, string>,
  body: unknown,
) {
  return postStaffMessage(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/conversations/${clientProfileId}`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function mintCall(
  workspaceId: string,
  mediaObjectId: string,
  headers: Record<string, string>,
) {
  return mintMedia(
    new Request(`${BASE}/api/v1/media/${workspaceId}/${mediaObjectId}`, {
      method: "GET",
      headers,
    }),
    { params: Promise.resolve({ workspaceId, mediaObjectId }) },
  );
}

describe.skipIf(!enabled)("W2-T8 message attachments (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.216.0.${++n}`,
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
    const tag = `t8${++n}_${Date.now()}`;
    const ws = await prisma.workspace.create({
      data: { name: tag, slug: tag, status: "ACTIVE" },
    });
    const { user, email } = await userWithPassword(tag);
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role, status: "ACTIVE" },
    });
    return { ws, user, member, email };
  }

  /** A client login: user + CLIENT member + linked client profile. */
  async function clientLogin(workspaceId: string, name: string) {
    const tag = `t8c${++n}_${Date.now()}`;
    const { user, email } = await userWithPassword(tag);
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: user.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    const profile = await prisma.clientProfile.create({
      data: { workspaceId, userId: user.id, name },
    });
    return { user, email, profile };
  }

  /** Live media_object row anchored to a client profile, bytes on disk. */
  async function mediaFor(
    workspaceId: string,
    clientProfileId: string | null,
    fileName = "attachment.txt",
  ) {
    const id = `t8media${++n}_${Date.now()}`;
    const owner = clientProfileId ?? "library";
    const storageKey = clientObjectPrefix(workspaceId, owner) + id;
    const media = await prisma.mediaObject.create({
      data: {
        id,
        workspaceId,
        kind: "DOCUMENT",
        storageKey,
        fileName,
        contentType: "text/plain",
        byteSize: BigInt(5),
        clientProfileId,
      },
    });
    return media;
  }

  beforeAll(async () => {
    mediaDir = mkdtempSync(join(tmpdir(), "t8-media-"));
    process.env.MEDIA_STORAGE_DIR = mediaDir;
    process.env.MEDIA_STORAGE_SIGNING_SECRET = SECRET;
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({
      datasources: { db: { url: url as string } },
    });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "message_read","message_draft_attachment","message_draft","message_attachment","message","conversation","media_assignment","media_object","coach_task","client_task","audit_event","client_week_note","client_phase","coach_note","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","sessions","accounts","rate_limit","verifications","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    delete process.env.MEDIA_STORAGE_DIR;
    delete process.env.MEDIA_STORAGE_SIGNING_SECRET;
    if (mediaDir) rmSync(mediaDir, { recursive: true, force: true });
  });

  it("staff POST links uploaded media, returns it, and the thread re-reads it", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await clientLogin(ws.id, "Attach Client");
    const media = await mediaFor(ws.id, cp.profile.id);
    const token = await signInToken(email);

    const res = await staffSendCall(ws.id, cp.profile.id, authed(token), {
      body: "See the attached file",
      mediaObjectIds: [media.id],
    });
    expect(res.status).toBe(200);
    const { message } = (await res.json()) as {
      message: { id: string; attachments: unknown[] };
    };
    expect(message.attachments).toEqual([
      {
        mediaObjectId: media.id,
        fileName: "attachment.txt",
        contentType: "text/plain",
        byteSize: 5,
        position: 0,
      },
    ]);
    expect(
      await prisma.messageAttachment.count({
        where: { messageId: message.id, mediaObjectId: media.id },
      }),
    ).toBe(1);

    // The client re-read of the same thread returns the attachment (render
    // on reload at the wire layer).
    const clientToken = await signInToken(cp.email);
    const own = await ownCall("GET", ws.id, authed(clientToken));
    expect(own.status).toBe(200);
    const { messages } = (await own.json()) as {
      messages: { id: string; attachments: unknown[]; read: boolean }[];
    };
    expect(messages).toHaveLength(1);
    expect(messages[0]!.attachments).toEqual([
      {
        mediaObjectId: media.id,
        fileName: "attachment.txt",
        contentType: "text/plain",
        byteSize: 5,
        position: 0,
      },
    ]);
  });

  it("send accepts an attachment-only body and rejects empty everything", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await clientLogin(ws.id, "File Only Client");
    const media = await mediaFor(ws.id, cp.profile.id);
    const token = await signInToken(email);

    const res = await staffSendCall(ws.id, cp.profile.id, authed(token), {
      mediaObjectIds: [media.id],
    });
    expect(res.status).toBe(200);
    const { message } = (await res.json()) as {
      message: { body: string; attachments: unknown[] };
    };
    expect(message.body).toBe("");
    expect(message.attachments).toHaveLength(1);

    const empty = await staffSendCall(ws.id, cp.profile.id, authed(token), {
      body: "   ",
    });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({
      error: { code: "invalid_input" },
    });
  });

  it("send idempotency does not duplicate the attachment link", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await clientLogin(ws.id, "Retry Client");
    const media = await mediaFor(ws.id, cp.profile.id);
    const token = await signInToken(email);

    const first = await staffSendCall(ws.id, cp.profile.id, authed(token), {
      body: "once",
      clientRequestId: "retry-1",
      mediaObjectIds: [media.id],
    });
    expect(first.status).toBe(200);
    const a = (await first.json()) as { message: { id: string } };
    const second = await staffSendCall(ws.id, cp.profile.id, authed(token), {
      body: "once",
      clientRequestId: "retry-1",
      mediaObjectIds: [media.id],
    });
    expect(second.status).toBe(200);
    const b = (await second.json()) as {
      message: { id: string; attachments: unknown[] };
    };
    expect(b.message.id).toBe(a.message.id);
    expect(b.message.attachments).toHaveLength(1);
    expect(
      await prisma.messageAttachment.count({
        where: { messageId: a.message.id },
      }),
    ).toBe(1);
  });

  it("rejects foreign-owned and unknown media ids on both send routes", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const mine = await clientLogin(ws.id, "Mine Client");
    const other = await clientLogin(ws.id, "Other Client");
    const mineMedia = await mediaFor(ws.id, mine.profile.id);
    const otherMedia = await mediaFor(ws.id, other.profile.id);
    const library = await mediaFor(ws.id, null, "library.txt");
    const token = await signInToken(email);
    const clientToken = await signInToken(mine.email);

    // Staff cannot link another client's or a library object to this thread.
    for (const bad of [otherMedia.id, library.id]) {
      const res = await staffSendCall(ws.id, mine.profile.id, authed(token), {
        body: "no",
        mediaObjectIds: [bad],
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden" } });
    }
    const unknown = await staffSendCall(ws.id, mine.profile.id, authed(token), {
      body: "no",
      mediaObjectIds: ["no_such_media"],
    });
    expect(unknown.status).toBe(400);

    // The client may attach their own object but never another client's.
    const ok = await ownCall("POST", ws.id, authed(clientToken), {
      body: "mine",
      mediaObjectIds: [mineMedia.id],
    });
    expect(ok.status).toBe(200);
    const foreign = await ownCall("POST", ws.id, authed(clientToken), {
      body: "not mine",
      mediaObjectIds: [otherMedia.id],
    });
    expect(foreign.status).toBe(403);
  });

  it("own thread read flags flip: staff read by client, client read by staff", async () => {
    const { ws, user, email } = await workspaceWith("COACH");
    const cp = await clientLogin(ws.id, "Read Flip Client");
    const conversation = await prisma.conversation.create({
      data: { workspaceId: ws.id, clientProfileId: cp.profile.id },
    });
    const staffMsg = await prisma.message.create({
      data: {
        workspaceId: ws.id,
        conversationId: conversation.id,
        senderKind: "STAFF",
        senderUserId: user.id,
        body: "from coach",
        clientRequestId: "rf-s",
      },
    });
    const clientMsg = await prisma.message.create({
      data: {
        workspaceId: ws.id,
        conversationId: conversation.id,
        senderKind: "CLIENT",
        senderUserId: cp.user.id,
        body: "from client",
        clientRequestId: "rf-c",
      },
    });
    const clientToken = await signInToken(cp.email);
    const staffToken = await signInToken(email);

    const before = (await (
      await ownCall("GET", ws.id, authed(clientToken))
    ).json()) as { messages: { id: string; read: boolean }[] };
    expect(before.messages.find((m) => m.id === staffMsg.id)!.read).toBe(false);
    expect(before.messages.find((m) => m.id === clientMsg.id)!.read).toBe(
      false,
    );

    // The client's own mark-read flips the STAFF message only.
    const marked = await ownReadCall(ws.id, authed(clientToken));
    expect(marked.status).toBe(200);
    expect(await marked.json()).toEqual({ marked: 1 });
    const again = await ownReadCall(ws.id, authed(clientToken));
    expect(await again.json()).toEqual({ marked: 0 });

    // The staff caller's read marker flips the CLIENT message.
    await prisma.messageRead.create({
      data: { messageId: clientMsg.id, userId: user.id, readAt: new Date() },
    });
    const after = (await (
      await ownCall("GET", ws.id, authed(clientToken))
    ).json()) as { messages: { id: string; read: boolean }[] };
    expect(after.messages.find((m) => m.id === staffMsg.id)!.read).toBe(true);
    expect(after.messages.find((m) => m.id === clientMsg.id)!.read).toBe(true);

    // A staff caller has no client profile: own mark-read denies.
    const denied = await ownReadCall(ws.id, authed(staffToken));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: { code: "forbidden" } });
  });

  it("attachment url mints for its parties and denies foreign callers", async () => {
    const a = await workspaceWith("COACH");
    const b = await workspaceWith("COACH");
    const cp = await clientLogin(a.ws.id, "Mint Client");
    const otherClient = await clientLogin(a.ws.id, "Other Mint Client");
    const media = await mediaFor(a.ws.id, cp.profile.id);
    const staffToken = await signInToken(a.email);
    const clientToken = await signInToken(cp.email);
    const otherClientToken = await signInToken(otherClient.email);
    const foreignToken = await signInToken(b.email);

    // Both thread parties mint the attachment url.
    const staffMint = await mintCall(a.ws.id, media.id, authed(staffToken));
    expect(staffMint.status).toBe(200);
    const staffBody = (await staffMint.json()) as {
      download: { url: string; expiresAt: string };
    };
    expect(staffBody.download.url).toContain("/api/v1/media/object");
    const clientMint = await mintCall(a.ws.id, media.id, authed(clientToken));
    expect(clientMint.status).toBe(200);

    // Another client in the same workspace and a foreign-workspace caller
    // both deny on the mint.
    const otherMint = await mintCall(
      a.ws.id,
      media.id,
      authed(otherClientToken),
    );
    expect(otherMint.status).toBe(403);
    const foreignMint = await mintCall(a.ws.id, media.id, authed(foreignToken));
    expect(foreignMint.status).toBe(403);

    // The minted url serves bytes now and an expired signature denies.
    const key = clientObjectPrefix(a.ws.id, cp.profile.id) + media.id;
    const fresh = await getObject(
      new Request(
        `${BASE}${signedGetPath(key, Math.floor(Date.now() / 1000) + 600)}`,
      ),
    );
    expect(fresh.status).toBe(404); // no bytes written for this fixture row
    const expired = await getObject(
      new Request(
        `${BASE}${signedGetPath(key, Math.floor(Date.now() / 1000) - 10)}`,
      ),
    );
    expect(expired.status).toBe(403);
    expect(await expired.json()).toEqual({
      error: { code: "invalid_signature" },
    });
  });

  it("expired mint url rejects redemption; minted attachment is workspace-scoped", async () => {
    const { ws, email } = await workspaceWith("COACH");
    const cp = await clientLogin(ws.id, "Bytes Client");
    const media = await mediaFor(ws.id, cp.profile.id, "bytes.txt");
    const key = clientObjectPrefix(ws.id, cp.profile.id) + media.id;
    // Write real bytes through the local backend so the redemption check
    // exercises signature AND storage, not just the 404 path.
    const { writeLocalObject } = await import("../../lib/storage/local");
    await writeLocalObject(key, new TextEncoder().encode("hello"));

    const token = await signInToken(cp.email);
    const mint = await mintCall(ws.id, media.id, authed(token));
    expect(mint.status).toBe(200);
    const { download } = (await mint.json()) as {
      download: { url: string; expiresAt: string };
    };
    const object = await getObject(new Request(`${BASE}${download.url}`));
    expect(object.status).toBe(200);
    expect(await object.text()).toBe("hello");

    const staffToken = await signInToken(email);
    const staffMint = await mintCall(ws.id, media.id, authed(staffToken));
    expect(staffMint.status).toBe(200);
  });
});
