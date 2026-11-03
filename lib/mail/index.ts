import { appendFile, mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

/**
 * Mail delivery port (D17): one adapter registry, fail-closed.
 *
 * - `dev-file` appends each message as one JSON line to the local mailbox file
 *   (`DEV_MAILBOX_FILE`, default `var/mailbox.jsonl`). This is the development
 *   adapter — it satisfies "one delivery port with a development adapter that
 *   writes to a local mailbox file" without promising real email.
 * - `smtp` submits through a standard SMTP relay the deployment supplies
 *   (`SMTP_HOST`, `MAIL_FROM` required; `SMTP_TLS` require/implicit/none;
 *   `SMTP_USER` + `SMTP_PASSWORD` as a pair for authenticated relays).
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

type SmtpConfig = {
  host: string;
  port: number;
  tls: SmtpTlsMode;
  user?: string;
  password?: string;
  from: string;
};

function resolveSmtpConfig(): SmtpConfig {
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
    host: process.env[SMTP_HOST_ENV] ?? "",
    port,
    tls: tlsMode as SmtpTlsMode,
    from: process.env[MAIL_FROM_ENV] ?? "",
  };
  if (process.env[SMTP_USER_ENV]) {
    config.user = process.env[SMTP_USER_ENV];
    config.password = process.env[SMTP_PASSWORD_ENV];
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

const base64 = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64");

const wrap76 = (value: string): string => value.replace(/.{1,76}/g, "$&\r\n");

/** RFC 2047 encoded-word for a non-ASCII header value; ASCII passes through. */
function headerValue(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`;
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

function buildMessage(cfg: SmtpConfig, message: MailMessage): string {
  const boundary = `=_vari8_${Date.now().toString(36)}`;
  const part = (type: string, body: string) =>
    `Content-Type: ${type}; charset=utf-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n${wrap76(base64(body))}\r\n`;
  return (
    `From: ${cfg.from}\r\n` +
    `To: ${message.to}\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    `Subject: ${headerValue(message.subject)}\r\n` +
    "MIME-Version: 1.0\r\n" +
    `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
    `--${boundary}\r\n${part("text/plain", message.text)}` +
    `--${boundary}\r\n${part("text/html", simpleHtml(message.text))}` +
    `--${boundary}--\r\n`
  );
}

type SmtpReply = { code: number; lines: string[] };

/**
 * Minimal SMTP session: line-buffered replies (multiline "NNN-" until "NNN "),
 * a per-socket inactivity timeout, and status-only errors — a reply body can
 * echo the recipient and the message can carry a single-use token, so neither
 * reaches an error string.
 */
async function smtpSend(cfg: SmtpConfig, message: MailMessage): Promise<void> {
  // Header injection is refused before a byte reaches the wire.
  assertSafeHeaders(cfg, message);
  let socket: net.Socket | tls.TLSSocket;
  if (cfg.tls === "implicit") {
    socket = tls.connect({
      host: cfg.host,
      port: cfg.port,
      servername: cfg.host,
    });
  } else {
    socket = net.connect({ host: cfg.host, port: cfg.port });
  }
  socket.setTimeout(SMTP_TIMEOUT_MS);

  let buffer = "";
  const ready: SmtpReply[] = [];
  const lines: string[] = [];
  const waiters: {
    resolve: (r: SmtpReply) => void;
    reject: (e: Error) => void;
  }[] = [];
  const failAll = (error: Error) => {
    for (const w of waiters.splice(0)) w.reject(error);
  };
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end === -1) break;
      const line = buffer.slice(0, end + 1);
      buffer = buffer.slice(end + 1);
      const m = /^(\d{3})([ -])/.exec(line);
      if (!m) {
        failAll(new Error("mail delivery failed: malformed relay reply"));
        socket.destroy();
        return;
      }
      lines.push(line.slice(4).trim());
      if (m[2] === " ") {
        const reply = { code: Number(m[1]), lines: lines.splice(0) };
        const w = waiters.shift();
        if (w) w.resolve(reply);
        else ready.push(reply);
      }
    }
  });
  socket.on("timeout", () => {
    failAll(new Error("mail delivery timed out"));
    socket.destroy();
  });
  socket.on("error", (e) => failAll(e));

  const nextReply = () =>
    new Promise<SmtpReply>((resolve, reject) => {
      const reply = ready.shift();
      if (reply) resolve(reply);
      else waiters.push({ resolve, reject });
    });
  const say = async (line: string, ...ok: number[]): Promise<SmtpReply> => {
    socket.write(line + "\r\n");
    const reply = await nextReply();
    if (!ok.includes(reply.code)) {
      throw new Error(`mail delivery failed with status ${reply.code}`);
    }
    return reply;
  };
  const ehlo = async (): Promise<string[]> => {
    const reply = await say("EHLO localhost", 250);
    return reply.lines;
  };

  try {
    const greeting = await nextReply();
    if (greeting.code !== 220) {
      throw new Error(`mail delivery failed with status ${greeting.code}`);
    }
    let capabilities = await ehlo();
    if (cfg.tls === "require") {
      if (!capabilities.some((c) => /^STARTTLS$/i.test(c))) {
        throw new Error("mail delivery failed: relay does not offer STARTTLS");
      }
      await say("STARTTLS", 220);
      socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const wrapped = tls.connect({
          socket,
          servername: cfg.host,
        });
        wrapped.once("secureConnect", () => resolve(wrapped));
        wrapped.once("error", reject);
      });
      capabilities = await ehlo();
    }
    if (cfg.user !== undefined) {
      await say("AUTH LOGIN", 334);
      socket.write(base64(cfg.user) + "\r\n");
      const u = await nextReply();
      if (u.code !== 334) {
        throw new Error(`mail delivery failed with status ${u.code}`);
      }
      socket.write(base64(cfg.password ?? "") + "\r\n");
      const p = await nextReply();
      if (p.code !== 235) {
        throw new Error(`mail delivery failed with status ${p.code}`);
      }
    }
    await say(`MAIL FROM:<${cfg.from}>`, 250);
    await say(`RCPT TO:<${message.to}>`, 250, 251);
    await say("DATA", 354);
    const data = buildMessage(cfg, message).replace(/(^|\r?\n)\./g, "$1..");
    socket.write(data + "\r\n.\r\n");
    const accepted = await nextReply();
    if (accepted.code !== 250) {
      throw new Error(`mail delivery failed with status ${accepted.code}`);
    }
    socket.write("QUIT\r\n");
    await nextReply().catch(() => undefined);
  } finally {
    socket.destroy();
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
    await smtpSend(resolveSmtpConfig(), message);
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
export function assertMailDeliveryConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env[MAIL_DELIVERY_ADAPTER_ENV] !== "smtp") return;
  resolveSmtpConfig();
}

export async function sendMail(message: MailMessage): Promise<void> {
  const name = resolveAdapterName();
  const adapter = name === undefined ? undefined : adapters[name];
  if (!adapter) throw new Error("mail delivery is not configured");
  await adapter(message);
}
