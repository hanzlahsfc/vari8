/**
 * MEAL-PLAN-I1 (decision #115) — meal-plan boundary: the ONLY module the
 * app layer touches. Every service-domain error maps to a closed,
 * non-disclosing safe vocabulary; nothing raw escapes to the client.
 */

import { AccessDeniedError } from "../auth/guard";
import { ConsentError } from "../consent";
import { isMealPlansEnabled, type MealPlansEnv } from "./gate";
import {
  MealPlanError,
  publishMealPlanVersion,
  readOwnMealPlan,
  readStaffMealPlan,
  readStaffMealPlanVersion,
  saveMealPlanDraft,
  setMealPlanTimezone,
  type MealPlanDeps,
  type MealPlanVersionDetail,
  type OwnMealPlanView,
  type StaffMealPlanView,
} from "./service";

export type MealPlanSafeResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "denied"
        | "invalid_input"
        | "not_available"
        | "conflict"
        | "consent_missing"
        | "policy_not_configured"
        | "serialization_conflict"
        | "timezone_required"
        | "unrepresentable_date"
        | "publish_incomplete";
      message: string;
    };

const CLOSED_MESSAGES: Record<
  Extract<MealPlanSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to this meal plan.",
  invalid_input: "The meal plan request wasn’t valid.",
  not_available: "This meal plan isn’t available.",
  conflict: "The meal plan changed — refresh and try again.",
  consent_missing: "Meal plans aren’t available right now.",
  policy_not_configured: "Meal plans aren’t available right now.",
  serialization_conflict: "The meal plan changed — please try again.",
  timezone_required: "Confirm the client’s timezone before publishing.",
  unrepresentable_date: "That date doesn’t exist in the confirmed timezone.",
  publish_incomplete: "The draft isn’t complete enough to publish.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): MealPlanSafeResult<T> {
  return { ok: false, code, message: CLOSED_MESSAGES[code] };
}

function mapError<T>(error: unknown): MealPlanSafeResult<T> {
  if (error instanceof AccessDeniedError) return fail("denied");
  if (error instanceof ConsentError) {
    if (error.code === "consent_missing") return fail("consent_missing");
    return fail("policy_not_configured");
  }
  if (error instanceof MealPlanError) {
    switch (error.code) {
      case "plan_not_accessible":
        return fail("not_available");
      case "stale_revision":
        return fail("conflict");
      case "timezone_required":
      case "unrepresentable_date":
      case "publish_incomplete":
      case "consent_missing":
      case "policy_not_configured":
      case "serialization_conflict":
      case "invalid_input":
        return fail(error.code);
    }
  }
  return fail("not_available");
}

/**
 * Feature boundary FIRST — flag + trusted runtime before any session or
 * database work; unknown/production fails closed.
 */
async function guard<T>(
  env: MealPlansEnv,
  fn: () => Promise<T>,
): Promise<MealPlanSafeResult<T>> {
  if (!isMealPlansEnabled(env)) return fail("not_available");
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError(error);
  }
}

type Session = { user?: { id?: string } } | null | undefined;

export async function saveMealPlanDraftFromAction(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    expectedRevision: number;
    title?: string;
    draft: unknown;
    timezone?: string;
  },
  deps: MealPlanDeps = {},
): Promise<MealPlanSafeResult<{ planId: string; revision: number }>> {
  return guard(process.env, () => saveMealPlanDraft(session, input, deps));
}

export async function setMealPlanTimezoneFromAction(
  session: Session,
  input: { workspaceId: string; clientProfileId: string; timezone: string },
  deps: MealPlanDeps = {},
): Promise<MealPlanSafeResult<{ planId: string }>> {
  return guard(process.env, () => setMealPlanTimezone(session, input, deps));
}

export async function publishMealPlanVersionFromAction(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    expectedRevision: number;
    effectiveDate: string;
  },
  deps: MealPlanDeps = {},
): Promise<MealPlanSafeResult<{ versionId: string; versionSeq: number }>> {
  return guard(process.env, () => publishMealPlanVersion(session, input, deps));
}

export async function readStaffMealPlanFromAction(
  session: Session,
  input: { workspaceId: string; clientProfileId: string; cursor?: number },
  deps: MealPlanDeps = {},
): Promise<MealPlanSafeResult<StaffMealPlanView>> {
  return guard(process.env, () => readStaffMealPlan(session, input, deps));
}

export async function readStaffMealPlanVersionFromAction(
  session: Session,
  input: { workspaceId: string; clientProfileId: string; versionId: string },
  deps: MealPlanDeps = {},
): Promise<MealPlanSafeResult<MealPlanVersionDetail>> {
  return guard(process.env, () =>
    readStaffMealPlanVersion(session, input, deps),
  );
}

export async function readOwnMealPlanFromAction(
  session: Session,
  input: { workspaceId: string },
  deps: MealPlanDeps = {},
): Promise<MealPlanSafeResult<OwnMealPlanView>> {
  return guard(process.env, () => readOwnMealPlan(session, input, deps));
}
