import { describe, expect, it } from "vitest";

import { createDailyEntryImpactProvider } from "@/lib/coaching/daily-entry-impact";
import { DAILY_ENTRY_CONSUMER } from "@/lib/coaching/daily-entry-impact";
import { collectProviderImpacts } from "@/lib/coaching/transition-impact";
import type { TransitionImpactInput } from "@/lib/coaching/transition-impact";

/** Stubbed PrismaLike — captures the query args and returns canned rows
 * keyed by parameter_id. The provider's only DB surface is the single
 * $queryRawUnsafe count query. */
function stubDb(
  rows: Array<{
    parameter_id: string;
    entry_count: string | number;
    earliest: Date | string | null;
    latest: Date | string | null;
  }>,
) {
  return {
    $queryRawUnsafe: async (_sql: string, ids: string[]) =>
      rows.filter((r) => ids.includes(r.parameter_id)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const input = (
  removed: Array<{ parameterId: string; parameterKey: string }>,
): TransitionImpactInput => ({
  direction: "UPGRADE",
  removed,
  reboundFrom: [],
  reboundTo: [],
});

describe("P-021 daily-entry impact provider ordering", () => {
  it("sorts affectedParameters by code unit, not localeCompare", async () => {
    // "Z_"(90) sorts before "a_"(97) under code units but AFTER under
    // localeCompare in typical locales — a real differentiator.
    const provider = createDailyEntryImpactProvider(
      stubDb([
        {
          parameter_id: "pa",
          entry_count: "2",
          earliest: "2026-10-01",
          latest: "2026-10-05",
        },
        {
          parameter_id: "pz",
          entry_count: "1",
          earliest: "2026-10-03",
          latest: "2026-10-03",
        },
      ]),
      "client_x",
    );
    const result = await collectProviderImpacts(
      {
        declarations: [DAILY_ENTRY_CONSUMER],
        providers: { "daily-entry": provider },
      },
      input([
        { parameterId: "pa", parameterKey: "a_param" },
        { parameterId: "pz", parameterKey: "Z_param" },
      ]),
    );
    // Code-unit order is [Z_param, a_param]; localeCompare yields the
    // opposite — which the P-020B strict-ascending validator rejects as
    // PROVIDER_OUTPUT_INVALID.
    expect(result.blockedReasonCodes).toEqual([]);
    expect(result.impacts).toHaveLength(1);
    const keys = result.impacts[0].affectedParameters.map(
      (p) => p.parameterKey,
    );
    expect(keys).toEqual(["Z_param", "a_param"]);
    // Count/date semantics unchanged.
    const byKey = new Map(
      result.impacts[0].affectedParameters.map((p) => [p.parameterKey, p]),
    );
    expect(byKey.get("a_param")).toMatchObject({
      count: "2",
      earliestDate: "2026-10-01",
      latestDate: "2026-10-05",
      reasonCode: "REMOVED_WITH_HISTORY",
    });
    expect(byKey.get("Z_param")).toMatchObject({
      count: "1",
      earliestDate: "2026-10-03",
      latestDate: "2026-10-03",
      reasonCode: "REMOVED_WITH_HISTORY",
    });
  });

  it("emits no raw parameter identifiers' order dependence on duplicates", async () => {
    const provider = createDailyEntryImpactProvider(
      stubDb([
        {
          parameter_id: "p1",
          entry_count: "3",
          earliest: "2026-09-01",
          latest: "2026-10-01",
        },
      ]),
      "client_x",
    );
    const result = await collectProviderImpacts(
      {
        declarations: [DAILY_ENTRY_CONSUMER],
        providers: { "daily-entry": provider },
      },
      input([
        { parameterId: "p1", parameterKey: "m1" },
        { parameterId: "p2", parameterKey: "m0" },
      ]),
    );
    expect(result.blockedReasonCodes).toEqual([]);
    const params = result.impacts[0].affectedParameters;
    expect(params.map((p) => p.parameterKey)).toEqual(["m0", "m1"]);
    expect(params.find((p) => p.parameterKey === "m0")?.count).toBe("0");
    expect(
      params.find((p) => p.parameterKey === "m0")?.earliestDate,
    ).toBeNull();
  });
});
