"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { saveDailyEntryFromAction } from "@/lib/daily-entry/boundary";
import { resolveDailyEntryMode } from "@/lib/daily-entry/gate";
import { dailyEntryConsentRegistry } from "@/lib/daily-entry/service";

/**
 * P-021 — DailyEntry save server action (decisions #64–#78).
 *
 * Order is load-bearing: MODE GATE → session gate → only then FormData
 * binding → boundary. With persistence off, unset, invalid, or in conflict
 * mode, the action returns the unavailable failure BEFORE `auth()` runs —
 * no session lookup, no field reads, no service/database work.
 *
 * The browser submits positional ordinals (`v{N}` fields) + a stale token —
 * never raw entry/revision/pin/version/member/parameter ids.
 */

const OFF = "Daily tracking is currently unavailable.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

const singleString = (formData: FormData, key: string, maxLen: number) => {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  return typeof v === "string" && v.length > 0 && v.length <= maxLen ? v : null;
};

export async function saveDailyEntryAction(
  formData: FormData,
): Promise<
  | { ok: true; value: { status: "saved" | "no_op" } }
  | { ok: false; message: string }
> {
  // 1. Mode gate — persistence only; conflict/off fail before ANY work.
  const mode = resolveDailyEntryMode(
    process.env.ENABLE_DAILY_ENTRY,
    process.env.ENABLE_DAILY_PROTOTYPE,
  );
  if (mode !== "persistent") return fail(OFF);

  // 2. Session gate.
  const session = await auth();
  if (!session?.user?.id) return fail(DENIED);

  // 3. Bounded input binding.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const entryDate = singleString(formData, "entryDate", 16);
  const formToken = singleString(formData, "formToken", 128);
  if (workspaceId === null || entryDate === null || formToken === null)
    return fail(INVALID);
  const values: { ordinal: number; raw: string }[] = [];
  for (const [key, v] of formData.entries()) {
    if (!/^v\d+$/.test(key)) continue;
    if (typeof v !== "string") return fail(INVALID);
    values.push({ ordinal: Number(key.slice(1)), raw: v });
  }

  const result = await saveDailyEntryFromAction(
    { user: { id: session.user.id } },
    { workspaceId, entryDate, formToken, values },
    {
      entryEnabled: true,
      registry: dailyEntryConsentRegistry(true),
    },
  );
  if (result.ok) revalidatePath(`/workspace/${workspaceId}/daily`);
  return result;
}
