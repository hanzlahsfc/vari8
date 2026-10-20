import { prisma } from "@/lib/db";
import {
  getObjectStorage,
  MAX_MEDIA_BYTES,
  parseClientObjectKey,
} from "@/lib/storage";
import {
  localStorageConfig,
  readLocalObject,
  verifyLocalObjectSignature,
  writeLocalObject,
} from "@/lib/storage/local";

/**
 * PR-MEDIA local-backend object endpoint (D20). This is the redemption
 * target for the `local` adapter's presigned URLs — the HMAC signature is
 * the credential here, exactly like an S3 presigned URL: no session is
 * required, but the signature binds operation + key + expiry, every key is
 * validated against the workspace/client prefix grammar, and the
 * media_object row must exist, be live, and (on PUT) match the declared
 * byte size before a single byte is read or written.
 *
 * It answers 404 unless the active backend is `local`, so a deployment on a
 * real bucket exposes no signature-verification surface at all.
 */
export const dynamic = "force-dynamic";

function error(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status });
}

async function localOnly(): Promise<Response | null> {
  const backend = await getObjectStorage();
  return backend.name === "local" ? null : error(404, "not_found");
}

function verifiedKey(
  request: Request,
  op: "get" | "put",
): { key: string } | Response {
  const url = new URL(request.url);
  const e = Number(url.searchParams.get("e"));
  const s = url.searchParams.get("s") ?? "";
  let key: string;
  let secret: string;
  try {
    secret = localStorageConfig().secret;
    key = url.searchParams.get("key") ?? "";
    parseClientObjectKey(key);
  } catch {
    return error(404, "not_found");
  }
  if (
    url.searchParams.get("op") !== op ||
    !verifyLocalObjectSignature({
      secret,
      op,
      key,
      expiresAt: e,
      signature: s,
    })
  )
    return error(403, "invalid_signature");
  return { key };
}

export async function GET(request: Request): Promise<Response> {
  const gate = await localOnly();
  if (gate) return gate;
  const checked = verifiedKey(request, "get");
  if (checked instanceof Response) return checked;

  const media = await prisma.mediaObject.findFirst({
    where: { storageKey: checked.key, deletedAt: null },
    select: { contentType: true, byteSize: true },
  });
  if (!media) return error(404, "not_found");

  const bytes = await readLocalObject(checked.key);
  if (!bytes) return error(404, "not_found");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": media.contentType,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, no-store",
    },
  });
}

export async function PUT(request: Request): Promise<Response> {
  const gate = await localOnly();
  if (gate) return gate;
  const checked = verifiedKey(request, "put");
  if (checked instanceof Response) return checked;

  const media = await prisma.mediaObject.findFirst({
    where: { storageKey: checked.key, deletedAt: null },
    select: { byteSize: true },
  });
  if (!media) return error(404, "not_found");

  const bytes = new Uint8Array(await request.arrayBuffer());
  // The declared size on the media_object row is the contract: a body that
  // is not exactly it — truncated, padded, or swapped — is rejected before
  // a single byte hits disk, and the schema CHECK keeps it inside the
  // 20 MB D20 cap regardless.
  if (
    bytes.byteLength !== Number(media.byteSize) ||
    bytes.byteLength > MAX_MEDIA_BYTES
  )
    return error(400, "invalid_input");

  await writeLocalObject(checked.key, bytes);
  return Response.json({ uploaded: true });
}
