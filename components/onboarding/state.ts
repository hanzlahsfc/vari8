// P-008-R ES-1 — pure draft-editor state seam.
//
// The client draft-editor component routes incoming server props and the
// save-success result through this seam so a revalidated snapshot can
// never clobber dirty local edits and the displayed name always comes
// from the server-normalized definition. Contract pinned by
// tests/unit/onboarding-draft-editor.test.ts.
//
// This module is intentionally pure — no React imports — so the seam is
// unit-testable without a DOM harness; the component consumes it in
// components/onboarding/draft-editor.tsx.

export type DraftFieldKind =
  "shortText" | "longText" | "number" | "date" | "singleChoice" | "multiChoice";

export type DraftOption = {
  optionId?: string;
  label: string;
};

export type DraftField = {
  fieldId?: string;
  kind: DraftFieldKind;
  label: string;
  required: boolean;
  order: number;
  helpText?: string;
  options?: DraftOption[];
};

export type DraftState = {
  name: string;
  fields: DraftField[];
  revision: number;
  dirty: boolean;
};

export type SavedDraft = {
  revision: number;
  definition: { title: string; fields: DraftField[] };
};

const ordered = (fields: DraftField[]): DraftField[] =>
  [...fields].sort((a, b) => a.order - b.order);

/**
 * Seed the editor's initial local state from mounted server props.
 * Contract: fields ordered by `order`, dirty = false.
 */
export function initialDraftState(
  name: string,
  revision: number,
  definition: { title: string; fields: DraftField[] },
): DraftState {
  return {
    name,
    fields: ordered(definition.fields),
    revision,
    dirty: false,
  };
}

/**
 * Decide the editor's next local state when NEW server props arrive.
 * Contract: dirty local state is returned untouched; clean state adopts
 * the incoming snapshot — UNLESS it carries an older revision, in which
 * case the newer local state is kept (monotonic guard).
 */
export function reseedDraftState(
  local: DraftState,
  incoming: DraftState,
): DraftState {
  return local.dirty || incoming.revision < local.revision
    ? local
    : { ...incoming, dirty: false };
}

/**
 * Decide the editor's next local state after a SUCCESSFUL save.
 * Contract: the server-normalized result is adopted — `definition.title`
 * (never the raw local name), ordered `definition.fields` with
 * server-minted ids, `revision`; dirty clears.
 */
export function adoptSavedResult(
  local: DraftState,
  saved: SavedDraft,
): DraftState {
  return {
    name: saved.definition.title,
    fields: ordered(saved.definition.fields),
    revision: saved.revision,
    dirty: false,
  };
}

/**
 * Append a new field of the given kind.
 * Contract: blank metadata (empty label, required=false, next order
 * index), dirty = true, exactly one blank option for choice kinds and no
 * options otherwise; the input state is not mutated.
 */
export function addDraftField(
  state: DraftState,
  kind: DraftFieldKind,
): DraftState {
  return {
    ...state,
    dirty: true,
    fields: [
      ...state.fields,
      {
        kind,
        label: "",
        required: false,
        order: state.fields.length,
        ...(kind === "singleChoice" || kind === "multiChoice"
          ? { options: [{ label: "" }] }
          : {}),
      },
    ],
  };
}
