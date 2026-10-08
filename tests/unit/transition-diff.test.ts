import { describe, expect, it } from "vitest";

import {
  buildTransitionSummary,
  computeTransitionDiff,
  DIFF_CATEGORY_RANK,
  validateTransitionSummary,
} from "../../lib/coaching/transition-diff";

/**
 * P-020B — structural transition diff unit tests (pure logic; immutable
 * version snapshots only). Categories are a closed vocabulary ordered by an
 * explicit rank table; diffHash is versioned/length-prefixed/deterministic.
 */

type ParamSnap = Record<string, unknown>;
function snapParam(id: string, over: Partial<ParamSnap> = {}): ParamSnap {
  return {
    key: `p_${id}`,
    kind: "MEASUREMENT",
    label: `Label ${id}`,
    helpText: null,
    unit: "kg",
    ratingScheme: null,
    options: [],
    validation: null,
    group: null,
    dataClassification: "GENERAL_HEALTH",
    revision: 1,
    ...over,
  };
}

function item(
  itemId: string,
  parameterId: string,
  over: Record<string, unknown> = {},
) {
  return {
    itemId,
    parameterId,
    parameterKey: `p_${parameterId}`,
    required: false,
    order: 0,
    ...over,
  };
}

function def(over: Record<string, unknown> = {}) {
  return {
    title: "Template",
    sections: [
      {
        sectionId: "sec_a",
        label: "Section A",
        order: 0,
        items: [item("itm_1", "p1"), item("itm_2", "p2", { order: 1 })],
      },
    ],
    parameters: { p1: snapParam("p1"), p2: snapParam("p2") },
    ...over,
  };
}

describe("P-020B computeTransitionDiff", () => {
  it("identical snapshots produce an empty diff and a deterministic hash", () => {
    const a = def();
    const b = def();
    const d = computeTransitionDiff(a, b);
    expect(d.entries).toEqual([]);
    expect(d.defective).toBe(false);
    expect(d.categories).toEqual({
      added: 0,
      removed: 0,
      rebound: 0,
      moved: 0,
      required: 0,
      display: 0,
    });
    expect(d.warningCount).toBe(0);
    expect(computeTransitionDiff(a, b).diffHash).toBe(d.diffHash);
    // A real change must alter the hash.
    const c = def({
      sections: [
        {
          sectionId: "sec_a",
          label: "Section A",
          order: 0,
          items: [
            item("itm_1", "p1"),
            item("itm_2", "p2", { order: 1 }),
            item("itm_3", "p3", { order: 2 }),
          ],
        },
      ],
      parameters: {
        p1: snapParam("p1"),
        p2: snapParam("p2"),
        p3: snapParam("p3"),
      },
    });
    expect(computeTransitionDiff(a, c).diffHash).not.toBe(d.diffHash);
  });

  it("classifies added and removed items by category with warning on removal", () => {
    const from = def();
    const to = def({
      sections: [
        {
          sectionId: "sec_a",
          label: "Section A",
          order: 0,
          items: [item("itm_1", "p1"), item("itm_3", "p3", { order: 1 })],
        },
      ],
      parameters: { p1: snapParam("p1"), p3: snapParam("p3") },
    });
    const d = computeTransitionDiff(from, to);
    expect(d.defective).toBe(false);
    const removed = d.entries.find((e) => e.category === "removed");
    const added = d.entries.find((e) => e.category === "added");
    expect(removed?.parameterKey).toBe("p_p2");
    expect(removed?.warn).toBe(true);
    expect(added?.parameterKey).toBe("p_p3");
    expect(added?.warn).toBe(false);
    expect(d.categories.removed).toBe(1);
    expect(d.categories.added).toBe(1);
    expect(d.warningCount).toBe(1);
  });

  it("detects rebound when an itemId keeps its slot but changes parameter", () => {
    const from = def();
    const to = def({
      sections: [
        {
          sectionId: "sec_a",
          label: "Section A",
          order: 0,
          items: [item("itm_1", "p1"), item("itm_2", "p9", { order: 1 })],
        },
      ],
      parameters: {
        p1: snapParam("p1"),
        p2: snapParam("p2"),
        p9: snapParam("p9"),
      },
    });
    const d = computeTransitionDiff(from, to);
    const rebound = d.entries.filter((e) => e.category === "rebound");
    expect(rebound).toHaveLength(1);
    expect(rebound[0].parameterId).toBe("p2");
    expect(rebound[0].reboundParameterId).toBe("p9");
    expect(rebound[0].warn).toBe(true);
    expect(d.categories.rebound).toBe(1);
    expect(d.warningCount).toBe(1);
  });

  it("detects moved items (section or order change) as informational", () => {
    const from = def();
    const to = def({
      sections: [
        {
          sectionId: "sec_a",
          label: "Section A",
          order: 0,
          items: [item("itm_1", "p1")],
        },
        {
          sectionId: "sec_b",
          label: "Section B",
          order: 1,
          items: [item("itm_2", "p2", { order: 0 })],
        },
      ],
    });
    const d = computeTransitionDiff(from, to);
    const moved = d.entries.filter((e) => e.category === "moved");
    expect(moved).toHaveLength(1);
    expect(moved[0].parameterKey).toBe("p_p2");
    expect(moved[0].warn).toBe(false);
  });

  it("detects required flips as informational entries", () => {
    const from = def();
    const to = def({
      sections: [
        {
          sectionId: "sec_a",
          label: "Section A",
          order: 0,
          items: [
            item("itm_1", "p1"),
            item("itm_2", "p2", { order: 1, required: true }),
          ],
        },
      ],
    });
    const d = computeTransitionDiff(from, to);
    const req = d.entries.filter((e) => e.category === "required");
    expect(req).toHaveLength(1);
    expect(req[0].detail).toBe("required_on");
    expect(req[0].warn).toBe(false);
    expect(d.categories.required).toBe(1);
  });

  it("detects display changes (label/helpText/group/title/section label)", () => {
    const from = def();
    const to = def({
      title: "Renamed",
      sections: [
        {
          sectionId: "sec_a",
          label: "Section A2",
          order: 0,
          items: [item("itm_1", "p1"), item("itm_2", "p2", { order: 1 })],
        },
      ],
      parameters: {
        p1: snapParam("p1", { label: "New label", group: "Vitals" }),
        p2: snapParam("p2", { helpText: "hint" }),
      },
    });
    const d = computeTransitionDiff(from, to);
    const details = d.entries.map((e) => e.detail).sort();
    expect(details).toEqual(
      [
        "group_changed",
        "help_changed",
        "label_changed",
        "section_label_changed",
        "title_changed",
      ].sort(),
    );
    expect(d.categories.display).toBe(5);
    expect(d.warningCount).toBe(0);
  });

  it("fails closed on defensive semantic drift between bound parameters", () => {
    const from = def();
    const to = def({
      parameters: { p1: snapParam("p1", { unit: "lb" }), p2: snapParam("p2") },
    });
    const d = computeTransitionDiff(from, to);
    expect(d.defective).toBe(true);
  });

  it("fails closed on malformed snapshots", () => {
    expect(computeTransitionDiff(null, def()).defective).toBe(true);
    expect(computeTransitionDiff(def(), { nope: true }).defective).toBe(true);
    expect(
      computeTransitionDiff(def(), {
        ...def(),
        sections: [{ label: "x" }],
      }).defective,
    ).toBe(true);
  });

  it("orders entries deterministically by explicit category rank then identity", () => {
    const from = def();
    const to = def({
      sections: [
        {
          sectionId: "sec_a",
          label: "Section A",
          order: 0,
          items: [
            item("itm_1", "p1"),
            item("itm_2", "p8", { order: 1, required: true }),
            item("itm_3", "p9", { order: 2 }),
          ],
        },
      ],
      parameters: {
        p1: snapParam("p1"),
        p8: snapParam("p8"),
        p9: snapParam("p9"),
      },
    });
    const d = computeTransitionDiff(from, to);
    const cats = d.entries.map((e) => e.category);
    // rebound (itm_2 keeps its itemId → p2→p8) → added (itm_3 p9)
    expect(cats).toEqual(["rebound", "added"]);
    for (const e of d.entries) {
      expect(DIFF_CATEGORY_RANK[e.category]).toBeTypeOf("number");
    }
  });
});

describe("P-020B transition summary validation", () => {
  it("builds and round-trips a valid summary", () => {
    const summary = buildTransitionSummary("UPGRADE", {
      added: 1,
      removed: 2,
      rebound: 0,
      moved: 0,
      required: 0,
      display: 0,
    });
    expect(validateTransitionSummary(summary)).toEqual(summary);
    expect(summary.schemaVersion).toBe(1);
    expect(summary.direction).toBe("UPGRADE");
  });

  it("rejects extras, wrong direction, missing keys, and bad counts", () => {
    const ok = buildTransitionSummary("ROLLBACK", {
      added: 0,
      removed: 0,
      rebound: 0,
      moved: 0,
      required: 0,
      display: 0,
    });
    expect(validateTransitionSummary(null)).toBeNull();
    expect(validateTransitionSummary({ ...ok, extra: 1 })).toBeNull();
    expect(
      validateTransitionSummary({ ...ok, direction: "SIDEWAYS" }),
    ).toBeNull();
    expect(validateTransitionSummary({ ...ok, schemaVersion: 2 })).toBeNull();
    const missingKey = { ...ok, categories: { added: 0 } };
    expect(validateTransitionSummary(missingKey)).toBeNull();
    const badCount = {
      ...ok,
      categories: { ...ok.categories, added: -1 },
    };
    expect(validateTransitionSummary(badCount)).toBeNull();
    const floatCount = {
      ...ok,
      categories: { ...ok.categories, added: 1.5 },
    };
    expect(validateTransitionSummary(floatCount)).toBeNull();
    const badReason = { ...ok, reasonCodes: ["ANYTHING"] };
    expect(validateTransitionSummary(badReason)).toBeNull();
  });
});
