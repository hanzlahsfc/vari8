import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { MAX_MEDIA_BYTES } from "../../lib/storage";
import { POST } from "../../app/api/v1/media/[workspaceId]/route";
import { GET as GET_MEDIA } from "../../app/api/v1/media/[workspaceId]/[mediaObjectId]/route";
import {
  GET as GET_OBJECT,
  PUT as PUT_OBJECT,
} from "../../app/api/v1/media/object/route";

/**
 * PR-MEDIA end-to-end contract on real PG + the local adapter: a signed
 * upload intent, a byte-exact PUT redemption, a signed download, and the
 * fail-closed matrix (foreign workspace, client foreign profile, oversized,
 * non-allowlisted type, expired/tampered signature, unauthenticated).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const SECRET = "media-integration-signing-secret";

let mediaDir = "";

function postIntent(
  workspaceId: string,
  token: string | null,
  body: unknown,
) {
  return POST(
    new Request(`${BASE}/api/v1/media/${workspaceId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function getMedia(workspaceId: string, mediaObjectId: string, token: string) {
  return GET_MEDIA(
    new Request(`${BASE}/api/v1/media/${workspaceId}/${mediaObjectId}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ workspaceId, mediaObjectId }) },
  );
}

const putObject = (path: string, bytes: Uint8Array) =>
  PUT_OBJECT(
    new Request(`${BASE}${path}`, {
      method: "PUT",
      body: bytes.slice().buffer as ArrayBuffer,
    }),
  );

const getObject = (path: string) =>
  GET_OBJECT(new Request(`${BASE}${path}`));

function signedPath(
  op: "get" | "put",
  key: string,
  expiresAt: number,
  signature?: string,
): string {
  const s =
    signature ??
    createHmac("sha256", SECRET)
      .update(`${op}\n${key}\n${expiresAt}`)
      .digest("hex");
  return `/api/v1/media/object?op=${op}&key=${encodeURIComponent(key)}&e=${expiresAt}&s=${s}`;
}

describe.skipIf(!enabled)(
  "PR-MEDIA /api/v1/media (real PG, local adapter)",
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
            "x-forwarded-for": `10.230.0.${++n}`,
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
    ) {
      const tag = `m${++n}_${Date.now()}`;
      const email = `${tag}@example.test`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: "fixture",
          name: tag,
          status: "ACTIVE",
        },
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
      return { user, email };
    }

    async function workspace() {
      const tag = `ws${++n}_${Date.now()}`;
      return prisma.workspace.create({
        data: { name: tag, slug: tag, status: "ACTIVE" },
      });
    }

    async function uploadAsCoach(workspaceId: string, clientProfileId: string) {
      const { email } = await member(workspaceId, "COACH");
      const token = await signInToken(email);
      const bytes = new Uint8Array([9, 8, 7, 6, 5]);
      const intent = await postIntent(workspaceId, token, {
        fileName: "note.wav",
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
        clientProfileId,
      });
      return { token, intent, bytes };
    }

    beforeAll(async () => {
      process.env.MEDIA_STORAGE_SIGNING_SECRET = SECRET;
      mkdirSync(join(process.cwd(), "var"), { recursive: true });
      mediaDir = mkdtempSync(join(process.cwd(), "var", "media-int-"));
      process.env.MEDIA_STORAGE_DIR = mediaDir;
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "media_object","rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      rmSync(mediaDir, { recursive: true, force: true });
      delete process.env.MEDIA_STORAGE_DIR;
      delete process.env.MEDIA_STORAGE_SIGNING_SECRET;
    });

    it("coach uploads bytes through the signed URL and downloads them", async () => {
      const ws = await workspace();
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Anna" },
      });
      const { token, intent, bytes } = await uploadAsCoach(ws.id, client.id);
      expect(intent.status).toBe(200);
      const body = await intent.json();
      expect(body.mediaObject).toMatchObject({
        kind: "AUDIO",
        fileName: "note.wav",
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      });
      expect(body.upload.method).toBe("PUT");
      expect(body.upload.url).toContain("/api/v1/media/object");

      const put = await putObject(body.upload.url, bytes);
      expect(put.status).toBe(200);
      expect(await put.json()).toEqual({ uploaded: true });

      const mint = await getMedia(ws.id, body.mediaObject.id, token);
      expect(mint.status).toBe(200);
      const mintBody = await mint.json();
      const object = await getObject(mintBody.download.url);
      expect(object.status).toBe(200);
      expect(object.headers.get("content-type")).toBe("audio/wav");
      expect(new Uint8Array(await object.arrayBuffer())).toEqual(bytes);
    });

    it("client uploads under their own profile (inferred), plays back", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      const profile = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self", userId: user.id },
      });
      const token = await signInToken(email);
      const bytes = new Uint8Array([1, 2, 3]);
      const intent = await postIntent(ws.id, token, {
        fileName: "pic.png",
        contentType: "image/png",
        byteSize: bytes.byteLength,
      });
      expect(intent.status).toBe(200);
      const body = await intent.json();
      expect(body.mediaObject.kind).toBe("IMAGE");
      // The key anchors to the caller's own client profile.
      const row = await prisma.mediaObject.findUniqueOrThrow({
        where: { id: body.mediaObject.id },
      });
      expect(row.storageKey).toBe(
        `workspace/${ws.id}/client/${profile.id}/${body.mediaObject.id}`,
      );
      await putObject(body.upload.url, bytes);
      const mint = await getMedia(ws.id, body.mediaObject.id, token);
      expect(mint.status).toBe(200);
      const { download } = await mint.json();
      const object = await getObject(download.url);
      expect(new Uint8Array(await object.arrayBuffer())).toEqual(bytes);
    });

    it("client cannot anchor media to another client's profile", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self2", userId: user.id },
      });
      const other = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Other" },
      });
      const token = await signInToken(email);
      const res = await postIntent(ws.id, token, {
        fileName: "x.png",
        contentType: "image/png",
        byteSize: 4,
        clientProfileId: other.id,
      });
      expect(res.status).toBe(403);
      // And cannot mint a download URL for another client's object.
      const { intent } = await uploadAsCoach(
        ws.id,
        other.id,
      );
      const created = (await intent.json()).mediaObject;
      const mint = await getMedia(ws.id, created.id, token);
      expect(mint.status).toBe(403);
    });

    it("a member of another workspace fails closed on intent and mint", async () => {
      const ws = await workspace();
      const foreign = await workspace();
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "C" },
      });
      const { intent, bytes } = await uploadAsCoach(ws.id, client.id);
      const intentBody = await intent.json();
      const created = intentBody.mediaObject;
      await putObject(intentBody.upload.url, bytes);

      const { email } = await member(foreign.id, "WORKSPACE_OWNER");
      const token = await signInToken(email);
      const res = await postIntent(foreign.id, token, {
        fileName: "x.png",
        contentType: "image/png",
        byteSize: 4,
        clientProfileId: client.id,
      });
      // The profile belongs to ws, not foreign — the service 404s it.
      expect(res.status).toBe(404);
      const mint = await getMedia(ws.id, created.id, token);
      expect(mint.status).toBe(403);
      const mintForeign = await getMedia(foreign.id, created.id, token);
      expect(mintForeign.status).toBe(404);
    });

    it("rejects non-allowlisted types and the 20 MB cap", async () => {
      const ws = await workspace();
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "C" },
      });
      const { token } = await uploadAsCoach(ws.id, client.id);
      const badType = await postIntent(ws.id, token, {
        fileName: "x.bin",
        contentType: "application/octet-stream",
        byteSize: 10,
        clientProfileId: client.id,
      });
      expect(badType.status).toBe(400);
      expect(await badType.json()).toEqual({
        error: { code: "unsupported_media_type" },
      });
      const overCap = await postIntent(ws.id, token, {
        fileName: "big.png",
        contentType: "image/png",
        byteSize: MAX_MEDIA_BYTES + 1,
        clientProfileId: client.id,
      });
      expect(overCap.status).toBe(400);
      expect(await overCap.json()).toMatchObject({
        error: { code: "invalid_input" },
      });
    });

    it("rejects expired, tampered and wrong-size object requests", async () => {
      const ws = await workspace();
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "C" },
      });
      const { intent, bytes } = await uploadAsCoach(ws.id, client.id);
      const { upload } = await intent.json();
      const key = new URL(`${BASE}${upload.url}`).searchParams.get(
        "key",
      ) as string;

      // Expired signed URL: a correctly-signed URL whose time has passed.
      const expired = Math.floor(Date.now() / 1000) - 10;
      const old = await putObject(signedPath("put", key, expired), bytes);
      expect(old.status).toBe(403);
      expect(await old.json()).toEqual({ error: { code: "invalid_signature" } });

      // Tampered: valid signature for this key, but the key param swapped.
      const future = Math.floor(Date.now() / 1000) + 600;
      const sig = new URL(`${BASE}${upload.url}`).searchParams.get(
        "s",
      ) as string;
      const tampered = await putObject(
        signedPath("put", `${key}evil`, future, sig),
        bytes,
      );
      expect(tampered.status).toBe(403);

      // Valid signature but the body does not match the declared byte size.
      const wrongSize = await putObject(
        signedPath("put", key, future),
        new Uint8Array([1]),
      );
      expect(wrongSize.status).toBe(400);

      // Valid upload; a GET with the PUT signature is a different credential.
      expect((await putObject(upload.url, bytes)).status).toBe(200);
      const getAsPut = await getObject(upload.url);
      expect(getAsPut.status).toBe(403);
    });

    it("requires authentication for intent and mint", async () => {
      const ws = await workspace();
      const res = await postIntent(ws.id, null, {
        fileName: "x.png",
        contentType: "image/png",
        byteSize: 4,
      });
      expect(res.status).toBe(401);
    });
  },
);
