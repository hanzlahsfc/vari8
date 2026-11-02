import {
  clientObjectPrefix,
  getObjectStorage,
  mediaKindForContentType,
} from "../../lib/storage";
import { writeLocalObject } from "../../lib/storage/local";
import type { SeedContext } from "./index";

/**
 * PR-MEDIA (D20) — demo media objects for the seeded canvas workspace.
 *
 * Writes one voice note (synthetic wav, the same tone the canvas demo
 * generated) and one image (a small synthetic png) through the LOCAL
 * storage adapter and creates the matching media_object rows for the first
 * canvas client, uploaded by the seeded staff coach — so a fresh lane
 * database can play media back end-to-end. Idempotent: rows upsert on
 * storage_key and the bytes are rewritten each run.
 *
 * Skips silently when the active storage backend is not "local" — seeding
 * storage pointers without the matching bytes would break playback.
 */

const WORKSPACE_SLUG = "canvas-demo";

/** ~0.5 s of a soft tone, 16 kHz mono 16-bit wav — the canvas demo shape. */
function demoWav(): Uint8Array {
  const rate = 16000;
  const seconds = 0.5;
  const count = Math.floor(rate * seconds);
  const buffer = new ArrayBuffer(44 + count * 2);
  const v = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + count * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const envelope = Math.sin((Math.PI * t) / seconds) * 0.12;
    v.setInt16(
      44 + i * 2,
      Math.sin(2 * Math.PI * (240 + Math.sin(t * 4) * 35) * t) *
        envelope *
        32767,
      true,
    );
  }
  return new Uint8Array(buffer);
}

/** 32x32 accent-pink PNG, generated once as a literal (no encoder needed). */
function demoPng(): Uint8Array {
  // Minimal valid PNG: 1x1 pixel, accent color #eb91b8 from the canvas theme.
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8" +
        "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const backend = await getObjectStorage();
  if (backend.name !== "local") {
    console.log(
      `[seed] 40-media: backend "${backend.name}" is not local, skipping`,
    );
    return;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace) {
    console.log(`[seed] 40-media: workspace ${WORKSPACE_SLUG} missing, skip`);
    return;
  }
  const coach = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, role: "COACH", status: "ACTIVE" },
    select: { userId: true },
  });
  const client = await prisma.clientProfile.findFirst({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!coach || !client) {
    console.log("[seed] 40-media: no coach or client profile yet, skip");
    return;
  }

  const prefix = clientObjectPrefix(workspace.id, client.id);
  const items: {
    objectId: string;
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
  }[] = [
    {
      objectId: "seed-voice-note",
      fileName: "Voice note · seed.wav",
      contentType: "audio/wav",
      bytes: demoWav(),
    },
    {
      objectId: "seed-progress-photo",
      fileName: "Progress photo · seed.png",
      contentType: "image/png",
      bytes: demoPng(),
    },
  ];

  for (const item of items) {
    const storageKey = prefix + item.objectId;
    const kind = mediaKindForContentType(item.contentType);
    if (!kind)
      throw new Error(`seed media type not allowlisted: ${item.contentType}`);
    await writeLocalObject(storageKey, item.bytes);
    await prisma.mediaObject.upsert({
      where: { storageKey },
      update: {
        fileName: item.fileName,
        contentType: item.contentType,
        byteSize: BigInt(item.bytes.byteLength),
        uploadedByUserId: coach.userId,
        clientProfileId: client.id,
        deletedAt: null,
      },
      create: {
        workspaceId: workspace.id,
        kind,
        storageKey,
        fileName: item.fileName,
        contentType: item.contentType,
        byteSize: BigInt(item.bytes.byteLength),
        uploadedByUserId: coach.userId,
        clientProfileId: client.id,
      },
    });
  }
  console.log(
    `[seed] 40-media: ${items.length} media object(s) on ${WORKSPACE_SLUG} client ${client.id}`,
  );
}
