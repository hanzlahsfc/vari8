import { describe, expect, it } from "vitest";

import {
  assertClientObjectKey,
  assertMediaByteSize,
  assertPresignGetTtl,
  clientObjectPrefix,
  MAX_MEDIA_BYTES,
  mediaKindForContentType,
  nullObjectStorage,
  parseClientObjectKey,
  presignTtlSeconds,
  StorageError,
} from "../../lib/storage";

/**
 * S1-G provider-neutral storage port (extended by PR-MEDIA, D20): fail-closed
 * key/TTL validation, the media type allowlist and 20 MB cap, and a null
 * backend that can never mint a URL.
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
      nullObjectStorage.presignPut("workspace/ws1/client/cp1/x", {
        contentType: "image/png",
        byteSize: 10,
        ttlSeconds: 60,
      }),
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "storage_not_configured",
    });
    await expect(
      nullObjectStorage.deletePrefix("workspace/ws1/client/cp1/"),
    ).resolves.toEqual({ deleted: 0 });
  });

  it("parseClientObjectKey returns the key's three segments", () => {
    expect(parseClientObjectKey("workspace/ws1/client/cp1/obj_01.jpg")).toEqual(
      { workspaceId: "ws1", clientProfileId: "cp1", objectId: "obj_01.jpg" },
    );
  });

  it.each([
    "workspace/ws1/client/cp1",
    "workspace/ws1/client/cp1/",
    "workspace/ws1/client/cp1/a/b",
    "workspace/ws1/client/../x",
    "workspace/ws 1/client/cp1/x",
    "workspace/ws1/client/cp1/.hidden",
    "other/ws1/client/cp1/x",
    "",
    42,
    null,
    undefined,
  ])("parseClientObjectKey rejects %j", (key) => {
    expect(() => parseClientObjectKey(key)).toThrowError(
      expect.objectContaining({ code: "invalid_key" }),
    );
  });

  it("maps allowlisted content types to media kinds", () => {
    expect(mediaKindForContentType("image/png")).toBe("IMAGE");
    expect(mediaKindForContentType("audio/webm")).toBe("AUDIO");
    expect(mediaKindForContentType("video/quicktime")).toBe("VIDEO");
    expect(mediaKindForContentType("application/pdf")).toBe("DOCUMENT");
    expect(mediaKindForContentType("IMAGE/JPEG")).toBe("IMAGE");
  });

  it.each([
    "application/octet-stream",
    "text/html",
    "image/svg+xml",
    "application/zip",
    "",
    12,
    null,
    undefined,
  ])("rejects non-allowlisted content type %j", (type) => {
    expect(mediaKindForContentType(type)).toBeNull();
  });

  it("assertMediaByteSize enforces the D20 20 MB cap", () => {
    expect(assertMediaByteSize(1)).toBe(1);
    expect(assertMediaByteSize(MAX_MEDIA_BYTES)).toBe(MAX_MEDIA_BYTES);
    for (const bad of [0, -1, 1.5, "100", null]) {
      expect(() => assertMediaByteSize(bad)).toThrowError(
        expect.objectContaining({ code: "invalid_input" }),
      );
    }
    for (const over of [MAX_MEDIA_BYTES + 1, Number.MAX_SAFE_INTEGER]) {
      expect(() => assertMediaByteSize(over)).toThrowError(
        expect.objectContaining({ code: "payload_too_large" }),
      );
    }
  });

  it("presignTtlSeconds defaults, honors env, and rejects out-of-bound", () => {
    expect(presignTtlSeconds({})).toBe(300);
    expect(presignTtlSeconds({ MEDIA_URL_TTL_SECONDS: "120" })).toBe(120);
    for (const bad of ["0", "3601", "abc", "-5"]) {
      expect(() =>
        presignTtlSeconds({ MEDIA_URL_TTL_SECONDS: bad }),
      ).toThrowError(expect.objectContaining({ code: "invalid_ttl" }));
    }
  });
});
