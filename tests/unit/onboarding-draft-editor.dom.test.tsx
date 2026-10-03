// @vitest-environment jsdom

// P-008-R ES-2 — REAL DraftEditor component harness (jsdom + testing-library).
//
// Provenance (TDD recovery): written fresh for the recovery per the
// corrected plan — the component contract (props, selector surface, seam
// usage) is pinned here and the production component is rebuilt on this
// branch; nothing is copied from the frozen reference worktree.
//
// Why this harness exists (plan §3): the props-sync/adoption defect class
// is structurally invisible to the e2e browser harness because action
// responses carry revalidation, and production test-only routes are
// forbidden. Mounting the REAL component under jsdom observes the actual
// usage path of the pure seam — dirty/monotonic reseed and
// server-normalized save adoption are unmaskable here.
//
// Scope honesty: pure-markup assertions (mount surface, sorted fields,
// clean disabled save) may legitimately PASS on the inert ES-2 scaffold.
// Every edit/dirty/props-sync/save assertion MUST fail on the scaffold —
// save wiring itself stays intentionally RED until ES-3.
//
// Matcher note: jest-dom is NOT part of the approved harness — assertions
// read DOM properties directly (`input.value`, `control.disabled`,
// `textContent`) with plain vitest expects.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { act, type JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftField } from "../../components/onboarding/state";
import type { FormField } from "@/lib/onboarding/forms";
import { saveDraft } from "@/app/workspace/[workspaceId]/onboarding/actions";

vi.mock("@/app/workspace/[workspaceId]/onboarding/actions", () => ({
  saveDraft: vi.fn(),
}));

const saveDraftMock = vi.mocked(saveDraft);

const MODULE_PATH = "../../components/onboarding/draft-editor";

type EditorProps = {
  workspaceId: string;
  formId: string;
  initialName: string;
  initialRevision: number;
  initialDraft: { title: string; fields: DraftField[] };
};

const load = () =>
  import(MODULE_PATH) as Promise<{
    DraftEditor: (props: EditorProps) => JSX.Element;
  }>;

const STALE_MESSAGE =
  "This form changed while you were editing. Reload and try again.";
const GENERIC_MESSAGE = "Something went wrong. Please try again in a moment.";

const field = (partial: Partial<DraftField> = {}): DraftField => ({
  kind: "shortText",
  label: "Question",
  required: false,
  order: 0,
  ...partial,
});

// Server-minted rows in a SAVED definition always carry ids — the
// action's success value is typed FormDefinition (fieldId required).
const savedField = (
  fieldId: string,
  partial: Partial<FormField> = {},
): FormField => ({
  fieldId,
  kind: "shortText",
  label: "Question",
  required: false,
  order: 0,
  ...partial,
});

const savedResult = (revision: number, title: string, fields: FormField[]) => ({
  ok: true as const,
  value: { revision, definition: { title, fields } },
});

const baseProps: EditorProps = {
  workspaceId: "ws-test",
  formId: "form-test",
  initialName: "Intake",
  initialRevision: 1,
  initialDraft: {
    title: "Intake",
    fields: [
      field({ fieldId: "f_b", label: "Second", order: 1 }),
      field({ fieldId: "f_a", label: "First", order: 0 }),
    ],
  },
};

type Control = HTMLInputElement | HTMLButtonElement;

const control = (testid: string) => screen.getByTestId(testid) as Control;
const input = (testid: string) =>
  screen.getByTestId(testid) as HTMLInputElement;
const expectEnabled = (testid: string) =>
  expect(control(testid).disabled).toBe(false);
const expectDisabled = (testid: string) =>
  expect(control(testid).disabled).toBe(true);
const expectValue = (testid: string, value: string) =>
  expect(input(testid).value).toBe(value);

afterEach(cleanup);
beforeEach(() => saveDraftMock.mockReset());

describe("DraftEditor — mount surface + client-local edit contract", () => {
  it("mounts editor-ready: fields ordered, inputs enabled, clean disabled save", async () => {
    const { DraftEditor } = await load();
    render(<DraftEditor {...baseProps} />);
    expectValue("form-name", "Intake");
    expectEnabled("form-name");
    expectValue("field-label-0", "First");
    expectValue("field-label-1", "Second");
    expectEnabled("field-label-0");
    expectDisabled("save-draft");
  });

  it("a metadata edit arms dirty and enables save", async () => {
    const { DraftEditor } = await load();
    render(<DraftEditor {...baseProps} />);
    fireEvent.change(input("form-name"), {
      target: { value: "Edited name" },
    });
    expectValue("form-name", "Edited name");
    expectEnabled("save-draft");
  });
});

describe("DraftEditor — props reseed through the real component", () => {
  it("preserves dirty local edits when NEWER server props arrive", async () => {
    const { DraftEditor } = await load();
    const { rerender } = render(<DraftEditor {...baseProps} />);
    fireEvent.change(input("form-name"), {
      target: { value: "Unsaved local" },
    });
    expectValue("form-name", "Unsaved local");
    rerender(
      <DraftEditor
        {...baseProps}
        initialName="Someone else's save"
        initialRevision={9}
        initialDraft={{ title: "Someone else's save", fields: [] }}
      />,
    );
    // Dirty state wins — the newer snapshot must NOT clobber the edit.
    expectValue("form-name", "Unsaved local");
  });

  it("adopts NEWER incoming props while clean", async () => {
    const { DraftEditor } = await load();
    const { rerender } = render(<DraftEditor {...baseProps} />);
    rerender(
      <DraftEditor
        {...baseProps}
        initialName="Newer snapshot"
        initialRevision={2}
        initialDraft={{
          title: "Newer snapshot",
          fields: [field({ fieldId: "f_c", label: "Replacement" })],
        }}
      />,
    );
    expectValue("form-name", "Newer snapshot");
    expectValue("field-label-0", "Replacement");
    expect(screen.queryByTestId("field-label-1")).toBeNull();
  });

  it("does not roll back to an OLDER revision while clean (monotonic)", async () => {
    const { DraftEditor } = await load();
    const { rerender } = render(<DraftEditor {...baseProps} />);
    // A newer clean snapshot is adopted first…
    rerender(
      <DraftEditor
        {...baseProps}
        initialName="Newer snapshot"
        initialRevision={2}
        initialDraft={{ title: "Newer snapshot", fields: [] }}
      />,
    );
    expectValue("form-name", "Newer snapshot");
    // …then a STALE (lower-revision) snapshot must not roll it back.
    rerender(<DraftEditor {...baseProps} />);
    expectValue("form-name", "Newer snapshot");
  });
});

describe("DraftEditor — save wiring (intentionally RED until ES-3)", () => {
  it("issues saveDraft exactly once with the bounded payload shape", async () => {
    const { DraftEditor } = await load();
    saveDraftMock.mockResolvedValue(
      savedResult(2, "Intake", [
        savedField("f_a", { label: "First" }),
        savedField("f_b", { label: "Second", order: 1 }),
      ]),
    );
    render(<DraftEditor {...baseProps} />);
    fireEvent.change(input("form-name"), {
      target: { value: "Edited name" },
    });
    fireEvent.click(control("save-draft"));
    await act(async () => {});
    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    const [wsArg, formData] = saveDraftMock.mock.calls[0];
    expect(wsArg).toBe("ws-test");
    expect(formData.get("formId")).toBe("form-test");
    expect(formData.get("expectedRevision")).toBe("1");
    expect(JSON.parse(String(formData.get("draftJson")))).toEqual({
      title: "Edited name",
      fields: baseProps.initialDraft.fields,
    });
    expect(formData.get("name")).toBe("Edited name");
  });

  it("adopts the SERVER-NORMALIZED title — never the raw padded local name", async () => {
    const { DraftEditor } = await load();
    // The server trimmed outer whitespace only; inner spacing preserved.
    // The DOM input must show definition.title — this harness has NO
    // revalidation path, so a wrong adoption source cannot be healed.
    saveDraftMock.mockResolvedValue(
      savedResult(2, "Padded   name", [
        savedField("f_a", { label: "First" }),
        savedField("f_b", { label: "Second", order: 1 }),
      ]),
    );
    render(<DraftEditor {...baseProps} />);
    fireEvent.change(input("form-name"), {
      target: { value: "  Padded   name  " },
    });
    fireEvent.click(control("save-draft"));
    await act(async () => {});
    expectValue("form-name", "Padded   name");
    expectDisabled("save-draft");
  });

  it("disables every mutation control while the save is in flight, then re-enables", async () => {
    const { DraftEditor } = await load();
    let release: (value: ReturnType<typeof savedResult>) => void = () => {};
    // One shared deferred — NOT created inside the impl — so vitest's
    // post-test mock probe-call returns the already-settled promise
    // instead of minting a second, never-resolving one (which wedged the
    // cleanup hook until the timeout).
    const pendingSave = new Promise<ReturnType<typeof savedResult>>(
      (resolve) => {
        release = resolve;
      },
    );
    saveDraftMock.mockImplementation(() => pendingSave);
    render(<DraftEditor {...baseProps} />);
    fireEvent.change(input("form-name"), {
      target: { value: "Edited name" },
    });
    fireEvent.click(control("save-draft"));
    try {
      expect(saveDraftMock).toHaveBeenCalledTimes(1);
      for (const testid of [
        "form-name",
        "field-label-0",
        "add-field-shortText",
        "add-field-singleChoice",
        "save-draft",
      ]) {
        expectDisabled(testid);
      }
      expect(
        (screen.getByLabelText("Remove field 1") as Control).disabled,
      ).toBe(true);
    } finally {
      // Always drain the act queue and settle the in-flight save — even on
      // failure — so a pending transition can never wedge the teardown.
      await act(async () => {
        release(
          savedResult(2, "Edited name", [
            savedField("f_a", { label: "First" }),
            savedField("f_b", { label: "Second", order: 1 }),
          ]),
        );
      });
    }
    expectEnabled("form-name");
    expectDisabled("save-draft");
  });

  it("a typed save rejection shows the safe alert and preserves unsaved edits", async () => {
    const { DraftEditor } = await load();
    saveDraftMock.mockResolvedValue({ ok: false, message: STALE_MESSAGE });
    render(<DraftEditor {...baseProps} />);
    fireEvent.change(input("field-label-0"), {
      target: { value: "Unsaved local edit" },
    });
    fireEvent.click(control("save-draft"));
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toContain(STALE_MESSAGE);
    expectValue("field-label-0", "Unsaved local edit");
    expectEnabled("save-draft");
  });

  it("a transport failure shows the generic alert, preserves edits, and does not auto-retry", async () => {
    const { DraftEditor } = await load();
    // vitest's cleanup probe invokes the impl once with ZERO args and
    // awaits the result — return a settled promise there so the probe can
    // never surface a phantom rejection. The real saveDraft call always
    // carries (workspaceId, formData).
    const transportError = Promise.reject(new Error("network down"));
    transportError.catch(() => {});
    saveDraftMock.mockImplementation((...args) =>
      (args as unknown[]).length === 0
        ? (Promise.resolve() as unknown as ReturnType<typeof saveDraft>)
        : transportError,
    );
    render(<DraftEditor {...baseProps} />);
    fireEvent.change(input("field-label-0"), {
      target: { value: "Edit before abort" },
    });
    fireEvent.click(control("save-draft"));
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toContain(GENERIC_MESSAGE);
    expectValue("field-label-0", "Edit before abort");
    // An unknown transport outcome is never blindly retried — the user
    // must press again; exactly one call for the one press.
    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    expectEnabled("save-draft");
  });
});

describe("DraftEditor — field structure ops (intentionally RED until ES-3)", () => {
  const labelInputs = () => screen.getAllByTestId(/^field-label-\d+$/);
  const optionsIn = (index: number) =>
    within(screen.getByTestId(`field-options-${index}`)).getAllByLabelText(
      /^Option \d+$/,
    );
  const threeFieldProps: EditorProps = {
    ...baseProps,
    initialDraft: {
      title: "Intake",
      fields: [
        field({ fieldId: "f_a", label: "First", order: 0 }),
        field({ fieldId: "f_b", label: "Second", order: 1 }),
        field({
          fieldId: "f_c",
          kind: "singleChoice",
          label: "Third",
          order: 2,
          options: [
            { optionId: "o_a", label: "Yes" },
            { optionId: "o_b", label: "No" },
          ],
        }),
      ],
    },
  };
  const sentPayload = (): { fields: DraftField[] } =>
    JSON.parse(String(saveDraftMock.mock.calls[0][1].get("draftJson"))) as {
      fields: DraftField[];
    };

  it("adding a singleChoice field via the real control renders exactly one blank option row", async () => {
    const { DraftEditor } = await load();
    render(<DraftEditor {...baseProps} />);
    // The real add-field control routes through addDraftField — assert the
    // newly RENDERED rows, not a synthetic snapshot.
    fireEvent.click(control("add-field-singleChoice"));
    expect(labelInputs()).toHaveLength(3);
    expectValue("field-label-2", "");
    const seeded = optionsIn(2);
    expect(seeded).toHaveLength(1);
    expect((seeded[0] as HTMLInputElement).value).toBe("");
    expectEnabled("save-draft");
  });

  it("remove reindexes contiguously, keeps surviving field/option ids, and the next add uses the next order", async () => {
    const { DraftEditor } = await load();
    saveDraftMock.mockResolvedValue(
      savedResult(2, "Intake", [
        savedField("f_a", { label: "First" }),
        savedField("f_c", {
          kind: "singleChoice",
          label: "Third",
          order: 1,
        }),
      ]),
    );
    render(<DraftEditor {...threeFieldProps} />);
    fireEvent.click(screen.getByLabelText("Remove field 2"));
    // f_b retires; the survivors reindex contiguously in the DOM.
    expect(labelInputs()).toHaveLength(2);
    expectValue("field-label-0", "First");
    expectValue("field-label-1", "Third");
    expect(screen.queryByTestId("field-label-2")).toBeNull();
    // The surviving choice field keeps its rendered option rows.
    expect(optionsIn(1)).toHaveLength(2);
    // A subsequent add lands at the NEXT contiguous index — not the stale
    // pre-removal length.
    fireEvent.click(control("add-field-shortText"));
    expectValue("field-label-2", "");
    fireEvent.click(control("save-draft"));
    await act(async () => {});
    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    const payload = sentPayload();
    expect(payload.fields.map((f) => f.order)).toEqual([0, 1, 2]);
    // Surviving server ids stay attached; the new field carries none.
    expect(payload.fields.map((f) => f.fieldId ?? null)).toEqual([
      "f_a",
      "f_c",
      null,
    ]);
    // Retired ids never resurrect — f_b appears nowhere in the payload.
    expect(payload.fields.some((f) => f.fieldId === "f_b")).toBe(false);
    // Surviving option ids are preserved on the reindexed field.
    expect(payload.fields[1].options?.map((o) => o.optionId ?? null)).toEqual([
      "o_a",
      "o_b",
    ]);
  });

  it("moving a field up swaps it with its neighbour — contiguous orders, stable ids", async () => {
    const { DraftEditor } = await load();
    saveDraftMock.mockResolvedValue(
      savedResult(2, "Intake", [
        savedField("f_a", { label: "First" }),
        savedField("f_c", { label: "Third", order: 1 }),
        savedField("f_b", { label: "Second", order: 2 }),
      ]),
    );
    render(<DraftEditor {...threeFieldProps} />);
    fireEvent.click(screen.getByLabelText("Move field 3 up"));
    expectValue("field-label-0", "First");
    expectValue("field-label-1", "Third");
    expectValue("field-label-2", "Second");
    fireEvent.click(control("save-draft"));
    await act(async () => {});
    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    expect(
      sentPayload().fields.map((f) => [f.fieldId ?? null, f.order]),
    ).toEqual([
      ["f_a", 0],
      ["f_c", 1],
      ["f_b", 2],
    ]);
  });

  it("removing then adding an option keeps surviving ids and never resurrects the retired one", async () => {
    const { DraftEditor } = await load();
    const choiceProps: EditorProps = {
      ...baseProps,
      initialDraft: {
        title: "Intake",
        fields: [
          field({
            fieldId: "f_c",
            kind: "singleChoice",
            label: "Pick one",
            order: 0,
            options: [
              { optionId: "o_a", label: "Yes" },
              { optionId: "o_b", label: "No" },
            ],
          }),
        ],
      },
    };
    saveDraftMock.mockResolvedValue(
      savedResult(2, "Intake", [
        savedField("f_c", { kind: "singleChoice", label: "Pick one" }),
      ]),
    );
    render(<DraftEditor {...choiceProps} />);
    fireEvent.click(screen.getByLabelText("Remove option 1"));
    const remaining = optionsIn(0);
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as HTMLInputElement).value).toBe("No");
    fireEvent.click(control("add-option-0"));
    const grown = optionsIn(0);
    expect(grown).toHaveLength(2);
    expect((grown[1] as HTMLInputElement).value).toBe("");
    fireEvent.click(control("save-draft"));
    await act(async () => {});
    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    // o_b survives with its id; the new option is blank and idless; o_a
    // is gone for good — never reassigned to the new row.
    expect(sentPayload().fields[0].options).toEqual([
      { optionId: "o_b", label: "No" },
      { label: "" },
    ]);
  });
});
