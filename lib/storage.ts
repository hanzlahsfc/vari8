/**
 * Provider-neutral object-storage port (S1-G, extended by PR-MEDIA for D20).
 *
 * Boundary (`docs/tasks/stage-1-plan.md` §7): a private bucket, no
 * ACL/public-URL model, server-generated presigned GETs and PUTs with a
 * short TTL, and keys prefixed by workspace + client. The vendor stays open
 * (D8): `localObjectStorage` (`lib/storage/local.ts`) serves development and
 * test, `s3ObjectStorage` (`lib/storage/s3.ts`) is the environment-configured
 * S3-compatible adapter, and `nullObjectStorage` fails closed when no
 * adapter is configured.
 *
 * `deletePrefix` exists for the deferred erasure slice: storage deletion and
 * the erasure database transaction are NOT atomic, and no design may claim
 * they are. Implementations must be idempotent and safe to retry; a real
 * backend's delete failure must abort the caller's operation.
 *
 * No vendor-specific APIs or provider SDKs leak through this port: callers
 * see keys, presigned URL strings and byte counts only.
 */

export type StorageErrorCode =
  | "invalid_input"
  | "invalid_key"
  | "invalid_ttl"
  | "invalid_signature"
  | "payload_too_large"
  | "unsupported_media_type"
  | "storage_not_configured";

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(code);
    this.name = "StorageError";
  }
}

export type PresignedUpload = {
  /** URL the client PUTs the object bytes to. */
  readonly url: string;
  readonly method: "PUT";
  /** Headers the client MUST send verbatim (signed on real backends). */
  readonly headers: Record<string, string>;
  /** ISO timestamp after which the URL is rejected. */
  readonly expiresAt: string;
};

export type PresignedDownload = {
  readonly url: string;
  readonly expiresAt: string;
};

export type ObjectStorageBackend = {
  /** Structural label only — never a vendor configuration. */
  readonly name: string;
  /**
   * Server-generated presigned GET for an already-validated client object
   * key. The backend MUST call `assertPresignGetTtl` before issuing.
   */
  presignGet(key: string, ttlSeconds: number): Promise<PresignedDownload>;
  /**
   * Server-generated presigned PUT for an already-validated client object
   * key. The backend MUST call `assertPresignGetTtl` before issuing and must
   * bind the declared content type into the signed request.
   */
  presignPut(
    key: string,
    options: { contentType: string; byteSize: number; ttlSeconds: number },
  ): Promise<PresignedUpload>;
  /**
   * Idempotent deletion of every object under a key prefix. Retry-safe by
   * contract: storage deletion is not atomic with any DB transaction.
   */
  deletePrefix(prefix: string): Promise<{ deleted: number }>;
};

const ID_SEGMENT = /^[A-Za-z0-9_-]+$/;
const OBJECT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function requireIdSegment(value: unknown): string {
  if (typeof value !== "string" || !ID_SEGMENT.test(value))
    throw new StorageError("invalid_input");
  return value;
}

/** `workspace/<workspaceId>/client/<clientProfileId>/` — tenant-scoped prefix. */
export function clientObjectPrefix(
  workspaceId: string,
  clientProfileId: string,
): string {
  return `workspace/${requireIdSegment(workspaceId)}/client/${requireIdSegment(clientProfileId)}/`;
}

/**
 * Fail-closed validation that `key` is exactly one object under the given
 * client's prefix: a single trailing segment of `[A-Za-z0-9._-]` that does not
 * start with a dot. Traversal, foreign prefixes, nested/empty segments,
 * backslashes, and non-strings all throw `invalid_key`.
 */
export function assertClientObjectKey(
  key: unknown,
  workspaceId: string,
  clientProfileId: string,
): string {
  if (typeof key !== "string") throw new StorageError("invalid_key");
  const prefix = clientObjectPrefix(workspaceId, clientProfileId);
  if (!key.startsWith(prefix)) throw new StorageError("invalid_key");
  const objectId = key.slice(prefix.length);
  if (!OBJECT_SEGMENT.test(objectId)) throw new StorageError("invalid_key");
  return key;
}

/**
 * Parses a `workspace/<ws>/client/<cp>/<object>` storage key into its parts,
 * validating every segment with the same rules `assertClientObjectKey`
 * enforces. Malformed keys throw `invalid_key` — callers can trust the
 * returned ids as regex-bound path segments, never raw input.
 */
export function parseClientObjectKey(key: unknown): {
  workspaceId: string;
  clientProfileId: string;
  objectId: string;
} {
  if (typeof key !== "string") throw new StorageError("invalid_key");
  const match = /^workspace\/([^/]+)\/client\/([^/]+)\/([^/]+)$/.exec(key);
  if (!match) throw new StorageError("invalid_key");
  const [, workspaceId, clientProfileId, objectId] = match;
  if (
    !ID_SEGMENT.test(workspaceId) ||
    !ID_SEGMENT.test(clientProfileId) ||
    !OBJECT_SEGMENT.test(objectId)
  )
    throw new StorageError("invalid_key");
  return { workspaceId, clientProfileId, objectId };
}

/**
 * Presigned-URL TTL bound check — pure and parameterized so it is testable.
 * Both operands must be positive integers and `ttlSeconds <= maxTtlSeconds`;
 * anything else throws `invalid_ttl`.
 */
export function assertPresignGetTtl(
  ttlSeconds: number,
  maxTtlSeconds: number,
): void {
  if (
    typeof ttlSeconds !== "number" ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds <= 0 ||
    typeof maxTtlSeconds !== "number" ||
    !Number.isInteger(maxTtlSeconds) ||
    maxTtlSeconds <= 0 ||
    ttlSeconds > maxTtlSeconds
  )
    throw new StorageError("invalid_ttl");
}

/* --------------------------------------------------------------------------
 * D20 media rules: the 20 MB cap the canvas shows (and the media_object
 * CHECK mirrors as 1..20971520) plus the closed content-type allowlist.
 * ---------------------------------------------------------------------- */

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

/** Upper bound for every presigned URL this port issues. */
export const MAX_PRESIGN_TTL_SECONDS = 3600;

/** Default presigned-URL lifetime when MEDIA_URL_TTL_SECONDS is unset. */
export const DEFAULT_PRESIGN_TTL_SECONDS = 300;

export type MediaKindName = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

/**
 * Closed allowlist (D20): images, documents, audio and video only, matching
 * what the canvas picker can produce and the recorder emits. Anything else —
 * including `application/octet-stream` — maps to no kind and is rejected.
 */
export const MEDIA_CONTENT_TYPES: Readonly<Record<string, MediaKindName>> = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "image/gif": "IMAGE",
  "image/avif": "IMAGE",
  "image/heic": "IMAGE",
  "audio/wav": "AUDIO",
  "audio/x-wav": "AUDIO",
  "audio/mpeg": "AUDIO",
  "audio/mp4": "AUDIO",
  "audio/ogg": "AUDIO",
  "audio/webm": "AUDIO",
  "audio/aac": "AUDIO",
  "video/webm": "VIDEO",
  "video/mp4": "VIDEO",
  "video/quicktime": "VIDEO",
  "application/pdf": "DOCUMENT",
  "text/plain": "DOCUMENT",
  "application/msword": "DOCUMENT",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCUMENT",
};

/** Content type -> MediaKind, or null for a rejected (non-allowlisted) type. */
export function mediaKindForContentType(
  contentType: unknown,
): MediaKindName | null {
  if (typeof contentType !== "string") return null;
  return MEDIA_CONTENT_TYPES[contentType.toLowerCase().trim()] ?? null;
}

/**
 * The D20 size guard: an integer byte count in `1..MAX_MEDIA_BYTES`.
 * Anything else throws `payload_too_large` (over cap) or `invalid_input`.
 */
export function assertMediaByteSize(byteSize: unknown): number {
  if (
    typeof byteSize !== "number" ||
    !Number.isInteger(byteSize) ||
    byteSize <= 0
  )
    throw new StorageError("invalid_input");
  if (byteSize > MAX_MEDIA_BYTES) throw new StorageError("payload_too_large");
  return byteSize;
}

/**
 * Signed-URL lifetime for this deployment: `MEDIA_URL_TTL_SECONDS` when set
 * to a valid in-bound integer, else the default. Out-of-bound values throw
 * `invalid_ttl` — a misconfigured TTL must not silently widen the window.
 */
export function presignTtlSeconds(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.MEDIA_URL_TTL_SECONDS;
  if (raw === undefined || raw === "") return DEFAULT_PRESIGN_TTL_SECONDS;
  const ttl = Number(raw);
  assertPresignGetTtl(ttl, MAX_PRESIGN_TTL_SECONDS);
  return ttl;
}

/**
 * Fail-closed backend: `presignGet`/`presignPut` always throw
 * `storage_not_configured`. `deletePrefix` reports zero.
 */
export const nullObjectStorage: ObjectStorageBackend = {
  name: "none",
  presignGet: async () => {
    throw new StorageError("storage_not_configured");
  },
  presignPut: async () => {
    throw new StorageError("storage_not_configured");
  },
  deletePrefix: () => Promise.resolve({ deleted: 0 }),
};

/**
 * Resolves the configured backend. `MEDIA_STORAGE_ADAPTER` selects:
 *   "local" — dev/test disk adapter (`lib/storage/local.ts`).
 *   "s3"    — S3-compatible adapter (`lib/storage/s3.ts`), env-configured.
 *   "none"  — fail-closed.
 * Unset means "local" outside production and "none" in production, so a
 * deployed instance without explicit storage config can never mint a URL.
 * Any unknown value fails closed to the null backend.
 */
export async function getObjectStorage(): Promise<ObjectStorageBackend> {
  const adapter = (
    process.env.MEDIA_STORAGE_ADAPTER ??
    (process.env.NODE_ENV === "production" ? "none" : "local")
  ).toLowerCase();
  switch (adapter) {
    case "local": {
      const { localObjectStorage } = await import("./storage/local");
      return localObjectStorage;
    }
    case "s3": {
      const { s3ObjectStorage } = await import("./storage/s3");
      return s3ObjectStorage;
    }
    default:
      return nullObjectStorage;
  }
}
