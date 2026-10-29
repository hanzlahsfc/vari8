import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { POST as POST_MEDIA } from "../../app/api/v1/media/[workspaceId]/route";
import { GET as GET_MEDIA } from "../../app/api/v1/media/[workspaceId]/[mediaObjectId]/route";
import { PUT as PUT_OBJECT } from "../../app/api/v1/media/object/route";
import {
  GET as LIST_PHOTOS,
  POST as CREATE_PHOTO,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/route";
import {
  DELETE as DELETE_PHOTO,
  GET as GET_PHOTO,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/[entryId]/route";
import { GET as COMPARE_PHOTOS } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/compare/route";

/**
 * Card 08 (#172) end-to-end contract on real PG + the local adapter: a
 * dated progress photo created over the real media upload (intent +
 * presigned PUT), listing for coach and client, same-client comparison,
 * cross-client refusal, by-id/by-url denial and entry soft delete that
 * leaves the media_object row for the retention pass.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const SECRET = "progress-photo-integration-signing-secret";

let mediaDir = "";

function postIntent(workspaceId: string, token: string, body: unknown) {
  return POST_MEDIA(
    new Request(`${BASE}/api/v1/media/${workspaceId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

const putObject = (path: string, bytes: Uint8Array) =>
  PUT_OBJECT(
    new Request(`${BASE}${path}`, {
      method: "PUT",
      body: bytes.slice().buffer as ArrayBuffer,
    }),
  );

function listPhotos(
  workspaceId: string,
  clientProfileId: string,
  token: string | null,
) {
  return LIST_PHOTOS(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/progress-photos`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function createPhoto(
  workspaceId: string,
  clientProfileId: string,
  token: string,
  body: unknown,
) {
  return CREATE_PHOTO(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/progress-photos`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function getPhoto(
  workspaceId: string,
  clientProfileId: string,
  entryId: string,
  token: string,
) {
  return GET_PHOTO(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/progress-photos/${entryId}`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId, entryId }) },
  );
}

function deletePhoto(
  workspaceId: string,
  clientProfileId: string,
  entryId: string,
  token: string,
) {
  return DELETE_PHOTO(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/progress-photos/${entryId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId, entryId }) },
  );
}

function comparePhotos(
  workspaceId: string,
  clientProfileId: string,
  first: string,
  second: string,
  token: string,
) {
  return COMPARE_PHOTOS(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/progress-photos/compare?first=${first}&second=${second}`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
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

describe.skipIf(!enabled)(
  "card-08 /api/v1 progress photos (real PG, local adapter)",
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

    /** Real upload: intent + presigned PUT, returns the media object id. */
    async function uploadImage(
      workspaceId: string,
      token: string,
      clientProfileId?: string,
      contentType = "image/png",
    ) {
      const bytes = new Uint8Array([1, 2, 3, 4, ++n % 250]);
      const intent = await postIntent(workspaceId, token, {
        fileName: "photo.png",
        contentType,
        byteSize: bytes.byteLength,
        ...(clientProfileId ? { clientProfileId } : {}),
      });
      expect(intent.status).toBe(200);
      const body = await intent.json();
      expect((await putObject(body.upload.url, bytes)).status).toBe(200);
      return body.mediaObject.id as string;
    }

    beforeAll(async () => {
      process.env.MEDIA_STORAGE_SIGNING_SECRET = SECRET;
      mkdirSync(join(process.cwd(), "var"), { recursive: true });
      mediaDir = mkdtempSync(join(process.cwd(), "var", "media-photo-int-"));
      process.env.MEDIA_STORAGE_DIR = mediaDir;
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "progress_photo_entry","media_object","rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      rmSync(mediaDir, { recursive: true, force: true });
      delete process.env.MEDIA_STORAGE_DIR;
      delete process.env.MEDIA_STORAGE_SIGNING_SECRET;
    });

    it("client uploads a dated photo; the coach list shows it with the date", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self", userId: user.id },
      });
      const coach = await member(ws.id, "COACH");
      const clientToken = await signInToken(email);
      const coachToken = await signInToken(coach.email);

      const mediaId = await uploadImage(ws.id, clientToken);
      const res = await createPhoto(ws.id, client.id, clientToken, {
        mediaObjectId: mediaId,
        takenOn: "2026-10-01",
      });
      expect(res.status).toBe(200);
      const { entry } = await res.json();
      expect(entry.takenOn).toBe("2026-10-01");
      expect(entry.mediaObjectId).toBe(mediaId);

      const coachList = await listPhotos(ws.id, client.id, coachToken);
      expect(coachList.status).toBe(200);
      const { entries } = await coachList.json();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: entry.id,
        mediaObjectId: mediaId,
        takenOn: "2026-10-01",
      });
    });

    it("defaults takenOn to today when the client does not pick a date", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self", userId: user.id },
      });
      const token = await signInToken(email);
      const mediaId = await uploadImage(ws.id, token);
      const res = await createPhoto(ws.id, client.id, token, {
        mediaObjectId: mediaId,
      });
      expect(res.status).toBe(200);
      const { entry } = await res.json();
      const today = new Date().toISOString().slice(0, 10);
      expect(entry.takenOn).toBe(today);
    });

    it("compares two entries of the same client and refuses a cross-client pair", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      const first = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self", userId: user.id },
      });
      const second = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Other" },
      });
      const coach = await member(ws.id, "COACH");
      const clientToken = await signInToken(email);
      const coachToken = await signInToken(coach.email);

      const aMedia = await uploadImage(ws.id, clientToken);
      const bMedia = await uploadImage(ws.id, clientToken);
      const a = (
        await (
          await createPhoto(ws.id, first.id, clientToken, {
            mediaObjectId: aMedia,
            takenOn: "2026-09-01",
          })
        ).json()
      ).entry;
      const b = (
        await (
          await createPhoto(ws.id, first.id, clientToken, {
            mediaObjectId: bMedia,
            takenOn: "2026-10-01",
          })
        ).json()
      ).entry;
      const otherMedia = await uploadImage(ws.id, coachToken, second.id);
      const other = (
        await (
          await createPhoto(ws.id, second.id, coachToken, {
            mediaObjectId: otherMedia,
            takenOn: "2026-10-02",
          })
        ).json()
      ).entry;

      const ok = await comparePhotos(ws.id, first.id, a.id, b.id, coachToken);
      expect(ok.status).toBe(200);
      const pair = await ok.json();
      expect(pair.first.id).toBe(a.id);
      expect(pair.second.id).toBe(b.id);

      // A pair spanning two clients is refused - under either client's path.
      const cross = await comparePhotos(
        ws.id,
        first.id,
        a.id,
        other.id,
        coachToken,
      );
      expect(cross.status).toBe(404);
      const crossUnderOther = await comparePhotos(
        ws.id,
        second.id,
        a.id,
        other.id,
        coachToken,
      );
      expect(crossUnderOther.status).toBe(404);
    });

    it("denies a client another client's list, entry id and media url", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      const own = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self", userId: user.id },
      });
      const other = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Other" },
      });
      const coach = await member(ws.id, "COACH");
      const clientToken = await signInToken(email);
      const coachToken = await signInToken(coach.email);

      const otherMedia = await uploadImage(ws.id, coachToken, other.id);
      const otherEntry = (
        await (
          await createPhoto(ws.id, other.id, coachToken, {
            mediaObjectId: otherMedia,
            takenOn: "2026-10-03",
          })
        ).json()
      ).entry;

      // By list: another client's path is forbidden under own scope.
      expect((await listPhotos(ws.id, other.id, clientToken)).status).toBe(403);
      // By entry id under the foreign client's path: forbidden; under the
      // client's own path the foreign entry reads as not found.
      expect(
        (await getPhoto(ws.id, other.id, otherEntry.id, clientToken)).status,
      ).toBe(403);
      expect(
        (await getPhoto(ws.id, own.id, otherEntry.id, clientToken)).status,
      ).toBe(404);
      // By url: the media mint still refuses a foreign-profile object.
      expect((await getMedia(ws.id, otherMedia, clientToken)).status).toBe(403);
      // Compare with a foreign entry is refused for the client too.
      const ownMedia = await uploadImage(ws.id, clientToken);
      const ownEntry = (
        await (
          await createPhoto(ws.id, own.id, clientToken, {
            mediaObjectId: ownMedia,
          })
        ).json()
      ).entry;
      expect(
        (
          await comparePhotos(
            ws.id,
            own.id,
            ownEntry.id,
            otherEntry.id,
            clientToken,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await comparePhotos(
            ws.id,
            other.id,
            ownEntry.id,
            otherEntry.id,
            clientToken,
          )
        ).status,
      ).toBe(403);
    });

    it("hides client-invisible entries from the client, not the coach", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self", userId: user.id },
      });
      const coach = await member(ws.id, "COACH");
      const clientToken = await signInToken(email);
      const coachToken = await signInToken(coach.email);

      const hidden = await uploadImage(ws.id, coachToken, client.id);
      const shown = await uploadImage(ws.id, clientToken);
      await createPhoto(ws.id, client.id, coachToken, {
        mediaObjectId: hidden,
        takenOn: "2026-10-04",
        clientVisible: false,
      });
      await createPhoto(ws.id, client.id, clientToken, {
        mediaObjectId: shown,
        takenOn: "2026-10-05",
      });

      const coachList = await (
        await listPhotos(ws.id, client.id, coachToken)
      ).json();
      expect(coachList.entries).toHaveLength(2);
      const clientList = await (
        await listPhotos(ws.id, client.id, clientToken)
      ).json();
      expect(clientList.entries).toHaveLength(1);
      expect(clientList.entries[0].takenOn).toBe("2026-10-05");
    });

    it("soft deletes the entry and keeps the media object", async () => {
      const ws = await workspace();
      const { user, email } = await member(ws.id, "CLIENT");
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self", userId: user.id },
      });
      const coach = await member(ws.id, "COACH");
      const clientToken = await signInToken(email);
      const coachToken = await signInToken(coach.email);

      const mediaId = await uploadImage(ws.id, clientToken);
      const { entry } = await (
        await createPhoto(ws.id, client.id, clientToken, {
          mediaObjectId: mediaId,
          takenOn: "2026-10-06",
        })
      ).json();

      expect(
        (await deletePhoto(ws.id, client.id, entry.id, clientToken)).status,
      ).toBe(200);
      const after = await (
        await listPhotos(ws.id, client.id, coachToken)
      ).json();
      expect(after.entries).toHaveLength(0);
      expect(
        (await getPhoto(ws.id, client.id, entry.id, coachToken)).status,
      ).toBe(404);

      // Retention pass input: the media object row and its bytes stay.
      const media = await prisma.mediaObject.findUniqueOrThrow({
        where: { id: mediaId },
      });
      expect(media.deletedAt).toBeNull();
      const mint = await getMedia(ws.id, mediaId, coachToken);
      expect(mint.status).toBe(200);
      // Re-deleting is not found.
      expect(
        (await deletePhoto(ws.id, client.id, entry.id, clientToken)).status,
      ).toBe(404);
    });

    it("rejects non-image media and foreign or reused objects", async () => {
      const ws = await workspace();
      const other = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Other" },
      });
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self" },
      });
      const coach = await member(ws.id, "COACH");
      const coachToken = await signInToken(coach.email);

      // Audio is a valid upload but not a progress photo.
      const audio = await uploadImage(
        ws.id,
        coachToken,
        client.id,
        "audio/wav",
      );
      expect(
        (
          await createPhoto(ws.id, client.id, coachToken, {
            mediaObjectId: audio,
          })
        ).status,
      ).toBe(400);

      // Media anchored to another client cannot be pinned to this client.
      const foreign = await uploadImage(ws.id, coachToken, other.id);
      expect(
        (
          await createPhoto(ws.id, client.id, coachToken, {
            mediaObjectId: foreign,
          })
        ).status,
      ).toBe(400);

      // One media object backs at most one entry.
      const media = await uploadImage(ws.id, coachToken, client.id);
      expect(
        (
          await createPhoto(ws.id, client.id, coachToken, {
            mediaObjectId: media,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await createPhoto(ws.id, client.id, coachToken, {
            mediaObjectId: media,
          })
        ).status,
      ).toBe(400);
    });

    it("requires authentication", async () => {
      const ws = await workspace();
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Self" },
      });
      expect((await listPhotos(ws.id, client.id, null)).status).toBe(401);
    });
  },
);
