/**
 * P-008 onboarding form definitions — callable interface scaffold (slice 1D-0).
 *
 * Types and approved constants only. `validateDefinition` is intentionally a
 * stub: it throws an UNTYPED error so every behavioral test fails meaningfully
 * (missing typed codes / missing minted IDs) until the validator slices
 * implement it. No Prisma/DB imports, no service operations, no authz or
 * audit wiring live here — those are later slices.
 */

export type OnboardingFormErrorCode =
  | "invalid_input"
  | "form_not_accessible"
  | "form_archived"
  | "no_open_draft"
  | "stale_revision"
  | "forbidden_field_id"
  | "publish_incomplete";

export class OnboardingFormError extends Error {
  constructor(readonly code: OnboardingFormErrorCode) {
    super(code);
    this.name = "OnboardingFormError";
  }
}

export const FIELD_KINDS = [
  "shortText",
  "longText",
  "number",
  "date",
  "singleChoice",
  "multiChoice",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FORM_LIMITS = {
  maxFields: 100,
  minPublishFields: 1,
  labelMax: 200,
  helpTextMax: 500,
  minOptions: 1,
  maxOptions: 50,
  optionLabelMax: 200,
  nameMax: 120,
  definitionMaxBytes: 64 * 1024,
} as const;

export type FieldOption = { optionId: string; label: string };
export type FormField = {
  fieldId: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  order: number;
  helpText?: string;
  options?: FieldOption[];
};
export type FormDefinition = { title: string; fields: FormField[] };

export type FormSummary = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  hasDraft: boolean;
  latestVersionSeq: number | null;
  updatedAt: string;
};

export type FormDetail = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  draft: FormDefinition | null;
  versions: Array<{
    versionSeq: number;
    publishedAt: string;
    definition: FormDefinition;
  }>;
};

/**
 * Structural validation + normalization of a definition payload. Presented
 * `fieldId`/`optionId` values are trusted only when already bound in
 * `knownIds` (the CURRENT draft's IDs — retired IDs from earlier drafts or
 * historical versions are never resurrected); absent IDs get server-minted
 * ones. Field kind is immutable per fieldId.
 */
export function validateDefinition(
  _input: unknown,
  _knownIds: {
    fieldIds: Map<string, FieldKind>;
    optionIds: Map<string, string>;
  },
  _opts: { forPublish: boolean },
): FormDefinition {
  throw new Error("not implemented (P-008 slice-1D scaffold)");
}
