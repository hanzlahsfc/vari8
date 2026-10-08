import { describe, expect, it } from "vitest";

import {
  BLOCKED_REASON_RANK,
  collectProviderImpacts,
  IMPACT_ROLE_RANK,
  isCanonicalCalendarDate,
  isCanonicalCount,
  isValidImpactBounds,
  providerSetIdentity,
  validateProviderSet,
  type ConsumerDeclaration,
  type TransitionImpactProvider,
} from "../../lib/coaching/transition-impact";
import {
  DECLARED_CONSUMERS,
  PROVIDER_FACTORIES,
  validateProviderFactories,
} from "../../lib/coaching/impact-consumers";
import { ClientSetupTransitionError } from "../../lib/coaching/client-setup-transition-gate";

/**
 * P-020B — provider framework unit tests: canonical counts/dates, closed
 * reason vocabularies, declaration/provider exact-set equality, provider-set
 * identity vectors, and provider execution/validation failure mapping.
 */

const decl = (key: string, contract = 1, output = 1): ConsumerDeclaration => ({
  consumerKey: key,
  contractVersion: contract,
  outputSchemaVersion: output,
});

const input = {
  direction: "UPGRADE" as const,
  removed: [{ parameterId: "p1", parameterKey: "p_p1" }],
  reboundFrom: [{ parameterId: "p2", parameterKey: "p_p2" }],
  reboundTo: [{ parameterId: "p3", parameterKey: "p_p3" }],
};

const provider = (
  key: string,
  evaluate: TransitionImpactProvider["evaluate"],
): TransitionImpactProvider => ({ evaluate });

describe("P-020B canonical count + date validation", () => {
  it("accepts only unsigned ASCII base-10 canonical counts", () => {
    for (const ok of ["0", "1", "42", "9007199254740993"]) {
      expect(isCanonicalCount(ok)).toBe(true);
    }
    for (const bad of [
      "",
      "00",
      "01",
      "-1",
      "+1",
      " 1",
      "1 ",
      "1.5",
      "1e3",
      "1,000",
      "0x10",
      "1\n",
      "１２",
      5,
      null,
      undefined,
    ]) {
      expect(isCanonicalCount(bad)).toBe(false);
    }
  });

  it("accepts only real canonical calendar dates", () => {
    expect(isCanonicalCalendarDate("2026-10-08")).toBe(true);
    expect(isCanonicalCalendarDate("1970-01-01")).toBe(true);
    for (const bad of [
      "",
      "2026-13-01",
      "2026-02-30",
      "2026-04-31",
      "2023-02-29", // not a leap year
      "2024-02-29b",
      "26-10-08",
      "2026/10/08",
      "2026-10-08T00:00:00Z",
      null,
      42,
    ]) {
      expect(isCanonicalCalendarDate(bad)).toBe(false);
    }
    // 2024 IS a leap year.
    expect(isCanonicalCalendarDate("2024-02-29")).toBe(true);
  });

  it("enforces count/date bound coupling and ordering", () => {
    expect(isValidImpactBounds("0", null, null)).toBe(true);
    expect(isValidImpactBounds("0", "2026-01-01", null)).toBe(false);
    expect(isValidImpactBounds("5", "2026-01-01", "2026-01-02")).toBe(true);
    expect(isValidImpactBounds("5", "2026-01-01", null)).toBe(false);
    expect(isValidImpactBounds("5", "2026-02-01", "2026-01-01")).toBe(false);
    expect(isValidImpactBounds("5", "bad", "2026-01-01")).toBe(false);
    expect(isValidImpactBounds("bad", "2026-01-01", "2026-01-02")).toBe(false);
  });
});

describe("P-020B provider declaration/set equality", () => {
  it("the production registry declares daily-entry with a matching factory", () => {
    expect(DECLARED_CONSUMERS.map((d) => d.consumerKey)).toEqual([
      "daily-entry",
    ]);
    expect(Object.keys(PROVIDER_FACTORIES)).toEqual(["daily-entry"]);
    expect(() =>
      validateProviderFactories(DECLARED_CONSUMERS, PROVIDER_FACTORIES),
    ).not.toThrow();
  });

  it("rejects declaration-without-factory and factory-without-declaration", () => {
    expect(() =>
      validateProviderFactories([...DECLARED_CONSUMERS, decl("x")], {
        ...PROVIDER_FACTORIES,
      }),
    ).toThrowError(ClientSetupTransitionError);
    expect(() =>
      validateProviderFactories(DECLARED_CONSUMERS, {
        ...PROVIDER_FACTORIES,
        x: () => ({}) as never,
      }),
    ).toThrowError(ClientSetupTransitionError);
  });

  it("rejects declaration-without-provider and provider-without-declaration", () => {
    expect(() => validateProviderSet([decl("a")], {})).toThrowError(
      ClientSetupTransitionError,
    );
    expect(() =>
      validateProviderSet([], { a: provider("a", async () => ({}) as never) }),
    ).toThrowError(ClientSetupTransitionError);
    expect(() =>
      validateProviderSet([decl("a"), decl("b")], {
        a: provider("a", async () => ({}) as never),
      }),
    ).toThrowError(ClientSetupTransitionError);
  });

  it("rejects duplicate keys and non-positive-int versions", () => {
    expect(() => validateProviderSet([decl("a"), decl("a")], {})).toThrowError(
      ClientSetupTransitionError,
    );
    expect(() => validateProviderSet([decl("a", 0, 1)], {})).toThrowError(
      ClientSetupTransitionError,
    );
    expect(() => validateProviderSet([decl("a", 1, 1.5)], {})).toThrowError(
      ClientSetupTransitionError,
    );
  });

  it("accepts a consistent non-empty set", () => {
    expect(() =>
      validateProviderSet([decl("a"), decl("b", 2, 3)], {
        a: provider("a", async () => ({}) as never),
        b: provider("b", async () => ({}) as never),
      }),
    ).not.toThrow();
  });
});

describe("P-020B provider-set identity vectors", () => {
  it("pins the empty-set identity (versioned domain hash)", () => {
    // Fixed test vector — regenerate ONLY with a contract-version change.
    expect(providerSetIdentity([])).toBe(
      "127e19f4365906f74aefb19bd1a20faa230a18df6e85166744f0705b93a90415",
    );
  });

  it("pins a synthetic non-empty identity and is order-insensitive", () => {
    const a = [decl("alpha", 1, 1), decl("beta", 2, 1)];
    const b = [decl("beta", 2, 1), decl("alpha", 1, 1)];
    expect(providerSetIdentity(a)).toBe(providerSetIdentity(b));
    expect(providerSetIdentity(a)).toBe(
      "c4a9693d72c436fcbd9b3dd4d0af9658ab28c0f02a9f2c4485543f8222faaccc",
    );
    expect(providerSetIdentity(a)).not.toBe(providerSetIdentity([]));
  });
});

describe("P-020B provider execution + output validation", () => {
  const baseImpact = () => ({
    parameterId: "p1",
    parameterKey: "p_p1",
    impactRole: "REMOVED",
    count: "9007199254740993",
    earliestDate: "2020-01-01",
    latestDate: "2025-12-31",
    reasonCode: "REMOVED_WITH_HISTORY",
  });
  const base = (over: Record<string, unknown> = {}) => ({
    consumerKey: "history",
    contractVersion: 1,
    affectedParameters: [baseImpact()],
    blockedReasonCodes: [],
    ...over,
  });

  it("passes through a valid provider result", async () => {
    const result = await collectProviderImpacts(
      {
        declarations: [decl("history")],
        providers: {
          history: provider("history", async () => base() as never),
        },
      },
      input,
    );
    expect(result.blockedReasonCodes).toEqual([]);
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0].affectedParameters[0].count).toBe(
      "9007199254740993",
    );
  });

  it("maps provider exceptions to PROVIDER_EXECUTION_FAILED", async () => {
    const result = await collectProviderImpacts(
      {
        declarations: [decl("history")],
        providers: {
          history: provider("history", async () => {
            throw new Error("boom");
          }),
        },
      },
      input,
    );
    expect(result.impacts).toEqual([]);
    expect(result.blockedReasonCodes).toEqual(["PROVIDER_EXECUTION_FAILED"]);
  });

  it("maps consumerKey/contractVersion mismatch to PROVIDER_VERSION_MISMATCH", async () => {
    for (const over of [{ consumerKey: "other" }, { contractVersion: 2 }]) {
      const result = await collectProviderImpacts(
        {
          declarations: [decl("history")],
          providers: {
            history: provider("history", async () => base(over) as never),
          },
        },
        input,
      );
      expect(result.blockedReasonCodes).toEqual(["PROVIDER_VERSION_MISMATCH"]);
    }
  });

  it("maps malformed outputs to PROVIDER_OUTPUT_INVALID", async () => {
    for (const over of [
      { affectedParameters: "nope" },
      { blockedReasonCodes: ["NOT_A_CODE"] },
      {
        affectedParameters: [{ ...baseImpact(), count: "01" }],
      },
      {
        affectedParameters: [{ ...baseImpact(), earliestDate: "2020-1-1" }],
      },
      {
        affectedParameters: [{ ...baseImpact(), parameterId: "unknown" }],
      },
      {
        affectedParameters: [{ ...baseImpact(), reasonCode: "MADE_UP" }],
      },
      {
        affectedParameters: [{ ...baseImpact(), impactRole: "REBOUND_TO" }],
      },
    ]) {
      const result = await collectProviderImpacts(
        {
          declarations: [decl("history")],
          providers: {
            history: provider("history", async () => base(over) as never),
          },
        },
        input,
      );
      expect(result.blockedReasonCodes).toEqual(["PROVIDER_OUTPUT_INVALID"]);
    }
  });

  it("maps provider-reported blocks to PROVIDER_REPORTED_BLOCK", async () => {
    const result = await collectProviderImpacts(
      {
        declarations: [decl("history")],
        providers: {
          history: provider(
            "history",
            async () =>
              base({
                affectedParameters: [],
                blockedReasonCodes: ["PROVIDER_UNAVAILABLE"],
              }) as never,
          ),
        },
      },
      input,
    );
    expect(result.blockedReasonCodes).toEqual(["PROVIDER_REPORTED_BLOCK"]);
  });

  it("a set with no real provider invocable reports no impacts", async () => {
    const result = await collectProviderImpacts(
      { declarations: [], providers: {} },
      input,
    );
    expect(result.impacts).toEqual([]);
    expect(result.blockedReasonCodes).toEqual([]);
  });
});

describe("P-020B closed vocabularies", () => {
  it("rank tables cover the whole union deterministically", () => {
    expect(Object.keys(BLOCKED_REASON_RANK).sort()).toEqual(
      [
        "PROVIDER_EXECUTION_FAILED",
        "PROVIDER_OUTPUT_INVALID",
        "PROVIDER_REPORTED_BLOCK",
        "PROVIDER_UNAVAILABLE",
        "PROVIDER_VERSION_MISMATCH",
        "TARGET_INELIGIBLE",
      ].sort(),
    );
    expect(Object.keys(IMPACT_ROLE_RANK).sort()).toEqual(
      ["REBOUND_FROM", "REBOUND_TO", "REMOVED"].sort(),
    );
  });
});
