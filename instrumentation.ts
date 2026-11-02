/**
 * Next.js instrumentation hook — runs once at server start (and edge-less
 * runtimes). Used for the production boot refusals: a deployment without
 * `BETTER_AUTH_SECRET` (>=32 chars), with an `http:` auth origin, or with
 * `MEDIA_STORAGE_ADAPTER=s3` missing an S3 variable must not serve traffic.
 * Refusals log one redacted `boot_refused` line through lib/log — the only
 * logger — before the process exits.
 */
import { logError } from "./lib/log";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { assertAuthSecretConfigured } = await import("./lib/auth/server");
      const { assertMediaStorageConfigured } = await import("./lib/storage");
      const { assertMailDeliveryConfigured } = await import("./lib/mail");
      assertAuthSecretConfigured();
      assertMediaStorageConfigured();
      // O22: production plus the emaillabs adapter plus a missing key refuses
      // boot rather than serving reset and invitation forms that send nothing.
      assertMailDeliveryConfigured();
    } catch (error) {
      // Next 16 catches instrumentation failures and keeps the process alive
      // serving 500s with the port open; in production a refused auth-env
      // gate must take the process down instead.
      if (process.env.NODE_ENV === "production") {
        logError("boot_refused", { error });
        process.exit(1);
      }
      throw error;
    }
  }
}
