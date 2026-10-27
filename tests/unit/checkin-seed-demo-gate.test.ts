import { describe, expect, it } from "vitest";

import {
  eventsBetween,
  seedState,
} from "../../components/canvas/coach/model";

/**
 * W2-CHK-I4 (fail-closed seed gate): with ENABLE_CHECK_INS unset every
 * flag-gated check-in read returns 403, so whatever the seed carries is what
 * the canvas renders. A non-demo seed that ships fixture submissions,
 * extras and schedules presents demo check-in rows as live workspace data,
 * the leaked row the verifier caught on the profile Check-ins tab.
 */
describe("check-in seed demo gate (W2-CHK-I4)", () => {
  it("non-demo seed carries no check-in fixture rows", () => {
    const state = seedState({ demo: false });
    expect(state.submissions).toEqual([]);
    expect(state.extras).toEqual([]);
    expect(state.clients.every((c) => c.schedules.length === 0)).toBe(true);
  });

  it("non-demo seed paints no check-in events on the board", () => {
    const state = seedState({ demo: false });
    expect(eventsBetween(state, "2026-10-01", "2026-12-31")).toEqual([]);
  });

  it("demo seed keeps the check-in fixtures", () => {
    const state = seedState({ demo: true });
    expect(state.submissions.length).toBeGreaterThan(0);
    expect(state.extras.length).toBeGreaterThan(0);
    expect(state.clients.some((c) => c.schedules.length > 0)).toBe(true);
    expect(
      eventsBetween(state, "2026-10-12", "2026-10-12").length,
    ).toBeGreaterThan(0);
  });
});
