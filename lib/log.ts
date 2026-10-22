/**
 * LOGGING (#168, READINESS B8) — one logger, one line shape, stdout.
 *
 * The host collects stdout (the DEPLOY-CONTAINER lane's only sink), so
 * every entry is a single JSON object written with `process.stdout.write`:
 *   { "level", "event", "ts", ...fields }
 * `fields` is the per-event allowlist — today:
 *   api_v1_request_failed: requestId, method, route, status, error
 *   boot_refused:          error
 * No other event emits fields outside its own contract, and every value —
 * including inside `error` — passes the redaction below.
 *
 * Redaction contract (what can never appear in a line):
 *   - any object key matching a sensitive name (passwords, tokens, secrets,
 *     cookies, authorization headers, sessions, credentials, api keys,
 *     signatures) — the value is replaced, not logged;
 *   - email addresses anywhere in a string;
 *   - `Bearer <x>` credentials;
 *   - `Cookie:`/`Authorization:` header payloads embedded in text;
 *   - URLs are rewritten to scheme+host+path — userinfo, query (signed-URL
 *     params such as X-Amz-Signature, credentials in the query) and
 *     fragment are dropped;
 *   - `<sensitive-name>=<value>` query-style fragments in free text;
 *   - long unbroken urlsafe/hex runs (session/reset/invitation token shape)
 *     — bare UUIDs are identifiers, not secrets, and are exempt;
 *   - raw request bodies never reach the logger: callers pass only the
 *     allowlisted fields above and the thrown error.
 * Stacks are kept (file:line context) but run through the same scrub;
 * `cause` chains serialize nested errors recursively, depth-capped, with a
 * circularity guard. Logging itself can never throw.
 */

const SENSITIVE_KEY =
  /authorization|cookie|set-cookie|password|passwd|secret|token|session|bearer|credential|api[-_]?key|private[-_]?key|signature|x-amz/i;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const BEARER = /\bBearer\s+\S+/gi;
const HEADER_LINE = /\b(Cookie|Authorization)\s*:\s*[^\n]+/gi;
// Any `scheme://` URI — connection strings (postgres://, redis://, …) carry
// credentials in userinfo exactly like http URLs.
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]}]+/gi;
const SENSITIVE_PARAM =
  /\b(?:password|passwd|secret|token|session|signature|sig|key|api[-_]?key|credential)[\w-]*=\S+/gi;
const UUID =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const LONG_TOKEN = /[A-Za-z0-9_+/=-]{32,}/g;

export const REDACTED = "[redacted]";

function scrubUrl(match: string): string {
  try {
    const url = new URL(match);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return REDACTED;
  }
}

/** Redact every forbidden pattern from one string. */
export function redactString(value: string): string {
  // UUIDs are identifiers, not secrets — lift them out before the
  // long-token scrub so request ids survive, then restore.
  const uuids: string[] = [];
  const kept = value.replace(UUID, (m) => {
    uuids.push(m);
    return `__UUID_${uuids.length - 1}__`;
  });
  const scrubbed = kept
    .replace(URL_RE, scrubUrl)
    .replace(EMAIL, "[email]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(HEADER_LINE, (_m, name: string) => `${name}: [redacted]`)
    .replace(SENSITIVE_PARAM, (m) => `${m.split("=")[0]}=${REDACTED}`)
    .replace(LONG_TOKEN, REDACTED);
  return scrubbed.replace(/__UUID_(\d+)__/g, (_m, i) => uuids[Number(i)]);
}

const MAX_DEPTH = 4;
const MAX_ITEMS = 20;
const MAX_STRING = 2000;
const MAX_KEYS = 64;
/** Total serialized line budget — a degraded but always-valid JSON line. */
const MAX_LINE = 32_768;

/**
 * Marker for a value the caller has already validated to a safe shape —
 * used for the v1 request id, whose `^[A-Za-z0-9-]{1,64}$` grammar cannot
 * carry secrets or forge a line. `trustedId` preserves it verbatim so the
 * logged correlation id always equals the one returned to the client; it
 * does NOT weaken the long-token scrub for any other field.
 */
class TrustedId {
  constructor(readonly value: string) {}
}

export function trustedId(value: string): TrustedId {
  return new TrustedId(value);
}

function formatError(
  error: Error,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  // name and code are caller-controlled strings on custom error classes —
  // they go through the same scrub as message, stack and cause.
  const out: Record<string, unknown> = {
    name: redactString(error.name),
    message: redactString(error.message),
  };
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") out.code = redactString(code);
  if (typeof error.stack === "string") out.stack = redactString(error.stack);
  if ("cause" in error && error.cause !== undefined) {
    out.cause =
      depth + 1 >= MAX_DEPTH
        ? "[depth-capped]"
        : redact(error.cause, depth + 1, seen);
  }
  return out;
}

/**
 * Deep-redact an arbitrary value for logging. Sensitive object keys are
 * replaced with "[redacted]" at any depth; strings are scrubbed; arrays and
 * plain objects recurse with depth/size caps; Errors go through the error
 * serializer (cause chains included). Anything unrepresentable degrades to
 * a short type label — a log field can never throw.
 */
export function redact(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "string") {
    const scrubbed = redactString(value);
    return scrubbed.length > MAX_STRING
      ? `${scrubbed.slice(0, MAX_STRING)}…[truncated]`
      : scrubbed;
  }
  if (typeof value === "bigint") return Number(value);
  if (value instanceof TrustedId) return value.value;
  if (value instanceof Error) return formatError(value, depth, seen);
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[depth-capped]";
  if (Array.isArray(value)) {
    seen.add(value);
    return value
      .slice(0, MAX_ITEMS)
      .map((item) => redact(item, depth + 1, seen));
  }
  if (typeof value === "object") {
    seen.add(value);
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value);
    for (const [key, entry] of entries.slice(0, MAX_KEYS)) {
      out[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : redact(entry, depth + 1, seen);
    }
    if (entries.length > MAX_KEYS)
      out.__keys_omitted = entries.length - MAX_KEYS;
    return out;
  }
  return `[${typeof value}]`;
}

export type LogLevel = "info" | "warn" | "error";

/**
 * Emit one JSON line on stdout. `fields` go through `redact` — the caller's
 * contract is to pass only the event's allowlisted fields. A serialization
 * failure degrades to a minimal line rather than throwing into the
 * application.
 */
export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  try {
    const entry: Record<string, unknown> = {
      level,
      event,
      ts: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(value);
    }
    let line = JSON.stringify(entry);
    // Bounded line size: degrade the biggest serializations first, never
    // truncate raw JSON mid-line.
    if (line.length > MAX_LINE && entry.error instanceof Object) {
      (entry.error as Record<string, unknown>).stack = "[truncated]";
      line = JSON.stringify(entry);
    }
    if (line.length > MAX_LINE && entry.error instanceof Object) {
      (entry.error as Record<string, unknown>).cause = "[truncated]";
      line = JSON.stringify(entry);
    }
    if (line.length > MAX_LINE) {
      line = JSON.stringify({
        level,
        event,
        ts: entry.ts,
        truncated: "[event-exceeded-size-limit]",
      });
    }
    try {
      process.stdout.write(`${line}\n`);
    } catch {
      // The sink itself failed (EPIPE, destroyed stream): logging must
      // never replace an API response or block the boot exit — the line
      // is lost, silently.
    }
  } catch {
    try {
      process.stdout.write(
        `${JSON.stringify({ level: "error", event: "log_write_failed", ts: new Date().toISOString() })}\n`,
      );
    } catch {
      // same guard — a dead sink must not throw into the application
    }
  }
}

export function logError(event: string, fields: Record<string, unknown>) {
  log("error", event, fields);
}
