import { describe, expect, it } from "vitest";

import { presignS3Url, s3Config, type S3Config } from "../../lib/storage/s3";

/**
 * PR-MEDIA S3 adapter: SigV4 presign shape — deterministic given a fixed
 * clock, correct host/path for virtual-hosted and path styles, and the PUT
 * content type bound into SignedHeaders.
 */
const CONFIG: S3Config = {
  endpoint: "https://s3.eu-west-1.amazonaws.com",
  bucket: "media-bucket",
  region: "eu-west-1",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secret",
  pathStyle: false,
};

const NOW = new Date("2026-10-20T12:00:00Z");
const KEY = "workspace/ws1/client/cp1/obj1";

describe("s3 presign", () => {
  it("mints a virtual-hosted GET URL with SigV4 query params", () => {
    const { url, headers } = presignS3Url({
      config: CONFIG,
      method: "GET",
      key: KEY,
      ttlSeconds: 300,
      now: NOW,
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe("media-bucket.s3.eu-west-1.amazonaws.com");
    expect(parsed.pathname).toBe(`/${KEY}`);
    const q = parsed.searchParams;
    expect(q.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(q.get("X-Amz-Credential")).toBe(
      "AKIAEXAMPLE/20261020/eu-west-1/s3/aws4_request",
    );
    expect(q.get("X-Amz-Date")).toBe("20261020T120000Z");
    expect(q.get("X-Amz-Expires")).toBe("300");
    expect(q.get("X-Amz-SignedHeaders")).toBe("host");
    expect(q.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(headers).toEqual({});
  });

  it("is deterministic for a fixed clock and changes with the key", () => {
    const a = presignS3Url({
      config: CONFIG,
      method: "GET",
      key: KEY,
      ttlSeconds: 300,
      now: NOW,
    });
    const b = presignS3Url({
      config: CONFIG,
      method: "GET",
      key: KEY,
      ttlSeconds: 300,
      now: NOW,
    });
    const c = presignS3Url({
      config: CONFIG,
      method: "GET",
      key: "workspace/ws2/client/cp2/other",
      ttlSeconds: 300,
      now: NOW,
    });
    expect(a.url).toBe(b.url);
    expect(new URL(a.url).searchParams.get("X-Amz-Signature")).not.toBe(
      new URL(c.url).searchParams.get("X-Amz-Signature"),
    );
  });

  it("signs the declared content type into the PUT", () => {
    const { url, headers } = presignS3Url({
      config: CONFIG,
      method: "PUT",
      key: KEY,
      ttlSeconds: 300,
      extraHeaders: { "content-type": "audio/webm" },
      now: NOW,
    });
    const q = new URL(url).searchParams;
    expect(q.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(headers).toEqual({ "content-type": "audio/webm" });
    // A PUT signature differs from a GET signature on the same key.
    const get = presignS3Url({
      config: CONFIG,
      method: "GET",
      key: KEY,
      ttlSeconds: 300,
      now: NOW,
    });
    expect(q.get("X-Amz-Signature")).not.toBe(
      new URL(get.url).searchParams.get("X-Amz-Signature"),
    );
  });

  it("path style keeps the bucket in the path (MinIO-style)", () => {
    const { url } = presignS3Url({
      config: { ...CONFIG, endpoint: "http://127.0.0.1:9000", pathStyle: true },
      method: "GET",
      key: KEY,
      ttlSeconds: 60,
      now: NOW,
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe("127.0.0.1:9000");
    expect(parsed.pathname).toBe(`/media-bucket/${KEY}`);
  });

  it("s3Config fails closed without the four required values", () => {
    expect(s3Config({})).toBeNull();
    expect(
      s3Config({
        S3_BUCKET: "b",
        S3_REGION: "r",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
      }),
    ).toMatchObject({ bucket: "b", region: "r", pathStyle: false });
  });
});
