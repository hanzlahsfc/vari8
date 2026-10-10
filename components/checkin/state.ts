// P-025-A — pure Check-In draft-editor state seam.
//
// The client draft-editor component routes incoming server props and the
// save-success result through this seam so a revalidated snapshot can
// never clobber dirty local edits and the displayed name always comes
// from the server-normalized definition. Intentionally pure — no React
// imports — so the seam is unit-testable without a DOM harness.

export type CheckInDraftFieldKind =
  "shortText" | "longText" | "number" | "date" | "singleChoice" | "multiChoice";

export type CheckInDraftOption = {
  optionId?: string;
  label: string;
};

export type CheckInDraftField = {
  fieldId?: string;
  kind: CheckInDraftFieldKind;
  label: string;
  required: boolean;
  order: number;
  helpText?: string;
  /** Optional bounded synthetic metadata — preserved through the snapshot,
   * never edited or shown in this slice's UI. */
  classification?: string;
  options?: CheckInDraftOption[];
};

export type CheckInDraftState = {
  name: string;
  fields: CheckInDraftField[];
  revision: number;
  dirty: boolean;
};

export type CheckInSavedDraft = {
  revision: number;
  definition: { title: string; fields: CheckInDraftField[] };
};

const ordered = (fields: CheckInDraftField[]): CheckInDraftField[] =>
  [...fields].sort((a, b) => a.order - b.order);

/** Seed the editor's initial local state from mounted server props. */
export function initialDraftState(
  name: string,
  revision: number,
  definition: { title: string; fields: CheckInDraftField[] },
): CheckInDraftState {
  return {
    name,
    fields: ordered(definition.fields),
    revision,
    dirty: false,
  };
}

/** Dirty local state is never clobbered; clean state adopts the incoming
 * snapshot unless it carries an older revision (monotonic guard). */
export function reseedDraftState(
  local: CheckInDraftState,
  incoming: CheckInDraftState,
): CheckInDraftState {
  return local.dirty || incoming.revision < local.revision
    ? local
    : { ...incoming, dirty: false };
}

/** After a successful save: adopt the server-normalized result wholesale —
 * `definition.title` (never the raw local name), ordered fields with
 * server-minted ids, new revision; dirty clears. */
export function adoptSavedResult(
  local: CheckInDraftState,
  saved: CheckInSavedDraft,
): CheckInDraftState {
  return {
    name: saved.definition.title,
    fields: ordered(saved.definition.fields),
    revision: saved.revision,
    dirty: false,
  };
}

/** Append a new field of the given kind: blank metadata (empty label,
 * required=false, next order), dirty=true, exactly one blank option for
 * choice kinds; the input state is not mutated. */
export function addDraftField(
  state: CheckInDraftState,
  kind: CheckInDraftFieldKind,
): CheckInDraftState {
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
