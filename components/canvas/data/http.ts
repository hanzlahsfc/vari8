// The one shared fetch client for the canvas data seam (owner ruling O1,
// WIRING-SPEC X1). Transport: same-origin `/api/v1` JSON; the cookie session
// authenticates web and PWA (`credentials: "same-origin"`), and a Capacitor
// build attaches its bearer token through the `token` option — token storage
// and rotation stay with PR-31 (X3).
//
// Failure convention (X5): a call resolves to the parsed JSON body on 2xx and
// rejects with `ApiClientError` on anything else. The error carries the HTTP
// status and the server's `{ error: { code } }` code from `lib/api/v1.ts`
// (400 invalid_input, 401 unauthenticated, 403 forbidden, 500 internal); a
// request that never got a response throws status 0, code "network".
// Providers surface `error.code` to the screen; they do not swallow failures.
//
// Loading convention (X7): a screen awaiting a provider call shows its
// existing canvas loading surface, so loading copy describes the data, not
// storage hydration. Domain providers expose pending state themselves once
// they go remote; localStorage-backed providers resolve synchronously and
// need none.
//
// No screen calls this yet: wiring PRs (PR-W2 onward) route their provider's
// reads and writes through it, so mutations never use server actions (X2,
// settled by O1) except as thin web wrappers over the same services.

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiClientError";
  }
}

const BASE = "/api/v1";

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Capacitor bearer token; the web cookie path never sets it (O1). */
  token?: string;
};

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method:
        options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      credentials: "same-origin",
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiClientError(0, "network");
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON response is a transport failure, not domain data.
    throw new ApiClientError(response.status, "internal");
  }
  if (!response.ok) {
    const code =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: { code?: unknown } }).error?.code ===
        "string"
        ? (payload as { error: { code: string } }).error.code
        : "internal";
    throw new ApiClientError(response.status, code);
  }
  return payload as T;
}
