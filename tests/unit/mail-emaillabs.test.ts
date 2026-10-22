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
import { invitationLink, sendInvitationMail } from "../../lib/mail/invitation";

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
});

describe("invitation mail", () => {
  it("links to the invite route with workspace and token, whatever the role", () => {
    setEnv("BETTER_AUTH_URL", "https://app.vari8.test/");
    const link = invitationLink({
      workspaceId: "ws_123",
      rawToken: TOKEN,
    });
    expect(link).toBe(
      `https://app.vari8.test/invite?workspace=ws_123&token=${TOKEN}`,
    );
  });

  it("sends role-aware copy through the adapter, with the link in both parts", async () => {
    setEnv("BETTER_AUTH_URL", "https://app.vari8.test");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendInvitationMail({
      to: "athlete@example.test",
      workspaceId: "ws_123",
      rawToken: TOKEN,
      intendedRole: "CLIENT",
    });

    const body = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1].body as URLSearchParams;
    expect(body.get("subject")).toMatch(/your coaching space/i);
    expect(body.get("text")).toContain(
      `https://app.vari8.test/invite?workspace=ws_123&token=${TOKEN}`,
    );
    expect(body.get("html")).toContain(
      `https://app.vari8.test/invite?workspace=ws_123&amp;token=${TOKEN}`,
    );
  });
});
