import { describe, expect, it } from "vitest";

import {
  retentionCutoff,
  retentionElapsed,
} from "../../lib/workspace/retention";

const now = new Date("2026-12-31T00:00:00.000Z");

describe("retention boundary", () => {
  it("puts the cutoff the configured number of days before now", () => {
    expect(retentionCutoff(now, 90).toISOString()).toBe(
      "2026-10-02T00:00:00.000Z",
    );
  });

  it("is inclusive: archived exactly on the cutoff is elapsed", () => {
    expect(
      retentionElapsed(new Date("2026-10-02T00:00:00.000Z"), 90, now),
    ).toBe(true);
    expect(
      retentionElapsed(new Date("2026-10-02T00:00:00.001Z"), 90, now),
    ).toBe(false);
  });

  it("clamps a non-positive workspace setting to zero instead of future-dating the cutoff", () => {
    // Unguarded, 0/-1 would place the cutoff at or after `now`, so a client
    // archived a moment ago would be deletable immediately.
    expect(retentionCutoff(now, 0).getTime()).toBe(now.getTime());
    expect(retentionCutoff(now, -1).getTime()).toBe(now.getTime());
    const justArchived = new Date(now.getTime() - 1);
    expect(retentionElapsed(justArchived, -1, now)).toBe(true);
    expect(retentionElapsed(now, -1, now)).toBe(true);
  });
});
