import { lookupInviteForRoute } from "@/lib/workspace/invite-links";

export const dynamic = "force-dynamic";

/**
 * T3 public invite lookup. POST only - the bearer token travels in the JSON
 * body, never in a URL query string.
 *
 * Contract: success is `200 { "name": "<workspace display name>" }` and that
 * is the ONLY field returned. Malformed, unknown, expired, revoked,
 * consumed, wrong-purpose, and over-budget requests all receive the same
 * `404 { "name": null }` - a single fail-closed shape, no oracle.
 */
export async function POST(request: Request): Promise<Response> {
  let rawToken: unknown = null;
  try {
    const body: unknown = await request.json();
    if (body !== null && typeof body === "object" && "token" in body) {
      rawToken = (body as { token: unknown }).token;
    }
  } catch {
    rawToken = null;
  }
  const outcome = await lookupInviteForRoute({
    rawToken,
    headers: request.headers,
  });
  return Response.json(outcome.body, { status: outcome.status });
}
