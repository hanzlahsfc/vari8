import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Mail delivery port (D17): one adapter registry, fail-closed.
 *
 * - `dev-file` appends each message as one JSON line to the local mailbox file
 *   (`DEV_MAILBOX_FILE`, default `var/mailbox.jsonl`). This is the development
 *   adapter — it satisfies "one delivery port with a development adapter that
 *   writes to a local mailbox file" without promising real email.
 * - `MAIL_DELIVERY_ADAPTER` selects an adapter explicitly. Outside production
 *   the dev-file adapter is the implicit default so the app works locally; in
 *   production an explicit adapter name is required, otherwise
 *   `mailDeliveryConfigured()` is false and mail-gated routes fail closed.
 */

export type MailMessage = { to: string; subject: string; text: string };
export type MailAdapter = (message: MailMessage) => Promise<void>;

export const MAIL_DELIVERY_ADAPTER_ENV = "MAIL_DELIVERY_ADAPTER";
export const DEV_MAILBOX_FILE_ENV = "DEV_MAILBOX_FILE";

const adapters: Record<string, MailAdapter> = {
  "dev-file": async (message) => {
    const file =
      process.env[DEV_MAILBOX_FILE_ENV] ??
      path.join(process.cwd(), "var", "mailbox.jsonl");
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(
      file,
      JSON.stringify({ at: new Date().toISOString(), ...message }) + "\n",
      "utf8",
    );
  },
};

function resolveAdapterName(): string | undefined {
  const explicit = process.env[MAIL_DELIVERY_ADAPTER_ENV];
  if (explicit !== undefined) return explicit;
  return process.env.NODE_ENV === "production" ? undefined : "dev-file";
}

export function mailDeliveryConfigured(): boolean {
  const name = resolveAdapterName();
  return name !== undefined && name in adapters;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const name = resolveAdapterName();
  const adapter = name === undefined ? undefined : adapters[name];
  if (!adapter) throw new Error("mail delivery is not configured");
  await adapter(message);
}
