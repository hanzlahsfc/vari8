"use server";

import { auth } from "@/auth";
import { AccessDeniedError } from "@/lib/auth/guard";
import { DailyEntryError, resolveDailyEntryMode } from "@/lib/daily-entry/gate";
import {
  dailyEntryConsentRegistry,
  readStaffDailyEntryDetail,
} from "@/lib/daily-entry/service";

/**
 * P-022 — staff DailyEntry "View details" server action (decisions
 * #79–#81, P-022-R4). This is the ONLY detail-bearing surface: there is no
 * GET detail route.
 *
 * Order is load-bearing: MODE GATE → session gate → bounded field binding →
 * the transaction-bound service. With persistence off/invalid/conflicting,
 * the action returns the unavailable failure before `auth()` runs — no
 * session lookup, no field reads, no database work.
 *
 * Inputs are exactly `workspaceId` / `clientProfileId` / `entryDate` —
 * untrusted selection data rebound server-side through the authorized
 * transaction, never treated as authority. Results are sanitized display
 * strings only; failures return a typed non-disclosing message and no
 * values.
 */

const OFF = "Daily entries are currently unavailable.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";
const GENERIC = "Something went wrong. Please try again in a moment.";
const CONSENT = "The client's required consent is not in place.";

export type StaffDailyDetailValue = {
  parameterKey: string;
  label: string;
  unit: string | null;
  display: string;
};

export type StaffDailyDetailState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      entryDate: string;
      revisionSeq: number;
      revisionCount: number;
      declaredAt: string;
      values: StaffDailyDetailValue[];
    };

const fail = (message: string): StaffDailyDetailState => ({
  status: "error",
  message,
});

/** Exactly one bounded string value; File/duplicate/missing/oversized → null. */
const singleString = (formData: FormData, key: string, maxLen: number) => {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  return typeof v === "string" && v.length > 0 && v.length <= maxLen ? v : null;
};

export async function viewStaffDailyEntryDetail(
  _prev: StaffDailyDetailState,
  formData: FormData,
): Promise<StaffDailyDetailState> {
  // 1. Mode gate — persistence only; off/conflict fail before ANY work.
  const mode = resolveDailyEntryMode(
    process.env.ENABLE_DAILY_ENTRY,
    process.env.ENABLE_DAILY_PROTOTYPE,
  );
  if (mode !== "persistent") return fail(OFF);

  // 2. Session gate.
  let session;
  try {
    session = await auth();
  } catch {
    return fail(GENERIC);
  }
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0) return fail(DENIED);

  // 3. Bounded inputs — selection data only, rebound inside the service's
  // authoritative transaction.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const entryDate = singleString(formData, "entryDate", 16);
  if (workspaceId === null || clientProfileId === null || entryDate === null)
    return fail(INVALID);

  try {
    const detail = await readStaffDailyEntryDetail(
      { user: { id: userId } },
      { workspaceId, clientProfileId, entryDate },
      { registry: dailyEntryConsentRegistry(true) },
    );
    return {
      status: "ok",
      entryDate: detail.entryDate,
      revisionSeq: detail.revisionSeq,
      revisionCount: detail.revisionCount,
      declaredAt: detail.declaredAt,
      values: detail.values.map((v) => ({
        parameterKey: v.parameterKey,
        label: v.label,
        unit: v.unit,
        display: v.display,
      })),
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) return fail(DENIED);
    if (error instanceof DailyEntryError) {
      if (error.code === "invalid_input") return fail(INVALID);
      if (
        error.code === "consent_missing" ||
        error.code === "policy_not_configured"
      )
        return fail(CONSENT);
      return fail(OFF);
    }
    return fail(GENERIC);
  }
}
