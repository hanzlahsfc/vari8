import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { AccessDeniedError, type SessionLike } from "../auth/guard";
import { mapError as sharedMapError } from "../boundary";
import type { ConsentPolicyRegistry } from "../consent";
import { ApiError, type ApiViewer, type ApiWorkspaceContext } from "../api/v1";
import { DailyEntryError, isDailyEntryEnabled } from "./gate";
import {
  dailyEntryConsentRegistry,
  readDailyEntryNumericSeries,
  saveDailyEntry,
} from "./service";

/**
 * P-021 — DailyEntry boundary: the single app-facing save surface.
 * Gate BEFORE any input binding, session use, or database work; generic
 * non-disclosing messages; no internal identifiers cross to the browser.
 */

export type DailyEntryActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

const OFF = "Daily tracking is currently unavailable.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";
const STALE = "This form changed since you opened it. Reload and try again.";
const GENERIC = "Something went wrong. Please try again in a moment.";

const MAX_ORDINAL = 255;
const MAX_RAW_LEN = 512;
const MAX_VALUES = 64;

type ParsedInput =
  | {
      ok: true;
      workspaceId: string;
      entryDate: string;
      formToken: string;
      values: { ordinal: number; raw: string }[];
    }
  | { ok: false };

function boundedString(v: unknown, max = MAX_RAW_LEN): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > max) return null;
  return v;
}

function parseInput(input: unknown): ParsedInput {
  if (typeof input !== "object" || input === null) return { ok: false };
  const i = input as Record<string, unknown>;
  const workspaceId = boundedString(i.workspaceId, 128);
  const entryDate = boundedString(i.entryDate, 16);
  const formToken = boundedString(i.formToken, 128);
  if (workspaceId === null || entryDate === null || formToken === null)
    return { ok: false };
  if (!Array.isArray(i.values) || i.values.length > MAX_VALUES)
    return { ok: false };
  const values: { ordinal: number; raw: string }[] = [];
  for (const raw of i.values) {
    if (typeof raw !== "object" || raw === null) return { ok: false };
    const v = raw as Record<string, unknown>;
    if (
      typeof v.ordinal !== "number" ||
      !Number.isSafeInteger(v.ordinal) ||
      v.ordinal < 0 ||
      v.ordinal > MAX_ORDINAL ||
      typeof v.raw !== "string" ||
      v.raw.length > MAX_RAW_LEN
    )
      return { ok: false };
    values.push({ ordinal: v.ordinal, raw: v.raw });
  }
  return {
    ok: true,
    workspaceId,
    entryDate,
    formToken,
    values,
  };
}

function mapError(error: unknown): string {
  return sharedMapError(error, {
    denied: () => DENIED,
    domain: (e) => {
      if (!(e instanceof DailyEntryError)) return null;
      switch (e.code) {
        case "stale_form":
          return STALE;
        case "invalid_input":
          return INVALID;
        case "not_available":
        case "no_active_setup":
        case "ineligible":
        case "consent_missing":
        case "policy_not_configured":
          return OFF;
        default:
          return GENERIC;
      }
    },
    fallback: () => GENERIC,
  });
}

export async function saveDailyEntryFromAction(
  session: SessionLike,
  input: unknown,
  deps: {
    entryEnabled?: boolean;
    db?: PrismaClient;
    registry?: ConsentPolicyRegistry;
  } = {},
): Promise<DailyEntryActionResult<{ status: "saved" | "no_op" }>> {
  // Gate FIRST — before binding input, before session use, before the DB.
  if (!(
    deps.entryEnabled ?? isDailyEntryEnabled(process.env.ENABLE_DAILY_ENTRY)
  ))
    return { ok: false, message: OFF };
  const parsed = parseInput(input);
  if (!parsed.ok) return { ok: false, message: INVALID };
  try {
    const result = await saveDailyEntry(
      session,
      {
        workspaceId: parsed.workspaceId,
        entryDate: parsed.entryDate,
        formToken: parsed.formToken,
        values: parsed.values,
      },
      { db: deps.db ?? prisma, registry: deps.registry },
    );
    return { ok: true, value: { status: result.status } };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

/**
 * PR-SV2 — /api/v1 boundary for the numeric series read. The route helper
 * has already authenticated the viewer, validated params/query and granted
 * the `clientData.read` scope; this boundary forwards the typed context and
 * maps domain outcomes onto the shared `{ error: { code } }` contract —
 * scope and disclosure denials stay indistinguishable 403s.
 */
export async function readDailyEntryNumericSeriesFromApi(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  input: {
    clientProfileId: unknown;
    parameterId: unknown;
    from: unknown;
    to: unknown;
  },
  deps: { db?: PrismaClient; registry?: ConsentPolicyRegistry } = {},
) {
  try {
    return await readDailyEntryNumericSeries(viewer, workspace, input, {
      db: deps.db ?? prisma,
      // Same resolution as the app callers: the dev policy while the D19
      // consent gates stay parked, unconfigured (fail closed) if they ever
      // activate without a real policy.
      registry: deps.registry ?? dailyEntryConsentRegistry(true),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError)
      throw new ApiError(403, "forbidden");
    if (error instanceof DailyEntryError) {
      if (error.code === "invalid_input")
        throw new ApiError(400, "invalid_input");
      if (error.code === "not_available" || error.code === "ineligible")
        throw new ApiError(404, "not_found");
    }
    throw error;
  }
}
