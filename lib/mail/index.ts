import { appendFile, mkdir, readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

import nodemailer from "nodemailer";

/**
 * Mail delivery port (D17): one adapter registry, fail-closed.
 *
 * - `dev-file` appends each message as one JSON line to the local mailbox file
 *   (`DEV_MAILBOX_FILE`, default `var/mailbox.jsonl`). This is the development
 *   adapter — it satisfies "one delivery port with a development adapter that
 *   writes to a local mailbox file" without promising real email.
 * - `smtp` submits through a standard SMTP relay the deployment supplies via
 *   Nodemailer (`SMTP_HOST`, `MAIL_FROM` required; `SMTP_TLS`
 *   require/implicit/none; `SMTP_USER` + `SMTP_PASSWORD` as a pair for
 *   authenticated relays). Certificate and hostname validation always stay on;
 *   `SMTP_TLS_CA_FILE` may add a private CA bundle, never disable it.
 * - `MAIL_DELIVERY_ADAPTER` selects an adapter explicitly. Outside production
 *   the dev-file adapter is the implicit default so the app works locally; in
 *   production an explicit adapter name is required, otherwise
 *   `mailDeliveryConfigured()` is false and mail-gated routes fail closed.
 */

export type MailMessage = { to: string; subject: string; text: string };
export type MailAdapter = (message: MailMessage) => Promise<void>;

export const MAIL_DELIVERY_ADAPTER_ENV = "MAIL_DELIVERY_ADAPTER";
export const DEV_MAILBOX_FILE_ENV = "DEV_MAILBOX_FILE";
export const SMTP_HOST_ENV = "SMTP_HOST";
export const SMTP_PORT_ENV = "SMTP_PORT";
export const SMTP_TLS_ENV = "SMTP_TLS";
export const SMTP_USER_ENV = "SMTP_USER";
export const SMTP_PASSWORD_ENV = "SMTP_PASSWORD";
export const SMTP_ALLOW_PLAINTEXT_ENV = "SMTP_ALLOW_PLAINTEXT";
export const SMTP_TLS_CA_FILE_ENV = "SMTP_TLS_CA_FILE";
export const MAIL_FROM_ENV = "MAIL_FROM";

const SMTP_TIMEOUT_MS = 10_000;
const SMTP_TLS_MODES = ["require", "implicit", "none"] as const;
type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

const SMTP_REQUIRED_ENVS = [SMTP_HOST_ENV, MAIL_FROM_ENV] as const;

function missingSmtpEnvs(): string[] {
  const missing: string[] = SMTP_REQUIRED_ENVS.filter(
    (name) => !process.env[name],
  );
  // AUTH is a pair: both or neither. A half pair names the absent half.
  if (!process.env[SMTP_USER_ENV] !== !process.env[SMTP_PASSWORD_ENV]) {
    missing.push(
      process.env[SMTP_USER_ENV] ? SMTP_PASSWORD_ENV : SMTP_USER_ENV,
    );
  }
  return missing;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

type SmtpConfig = {
  host: string;
  port: number;
  tls: SmtpTlsMode;
  user?: string;
  password?: string;
  from: string;
  ca?: string;
};

async function resolveSmtpConfig(): Promise<SmtpConfig> {
  const missing = missingSmtpEnvs();
  if (missing.length > 0) {
    // Names only. A missing value is a configuration fault, never a reason to
    // echo a value into a log or an error string.
    throw new Error(
      `mail delivery is not configured: missing ${missing.join(", ")}`,
    );
  }
  const tlsMode = process.env[SMTP_TLS_ENV] ?? "require";
  if (!SMTP_TLS_MODES.includes(tlsMode as SmtpTlsMode)) {
    throw new Error(
      `mail delivery is not configured: ${SMTP_TLS_ENV} must be require, implicit or none`,
    );
  }
  const host = process.env[SMTP_HOST_ENV] ?? "";
  const user = process.env[SMTP_USER_ENV];
  const password = process.env[SMTP_PASSWORD_ENV];
  if (tlsMode === "none" && user) {
    // Never send AUTH over an unencrypted connection, on any host.
    throw new Error(
      `mail delivery is not configured: ${SMTP_TLS_ENV}=none cannot carry credentials`,
    );
  }
  if (
    tlsMode === "none" &&
    process.env.NODE_ENV === "production" &&
    !LOOPBACK_HOSTS.has(host) &&
    process.env[SMTP_ALLOW_PLAINTEXT_ENV] !== "1"
  ) {
    // Plaintext relay for local capture is explicitly local and unauthenticated;
    // production plaintext to a non-local relay needs the deliberate opt-in.
    throw new Error(
      `mail delivery is not configured: ${SMTP_TLS_ENV}=none in production for a non-local relay requires ${SMTP_ALLOW_PLAINTEXT_ENV}=1`,
    );
  }
  const rawPort = process.env[SMTP_PORT_ENV];
  const port =
    rawPort === undefined
      ? tlsMode === "implicit"
        ? 465
        : 587
      : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `mail delivery is not configured: ${SMTP_PORT_ENV} must be a TCP port`,
    );
  }
  const config: SmtpConfig = {
    host,
    port,
    tls: tlsMode as SmtpTlsMode,
    from: process.env[MAIL_FROM_ENV] ?? "",
  };
  if (user) {
    config.user = user;
    config.password = password;
  }
  const caFile = process.env[SMTP_TLS_CA_FILE_ENV];
  if (caFile) {
    config.ca = await readFile(caFile, "utf8");
  }
  return config;
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

function assertSafeHeaders(cfg: SmtpConfig, message: MailMessage): void {
  for (const [field, value] of [
    ["to", message.to],
    ["subject", message.subject],
    ["from", cfg.from],
  ] as const) {
    if (/[\r\n]/.test(value)) {
      throw new Error(`mail message rejected: CRLF in ${field}`);
    }
  }
}

/**
 * Nodemailer owns the wire: MIME building, header encoding/folding and
 * dot-stuffing. Certificate and hostname validation stay enabled; the relay
 * reply text can echo the recipient and the message can carry a single-use
 * token, so failures surface a status code or the library's error category
 * only — never a secret, a body or an address.
 */
async function smtpSend(cfg: SmtpConfig, message: MailMessage): Promise<void> {
  assertSafeHeaders(cfg, message);
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls === "implicit",
    requireTLS: cfg.tls === "require",
    ignoreTLS: cfg.tls === "none",
    auth:
      cfg.user === undefined
        ? undefined
        : { user: cfg.user, pass: cfg.password },
    tls: {
      // SNI only for name hosts — an IP literal is rejected by node, while the
      // certificate chain + name/IP check still runs either way.
      ...(isIP(cfg.host) === 0 ? { servername: cfg.host } : {}),
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ...(cfg.ca === undefined ? {} : { ca: cfg.ca }),
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  try {
    await transport.sendMail({
      from: cfg.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: simpleHtml(message.text),
    });
  } catch (error) {
    const e = error as { responseCode?: number; code?: string };
    if (typeof e.responseCode === "number") {
      throw new Error(`mail delivery failed with status ${e.responseCode}`);
    }
    if (typeof e.code === "string" && /^[A-Z_]+$/.test(e.code)) {
      throw new Error(`mail delivery failed (${e.code})`);
    }
    throw new Error("mail delivery failed");
  } finally {
    transport.close();
  }
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
  smtp: async (message) => {
    await smtpSend(await resolveSmtpConfig(), message);
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
 * `smtp` adapter without its configuration would otherwise serve a password
 * reset form that silently sends nothing, so it refuses to start instead. Mail
 * that is deliberately off (no adapter named) is not an error here: the
 * mail-gated routes already fail closed through `mailDeliveryConfigured`.
 */
export async function assertMailDeliveryConfigured(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env[MAIL_DELIVERY_ADAPTER_ENV] !== "smtp") return;
  await resolveSmtpConfig();
}

export async function sendMail(message: MailMessage): Promise<void> {
  const name = resolveAdapterName();
  const adapter = name === undefined ? undefined : adapters[name];
  if (!adapter) throw new Error("mail delivery is not configured");
  await adapter(message);
}
