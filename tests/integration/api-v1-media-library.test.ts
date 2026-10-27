import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET as GET_LIBRARY,
  POST as POST_MEDIA,
} from "../../app/api/v1/media/[workspaceId]/route";
import {
  DELETE as DELETE_MEDIA,
  GET as GET_MEDIA,
} from "../../app/api/v1/media/[workspaceId]/[mediaObjectId]/route";
import { POST as POST_ASSIGN } from "../../app/api/v1/media/[workspaceId]/[mediaObjectId]/assignments/route";
import { DELETE as DELETE_ASSIGN } from "../../app/api/v1/media/[workspaceId]/[mediaObjectId]/assignments/[clientProfileId]/route";
import { GET as GET_ASSIGNED } from "../../app/api/v1/media/[workspaceId]/assigned/route";
import {
  GET as GET_OBJECT,
  PUT as PUT_OBJECT,
} from "../../app/api/v1/media/object/route";

/**
 * T6 (R7/R8) end-to-end contract on real PG + the local adapter: the staff
 * library list with type/ownership filters, the assignment write, the
 * client-visible assigned list (own scope, cross-client denial), the
 * download mint through an assignment grant, and the FAIL delete decision
 * (409 `has_assignments` until every grant is revoked).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const SECRET = "media-library-integration-signing-secret";

let mediaDir = "";

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

const postMedia = (workspaceId: string, token: string | null, body: unknown) =>
  POST_MEDIA(authed(`/api/v1/media/${workspaceId}`, "POST", token, body), {
    params: Promise.resolve({ workspaceId }),
  });

const getLibrary = (workspaceId: string, token: string | null, qs = "") =>
  GET_LIBRARY(authed(`/api/v1/media/${workspaceId}${qs}`, "GET", token), {
    params: Promise.resolve({ workspaceId }),
  });

const getMedia = (workspaceId: string, id: string, token: string | null) =>
  GET_MEDIA(authed(`/api/v1/media/${workspaceId}/${id}`, "GET", token), {
    params: Promise.resolve({ workspaceId, mediaObjectId: id }),
  });

const deleteMedia = (workspaceId: string, id: string, token: string | null) =>
  DELETE_MEDIA(authed(`/api/v1/media/${workspaceId}/${id}`, "DELETE", token), {
    params: Promise.resolve({ workspaceId, mediaObjectId: id }),
  });

const postAssign = (
  workspaceId: string,
  id: string,
  token: string | null,
  clientProfileId: string,
) =>
  POST_ASSIGN(
    authed(`/api/v1/media/${workspaceId}/${id}/assignments`, "POST", token, {
      clientProfileId,
    }),
    { params: Promise.resolve({ workspaceId, mediaObjectId: id }) },
  );

const deleteAssign = (
  workspaceId: string,
  id: string,
  clientProfileId: string,
  token: string | null,
) =>
  DELETE_ASSIGN(
    authed(
      `/api/v1/media/${workspaceId}/${id}/assignments/${clientProfileId}`,
      "DELETE",
      token,
    ),
    {
      params: Promise.resolve({
        workspaceId,
        mediaObjectId: id,
        clientProfileId,
      }),
    },
  );

const getAssigned = (
  workspaceId: string,
  token: string | null,
  clientProfileId?: string,
) =>
  GET_ASSIGNED(
    authed(
      `/api/v1/media/${workspaceId}/assigned${clientProfileId ? `?clientProfileId=${clientProfileId}` : ""}`,
      "GET",
      token,
    ),
    { params: Promise.resolve({ workspaceId }) },
  );

const putObject = (path: string, bytes: Uint8Array) =>
  PUT_OBJECT(
    new Request(`${BASE}${path}`, {
      method: "PUT",
      body: bytes.slice().buffer as ArrayBuffer,
    }),
  );

const getObject = (path: string) => GET_OBJECT(new Request(`${BASE}${path}`));

describe.skipIf(!enabled)(
  "T6 /api/v1/media library + assignment (real PG)",
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

    async function uploadBytes(
      workspaceId: string,
      token: string,
      body: Record<string, unknown>,
      bytes = new Uint8Array([9, 8, 7, 6]),
    ) {
      const intent = await postMedia(workspaceId, token, {
        byteSize: bytes.byteLength,
        ...body,
      });
      expect(intent.status).toBe(200);
      const intentBody = await intent.json();
      const put = await putObject(
        intentBody.upload.url.replace(BASE, ""),
        bytes,
      );
      expect(put.status).toBe(200);
      return intentBody.mediaObject.id as string;
    }

    beforeAll(async () => {
      process.env.MEDIA_STORAGE_SIGNING_SECRET = SECRET;
      mkdirSync(join(process.cwd(), "var"), { recursive: true });
      mediaDir = mkdtempSync(join(process.cwd(), "var", "media-lib-"));
      process.env.MEDIA_STORAGE_DIR = mediaDir;
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "media_assignment","media_object","rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      rmSync(mediaDir, { recursive: true, force: true });
      delete process.env.MEDIA_STORAGE_DIR;
      delete process.env.MEDIA_STORAGE_SIGNING_SECRET;
    });

    it("staff library upload lands with no client owner and filters by type and ownership", async () => {
      const ws = await workspace();
      const coach = await member(ws.id, "COACH");
      const token = await signInToken(coach.email);
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Anna" },
      });

      const libImage = await uploadBytes(ws.id, token, {
        fileName: "guide.jpg",
        contentType: "image/jpeg",
        library: true,
      });
      await uploadBytes(ws.id, token, {
        fileName: "note.wav",
        contentType: "audio/wav",
        clientProfileId: client.id,
      });
      const libDoc = await uploadBytes(ws.id, token, {
        fileName: "plan.pdf",
        contentType: "application/pdf",
        library: true,
      });

      const all = await getLibrary(ws.id, token);
      expect(all.status).toBe(200);
      const allBody = await all.json();
      expect(allBody.items).toHaveLength(3);
      const libraryRow = allBody.items.find(
        (item: { id: string }) => item.id === libImage,
      );
      expect(libraryRow.clientProfileId).toBeNull();
      expect(libraryRow.assignedClientProfileIds).toEqual([]);

      const images = await getLibrary(ws.id, token, "?type=IMAGE");
      expect((await images.json()).items).toHaveLength(1);

      const owned = await getLibrary(ws.id, token, "?ownership=library");
      expect((await owned.json()).items).toHaveLength(2);

      const clientOwned = await getLibrary(ws.id, token, "?ownership=client");
      const clientBody = await clientOwned.json();
      expect(clientBody.items).toHaveLength(1);
      expect(clientBody.items[0].clientProfileId).toBe(client.id);

      expect(libDoc).toBeTruthy();
    });

    it("client role cannot list the library and cannot upload to it", async () => {
      const ws = await workspace();
      const client = await member(ws.id, "CLIENT", "Anna");
      const token = await signInToken(client.email);

      const list = await getLibrary(ws.id, token);
      expect(list.status).toBe(403);

      const intent = await postMedia(ws.id, token, {
        fileName: "sneaky.pdf",
        contentType: "application/pdf",
        byteSize: 4,
        library: true,
      });
      expect(intent.status).toBe(400);

      const deletion = await deleteMedia(ws.id, "whatever", token);
      expect(deletion.status).toBe(403);

      const assign = await postAssign(ws.id, "whatever", token, "cp1");
      expect(assign.status).toBe(403);
    });

    it("assign grants the client-visible list, unassign removes it, and foreign clients see nothing", async () => {
      const ws = await workspace();
      const coach = await member(ws.id, "COACH");
      const coachToken = await signInToken(coach.email);
      const anna = await member(ws.id, "CLIENT", "Anna");
      const boris = await member(ws.id, "CLIENT", "Boris");
      const annaToken = await signInToken(anna.email);
      const borisToken = await signInToken(boris.email);

      const mediaId = await uploadBytes(ws.id, coachToken, {
        fileName: "guide.pdf",
        contentType: "application/pdf",
        library: true,
      });

      const granted = await postAssign(
        ws.id,
        mediaId,
        coachToken,
        anna.clientProfile!.id,
      );
      expect(granted.status).toBe(200);
      const grantBody = await granted.json();
      expect(grantBody.assignment.clientProfileId).toBe(anna.clientProfile!.id);

      // Idempotent second assign returns the same grant.
      const again = await postAssign(
        ws.id,
        mediaId,
        coachToken,
        anna.clientProfile!.id,
      );
      expect(again.status).toBe(200);
      expect((await again.json()).assignment.id).toBe(grantBody.assignment.id);

      const annaList = await getAssigned(ws.id, annaToken);
      expect(annaList.status).toBe(200);
      const annaItems = (await annaList.json()).items;
      expect(annaItems).toHaveLength(1);
      expect(annaItems[0].mediaObjectId).toBe(mediaId);
      expect(annaItems[0].fileName).toBe("guide.pdf");

      // Boris has no grant: empty list, no mint, no spoofed profile read.
      const borisList = await getAssigned(ws.id, borisToken);
      expect((await borisList.json()).items).toHaveLength(0);
      expect((await getMedia(ws.id, mediaId, borisToken)).status).toBe(403);
      expect(
        (await getAssigned(ws.id, borisToken, anna.clientProfile!.id)).status,
      ).toBe(403);

      // The grant also mints the download for Anna.
      const mint = await getMedia(ws.id, mediaId, annaToken);
      expect(mint.status).toBe(200);
      const download = (await mint.json()).download.url;
      const object = await getObject(download.replace(BASE, ""));
      expect(object.status).toBe(200);
      expect(object.headers.get("content-type")).toBe("application/pdf");

      // Staff preview of a client's surface.
      const preview = await getAssigned(
        ws.id,
        coachToken,
        anna.clientProfile!.id,
      );
      expect(preview.status).toBe(200);
      expect((await preview.json()).items).toHaveLength(1);

      // Unassign revokes list and mint.
      const removed = await deleteAssign(
        ws.id,
        mediaId,
        anna.clientProfile!.id,
        coachToken,
      );
      expect(removed.status).toBe(200);
      expect((await getAssigned(ws.id, annaToken)).status).toBe(200);
      expect(
        (await (await getAssigned(ws.id, annaToken)).json()).items,
      ).toHaveLength(0);
      expect((await getMedia(ws.id, mediaId, annaToken)).status).toBe(403);

      // Second revoke is a 404, not an error.
      expect(
        (await deleteAssign(ws.id, mediaId, anna.clientProfile!.id, coachToken))
          .status,
      ).toBe(404);
    });

    it("deleting an assigned item fails with 409 until grants are removed", async () => {
      const ws = await workspace();
      const coach = await member(ws.id, "COACH");
      const token = await signInToken(coach.email);
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Anna" },
      });
      const mediaId = await uploadBytes(ws.id, token, {
        fileName: "clip.mp4",
        contentType: "video/mp4",
        library: true,
      });

      // Unassigned items delete cleanly.
      const clean = await deleteMedia(ws.id, mediaId, token);
      expect(clean.status).toBe(200);
      const stillThere = await getLibrary(ws.id, token);
      expect(
        (await stillThere.json()).items.find(
          (item: { id: string }) => item.id === mediaId,
        ),
      ).toBeUndefined();

      const assignedId = await uploadBytes(ws.id, token, {
        fileName: "shared.mp4",
        contentType: "video/mp4",
        library: true,
      });
      await postAssign(ws.id, assignedId, token, client.id);
      const blocked = await deleteMedia(ws.id, assignedId, token);
      expect(blocked.status).toBe(409);
      expect((await blocked.json()).error.code).toBe("has_assignments");
      // Row stays live.
      expect(
        (await (await getLibrary(ws.id, token)).json()).items.find(
          (item: { id: string }) => item.id === assignedId,
        ),
      ).toBeTruthy();

      await deleteAssign(ws.id, assignedId, client.id, token);
      expect((await deleteMedia(ws.id, assignedId, token)).status).toBe(200);
      // Deleting again is a 404.
      expect((await deleteMedia(ws.id, assignedId, token)).status).toBe(404);
    });

    it("cross-workspace and unauthenticated calls are denied", async () => {
      const wsA = await workspace();
      const wsB = await workspace();
      const coachA = await member(wsA.id, "COACH");
      const tokenA = await signInToken(coachA.email);
      const clientB = await prisma.clientProfile.create({
        data: { workspaceId: wsB.id, name: "Foreign" },
      });
      const mediaId = await uploadBytes(wsA.id, tokenA, {
        fileName: "g.pdf",
        contentType: "application/pdf",
        library: true,
      });

      // Assigning a foreign workspace's client is a 404, not a leak.
      expect(
        (await postAssign(wsA.id, mediaId, tokenA, clientB.id)).status,
      ).toBe(404);
      // Assigning a foreign workspace's media is a 404.
      expect(
        (
          await postAssign(
            wsA.id,
            mediaId,
            tokenA,
            (
              await prisma.clientProfile.create({
                data: { workspaceId: wsA.id, name: "Local" },
              })
            ).id,
          )
        ).status,
      ).toBe(200);
      const memberB = await member(wsB.id, "COACH");
      const tokenB = await signInToken(memberB.email);
      expect(
        (
          await postAssign(
            wsB.id,
            mediaId,
            tokenB,
            (
              await prisma.clientProfile.create({
                data: { workspaceId: wsB.id, name: "B2" },
              })
            ).id,
          )
        ).status,
      ).toBe(404);
      expect((await getLibrary(wsB.id, tokenB)).status).toBe(200);
      expect(
        (await (await getLibrary(wsB.id, tokenB)).json()).items,
      ).toHaveLength(0);

      // No token at all.
      expect((await getLibrary(wsA.id, null)).status).toBe(401);
      expect((await getAssigned(wsA.id, null)).status).toBe(401);
      expect((await postAssign(wsA.id, mediaId, null, "x")).status).toBe(401);
      expect((await deleteMedia(wsA.id, mediaId, null)).status).toBe(401);
    });

    it("backfills the owner onto pre-T6 client-keyed rows so the ownership filter classifies them", async () => {
      const ws = await workspace();
      const foreign = await workspace();
      const coach = await member(ws.id, "COACH");
      const token = await signInToken(coach.email);
      const client = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, name: "Anna" },
      });
      const foreignClient = await prisma.clientProfile.create({
        data: { workspaceId: foreign.id, name: "Foreign" },
      });

      // Rows written before T6 carried the owner only in the storage key;
      // client_profile_id did not exist yet.
      const legacy = async (storageKey: string, fileName: string) =>
        prisma.mediaObject.create({
          data: {
            workspaceId: ws.id,
            kind: "IMAGE",
            storageKey,
            fileName,
            contentType: "image/png",
            byteSize: BigInt(4),
            uploadedByUserId: coach.user.id,
          },
        });
      const own = await legacy(
        `workspace/${ws.id}/client/${client.id}/legacy-photo`,
        "legacy.png",
      );
      const libraryRow = await legacy(
        `workspace/${ws.id}/client/library/legacy-plan`,
        "plan.png",
      );
      const dangling = await legacy(
        `workspace/${ws.id}/client/${foreignClient.id}/foreign-photo`,
        "foreign.png",
      );
      expect(own.clientProfileId).toBeNull();

      // Re-apply the migration's own backfill statement to these rows.
      const migrationSql = readFileSync(
        join(
          import.meta.dirname,
          "../../db/migrations/20261027000015_media_taxonomy_client_assignment/migration.sql",
        ),
        "utf8",
      );
      const backfill = migrationSql
        .split(";")
        .find(
          (statement) =>
            /\bUPDATE\b/.test(statement) &&
            statement.includes("client_profile_id"),
        );
      expect(backfill).toBeTruthy();
      await prisma.$executeRawUnsafe(backfill as string);

      const rows = await prisma.mediaObject.findMany({
        where: { workspaceId: ws.id },
        select: { id: true, clientProfileId: true },
      });
      const ownerOf = (id: string) =>
        rows.find((row) => row.id === id)?.clientProfileId;
      expect(ownerOf(own.id)).toBe(client.id);
      // The library pseudo-owner and a profile in another workspace stay NULL.
      expect(ownerOf(libraryRow.id)).toBeNull();
      expect(ownerOf(dangling.id)).toBeNull();

      const clientOwned = await getLibrary(ws.id, token, "?ownership=client");
      const clientIds = (await clientOwned.json()).items.map(
        (item: { id: string }) => item.id,
      );
      expect(clientIds).toContain(own.id);
      expect(clientIds).not.toContain(libraryRow.id);
      expect(clientIds).not.toContain(dangling.id);

      const coachLibrary = await getLibrary(ws.id, token, "?ownership=library");
      const libraryIds = (await coachLibrary.json()).items.map(
        (item: { id: string }) => item.id,
      );
      expect(libraryIds).toContain(libraryRow.id);
      expect(libraryIds).not.toContain(own.id);
    });
  },
);
