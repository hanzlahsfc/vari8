import { createHmac, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

import {
  assertPresignGetTtl,
  MAX_PRESIGN_TTL_SECONDS,
  parseClientObjectKey,
  StorageError,
  type ObjectStorageBackend,
  type PresignedDownload,
  type PresignedUpload,
} from "../storage";

/**
 * PR-MEDIA local-disk adapter (D8, D20): the development and test backend for
 * the storage port. Objects live under `MEDIA_STORAGE_DIR` (default
 * `<cwd>/var/media`, gitignored) and "presigned" URLs are relative paths into
 * `app/api/v1/media/object/route.ts` carrying an HMAC-SHA256 signature over
 * `op\nkey\nexpires` — the same trust shape as a real presigned URL: the
 * signature is the credential, no session is required to redeem it.
 *
 * Signing secret: `MEDIA_STORAGE_SIGNING_SECRET`, falling back to
 * `BETTER_AUTH_SECRET` (already required in every environment). Without a
 * secret the adapter fails closed (`storage_not_configured`).
 */

const LOCAL_ROUTE = "/api/v1/media/object";

export type LocalStorageConfig = {
  dir: string;
  secret: string;
};

export function localStorageConfig(
  env: Record<string, string | undefined> = process.env,
): LocalStorageConfig {
  const secret = env.MEDIA_STORAGE_SIGNING_SECRET ?? env.BETTER_AUTH_SECRET;
  if (typeof secret !== "string" || secret.length === 0)
    throw new StorageError("storage_not_configured");
  const dir = env.MEDIA_STORAGE_DIR ?? join(process.cwd(), "var", "media");
  return { dir, secret };
}

function signature(
  secret: string,
  op: "get" | "put",
  key: string,
  expiresAt: number,
): string {
  return createHmac("sha256", secret)
    .update(`${op}\n${key}\n${expiresAt}`)
    .digest("hex");
}

/**
 * Verifies a signed local object request: hex HMAC over `op\nkey\nexpires`,
 * compared in constant time, plus expiry. Returns boolean — never throws —
 * so the object route fails closed on any malformed input.
 */
export function verifyLocalObjectSignature(input: {
  secret: string;
  op: "get" | "put";
  key: string;
  expiresAt: number;
  signature: string;
  now?: number;
}): boolean {
  const { secret, op, key, expiresAt, signature: sig } = input;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(expiresAt) || expiresAt <= now) return false;
  if (typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = Buffer.from(signature(secret, op, key, expiresAt), "hex");
  const given = Buffer.from(sig, "hex");
  return timingSafeEqual(expected, given);
}

function signedPath(
  secret: string,
  op: "get" | "put",
  key: string,
  expiresAt: number,
): string {
  const params = new URLSearchParams({
    op,
    key,
    e: String(expiresAt),
    s: signature(secret, op, key, expiresAt),
  });
  return `${LOCAL_ROUTE}?${params.toString()}`;
}

/**
 * Absolute on-disk path for a key. `parseClientObjectKey` bounds every
 * segment to `[A-Za-z0-9._-]` (object never starts with a dot, ids never
 * contain dots), so the join cannot escape `dir` — the normalize+prefix
 * check is belt-and-braces against future key-shape changes.
 */
export function localObjectPath(dir: string, key: string): string {
  const { workspaceId, clientProfileId, objectId } = parseClientObjectKey(key);
  const path = normalize(
    join(dir, "workspace", workspaceId, "client", clientProfileId, objectId),
  );
  const root = normalize(dir) + sep;
  if (!path.startsWith(root)) throw new StorageError("invalid_key");
  return path;
}

export async function writeLocalObject(
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  const { dir } = localStorageConfig();
  const path = localObjectPath(dir, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

/** Object bytes, or null when no file exists at the key. */
export async function readLocalObject(key: string): Promise<Uint8Array | null> {
  const { dir } = localStorageConfig();
  try {
    return await readFile(localObjectPath(dir, key));
  } catch {
    return null;
  }
}

export const localObjectStorage: ObjectStorageBackend = {
  name: "local",

  presignGet: async (key, ttlSeconds): Promise<PresignedDownload> => {
    assertPresignGetTtl(ttlSeconds, MAX_PRESIGN_TTL_SECONDS);
    parseClientObjectKey(key);
    const { secret } = localStorageConfig();
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    return {
      url: signedPath(secret, "get", key, expiresAt),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  },

  presignPut: async (key, options): Promise<PresignedUpload> => {
    assertPresignGetTtl(options.ttlSeconds, MAX_PRESIGN_TTL_SECONDS);
    parseClientObjectKey(key);
    const { secret } = localStorageConfig();
    const expiresAt = Math.floor(Date.now() / 1000) + options.ttlSeconds;
    return {
      url: signedPath(secret, "put", key, expiresAt),
      method: "PUT",
      headers: { "content-type": options.contentType },
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  },

  deletePrefix: async (prefix) => {
    const { dir } = localStorageConfig();
    // A prefix is `workspace/<ws>/client/<cp>/` (or shorter); delete the
    // deepest named directory and count the files it held.
    const target = normalize(join(dir, prefix));
    const root = normalize(dir) + sep;
    if (!target.startsWith(root)) throw new StorageError("invalid_key");
    let deleted = 0;
    try {
      const count = async (p: string): Promise<number> => {
        let n = 0;
        for (const entry of await readdir(p, { withFileTypes: true })) {
          if (entry.isDirectory()) n += await count(join(p, entry.name));
          else n += 1;
        }
        return n;
      };
      if ((await stat(target)).isDirectory()) deleted = await count(target);
      await rm(target, { recursive: true, force: true });
    } catch {
      deleted = 0;
    }
    return { deleted };
  },
};
