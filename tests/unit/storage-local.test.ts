import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StorageError } from "../../lib/storage";
import {
  localObjectPath,
  localObjectStorage,
  localStorageConfig,
  readLocalObject,
  verifyLocalObjectSignature,
  writeLocalObject,
} from "../../lib/storage/local";

/**
 * PR-MEDIA local adapter: HMAC-signed URLs that expire and bind the
 * operation and key, on-disk path safety, and the presign round-trip a
 * signed URL redeemer performs.
 */
const SECRET = "unit-test-signing-secret";
const KEY = "workspace/ws1/client/cp1/obj1";

let dir: string;

beforeAll(() => {
  // Test objects land under the gitignored var/ tree, never /tmp.
  mkdirSync(join(process.cwd(), "var"), { recursive: true });
  dir = mkdtempSync(join(process.cwd(), "var", "media-unit-"));
  process.env.MEDIA_STORAGE_DIR = dir;
  process.env.MEDIA_STORAGE_SIGNING_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.MEDIA_STORAGE_DIR;
  delete process.env.MEDIA_STORAGE_SIGNING_SECRET;
  rmSync(dir, { recursive: true, force: true });
});

describe("local storage adapter", () => {
  it("requires a signing secret", () => {
    expect(() =>
      localStorageConfig({ MEDIA_STORAGE_DIR: "/x" }),
    ).toThrowError(
      expect.objectContaining({ code: "storage_not_configured" }),
    );
  });

  it("presigned PUT URL verifies for put and rejects other ops", async () => {
    const put = await localObjectStorage.presignPut(KEY, {
      contentType: "image/png",
      byteSize: 4,
      ttlSeconds: 60,
    });
    const url = new URL(put.url, "http://localhost");
    expect(url.pathname).toBe("/api/v1/media/object");
    expect(put.method).toBe("PUT");
    expect(put.headers["content-type"]).toBe("image/png");
    const args = {
      secret: SECRET,
      key: url.searchParams.get("key") as string,
      expiresAt: Number(url.searchParams.get("e")),
      signature: url.searchParams.get("s") as string,
    };
    expect(verifyLocalObjectSignature({ ...args, op: "put" })).toBe(true);
    // A signature minted for PUT must not redeem a GET, or vice versa.
    expect(verifyLocalObjectSignature({ ...args, op: "get" })).toBe(false);
  });

  it("rejects expired, tampered and malformed signatures", async () => {
    const get = await localObjectStorage.presignGet(KEY, 60);
    const url = new URL(get.url, "http://localhost");
    const base = {
      secret: SECRET,
      op: "get" as const,
      key: url.searchParams.get("key") as string,
      expiresAt: Number(url.searchParams.get("e")),
      signature: url.searchParams.get("s") as string,
    };
    expect(verifyLocalObjectSignature(base)).toBe(true);
    // Expired at verify time.
    expect(
      verifyLocalObjectSignature({ ...base, now: base.expiresAt + 1 }),
    ).toBe(false);
    // Key swapped for a foreign object's key — signature no longer binds.
    expect(
      verifyLocalObjectSignature({
        ...base,
        key: "workspace/ws2/client/cp2/other",
      }),
    ).toBe(false);
    // Forged signature shape and wrong secret both fail closed.
    expect(verifyLocalObjectSignature({ ...base, signature: "0".repeat(64) })).toBe(
      false,
    );
    expect(
      verifyLocalObjectSignature({ ...base, secret: "other-secret" }),
    ).toBe(false);
    expect(
      verifyLocalObjectSignature({ ...base, signature: "not-hex" }),
    ).toBe(false);
  });

  it("presign enforces the TTL bound", async () => {
    await expect(
      localObjectStorage.presignGet(KEY, 3601),
    ).rejects.toMatchObject({ code: "invalid_ttl" });
    await expect(
      localObjectStorage.presignPut(KEY, {
        contentType: "image/png",
        byteSize: 1,
        ttlSeconds: 0,
      }),
    ).rejects.toMatchObject({ code: "invalid_ttl" });
  });

  it("rejects malformed keys before touching disk", async () => {
    for (const bad of [
      "workspace/ws1/client/cp1/../evil",
      "workspace/ws1/client/cp1/a/b",
      "etc/passwd",
    ]) {
      await expect(
        localObjectStorage.presignGet(bad, 60),
      ).rejects.toMatchObject({ code: "invalid_key" });
      expect(() => localObjectPath(dir, bad)).toThrow(StorageError);
    }
  });

  it("writes, reads and deletes objects under the prefix", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await writeLocalObject(KEY, bytes);
    expect(await readLocalObject(KEY)).toEqual(Buffer.from(bytes));
    expect(await readLocalObject("workspace/ws1/client/cp1/missing")).toBeNull();

    const result = await localObjectStorage.deletePrefix(
      "workspace/ws1/client/cp1/",
    );
    expect(result).toEqual({ deleted: 1 });
    expect(await readLocalObject(KEY)).toBeNull();
    // Idempotent: deleting the prefix again reports zero, does not throw.
    await expect(
      localObjectStorage.deletePrefix("workspace/ws1/client/cp1/"),
    ).resolves.toEqual({ deleted: 0 });
  });
});
