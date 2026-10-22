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
export const EMAILLABS_APP_KEY_ENV = "EMAILLABS_APP_KEY";
export const EMAILLABS_SECRET_KEY_ENV = "EMAILLABS_SECRET_KEY";
export const EMAILLABS_SMTP_ACCOUNT_ENV = "EMAILLABS_SMTP_ACCOUNT";
export const EMAILLABS_API_URL_ENV = "EMAILLABS_API_URL";
export const MAIL_FROM_ENV = "MAIL_FROM";

/** Vendor-documented transactional endpoint (app key + secret key, HTTP Basic). */
const EMAILLABS_DEFAULT_API_URL =
  "https://api.emaillabs.net.pl/api/new_sendmail";

const EMAILLABS_REQUIRED_ENVS = [
  EMAILLABS_APP_KEY_ENV,
  EMAILLABS_SECRET_KEY_ENV,
  EMAILLABS_SMTP_ACCOUNT_ENV,
  MAIL_FROM_ENV,
] as const;

function missingEmaillabsEnvs(): string[] {
  return EMAILLABS_REQUIRED_ENVS.filter((name) => !process.env[name]);
}

/**
 * Plain text in, simple HTML out. No tracking pixel, no click rewriting: the
 * only markup is the escaped body in a paragraph, and a caller that needs a
 * link gets the same URL in both parts.
 */
function simpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<!doctype html><html><body>${paragraphs}</body></html>`;
}

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
  emaillabs: async (message) => {
    const missing = missingEmaillabsEnvs();
    if (missing.length > 0) {
      // Names only. A missing key is a configuration fault, never a reason to
      // echo a value into a log or an error string.
      throw new Error(
        `mail delivery is not configured: missing ${missing.join(", ")}`,
      );
    }
    const credentials = `${process.env[EMAILLABS_APP_KEY_ENV]}:${process.env[EMAILLABS_SECRET_KEY_ENV]}`;
    const body = new URLSearchParams({
      [`to[${message.to}]`]: "",
      smtp_account: process.env[EMAILLABS_SMTP_ACCOUNT_ENV] ?? "",
      from: process.env[MAIL_FROM_ENV] ?? "",
      subject: message.subject,
      text: message.text,
      html: simpleHtml(message.text),
    });
    const response = await fetch(
      process.env[EMAILLABS_API_URL_ENV] ?? EMAILLABS_DEFAULT_API_URL,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      // Status only. The provider body can echo the recipient and the message,
      // and the message can carry a single-use token.
      throw new Error(`mail delivery failed with status ${response.status}`);
    }
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

/**
 * Boot gate (owner ruling O22). A production deployment that names the
 * `emaillabs` adapter without its keys would otherwise serve a password reset
 * form that silently sends nothing, so it refuses to start instead. Mail that
 * is deliberately off (no adapter named) is not an error here: the
 * mail-gated routes already fail closed through `mailDeliveryConfigured`.
 */
export function assertMailDeliveryConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env[MAIL_DELIVERY_ADAPTER_ENV] !== "emaillabs") return;
  const missing = missingEmaillabsEnvs();
  if (missing.length > 0) {
    throw new Error(
      `MAIL_DELIVERY_ADAPTER=emaillabs requires ${missing.join(", ")}`,
    );
  }
}

export async function sendMail(message: MailMessage): Promise<void> {
  const name = resolveAdapterName();
  const adapter = name === undefined ? undefined : adapters[name];
  if (!adapter) throw new Error("mail delivery is not configured");
  await adapter(message);
}
