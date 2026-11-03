import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEV_MAILBOX_FILE_ENV,
  MAIL_DELIVERY_ADAPTER_ENV,
  mailDeliveryConfigured,
  sendMail,
} from "../../lib/mail";

/**
 * PR-05 mail port: the delivery adapter is the ONLY thing that can enable
 * mail — an env name that isn't a registered adapter fails closed, and
 * production without an explicit adapter stays unconfigured.
 */
const saved: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
    delete saved[key];
  }
});

describe("mail delivery port", () => {
  it("an env value alone cannot enable delivery — unknown names fail closed", () => {
    for (const env of ["", "1", "true", "sendgrid", "noop"]) {
      setEnv(MAIL_DELIVERY_ADAPTER_ENV, env);
      expect(mailDeliveryConfigured()).toBe(false);
    }
  });

  it("the smtp adapter is a registered name", () => {
    setEnv(MAIL_DELIVERY_ADAPTER_ENV, "smtp");
    expect(mailDeliveryConfigured()).toBe(true);
  });

  it("production without an explicit adapter is unconfigured", () => {
    setEnv(MAIL_DELIVERY_ADAPTER_ENV, undefined);
    setEnv("NODE_ENV", "production");
    expect(mailDeliveryConfigured()).toBe(false);
  });

  it("the dev-file adapter writes one JSON line per message", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mail-test-"));
    const file = join(dir, "mailbox.jsonl");
    setEnv(MAIL_DELIVERY_ADAPTER_ENV, "dev-file");
    setEnv(DEV_MAILBOX_FILE_ENV, file);
    try {
      expect(mailDeliveryConfigured()).toBe(true);
      await sendMail({
        to: "u@example.test",
        subject: "Reset your password",
        text: "link https://app.test/reset?token=abc",
      });
      const lines = (await readFile(file, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.to).toBe("u@example.test");
      expect(parsed.subject).toBe("Reset your password");
      expect(parsed.text).toContain("/reset?token=abc");
      expect(typeof parsed.at).toBe("string");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
