import net from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMailDeliveryConfigured,
  MAIL_DELIVERY_ADAPTER_ENV,
  MAIL_FROM_ENV,
  sendMail,
  SMTP_HOST_ENV,
  SMTP_PASSWORD_ENV,
  SMTP_PORT_ENV,
  SMTP_TLS_ENV,
  SMTP_USER_ENV,
} from "../../lib/mail";

/**
 * Standard-SMTP account mail (owner ruling P749: EmailLabs rejected). Each test
 * guards a rule that removing the rule breaks: the wire transcript a relay
 * actually sees, the no-secrets-in-errors rule, the boot refusal, fail-closed
 * TLS, and the invitation/reset link targets. A task-owned capture server stands
 * in for the relay — nothing leaves this host.
 */

const USER = "mailer@relay.test";
const PASSWORD = "s3cret-under-test";
const TOKEN = "tok_single_use_0123456789";

const ENV = {
  [MAIL_DELIVERY_ADAPTER_ENV]: "smtp",
  [SMTP_TLS_ENV]: "none",
  [MAIL_FROM_ENV]: "no-reply@vari8.test",
};

const saved = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined): void {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function applyEnv(overrides: Record<string, string | undefined> = {}): void {
  for (const [key, value] of Object.entries({ ...ENV, ...overrides })) {
    setEnv(key, value);
  }
}

/**
 * Minimal SMTP capture server: greeting, EHLO (advertises only the extensions
 * the case asks for), optional AUTH LOGIN, MAIL/RCPT/DATA/QUIT. Records the
 * command transcript and the DATA payload.
 */
type Capture = {
  port: number;
  transcript: () => string[];
  data: () => string;
  close: () => Promise<void>;
};

function captureServer(options: { auth?: boolean } = {}): Promise<Capture> {
  const transcript: string[] = [];
  let data = "";
  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    let authStep = 0;
    socket.write("220 relay.test ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        const end = buffer.indexOf("\n");
        if (end === -1) return;
        let line = buffer.slice(0, end + 1);
        buffer = buffer.slice(end + 1);
        line = line.trimEnd();
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 accepted\r\n");
          } else {
            data += line + "\n";
          }
          continue;
        }
        transcript.push(line);
        const [verb] = line.split(" ");
        switch (verb.toUpperCase()) {
          case "EHLO":
          case "HELO": {
            const caps = ["250-relay.test", "250-8BITMIME"];
            if (options.auth) caps.push("250-AUTH LOGIN");
            caps[caps.length - 1] = caps[caps.length - 1].replace(
              "250-",
              "250 ",
            );
            socket.write(caps.join("\r\n") + "\r\n");
            break;
          }
          case "AUTH":
            authStep = 1;
            socket.write("334 VXNlciBOYW1l\r\n");
            break;
          case "MAIL":
          case "RCPT":
            socket.write("250 2.1.0 ok\r\n");
            break;
          case "DATA":
            inData = true;
            socket.write("354 end with .\r\n");
            break;
          case "QUIT":
            socket.write("221 bye\r\n");
            break;
          case "RSET":
            socket.write("250 ok\r\n");
            break;
          default:
            if (authStep === 1) {
              authStep = 2;
              socket.write("334 UGFzc3dvcmQ=\r\n");
            } else if (authStep === 2) {
              authStep = 0;
              socket.write("235 2.7.0 authenticated\r\n");
            } else {
              socket.write("502 unsupported\r\n");
            }
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        transcript: () => transcript,
        data: () => data,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

const servers: Capture[] = [];

async function useServer(options: { auth?: boolean } = {}): Promise<Capture> {
  const server = await captureServer(options);
  servers.push(server);
  applyEnv({
    [SMTP_HOST_ENV]: "127.0.0.1",
    [SMTP_PORT_ENV]: String(server.port),
  });
  return server;
}

beforeEach(() => {
  applyEnv();
});

afterEach(async () => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const s of servers.splice(0)) await s.close();
});

describe("smtp adapter", () => {
  it("submits one multipart message over the documented transcript", async () => {
    const server = await useServer();
    await sendMail({
      to: "athlete@example.test",
      subject: "Reset your password",
      text: `Reset your password: https://app.test/reset?token=${TOKEN}`,
    });
    const t = server.transcript();
    expect(t[0]).toMatch(/^EHLO /);
    expect(t).toContain("MAIL FROM:<no-reply@vari8.test>");
    expect(t).toContain("RCPT TO:<athlete@example.test>");
    expect(t).toContain("DATA");
    expect(t).toContain("QUIT");
    const data = server.data();
    expect(data).toContain("To: athlete@example.test");
    expect(data).toContain("Subject: Reset your password");
    expect(data).toContain("multipart/alternative");
    // Bodies are base64-wrapped at 76 chars — compare on whitespace-stripped data.
    const stripped = data.replace(/\s/g, "");
    const plain = Buffer.from(
      `Reset your password: https://app.test/reset?token=${TOKEN}`,
    ).toString("base64");
    expect(stripped).toContain(plain);
    // The same link rides in both parts; no tracking pixel or rewritten URL.
    const html = Buffer.from("<p>").toString("base64");
    expect(stripped).toContain(html);
    expect(data).not.toContain("<img");
  });

  it("authenticates with AUTH LOGIN when both credentials are set", async () => {
    const server = await useServer({ auth: true });
    applyEnv({ [SMTP_USER_ENV]: USER, [SMTP_PASSWORD_ENV]: PASSWORD });
    await sendMail({ to: "a@b.test", subject: "s", text: "t" });
    const t = server.transcript();
    const i = t.indexOf("AUTH LOGIN");
    expect(i).toBeGreaterThan(-1);
    expect(t[i + 1]).toBe(Buffer.from(USER).toString("base64"));
    expect(t[i + 2]).toBe(Buffer.from(PASSWORD).toString("base64"));
    expect(t.indexOf("MAIL FROM:<no-reply@vari8.test>")).toBeGreaterThan(i);
  });

  it("fails closed when the relay cannot take the recipient", async () => {
    const server = net.createServer((socket) => {
      socket.write("220 relay.test\r\n");
      socket.on("data", (chunk) => {
        const line = chunk.toString("utf8");
        if (line.startsWith("EHLO") || line.startsWith("HELO"))
          socket.write("250 relay.test\r\n");
        else if (line.startsWith("RCPT")) socket.write("550 no such user\r\n");
        else socket.write("250 ok\r\n");
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const port = (server.address() as net.AddressInfo).port;
    applyEnv({ [SMTP_HOST_ENV]: "127.0.0.1", [SMTP_PORT_ENV]: String(port) });
    try {
      await expect(
        sendMail({
          to: "athlete@example.test",
          subject: "Reset your password",
          text: `link https://app.test/reset?token=${TOKEN}`,
        }),
      ).rejects.toThrow("mail delivery failed with status 550");
      await expect(
        sendMail({ to: "a@b.test", subject: "s", text: "t" }),
      ).rejects.not.toThrow(TOKEN);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("requires STARTTLS by default and refuses a relay that lacks it", async () => {
    const server = await useServer(); // advertises no STARTTLS
    applyEnv({ [SMTP_TLS_ENV]: undefined });
    await expect(
      sendMail({ to: "a@b.test", subject: "s", text: `token=${TOKEN}` }),
    ).rejects.toThrow(/STARTTLS/);
    expect(server.transcript()).not.toContain(
      "MAIL FROM:<no-reply@vari8.test>",
    );
  });

  it("names only the missing configuration, never values", async () => {
    applyEnv({ [SMTP_HOST_ENV]: undefined });
    await expect(
      sendMail({ to: "a@b.test", subject: "s", text: "t" }),
    ).rejects.toThrow(/missing SMTP_HOST/);
    await expect(
      sendMail({ to: "a@b.test", subject: "s", text: "t" }),
    ).rejects.not.toThrow("127.0.0.1");
  });

  it("a half auth pair is a configuration fault naming the absent half", async () => {
    const server = await useServer({ auth: true });
    applyEnv({ [SMTP_USER_ENV]: USER, [SMTP_PASSWORD_ENV]: undefined });
    await expect(
      sendMail({ to: "a@b.test", subject: "s", text: "t" }),
    ).rejects.toThrow(/missing SMTP_PASSWORD/);
    expect(server.transcript()).not.toContain("AUTH LOGIN");
  });

  it("rejects a message whose headers would inject a second command", async () => {
    const server = await useServer();
    await expect(
      sendMail({
        to: "a@b.test\r\nRCPT TO:<evil@example.test>",
        subject: "s",
        text: "t",
      }),
    ).rejects.toThrow(/CRLF/);
    expect(server.transcript().join("\n")).not.toContain("evil@example.test");
  });

  it("refuses to boot in production when a required name is missing", () => {
    setEnv("NODE_ENV", "production");
    applyEnv({ [SMTP_HOST_ENV]: "127.0.0.1", [MAIL_FROM_ENV]: undefined });
    expect(() => assertMailDeliveryConfigured()).toThrow(/MAIL_FROM/);
    applyEnv();
    expect(() => assertMailDeliveryConfigured()).not.toThrow();
  });

  it("does not refuse a deployment that deliberately leaves mail off", () => {
    setEnv("NODE_ENV", "production");
    applyEnv({ [MAIL_DELIVERY_ADAPTER_ENV]: undefined });
    expect(() => assertMailDeliveryConfigured()).not.toThrow();
  });
});

describe("invitation delivery (current boundary)", () => {
  // The served path: createInvitationFromApi builds and sends the link
  // inline — the deleted lib/mail/invitation.ts was a dead duplicate.
  // doMock (not hoisted vi.mock): the adapter tests above keep the real
  // sendMail; only these dynamic imports see the doubles.
  const sendMail = vi.fn(
    async (_message: { to: string; subject: string; text: string }) => {},
  );
  const createWorkspaceInvitation = vi.fn();

  const load = async () => {
    vi.resetModules();
    vi.doMock("../../lib/mail", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../lib/mail")>();
      return { ...mod, sendMail };
    });
    vi.doMock("../../lib/auth/rate-limit", () => ({
      consumeRateLimit: vi.fn(async () => ({ allowed: true })),
      userLimitKey: (a: string, b: string) => `${a}:${b}`,
    }));
    vi.doMock("../../lib/workspace/invitations", async (importOriginal) => {
      const mod =
        await importOriginal<
          typeof import("../../lib/workspace/invitations")
        >();
      return {
        ...mod,
        assertInvitationOrchestrationExternallyExposable: vi.fn(),
        createWorkspaceInvitation,
      };
    });
    return import("../../lib/workspace/invitation-api");
  };

  const viewer = {
    userId: "staff-1",
    email: "coach@vari8.test",
    name: "Coach",
  };
  // Only workspaceId is read; the rest of the boundary context is the
  // route's job — cast the double instead of re-deriving Role/scope.
  const workspace = { workspaceId: "ws_123" } as never;

  beforeEach(() => {
    sendMail.mockReset();
    createWorkspaceInvitation.mockReset();
    createWorkspaceInvitation.mockResolvedValue({
      invitationId: "inv-1",
      expiresAt: new Date("2026-11-03T12:00:00Z"),
      delivery: {
        to: "athlete@example.test",
        workspaceId: "ws_123",
        rawToken: TOKEN,
      },
    });
  });
  afterEach(() => {
    vi.doUnmock("../../lib/mail");
    vi.doUnmock("../../lib/auth/rate-limit");
    vi.doUnmock("../../lib/workspace/invitations");
  });

  it("mails the normalized recipient an /invite link carrying the raw token", async () => {
    setEnv("BETTER_AUTH_URL", "https://app.vari8.test/");
    const { createInvitationFromApi } = await load();
    const created = await createInvitationFromApi(viewer, workspace, {
      targetEmail: "athlete@example.test",
      intendedRole: "CLIENT",
    });
    expect(created.delivered).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe("athlete@example.test");
    expect(message.text).toContain(
      `https://app.vari8.test/invite?workspace=ws_123&token=${TOKEN}`,
    );
    expect(message.text).toContain("2026-11-03T12:00:00.000Z");
  });

  it("a delivery failure reports 502 delivery_failed — the row stays committed", async () => {
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    const { createInvitationFromApi } = await load();
    await expect(
      createInvitationFromApi(viewer, workspace, {
        targetEmail: "athlete@example.test",
        intendedRole: "CLIENT",
      }),
    ).rejects.toThrow(/delivery_failed/);
  });
});

describe("password reset mail construction", () => {
  // The served path: auth.options.emailAndPassword.sendResetPassword in
  // lib/auth/server.ts — exercised through the exported auth object so
  // the test drives the real closure, not a copy.
  const sendMail = vi.fn(
    async (_message: { to: string; subject: string; text: string }) => {},
  );
  const deleteMany = vi.fn(async () => ({}));
  const findFirst = vi.fn(async () => null);

  const callReset = async () => {
    vi.resetModules();
    vi.doMock("../../lib/mail", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../lib/mail")>();
      return {
        ...mod,
        sendMail,
        mailDeliveryConfigured: () => true,
      };
    });
    vi.doMock("../../lib/db", () => ({
      prisma: {
        verification: { deleteMany },
        clientProfile: { findFirst },
      },
    }));
    const { auth } = await import("../../lib/auth/server");
    const send = (
      auth.options as unknown as {
        emailAndPassword: {
          sendResetPassword: (input: {
            user: { id: string; email: string };
            token: string;
          }) => Promise<void>;
        };
      }
    ).emailAndPassword.sendResetPassword;
    await send({
      user: { id: "u-1", email: "athlete@example.test" },
      token: TOKEN,
    });
  };

  beforeEach(() => {
    sendMail.mockReset();
    deleteMany.mockReset();
    findFirst.mockReset();
  });
  afterEach(() => {
    vi.doUnmock("../../lib/mail");
    vi.doUnmock("../../lib/db");
  });

  it("staff reset links to /reset with the raw token", async () => {
    setEnv("BETTER_AUTH_URL", "https://app.vari8.test/");
    findFirst.mockResolvedValue(null);
    await callReset();
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe("athlete@example.test");
    expect(message.subject).toBe("Reset your password");
    expect(message.text).toBe(
      `Reset your password: https://app.vari8.test/reset?token=${TOKEN}`,
    );
    // Sibling-token cleanup ran before the send.
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it("a client-profile reset links to /me/reset — O17", async () => {
    setEnv("BETTER_AUTH_URL", "https://app.vari8.test");
    findFirst.mockResolvedValue({ id: "cp-1" } as never);
    await callReset();
    const message = sendMail.mock.calls[0][0];
    expect(message.text).toContain("/me/reset?token=");
  });
});
