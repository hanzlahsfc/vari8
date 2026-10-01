/**
 * S1-G provider-neutral object-storage port.
 *
 * Documented boundary (`docs/tasks/stage-1-plan.md` §7): a private bucket, no
 * ACL/public-URL model, server-generated presigned GETs with a short TTL, and
 * keys prefixed by workspace + client. **No storage vendor, bucket, region, or
 * credentials are decided** (`TODO(human)`); the only implementation here is
 * `nullObjectStorage`, which fails closed — it can never mint a URL and
 * reports zero deleted objects because no upload path or backend has ever
 * existed.
 *
 * `deletePrefix` exists for the deferred erasure slice: storage deletion and
 * the erasure database transaction are NOT atomic, and no design may claim
 * they are. Implementations must be idempotent and safe to retry; a real
 * backend's delete failure must abort the caller's operation.
 *
 * No vendor-specific APIs or provider SDKs. No app/route/UI file may import
 * this module (`assertObjectStorageExternallyExposable` fails closed).
 */

export type StorageErrorCode =
  "invalid_input" | "invalid_key" | "invalid_ttl" | "storage_not_configured";

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(code);
    this.name = "StorageError";
  }
}

export class ObjectStorageNotExposableError extends Error {
  constructor(readonly code: "object_storage_not_exposable") {
    super(code);
    this.name = "ObjectStorageNotExposableError";
  }
}

export type ObjectStorageBackend = {
  /** Structural label only — never a vendor configuration. */
  readonly name: string;
  /**
   * Server-generated presigned GET for an already-validated client object
   * key. The backend MUST call `assertPresignGetTtl` before issuing.
   */
  presignGet(key: string, ttlSeconds: number): Promise<string>;
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
 * Presigned-GET TTL bound check — pure and parameterized so it is testable
 * without a decided production value. Both operands must be positive integers
 * and `ttlSeconds <= maxTtlSeconds`; anything else throws `invalid_ttl`. The
 * production bound value is `TODO(human)`; callers inject it, and no backend
 * exists to reach it today.
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

/**
 * The only backend in this slice. `presignGet` always throws
 * `storage_not_configured` — no URL can be minted before a vendor decision.
 * `deletePrefix` returns zero: no object could ever have been written.
 */
export const nullObjectStorage: ObjectStorageBackend = {
  name: "none",
  presignGet: async () => {
    throw new StorageError("storage_not_configured");
  },
  deletePrefix: () => Promise.resolve({ deleted: 0 }),
};

/**
 * No external surface may reach storage yet: no decided vendor/bucket/TTL, no
 * upload path, no reviewed route. Fails closed; not a placeholder no-op.
 */
export function assertObjectStorageExternallyExposable(): never {
  throw new ObjectStorageNotExposableError("object_storage_not_exposable");
}
