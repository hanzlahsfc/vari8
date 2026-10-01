import { describe, expect, it } from "vitest";

import {
  assertClientObjectKey,
  assertObjectStorageExternallyExposable,
  assertPresignGetTtl,
  clientObjectPrefix,
  nullObjectStorage,
  ObjectStorageNotExposableError,
  StorageError,
} from "../../lib/storage";

/**
 * S1-G provider-neutral storage port: fail-closed key/TTL validation and a
 * null backend that can never mint a URL. No real backend exists.
 */
describe("S1-G storage port", () => {
  it("derives the workspace+client object prefix", () => {
    expect(clientObjectPrefix("ws1", "cp1")).toBe("workspace/ws1/client/cp1/");
  });

  it("rejects empty or non-string ids in the prefix", () => {
    for (const bad of ["", " ", "a/b", "a\\b", "..", 0, null, undefined]) {
      expect(() => clientObjectPrefix(bad as never, "cp1")).toThrow(
        StorageError,
      );
      expect(() => clientObjectPrefix("ws1", bad as never)).toThrow(
        StorageError,
      );
    }
  });

  it("accepts an object key under the exact client prefix", () => {
    const key = `${clientObjectPrefix("ws1", "cp1")}photo_01.jpg`;
    expect(assertClientObjectKey(key, "ws1", "cp1")).toBe(key);
  });

  const BAD_KEYS: unknown[] = [
    "workspace/ws1/client/cp1/", // prefix only — empty object id
    "workspace/ws1/client/cp1//x", // empty segment
    "workspace/ws1/client/cp1/../secret", // traversal
    "workspace/ws1/client/cp1/..", // traversal
    "workspace/ws1/client/cp2/x", // foreign client
    "workspace/ws2/client/cp1/x", // foreign workspace
    "workspace/ws1/client/cp1x/y", // prefix-adjacent, not under prefix
    "/workspace/ws1/client/cp1/x", // absolute
    "workspace\\ws1\\client\\cp1\\x", // backslashes
    "workspace/ws1/client/cp1/.hidden", // leading-dot object
    "workspace/ws1/client/cp1/a b", // whitespace
    "",
    123,
    null,
    undefined,
  ];
  it.each(BAD_KEYS)("rejects unsafe key %j", (key) => {
    expect(() => assertClientObjectKey(key as never, "ws1", "cp1")).toThrow(
      StorageError,
    );
  });

  it("assertPresignGetTtl accepts an in-bound positive integer", () => {
    expect(() => assertPresignGetTtl(60, 300)).not.toThrow();
    expect(() => assertPresignGetTtl(300, 300)).not.toThrow();
  });

  it.each([
    [301, 300], // over bound
    [0, 300], // zero
    [-5, 300], // negative
    [1.5, 300], // non-integer
    [Number.NaN, 300],
    [60, 0], // invalid bound
    [60, -1],
    [60, 2.5],
    [Number.POSITIVE_INFINITY, 300],
  ])("rejects ttl=%j max=%j", (ttl, max) => {
    expect(() => assertPresignGetTtl(ttl, max)).toThrowError(
      expect.objectContaining({
        name: "StorageError",
        code: "invalid_ttl",
      }),
    );
  });

  it("null backend presign fails closed; deletePrefix reports zero", async () => {
    expect(nullObjectStorage.name).toBe("none");
    await expect(
      nullObjectStorage.presignGet("workspace/ws1/client/cp1/x", 60),
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "storage_not_configured",
    });
    await expect(
      nullObjectStorage.deletePrefix("workspace/ws1/client/cp1/"),
    ).resolves.toEqual({ deleted: 0 });
  });

  it("external exposure assertion fails closed", () => {
    expect(() => assertObjectStorageExternallyExposable()).toThrow(
      ObjectStorageNotExposableError,
    );
    expect(() => assertObjectStorageExternallyExposable()).toThrowError(
      "object_storage_not_exposable",
    );
  });
});
