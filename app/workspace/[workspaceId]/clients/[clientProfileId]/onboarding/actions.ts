"use server";

import { auth } from "@/auth";
import {
  markSubmissionReviewedFromAction,
  viewSubmissionReviewDetail,
} from "@/lib/onboarding/review-boundary";

/**
 * P-024 — staff onboarding-review server actions (decisions #86–#91).
 * These are the ONLY detail-bearing and mark surfaces: no GET detail
 * route and no unmark exists.
 *
 * Order is load-bearing inside the boundary: feature gate → bounded
 * input binding → the transaction-bound services. Inputs are exactly
 * `workspaceId` / `clientProfileId` / `submissionId` — untrusted
 * selection data rebound server-side, never treated as authority.
 * Results are sanitized display strings / structural status only;
 * failures return a typed non-disclosing message and no answers.
 */

export type StaffOnboardingDetailValue = {
  fieldId: string;
  label: string;
  kind: string;
  display: string;
};

export type StaffOnboardingDetailState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      submissionId: string;
      formName: string;
      versionSeq: number;
      submittedAt: string;
      reviewed: { byName: string; at: string } | null;
      canMark: boolean;
      answers: StaffOnboardingDetailValue[];
    };

const fail = (message: string): StaffOnboardingDetailState => ({
  status: "error",
  message,
});

const GENERIC = "Something went wrong. Please try again in a moment.";

/** Exactly one bounded string value; File/duplicate/missing/oversized → null. */
const singleString = (formData: FormData, key: string, maxLen: number) => {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  return typeof v === "string" && v.length > 0 && v.length <= maxLen ? v : null;
};

export async function viewOnboardingSubmissionDetail(
  _prev: StaffOnboardingDetailState,
  formData: FormData,
): Promise<StaffOnboardingDetailState> {
  let session;
  try {
    session = await auth();
  } catch {
    return fail(GENERIC);
  }
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const submissionId = singleString(formData, "submissionId", 128);
  if (workspaceId === null || clientProfileId === null || submissionId === null)
    return fail("Check the form details and try again.");

  const result = await viewSubmissionReviewDetail(session, {
    workspaceId,
    clientProfileId,
    submissionId,
  });
  if (!result.ok) return fail(result.message);
  const d = result.value;
  return {
    status: "ok",
    submissionId: d.submissionId,
    formName: d.formName,
    versionSeq: d.versionSeq,
    submittedAt: d.submittedAt,
    reviewed: d.reviewed,
    canMark: d.canMark,
    answers: d.answers.map((a) => ({
      fieldId: a.fieldId,
      label: a.label,
      kind: a.kind,
      display: a.display,
    })),
  };
}

export type StaffOnboardingMarkState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "reviewed" | "already_reviewed";
      reviewedAt: string;
    };

export async function markOnboardingSubmissionReviewed(
  _prev: StaffOnboardingMarkState,
  formData: FormData,
): Promise<StaffOnboardingMarkState> {
  let session;
  try {
    session = await auth();
  } catch {
    return { status: "error", message: GENERIC };
  }
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const submissionId = singleString(formData, "submissionId", 128);
  if (workspaceId === null || clientProfileId === null || submissionId === null)
    return {
      status: "error",
      message: "Check the form details and try again.",
    };

  const result = await markSubmissionReviewedFromAction(session, {
    workspaceId,
    clientProfileId,
    submissionId,
  });
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: result.value.status,
    reviewedAt: result.value.reviewedAt,
  };
}
