import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEV_MAILBOX_FILE_ENV,
  MAIL_DELIVERY_ADAPTER_ENV,
  mailDeliveryConfigured,
  sendMail,
} from "../../lib/mail";

/**
 * PR-05 rewiring — `lib/auth/password-reset-delivery.ts` is deleted; the
 * fail-closed delivery port now lives in `lib/mail` (block TB1.061, same
 * contract). `MAIL_DELIVERY_ADAPTER` SELECTS a registered adapter — it can
 * never enable delivery on its own. Outside production the dev-file adapter
 * is the implicit default; in production an explicit name is required.
 */
describe("mailDeliveryConfigured (the reset delivery gate)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unconfigured for empty or whitespace adapter names", () => {
    for (const env of ["", "   "]) {
      vi.stubEnv(MAIL_DELIVERY_ADAPTER_ENV, env);
      expect(mailDeliveryConfigured()).toBe(false);
    }
  });

  it("an env value alone cannot enable delivery — unknown names fail closed", () => {
    for (const env of ["1", "true", "smtp", "sendgrid", "resend", "noop"]) {
      vi.stubEnv(MAIL_DELIVERY_ADAPTER_ENV, env);
      expect(mailDeliveryConfigured()).toBe(false);
    }
  });

  it("production with no adapter set is unconfigured; non-production defaults to dev-file", () => {
    vi.stubEnv(MAIL_DELIVERY_ADAPTER_ENV, undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(mailDeliveryConfigured()).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    expect(mailDeliveryConfigured()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(mailDeliveryConfigured()).toBe(true);
  });

  it("an explicit dev-file adapter name configures delivery", () => {
    vi.stubEnv(MAIL_DELIVERY_ADAPTER_ENV, "dev-file");
    expect(mailDeliveryConfigured()).toBe(true);
  });
});

describe("dev-file adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("appends one JSONL line per message, carrying the message fields only", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mb-unit-"));
    const file = path.join(dir, "mailbox.jsonl");
    vi.stubEnv(MAIL_DELIVERY_ADAPTER_ENV, "dev-file");
    vi.stubEnv(DEV_MAILBOX_FILE_ENV, file);

    await sendMail({ to: "a@x.test", subject: "s1", text: "body one" });
    await sendMail({ to: "b@x.test", subject: "s2", text: "body two" });

    const lines = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      to: "a@x.test",
      subject: "s1",
      text: "body one",
    });
    expect(lines[1]).toMatchObject({
      to: "b@x.test",
      subject: "s2",
      text: "body two",
    });
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual([
        "at",
        "subject",
        "text",
        "to",
      ]);
    }
  });

  it("sendMail with an unknown adapter name rejects — there is no silent sink", async () => {
    vi.stubEnv(MAIL_DELIVERY_ADAPTER_ENV, "smtp");
    await expect(
      sendMail({ to: "u@example.test", subject: "s", text: "t" }),
    ).rejects.toThrow("mail delivery is not configured");
  });
});
