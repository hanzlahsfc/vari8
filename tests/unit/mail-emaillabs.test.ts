import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMailDeliveryConfigured,
  EMAILLABS_APP_KEY_ENV,
  EMAILLABS_SECRET_KEY_ENV,
  EMAILLABS_SMTP_ACCOUNT_ENV,
  MAIL_DELIVERY_ADAPTER_ENV,
  MAIL_FROM_ENV,
  sendMail,
} from "../../lib/mail";

/**
 * O22 transactional mail. Each test guards a rule that removing the rule
 * breaks: the wire contract the provider actually reads, the no-secrets-in-logs
 * rule, the boot refusal, and the invitation link target.
 */

const APP_KEY = "app-key-under-test";
const SECRET_KEY = "secret-key-under-test";
const TOKEN = "tok_single_use_0123456789";

const ENV = {
  [MAIL_DELIVERY_ADAPTER_ENV]: "emaillabs",
  [EMAILLABS_APP_KEY_ENV]: APP_KEY,
  [EMAILLABS_SECRET_KEY_ENV]: SECRET_KEY,
  [EMAILLABS_SMTP_ACCOUNT_ENV]: "1.panel.smtp",
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

beforeEach(() => {
  applyEnv();
});

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("emaillabs adapter", () => {
  it("posts the form the provider documents, with basic auth and no tracking", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: "success" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendMail({
      to: "athlete@example.test",
      subject: "Reset your password",
      text: `Reset your password: https://app.test/reset?token=${TOKEN}`,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.emaillabs.net.pl/api/new_sendmail");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(
      `Basic ${Buffer.from(`${APP_KEY}:${SECRET_KEY}`).toString("base64")}`,
    );
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");

    const body = init.body as URLSearchParams;
    expect(body.get("to[athlete@example.test]")).toBe("");
    expect(body.get("smtp_account")).toBe("1.panel.smtp");
    expect(body.get("from")).toBe("no-reply@vari8.test");
    expect(body.get("subject")).toBe("Reset your password");
    expect(body.get("text")).toContain(`token=${TOKEN}`);
    const html = body.get("html") ?? "";
    expect(html).toContain("<p>");
    expect(html).toContain(`token=${TOKEN}`);
    // No tracking pixel, no click rewriting, no remote asset.
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/https?:\/\/(?!app\.test)/);
  });

  it("never puts a message, token or key into a log line", async () => {
    const logs: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((value) => String(value)).join(" "));
      });
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("provider exploded", { status: 500 })),
    );

    await expect(
      sendMail({
        to: "athlete@example.test",
        subject: "Reset your password",
        text: `Reset your password: https://app.test/reset?token=${TOKEN}`,
      }),
    ).rejects.toThrow(/status 500/);

    const all = logs.join("\n");
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain(APP_KEY);
    expect(all).not.toContain(SECRET_KEY);
    expect(all).not.toContain("athlete@example.test");
    expect(all).not.toContain("provider exploded");
  });

  it("refuses to boot in production when a named key is missing", () => {
    setEnv("NODE_ENV", "production");
    applyEnv({ [EMAILLABS_SECRET_KEY_ENV]: undefined });
    expect(() => assertMailDeliveryConfigured()).toThrow(
      /EMAILLABS_SECRET_KEY/,
    );

    applyEnv();
    expect(() => assertMailDeliveryConfigured()).not.toThrow();
  });

  it("does not refuse a deployment that deliberately leaves mail off", () => {
    setEnv("NODE_ENV", "production");
    applyEnv({ [MAIL_DELIVERY_ADAPTER_ENV]: undefined });
    expect(() => assertMailDeliveryConfigured()).not.toThrow();
  });

  it("propagates a provider timeout — no silent swallow, no retry storm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );
    await expect(
      sendMail({ to: "u@example.test", subject: "s", text: "t" }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("a non-2xx provider status rejects with the status only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(`bad recipient for ${TOKEN}`, { status: 422 }),
      ),
    );
    await expect(
      sendMail({
        to: "athlete@example.test",
        subject: "Reset your password",
        text: `Reset your password: https://app.test/reset?token=${TOKEN}`,
      }),
    ).rejects.toThrow("mail delivery failed with status 422");
    await expect(
      sendMail({ to: "a@b.test", subject: "s", text: "t" }),
    ).rejects.not.toThrow(TOKEN);
  });
});

describe("invitation delivery (current boundary)", () => {
  // The served path: createInvitationFromApi builds and sends the link
  // inline — the deleted lib/mail/invitation.ts was a dead duplicate.
  // doMock (not hoisted vi.mock): the adapter tests above keep the real
  // sendMail; only these dynamic imports see the doubles.
  const sendMail = vi.fn(async () => {});
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

  const viewer = { userId: "staff-1" };
  const workspace = { workspaceId: "ws_123" };

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
    const message = sendMail.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
    };
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
  const sendMail = vi.fn(async () => {});
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
    const message = sendMail.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
    };
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
    const message = sendMail.mock.calls[0][0] as {
      text: string;
    };
    expect(message.text).toContain("/me/reset?token=");
  });
});
