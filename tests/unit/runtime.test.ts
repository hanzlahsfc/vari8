import { describe, expect, it } from "vitest";

import { isCoachingTemplatesEnabled } from "../../lib/coaching/gate";
import { consentGatesEnabled, classifyRuntime } from "../../lib/runtime";
import { assertConsentMutationsExternallyExposable } from "../../lib/consent";
import {
  assertGdprExternallyExposable,
  GdprNotExposableError,
} from "../../lib/gdpr";
import { assertAutomaticRetentionConfigured } from "../../lib/gdpr/retention";

/**
 * PR-04 unit proof (D11/D14) — one biting test per gate kind:
 * an exact-1 development flag set in a production runtime stays off, and a
 * parked consent gate with ENABLE_CONSENT_GATES unset allows. These run the
 * exported gates the same way routes, actions and services call them.
 */

describe("trusted runtime classification", () => {
  it("explicit APP_ENV wins; only development/test are trusted", () => {
    expect(classifyRuntime({ APP_ENV: "development" })).toBe("development");
    expect(classifyRuntime({ APP_ENV: "test" })).toBe("test");
    expect(classifyRuntime({ APP_ENV: "staging" })).toBe("production");
    expect(classifyRuntime({ APP_ENV: "production" })).toBe("production");
    // Explicit value beats the baked-in NODE_ENV signal.
    expect(classifyRuntime({ APP_ENV: "production", NODE_ENV: "test" })).toBe(
      "production",
    );
    expect(classifyRuntime({ NODE_ENV: "development" })).toBe("development");
    // Missing or unknown values resolve production-safe.
    expect(classifyRuntime({})).toBe("production");
    expect(classifyRuntime({ NODE_ENV: "staging" })).toBe("production");
  });
});

describe("V3-H4-02 — exact-1 development flags", () => {
  it("a flag set to 1 in a production runtime stays off", () => {
    expect(isCoachingTemplatesEnabled("1", { APP_ENV: "production" })).toBe(
      false,
    );
    expect(isCoachingTemplatesEnabled("1", { APP_ENV: "staging" })).toBe(false);
    expect(isCoachingTemplatesEnabled("1", { NODE_ENV: "production" })).toBe(
      false,
    );
    expect(isCoachingTemplatesEnabled("1", {})).toBe(false);
  });

  it("a flag set to 1 in a trusted runtime is on; anything else is off", () => {
    expect(isCoachingTemplatesEnabled("1", { APP_ENV: "test" })).toBe(true);
    expect(isCoachingTemplatesEnabled("1", { NODE_ENV: "development" })).toBe(
      true,
    );
    expect(isCoachingTemplatesEnabled("yes", { APP_ENV: "test" })).toBe(false);
    expect(isCoachingTemplatesEnabled("", { APP_ENV: "test" })).toBe(false);
    expect(isCoachingTemplatesEnabled(undefined, { APP_ENV: "test" })).toBe(
      false,
    );
  });
});

describe("D19 — parked consent and health-data gates", () => {
  it("ENABLE_CONSENT_GATES unset allows", () => {
    expect(consentGatesEnabled({})).toBe(false);
    expect(consentGatesEnabled({ ENABLE_CONSENT_GATES: "0" })).toBe(false);
    expect(() => assertGdprExternallyExposable({})).not.toThrow();
    expect(() => assertConsentMutationsExternallyExposable({})).not.toThrow();
    expect(() => assertAutomaticRetentionConfigured({})).not.toThrow();
  });

  it("set to 1 in a trusted runtime the parked gates enforce", () => {
    const env = { ENABLE_CONSENT_GATES: "1", APP_ENV: "test" } as const;
    expect(consentGatesEnabled(env)).toBe(true);
    expect(() => assertGdprExternallyExposable(env)).toThrow(
      GdprNotExposableError,
    );
    expect(() => assertConsentMutationsExternallyExposable(env)).toThrow(
      "audit_not_wired_for_external_use",
    );
    expect(() => assertAutomaticRetentionConfigured(env)).toThrow(
      "retention_not_configured",
    );
  });

  it("the consent flag counts only in a trusted runtime too", () => {
    expect(
      consentGatesEnabled({
        ENABLE_CONSENT_GATES: "1",
        APP_ENV: "production",
      }),
    ).toBe(false);
  });
});
