/**
 * Next.js instrumentation hook — runs once at server start (and edge-less
 * runtimes). Used for the production auth-secret boot refusal: a deployment
 * without `BETTER_AUTH_SECRET` (>=32 chars) must not serve traffic.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const [{ assertAuthSecretConfigured }, { assertMailDeliveryConfigured }] =
        await Promise.all([import("./lib/auth/server"), import("./lib/mail")]);
      assertAuthSecretConfigured();
      // O22: production plus the emaillabs adapter plus a missing key refuses
      // boot rather than serving reset and invitation forms that send nothing.
      assertMailDeliveryConfigured();
    } catch (error) {
      // Next 16 catches instrumentation failures and keeps the process alive
      // serving 500s with the port open; in production a refused auth-env
      // gate must take the process down instead.
      if (process.env.NODE_ENV === "production") {
        console.error(error);
        process.exit(1);
      }
      throw error;
    }
  }
}
