/**
 * Issue #169 — activity targets: the pure day-effective resolver and write
 * planner. Dated version rows per (client, metric); the latest row with
 * effectiveFrom <= date wins; a null-kind row is a stop. Same-day replace is
 * an in-place plan that requires the confirm flag and bumps the revision.
 * These tests pin the day boundary, so they fail if it moves.
 */
import { describe, expect, it } from "vitest";

import {
  type ActivityTargetRow,
  type ActivityTargetWrite,
  planActivityTargetWrite,
  resolveActivityTarget,
  validateActivityTargetWrite,
} from "@/lib/activity-targets/model";

const stepsRow = (
  id: string,
  effectiveFrom: string,
  value: number,
  revision = 1,
): ActivityTargetRow => ({
  id,
  metric: "steps",
  kind: "MINIMUM",
  stepMin: value,
  stepMax: null,
  sessionsPerWeek: null,
  minutesPerSession: null,
  effectiveFrom,
  revision,
});

const cardioRow = (
  id: string,
  effectiveFrom: string,
  sessionsPerWeek: number,
  minutesPerSession: number,
  revision = 1,
): ActivityTargetRow => ({
  id,
  metric: "cardioMin",
  kind: "CARDIO",
  stepMin: null,
  stepMax: null,
  sessionsPerWeek,
  minutesPerSession,
  effectiveFrom,
  revision,
});

const minimum = (stepMin: number): ActivityTargetWrite => ({
  kind: "MINIMUM",
  stepMin,
});
const range = (stepMin: number, stepMax: number): ActivityTargetWrite => ({
  kind: "RANGE",
  stepMin,
  stepMax,
});
const cardio = (
  sessionsPerWeek: number,
  minutesPerSession: number,
): ActivityTargetWrite => ({
  kind: "CARDIO",
  sessionsPerWeek,
  minutesPerSession,
});

describe("resolveActivityTarget — day-effective versions", () => {
  // 2026-10-19 is a Monday; 2026-10-21 is a Wednesday.
  const oldTarget = stepsRow("r-old", "2026-10-19", 8000);
  const wednesdayChange = stepsRow("r-wed", "2026-10-21", 9500);
  const rows = [wednesdayChange, oldTarget];

  it("applies a Wednesday change from Wednesday", () => {
    expect(
      resolveActivityTarget({ rows, metric: "steps", date: "2026-10-21" })?.id,
    ).toBe("r-wed");
    expect(
      resolveActivityTarget({ rows, metric: "steps", date: "2026-10-23" })?.id,
    ).toBe("r-wed");
  });

  it("keeps the earlier target on Monday and Tuesday", () => {
    for (const date of ["2026-10-19", "2026-10-20"]) {
      const resolved = resolveActivityTarget({ rows, metric: "steps", date });
      expect(resolved?.id).toBe("r-old");
      expect(resolved?.stepMin).toBe(8000);
    }
  });

  it("returns undefined before the first version", () => {
    expect(
      resolveActivityTarget({ rows, metric: "steps", date: "2026-10-18" }),
    ).toBeUndefined();
  });

  it("scopes resolution to the metric", () => {
    const all = [...rows, cardioRow("r-cardio", "2026-10-19", 3, 20)];
    expect(
      resolveActivityTarget({ rows: all, metric: "cardioMin", date: "2026-10-23" })
        ?.id,
    ).toBe("r-cardio");
    expect(
      resolveActivityTarget({ rows: all, metric: "cardioMin", date: "2026-10-18" }),
    ).toBeUndefined();
  });

  it("does not depend on row order", () => {
    const shuffled = [...rows].reverse();
    expect(
      resolveActivityTarget({ rows: shuffled, metric: "steps", date: "2026-10-22" })
        ?.id,
    ).toBe("r-wed");
  });

  it("treats a null-kind row as a stop: no target from that day, old value before", () => {
    const stopped: ActivityTargetRow = {
      ...wednesdayChange,
      id: "r-stop",
      kind: null,
      stepMin: null,
      effectiveFrom: "2026-10-22",
    };
    const withStop = [oldTarget, wednesdayChange, stopped];
    expect(
      resolveActivityTarget({ rows: withStop, metric: "steps", date: "2026-10-22" })
        ?.kind,
    ).toBeNull();
    expect(
      resolveActivityTarget({ rows: withStop, metric: "steps", date: "2026-10-25" })
        ?.kind,
    ).toBeNull();
    expect(
      resolveActivityTarget({ rows: withStop, metric: "steps", date: "2026-10-21" })
        ?.id,
    ).toBe("r-wed");
    expect(
      resolveActivityTarget({ rows: withStop, metric: "steps", date: "2026-10-20" })
        ?.id,
    ).toBe("r-old");
  });
});

describe("validateActivityTargetWrite", () => {
  it("accepts positive whole step values for minimum, maximum and fixed", () => {
    expect(validateActivityTargetWrite(minimum(8000))).toEqual([]);
    expect(
      validateActivityTargetWrite({ kind: "MAXIMUM", stepMax: 12000 }),
    ).toEqual([]);
    expect(validateActivityTargetWrite({ kind: "FIXED", stepMin: 9000 })).toEqual(
      [],
    );
  });

  it("rejects blank, negative, fractional and non-finite step values", () => {
    for (const bad of [0, -5, 8000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateActivityTargetWrite(minimum(bad)).length).toBeGreaterThan(0);
    }
  });

  it("requires ordered positive whole-number range bounds", () => {
    expect(validateActivityTargetWrite(range(8000, 10000))).toEqual([]);
    expect(validateActivityTargetWrite(range(10000, 8000)).length).toBeGreaterThan(
      0,
    );
    expect(validateActivityTargetWrite(range(0, 8000)).length).toBeGreaterThan(0);
    expect(validateActivityTargetWrite(range(8000.5, 9000)).length).toBeGreaterThan(
      0,
    );
  });

  it("requires both cardio columns together", () => {
    expect(validateActivityTargetWrite(cardio(5, 20))).toEqual([]);
    // A CARDIO write with only one of the pair must be rejected.
    expect(
      validateActivityTargetWrite({
        kind: "CARDIO",
        sessionsPerWeek: 5,
        minutesPerSession: null as unknown as number,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateActivityTargetWrite({
        kind: "CARDIO",
        sessionsPerWeek: null as unknown as number,
        minutesPerSession: 20,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("accepts sessions per week above seven but rejects non-whole or non-positive counts", () => {
    expect(validateActivityTargetWrite(cardio(8, 20))).toEqual([]);
    expect(validateActivityTargetWrite(cardio(14, 45))).toEqual([]);
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(
        validateActivityTargetWrite(cardio(bad, 20)).length,
      ).toBeGreaterThan(0);
    }
  });

  it("accepts fractional minutes per session but rejects non-positive or non-finite", () => {
    expect(validateActivityTargetWrite(cardio(3, 22.5))).toEqual([]);
    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        validateActivityTargetWrite(cardio(3, bad)).length,
      ).toBeGreaterThan(0);
    }
  });

  it("accepts a stop write (null target)", () => {
    expect(validateActivityTargetWrite(null)).toEqual([]);
  });
});

describe("planActivityTargetWrite — same-day replace and revision", () => {
  const existing = stepsRow("r-today", "2026-10-21", 8000, 3);

  it("inserts a new day-effective version when the day has no row", () => {
    const plan = planActivityTargetWrite({
      rows: [existing],
      metric: "steps",
      effectiveFrom: "2026-10-22",
      target: minimum(9500),
      id: "r-new",
    });
    expect(plan.kind).toBe("insert");
    if (plan.kind !== "insert") return;
    expect(plan.revision).toBe(1);
    expect(plan.effectiveFrom).toBe("2026-10-22");
    expect(plan.stepMin).toBe(9500);
  });

  it("refuses a same-day replace without the confirm flag", () => {
    const plan = planActivityTargetWrite({
      rows: [existing],
      metric: "steps",
      effectiveFrom: "2026-10-21",
      target: minimum(9500),
      id: "r-new",
    });
    expect(plan.kind).toBe("confirmation-required");
  });

  it("replaces the row and bumps the revision when confirmed", () => {
    const plan = planActivityTargetWrite({
      rows: [existing],
      metric: "steps",
      effectiveFrom: "2026-10-21",
      target: minimum(9500),
      id: "r-new",
      confirmSameDay: true,
    });
    expect(plan.kind).toBe("replace");
    if (plan.kind !== "replace") return;
    expect(plan.id).toBe("r-today");
    expect(plan.revision).toBe(4);
    expect(plan.stepMin).toBe(9500);
  });

  it("a stop write on a new day inserts a stop version, not a prescription", () => {
    const plan = planActivityTargetWrite({
      rows: [existing],
      metric: "steps",
      effectiveFrom: "2026-10-22",
      target: null,
      id: "r-stop",
    });
    expect(plan.kind).toBe("insert");
    if (plan.kind !== "insert") return;
    expect(plan.targetKind).toBeNull();
  });

  it("same-day replace is scoped to the metric", () => {
    const plan = planActivityTargetWrite({
      rows: [existing],
      metric: "cardioMin",
      effectiveFrom: "2026-10-21",
      target: cardio(5, 20),
      id: "r-cardio",
    });
    expect(plan.kind).toBe("insert");
  });

  it("rejects an invalid date or invalid target before any same-day check", () => {
    for (const effectiveFrom of ["2026-2-14", "not-a-date", "2026-10-32"]) {
      const plan = planActivityTargetWrite({
        rows: [],
        metric: "steps",
        effectiveFrom,
        target: minimum(8000),
        id: "r-new",
      });
      expect(plan.kind).toBe("invalid");
    }
    const plan = planActivityTargetWrite({
      rows: [],
      metric: "steps",
      effectiveFrom: "2026-10-21",
      target: minimum(-1),
      id: "r-new",
    });
    expect(plan.kind).toBe("invalid");
  });
});
