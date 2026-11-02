/**
 * Browser-safe shared media policy (D20): the byte cap, closed
 * content-type allowlist and type->kind classification used by both the
 * server's media service and the client attachment picker. No server-only
 * transitive imports — keep this module dependency-free.
 */

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
