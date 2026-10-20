import { createHash, createHmac } from "node:crypto";

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
 * PR-MEDIA S3-compatible adapter (D8): environment-configured, vendor-open.
 * No AWS SDK dependency — SigV4 presigned URLs are derived with node:crypto,
 * and `deletePrefix` uses signed REST calls (ListObjectsV2 + DeleteObjects).
 *
 * Required env: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 * Optional: S3_ENDPOINT (default `https://s3.<region>.amazonaws.com`;
 * virtual-hosted style) and S3_FORCE_PATH_STYLE=1 for MinIO-style endpoints.
 * Missing config fails closed with `storage_not_configured`.
 */

export type S3Config = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
};

export function s3Config(
  env: Record<string, string | undefined> = process.env,
): S3Config | null {
  const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    return null;
  return {
    endpoint: (
      env.S3_ENDPOINT ?? `https://s3.${S3_REGION}.amazonaws.com`
    ).replace(/\/+$/, ""),
    bucket: S3_BUCKET,
    region: S3_REGION,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    pathStyle: env.S3_FORCE_PATH_STYLE === "1",
  };
}

function requireConfig(): S3Config {
  const config = s3Config();
  if (!config) throw new StorageError("storage_not_configured");
  return config;
}

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();
const sha256Hex = (data: string) =>
  createHash("sha256").update(data).digest("hex");

function signingKey(config: S3Config, dateStamp: string): Buffer {
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function objectUrl(
  config: S3Config,
  key: string,
): { host: string; path: string } {
  const { host } = new URL(config.endpoint);
  if (config.pathStyle) return { host, path: `/${config.bucket}/${key}` };
  return { host: `${config.bucket}.${host}`, path: `/${key}` };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function amzDates(now = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[-:]|\.\d+/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * SigV4 query-string presign for one object operation. `extraHeaders` (e.g.
 * content-type on PUT) are folded into SignedHeaders so the client must send
 * them verbatim. Pure given `now` — unit-testable without a bucket.
 */
export function presignS3Url(input: {
  config: S3Config;
  method: "GET" | "PUT";
  key: string;
  ttlSeconds: number;
  extraHeaders?: Record<string, string>;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const { config, method, key, ttlSeconds } = input;
  const { amzDate, dateStamp } = amzDates(input.now);
  const { host, path } = objectUrl(config, key);
  const canonicalUri = encodePath(path);

  const signedHeaderMap: Record<string, string> = {
    host,
    ...(input.extraHeaders ?? {}),
  };
  const signedHeaderNames = Object.keys(signedHeaderMap).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${signedHeaderMap[name].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(ttlSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  // SigV4 canonical query: sorted, URI-encoded (URLSearchParams encodes with
  // '+' for space — our parameter set never contains spaces).
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac("sha256", signingKey(config, dateStamp))
    .update(stringToSign)
    .digest("hex");

  const scheme = new URL(config.endpoint).protocol;
  const url = `${scheme}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  return { url, headers: input.extraHeaders ?? {} };
}

/** Header-signed request for adapter-side calls (deletePrefix). */
async function signedFetch(
  config: S3Config,
  method: string,
  path: string,
  query: Record<string, string>,
  body: string,
): Promise<Response> {
  const { amzDate, dateStamp } = amzDates();
  const { host } = new URL(config.endpoint);
  const canonicalUri = encodePath(path);
  const canonicalQuery = [...Object.entries(query)]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const payloadHash = sha256Hex(body);
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(config, dateStamp))
    .update(stringToSign)
    .digest("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`${config.endpoint}${canonicalUri}?${canonicalQuery}`, {
    method,
    headers: { ...headers, authorization },
    body: method === "GET" ? undefined : body,
  });
}

export const s3ObjectStorage: ObjectStorageBackend = {
  name: "s3",

  presignGet: async (key, ttlSeconds): Promise<PresignedDownload> => {
    assertPresignGetTtl(ttlSeconds, MAX_PRESIGN_TTL_SECONDS);
    parseClientObjectKey(key);
    const config = requireConfig();
    const { url } = presignS3Url({
      config,
      method: "GET",
      key,
      ttlSeconds,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  },

  presignPut: async (key, options): Promise<PresignedUpload> => {
    assertPresignGetTtl(options.ttlSeconds, MAX_PRESIGN_TTL_SECONDS);
    parseClientObjectKey(key);
    const config = requireConfig();
    // The declared content type is a signed header: a PUT with any other
    // type is rejected by the bucket. Byte-size cannot be bound by a plain
    // presigned PUT (POST-policy would be required); the media_object row's
    // declared size is the contract the wiring layer checks after upload.
    const { url, headers } = presignS3Url({
      config,
      method: "PUT",
      key,
      ttlSeconds: options.ttlSeconds,
      extraHeaders: { "content-type": options.contentType },
    });
    return {
      url,
      method: "PUT",
      headers,
      expiresAt: new Date(Date.now() + options.ttlSeconds * 1000).toISOString(),
    };
  },

  deletePrefix: async (prefix) => {
    const config = requireConfig();
    // ListObjectsV2 pages of 1000, then DeleteObjects batches. Idempotent:
    // deleting an already-empty prefix is a no-op returning zero.
    let deleted = 0;
    let continuationToken: string | undefined;
    // List/Delete hit the bucket endpoint: virtual-hosted style puts the
    // bucket in the host, path style puts it in the path.
    const listPath = config.pathStyle ? `/${config.bucket}` : "/";
    const listConfig: S3Config = config.pathStyle
      ? config
      : {
          ...config,
          endpoint: config.endpoint.replace("://", `://${config.bucket}.`),
        };
    do {
      const query: Record<string, string> = {
        "list-type": "2",
        prefix,
      };
      if (continuationToken) query["continuation-token"] = continuationToken;
      const res = await signedFetch(listConfig, "GET", listPath, query, "");
      if (!res.ok) throw new StorageError("storage_not_configured");
      const xml = await res.text();
      const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(
        (match) => match[1],
      );
      if (keys.length > 0) {
        const body =
          `<Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
          keys.map((k) => `<Object><Key>${k}</Key></Object>`).join("") +
          `</Delete>`;
        const del = await signedFetch(
          listConfig,
          "POST",
          listPath,
          { delete: "" },
          body,
        );
        if (!del.ok) throw new StorageError("storage_not_configured");
        deleted += keys.length;
      }
      const token =
        /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
      continuationToken = token ? decodeURIComponent(token[1]) : undefined;
    } while (continuationToken);
    return { deleted };
  },
};
