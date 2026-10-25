// FULL-PACKAGE SLICE of #171
/**
 * Card 06 / R2-N2 — coach check-in review panel read.
 *
 * ONE read model over the card 03 submission detail read
 * (`readCheckInSubmissionDetail`): the detail payload already carries the
 * answers, the review state, the bounded feedback page and the linked
 * answer-media references this panel draws. On top of it this module adds
 * the change summary against the previous submission of the SAME form —
 * added, removed and changed answers.
 *
 * Authorization, scope reconciliation, consent and the single structural
 * `READ checkin_submission` audit all live inside the detail read's
 * Serializable transaction; it runs FIRST, so a foreign or missing tuple
 * fails closed there before any panel data is touched. The previous
 * submission's answer rows read below are the same (workspace, client,
 * form) sensitivity the committed detail read just unlocked for this
 * caller, so the whole panel view stays ONE audited read — matching the
 * #171 read-model contract (one READ audit per view, zero on passive
 * GETs).
 */

import { Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import type { SessionLike } from "../auth/guard";
import type { CheckInField, CheckInFieldKind } from "./forms";
import {
  displayCheckInAnswer,
  readCheckInSubmissionDetail,
  type CheckInInstanceDeps,
  type StaffCheckInSubmissionDetail,
} from "./instances";

/** One raw answer row in the shape the diff compares (media flattened). */
export type CheckInReviewPanelAnswer = {
  fieldId: string;
  kind: string;
  valueText: string | null;
  valueNumeric: Prisma.Decimal | null;
  valueDate: Date | null;
  valueOptionIds: Prisma.JsonValue | null;
  valueRating: number | null;
  mediaIds: string[];
};

/** One added, removed or changed answer, display-ready for the panel. */
export type CheckInAnswerChange = {
  fieldId: string;
  label: string;
  kind: string;
  /** Sanitized display value before, or null when the answer was added. */
  previous: string | null;
  /** Sanitized display value now, or null when the answer was removed. */
  current: string | null;
};

export type CheckInSubmissionChangeSummary = {
  previousSubmissionId: string;
  previousSubmittedAt: string;
  previousFormName: string;
  added: CheckInAnswerChange[];
  removed: CheckInAnswerChange[];
  changed: CheckInAnswerChange[];
  /** Answer count identical between the two submissions. */
  unchanged: number;
};

export type CheckInReviewPanelDetail = StaffCheckInSubmissionDetail & {
  /**
   * Server-side review state. Draft feedback is client-local by design
   * (the schema stores committed feedback only), so the wire carries the
   * two durable states; the panel derives `draft` from its own autosave.
   */
  reviewState: "open" | "answered";
  /** Null when no earlier submission of this form exists to compare. */
  changeSummary: CheckInSubmissionChangeSummary | null;
};

const ANSWER_SELECT = {
  fieldId: true,
  kind: true,
  valueText: true,
  valueNumeric: true,
  valueDate: true,
  valueOptionIds: true,
  valueRating: true,
  media: {
    select: { mediaObjectId: true },
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.CheckInSubmissionAnswerSelect;

type RawAnswerRow = Omit<CheckInReviewPanelAnswer, "mediaIds"> & {
  media: { mediaObjectId: string }[];
};

function toPanelAnswer(row: RawAnswerRow): CheckInReviewPanelAnswer {
  const { media, ...rest } = row;
  return { ...rest, mediaIds: media.map((m) => m.mediaObjectId) };
}

/**
 * Canonical comparison value for one answer — kind-aware, never the
 * display string, so a render tweak can never fake a "changed" row.
 * Null means "no recorded answer value" (absent row or all-null row).
 */
function canonicalAnswerValue(
  answer: CheckInReviewPanelAnswer | undefined,
): string | null {
  if (!answer) return null;
  switch (answer.kind) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return answer.valueText;
    case "NUMBER":
      return answer.valueNumeric !== null
        ? answer.valueNumeric.toString()
        : null;
    case "DATE":
      return answer.valueDate
        ? answer.valueDate.toISOString().slice(0, 10)
        : null;
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE": {
      const ids = Array.isArray(answer.valueOptionIds)
        ? (answer.valueOptionIds as unknown[])
            .filter((v): v is string => typeof v === "string")
            .sort()
        : [];
      return ids.length > 0 ? ids.join("") : null;
    }
    case "RATING":
      return answer.valueRating === null ? null : String(answer.valueRating);
    case "VISUAL":
      return answer.mediaIds.length > 0 ? answer.mediaIds.join("") : null;
    default:
      return null;
  }
}

function fallbackField(fieldId: string, kind: string): CheckInField {
  return {
    fieldId,
    kind: kind as CheckInFieldKind,
    label: fieldId,
    required: false,
    order: 0,
  };
}

/**
 * The change summary itself — pure, so the classification a browser
 * cannot reach is testable directly. Field order follows the current
 * form version, then previous-version-only fields in their own order.
 */
export function diffCheckInSubmissions(input: {
  current: {
    fields: CheckInField[];
    answers: CheckInReviewPanelAnswer[];
  };
  previous: {
    submissionId: string;
    submittedAt: string;
    formName: string;
    fields: CheckInField[];
    answers: CheckInReviewPanelAnswer[];
  };
}): CheckInSubmissionChangeSummary {
  const curFields = new Map(input.current.fields.map((f) => [f.fieldId, f]));
  const prevFields = new Map(
    input.previous.fields.map((f) => [f.fieldId, f]),
  );
  const curAnswers = new Map(
    input.current.answers.map((a) => [a.fieldId, a]),
  );
  const prevAnswers = new Map(
    input.previous.answers.map((a) => [a.fieldId, a]),
  );
  // Ordered union: current version order, then previous-version-only
  // fields, then stray answer rows whose field left both definitions.
  const fieldIds = [
    ...new Set([
      ...input.current.fields.map((f) => f.fieldId),
      ...input.previous.fields.map((f) => f.fieldId),
      ...input.current.answers.map((a) => a.fieldId),
      ...input.previous.answers.map((a) => a.fieldId),
    ]),
  ];

  const added: CheckInAnswerChange[] = [];
  const removed: CheckInAnswerChange[] = [];
  const changed: CheckInAnswerChange[] = [];
  let unchanged = 0;

  for (const fieldId of fieldIds) {
    const cur = curAnswers.get(fieldId);
    const prev = prevAnswers.get(fieldId);
    const curValue = canonicalAnswerValue(cur);
    const prevValue = canonicalAnswerValue(prev);
    if (curValue === null && prevValue === null) continue;
    const curField =
      curFields.get(fieldId) ??
      prevFields.get(fieldId) ??
      fallbackField(fieldId, cur?.kind ?? prev?.kind ?? "");
    const prevField =
      prevFields.get(fieldId) ??
      curFields.get(fieldId) ??
      fallbackField(fieldId, prev?.kind ?? cur?.kind ?? "");
    const label = curField.label !== fieldId ? curField.label : prevField.label;
    const base = { fieldId, label, kind: curField.kind };
    if (prevValue === null) {
      added.push({
        ...base,
        previous: null,
        current: displayCheckInAnswer(curField, cur),
      });
    } else if (curValue === null) {
      removed.push({
        ...base,
        previous: displayCheckInAnswer(prevField, prev),
        current: null,
      });
    } else if (curValue !== prevValue) {
      changed.push({
        ...base,
        previous: displayCheckInAnswer(prevField, prev),
        current: displayCheckInAnswer(curField, cur),
      });
    } else {
      unchanged += 1;
    }
  }

  return {
    previousSubmissionId: input.previous.submissionId,
    previousSubmittedAt: input.previous.submittedAt,
    previousFormName: input.previous.formName,
    added,
    removed,
    changed,
    unchanged,
  };
}

/**
 * The review-panel read. The audited detail read authorizes (resource
 * `checkinsCoachReviews`, action `read`), reconciles the scope, locks the
 * consent rows and writes the view's one READ audit; a denied or foreign
 * tuple throws the closed vocabulary there and nothing below runs.
 */
export async function readCheckInReviewPanel(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInReviewPanelDetail> {
  const detail = await readCheckInSubmissionDetail(session, input, deps);
  const db = deps.db ?? defaultPrisma;
  const scope = {
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
  };

  // Same-scope follow-up reads: the current submission's own form +
  // answers (the detail view carries displays only) and the latest
  // earlier submission of the SAME form for this client — "the previous
  // submission" the panel diffs against. A different form's answers
  // would read as noise (every field added or removed), not as change.
  const current = await db.checkInSubmission.findFirst({
    where: { id: input.submissionId, ...scope },
    select: {
      id: true,
      formId: true,
      submittedAt: true,
      formVersion: { select: { definition: true } },
      answers: { select: ANSWER_SELECT },
    },
  });
  const previous = current
    ? await db.checkInSubmission.findFirst({
        where: {
          ...scope,
          formId: current.formId,
          submittedAt: { lt: current.submittedAt },
          NOT: { id: current.id },
        },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          submittedAt: true,
          form: { select: { name: true } },
          formVersion: { select: { definition: true } },
          answers: { select: ANSWER_SELECT },
        },
      })
    : null;

  const changeSummary =
    current && previous
      ? diffCheckInSubmissions({
          current: {
            fields:
              (current.formVersion.definition as unknown as CheckInDefinitionLike)
                .fields ?? [],
            answers: current.answers.map(toPanelAnswer),
          },
          previous: {
            submissionId: previous.id,
            submittedAt: previous.submittedAt.toISOString(),
            formName: previous.form.name,
            fields:
              (previous.formVersion
                .definition as unknown as CheckInDefinitionLike).fields ?? [],
            answers: previous.answers.map(toPanelAnswer),
          },
        })
      : null;

  return {
    ...detail,
    reviewState: detail.reviewed ? "answered" : "open",
    changeSummary,
  };
}

type CheckInDefinitionLike = { fields?: CheckInField[] };
