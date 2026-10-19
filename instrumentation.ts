/**
 * Next.js instrumentation hook — runs once at server start (and edge-less
 * runtimes). Used for the production auth-secret boot refusal: a deployment
 * without `BETTER_AUTH_SECRET` (>=32 chars) must not serve traffic.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertAuthSecretConfigured } = await import("./lib/auth/server");
    assertAuthSecretConfigured();
  }
}
