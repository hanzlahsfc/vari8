import { describe, expect, it } from "vitest";

import {
  CoachingTemplateError,
  type TemplateDraft,
  validateTemplateDraft,
} from "../../lib/coaching/templates";

/**
 * P-014 coaching template drafts — structural validator contract. Sections
 * and items carry server-minted IDs (presented IDs trusted only when bound
 * in the CURRENT draft); ordering is contiguous; `required` lives on the
 * item; caller-supplied acknowledgment revisions are never trusted.
 */

const liveParams = new Map<string, number>([
  ["p_weight", 3],
  ["p_sleep", 1],
]);

const knownIds = (draft: TemplateDraft | null) => ({
  sectionIds: new Set((draft?.sections ?? []).map((s) => s.sectionId)),
  itemIds: new Set(
    (draft?.sections ?? []).flatMap((s) => s.items.map((i) => i.itemId)),
  ),
});

const validDraft = {
  title: "Daily tracker",
  sections: [
    {
      label: "Basics",
      order: 0,
      items: [
        { parameterKey: "p_weight", required: true, order: 0 },
        { parameterKey: "p_sleep", required: false, order: 1 },
      ],
    },
  ],
};

describe("validateTemplateDraft", () => {
  it("accepts a valid draft, mints IDs, stamps acknowledgment revisions", () => {
    const d = validateTemplateDraft(
      validDraft,
      { sectionIds: new Set(), itemIds: new Set() },
      {
        resolveParameter: (key) => ({
          id: "pd_1",
          revision: liveParams.get(key) ?? -1,
        }),
        forPublish: false,
      },
    );
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0].sectionId).toMatch(/^sec_[0-9a-f-]{36}$/);
    expect(d.sections[0].items[0].itemId).toMatch(/^itm_[0-9a-f-]{36}$/);
    // Server-stamped current revisions — never the caller's value.
    expect(d.sections[0].items[0].acknowledgedParameterRevision).toBe(3);
    expect(d.sections[0].items[1].acknowledgedParameterRevision).toBe(1);
  });

  it("rejects a caller-supplied acknowledgedParameterRevision", () => {
    const draft = structuredClone(validDraft);
    (
      draft.sections[0].items[0] as Record<string, unknown>
    ).acknowledgedParameterRevision = 999;
    expect(() =>
      validateTemplateDraft(
        draft,
        { sectionIds: new Set(), itemIds: new Set() },
        {
          resolveParameter: (key) => ({
            id: "pd_1",
            revision: liveParams.get(key) ?? -1,
          }),
          forPublish: false,
        },
      ),
    ).toThrow(CoachingTemplateError);
  });

  it("rejects unknown parameter keys", () => {
    const draft = structuredClone(validDraft);
    draft.sections[0].items[0].parameterKey = "p_missing";
    expect(() =>
      validateTemplateDraft(
        draft,
        { sectionIds: new Set(), itemIds: new Set() },
        {
          resolveParameter: (key) =>
            liveParams.has(key)
              ? { id: "pd_1", revision: liveParams.get(key)! }
              : null,
          forPublish: false,
        },
      ),
    ).toThrow(CoachingTemplateError);
  });

  it("rejects presented section/item IDs not bound to the current draft", () => {
    const draft = structuredClone(validDraft);
    (draft.sections[0] as Record<string, unknown>).sectionId = "sec_forged";
    expect(() =>
      validateTemplateDraft(
        draft,
        { sectionIds: new Set(), itemIds: new Set() },
        {
          resolveParameter: () => ({ id: "pd_1", revision: 1 }),
          forPublish: false,
        },
      ),
    ).toThrow(CoachingTemplateError);
  });

  it("keeps known IDs and renumbers contiguous order", () => {
    // Stored drafts carry server-stamped fields; callers present only the
    // caller shape (server fields stripped, like the editor does).
    const existing: TemplateDraft = {
      title: "t",
      sections: [
        {
          sectionId: "sec_known",
          label: "S",
          order: 0,
          items: [
            {
              itemId: "itm_known",
              parameterKey: "p_weight",
              parameterId: "pd_1",
              acknowledgedParameterRevision: 3,
              required: true,
              order: 0,
            },
          ],
        },
      ],
    };
    const draft = {
      title: "t",
      sections: [
        {
          sectionId: "sec_known",
          label: "S",
          order: 0,
          items: [
            {
              itemId: "itm_known",
              parameterKey: "p_weight",
              required: true,
              order: 5, // caller order normalized
            },
          ],
        },
      ],
    };
    const d = validateTemplateDraft(draft, knownIds(existing), {
      resolveParameter: () => ({ id: "pd_1", revision: 9 }),
      forPublish: false,
    });
    expect(d.sections[0].sectionId).toBe("sec_known");
    expect(d.sections[0].items[0].itemId).toBe("itm_known");
    expect(d.sections[0].items[0].order).toBe(0);
    // Re-stamped to the CURRENT parameter revision (3 → 9).
    expect(d.sections[0].items[0].acknowledgedParameterRevision).toBe(9);
  });

  it("enforces section/item/depth/byte limits", () => {
    const big = {
      title: "t",
      sections: Array.from({ length: 33 }, (_, i) => ({
        label: `s${i}`,
        order: i,
        items: [],
      })),
    };
    expect(() =>
      validateTemplateDraft(
        big,
        { sectionIds: new Set(), itemIds: new Set() },
        {
          resolveParameter: () => ({ id: "pd_1", revision: 1 }),
          forPublish: false,
        },
      ),
    ).toThrow(CoachingTemplateError);

    const deep = {
      title: "t",
      sections: [
        { label: "s", order: 0, items: [], nested: { a: { b: { c: 1 } } } },
      ],
    };
    expect(() =>
      validateTemplateDraft(
        deep,
        { sectionIds: new Set(), itemIds: new Set() },
        {
          resolveParameter: () => ({ id: "pd_1", revision: 1 }),
          forPublish: false,
        },
      ),
    ).toThrow(CoachingTemplateError);
  });

  it("requires at least one item at publish", () => {
    const empty = { title: "t", sections: [] };
    expect(() =>
      validateTemplateDraft(
        empty,
        { sectionIds: new Set(), itemIds: new Set() },
        {
          resolveParameter: () => ({ id: "pd_1", revision: 1 }),
          forPublish: true,
        },
      ),
    ).toThrow(CoachingTemplateError);
  });
});
