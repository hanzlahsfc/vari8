import { describe, expect, it } from "vitest";

import {
  assertAutomaticRetentionConfigured,
  evaluateRetention,
  RETENTION_FAMILIES,
  RETENTION_POLICY,
  RetentionError,
} from "../../lib/gdpr/retention";
import { ACCESS_TOKEN_TERMINAL_RETENTION_MS } from "../../lib/tokens/store";

/**
 * S1-G retention is policy-as-data with all durations TODO(human). Nothing is
 * ever "due" while a family is unset, and no automatic enforcement exists.
 */
describe("S1-G retention policy", () => {
  it("covers the documented record families", () => {
    expect([...RETENTION_FAMILIES].sort()).toEqual(
      [
        "accessToken",
        "auditEvent",
        "bloodwork",
        "checkIn",
        "clientProfile",
        "consentRecord",
        "cycleData",
        "dailyTracking",
        "media",
        "note",
        "nutrition",
        "pedHrt",
        "training",
      ].sort(),
    );
  });

  it("every duration is unset except the decided access-token constant", () => {
    for (const family of RETENTION_FAMILIES) {
      if (family === "accessToken") {
        // Founder decision #26 (30-day terminal cleanup) — referenced
        // read-only, never duplicated.
        expect(RETENTION_POLICY[family].retainForMs).toBe(
          ACCESS_TOKEN_TERMINAL_RETENTION_MS,
        );
      } else {
        expect(RETENTION_POLICY[family].retainForMs).toBeNull();
      }
    }
  });

  it("evaluateRetention returns nothing due while any family is unset", () => {
    expect(evaluateRetention(new Date("2026-10-01T00:00:00Z"))).toEqual([]);
    expect(evaluateRetention()).toEqual([]);
  });

  it("computes cutoffs when a full policy is injected", () => {
    const policy = Object.fromEntries(
      RETENTION_FAMILIES.map((f) => [f, { retainForMs: 1000 }]),
    ) as typeof RETENTION_POLICY;
    const now = new Date("2026-10-01T00:00:00Z");
    const due = evaluateRetention(now, policy);
    expect(due).toHaveLength(RETENTION_FAMILIES.length);
    for (const entry of due) {
      expect(entry.cutoff.toISOString()).toBe("2026-09-30T23:59:59.000Z");
    }
  });

  it("returns empty when any injected family is unset", () => {
    const policy = Object.fromEntries(
      RETENTION_FAMILIES.map((f) => [f, { retainForMs: 1000 }]),
    ) as Record<string, { retainForMs: number | null }>;
    policy.clientProfile.retainForMs = null;
    expect(
      evaluateRetention(new Date(), policy as typeof RETENTION_POLICY),
    ).toEqual([]);
  });

  it.each([
    null,
    "x",
    {},
    { clientProfile: { retainForMs: 1000 } }, // missing families
    Object.assign(
      Object.fromEntries(
        RETENTION_FAMILIES.map((f) => [f, { retainForMs: 1000 }]),
      ),
      { bogus: { retainForMs: 1 } },
    ), // unknown family
    Object.assign(
      Object.fromEntries(
        RETENTION_FAMILIES.map((f) => [f, { retainForMs: 1000 }]),
      ),
      { clientProfile: { retainForMs: -5 } },
    ), // negative
    Object.assign(
      Object.fromEntries(
        RETENTION_FAMILIES.map((f) => [f, { retainForMs: 1000 }]),
      ),
      { clientProfile: { retainForMs: "x" } },
    ), // non-number
  ])("rejects malformed policy %j", (policy) => {
    expect(() => evaluateRetention(new Date(), policy as never)).toThrowError(
      expect.objectContaining({
        name: "RetentionError",
        code: "invalid_input",
      }),
    );
  });

  it("rejects a malformed now argument", () => {
    expect(() => evaluateRetention("now" as never)).toThrow(RetentionError);
    expect(() => evaluateRetention(new Date("not-a-date"))).toThrow(
      RetentionError,
    );
  });

  it("automatic enforcement fails closed — no job may exist", () => {
    expect(() => assertAutomaticRetentionConfigured()).toThrowError(
      expect.objectContaining({
        name: "RetentionError",
        code: "retention_not_configured",
      }),
    );
  });
});
