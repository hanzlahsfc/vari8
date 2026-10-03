// P-008-R ES-1 — draft editor state seam (unit level).
//
// Provenance (TDD recovery): adapted TESTS-ONLY from the reference branch
// feature/p008-onboarding-form-builder-tdd-5c @ e157306
// (tests/unit/onboarding-draft-editor.test.ts) per the P-009 recovery
// contract, extended for the corrected contract: adoptSavedResult
// normalized-title adoption, addDraftField blank-option seeding, and
// initialDraftState mount-seed ordering. The production seam is rebuilt
// fresh on this branch — no production code was copied.
//
// Evidence-level note (honest scope): these tests pin the props-sync and
// save-adoption LOGIC contract at the function level of a pure seam the
// client draft-editor component MUST route through. They do not, by
// themselves, prove the React render path — actual component usage is
// pinned by the ES-2 DOM component harness (real DraftEditor mounted
// under jsdom) and the browser suite, per the approved plan.

import { describe, expect, it } from "vitest";

import type { DraftField, DraftState } from "../../components/onboarding/state";

const MODULE_PATH = "../../components/onboarding/state";

type SavedResult = {
  revision: number;
  definition: { title: string; fields: DraftField[] };
};

const load = () =>
  import(MODULE_PATH) as Promise<{
    initialDraftState: (
      name: string,
      revision: number,
      definition: { title: string; fields: DraftField[] },
    ) => DraftState;
    reseedDraftState: (local: DraftState, incoming: DraftState) => DraftState;
    adoptSavedResult: (local: DraftState, saved: SavedResult) => DraftState;
    addDraftField: (state: DraftState, kind: DraftField["kind"]) => DraftState;
  }>;

const field = (label: string, order = 0): DraftField => ({
  kind: "shortText",
  label,
  required: false,
  order,
});

describe("ES-1a initial mount seed + monotonic props reseed", () => {
  it("initialDraftState orders fields by order and starts clean", async () => {
    const { initialDraftState } = await load();
    const next = initialDraftState("Form name", 7, {
      title: "Form name",
      fields: [field("Second", 1), field("First", 0), field("Third", 2)],
    });
    expect(next.name).toBe("Form name");
    expect(next.revision).toBe(7);
    expect(next.dirty).toBe(false);
    expect(next.fields.map((f) => f.label)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("does not mutate the input definition or reorder the caller's field array", async () => {
    const { initialDraftState } = await load();
    const source = [field("Second", 1), field("First", 0), field("Third", 2)];
    const definition = { title: "Form name", fields: source };
    const next = initialDraftState("Form name", 7, definition);
    // Output is sorted by order…
    expect(next.fields.map((f) => f.label)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    // …while the caller's array reference and its contents are untouched.
    expect(definition.fields).toBe(source);
    expect(definition.fields.map((f) => f.label)).toEqual([
      "Second",
      "First",
      "Third",
    ]);
  });

  it("adopts the incoming server snapshot when the editor is CLEAN", async () => {
    const { reseedDraftState } = await load();
    const local: DraftState = {
      name: "Old",
      fields: [],
      revision: 1,
      dirty: false,
    };
    const incoming: DraftState = {
      name: "New",
      fields: [field("L")],
      revision: 2,
      dirty: false,
    };
    const next = reseedDraftState(local, incoming);
    expect(next.name).toBe("New");
    expect(next.revision).toBe(2);
    expect(next.fields).toHaveLength(1);
  });

  it("preserves dirty local state when new props arrive mid-edit", async () => {
    const { reseedDraftState } = await load();
    const local: DraftState = {
      name: "My unsaved name",
      fields: [field("My unsaved label")],
      revision: 1,
      dirty: true,
    };
    const incoming: DraftState = {
      name: "Someone else's save",
      fields: [],
      revision: 9,
      dirty: false,
    };
    expect(reseedDraftState(local, incoming)).toBe(local);
  });

  it("preserves a CLEAN but NEWER local state when stale (older-revision) props arrive", async () => {
    const { reseedDraftState } = await load();
    const local: DraftState = {
      name: "Saved",
      fields: [field("Saved label")],
      revision: 3,
      dirty: false,
    };
    const incoming: DraftState = {
      name: "Stale",
      fields: [],
      revision: 2,
      dirty: false,
    };
    expect(reseedDraftState(local, incoming)).toBe(local);
  });

  it("still adopts a HIGHER incoming revision when clean", async () => {
    const { reseedDraftState } = await load();
    const local: DraftState = {
      name: "Old",
      fields: [],
      revision: 3,
      dirty: false,
    };
    const incoming: DraftState = {
      name: "Newer",
      fields: [field("N")],
      revision: 4,
      dirty: false,
    };
    const next = reseedDraftState(local, incoming);
    expect(next.name).toBe("Newer");
    expect(next.revision).toBe(4);
  });

  it("adopts same-revision props when clean; dirty rules are identical regardless of revision", async () => {
    const { reseedDraftState } = await load();
    const cleanLocal: DraftState = {
      name: "A",
      fields: [],
      revision: 3,
      dirty: false,
    };
    const sameRev: DraftState = {
      name: "B",
      fields: [field("X")],
      revision: 3,
      dirty: false,
    };
    expect(reseedDraftState(cleanLocal, sameRev).name).toBe("B");
    const dirtyLocal: DraftState = { ...cleanLocal, dirty: true };
    for (const rev of [2, 3, 4]) {
      expect(reseedDraftState(dirtyLocal, { ...sameRev, revision: rev })).toBe(
        dirtyLocal,
      );
    }
  });
});

describe("ES-1b adoptSavedResult — server-normalized save adoption", () => {
  it("adopts the NORMALIZED title — never the raw padded local name", async () => {
    const { adoptSavedResult } = await load();
    // The user typed padded text; the server trimmed outer whitespace only
    // (inner spacing preserved). The displayed name MUST come from
    // definition.title — this is the defect class revalidation used to
    // mask in the browser harness.
    const local: DraftState = {
      name: "  Padded   name  ",
      fields: [field("  Padded   label  ")],
      revision: 1,
      dirty: true,
    };
    const saved: SavedResult = {
      revision: 2,
      definition: {
        title: "Padded   name",
        fields: [{ ...field("Padded   label"), fieldId: "f_srv1" }],
      },
    };
    const next = adoptSavedResult(local, saved);
    expect(next.name).toBe("Padded   name");
    expect(next.revision).toBe(2);
    expect(next.dirty).toBe(false);
  });

  it("adopts server-minted field/option ids and orders fields by order", async () => {
    const { adoptSavedResult } = await load();
    const local: DraftState = {
      name: "N",
      fields: [field("a"), field("b")],
      revision: 4,
      dirty: true,
    };
    const saved: SavedResult = {
      revision: 5,
      definition: {
        title: "N",
        fields: [
          {
            ...field("Second", 1),
            kind: "singleChoice",
            fieldId: "f_2",
            options: [{ optionId: "o_2", label: "Only" }],
          },
          { ...field("First", 0), fieldId: "f_1" },
        ],
      },
    };
    const next = adoptSavedResult(local, saved);
    expect(next.fields.map((f) => f.fieldId)).toEqual(["f_1", "f_2"]);
    expect(next.fields[1].options).toEqual([
      { optionId: "o_2", label: "Only" },
    ]);
    expect(next.revision).toBe(5);
    expect(next.dirty).toBe(false);
  });
});

describe("ES-1c addDraftField — kind metadata + blank option seed", () => {
  const base: DraftState = {
    name: "N",
    fields: [field("Existing", 0)],
    revision: 3,
    dirty: false,
  };

  it("appends a new field with blank metadata and marks the state dirty", async () => {
    const { addDraftField } = await load();
    const next = addDraftField(base, "longText");
    expect(next.dirty).toBe(true);
    expect(next.fields).toHaveLength(2);
    const added = next.fields[1];
    expect(added.kind).toBe("longText");
    expect(added.label).toBe("");
    expect(added.required).toBe(false);
    expect(added.order).toBe(1);
    expect(added.fieldId).toBeUndefined();
    // Existing field untouched; original state not mutated.
    expect(next.fields[0]).toEqual(base.fields[0]);
    expect(base.fields).toHaveLength(1);
    expect(base.dirty).toBe(false);
  });

  it.each(["singleChoice", "multiChoice"] as const)(
    "seeds exactly ONE blank option for the %s kind",
    async (kind) => {
      const { addDraftField } = await load();
      const next = addDraftField(base, kind);
      const added = next.fields[next.fields.length - 1];
      expect(added.options).toEqual([{ label: "" }]);
    },
  );

  it.each(["shortText", "longText", "number", "date"] as const)(
    "seeds NO options for the non-choice %s kind",
    async (kind) => {
      const { addDraftField } = await load();
      const next = addDraftField(base, kind);
      const added = next.fields[next.fields.length - 1];
      expect(added.options).toBeUndefined();
    },
  );

  it("assigns the next order index across repeated adds", async () => {
    const { addDraftField } = await load();
    const two = addDraftField(addDraftField(base, "number"), "date");
    expect(two.fields.map((f) => f.order)).toEqual([0, 1, 2]);
  });
});
