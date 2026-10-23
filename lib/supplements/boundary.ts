/**
 * PR-SUPP — supplement-plan boundary: the ONLY module the app layer
 * touches. Every service-domain error maps to a closed, non-disclosing
 * safe vocabulary; nothing raw escapes to the client.
 */

import {
  fail as sharedFail,
  guard as sharedGuard,
  mapError as sharedMapError,
} from "../boundary";
import { isSupplementsEnabled, type SupplementsEnv } from "./gate";
import {
  readOwnSupplementPlan,
  readStaffSupplementPlan,
  saveSupplementPlan,
  SupplementError,
  viewStaffSupplementPlan,
  type OwnSupplementPlanView,
  type StaffSupplementPlanView,
  type SupplementsDeps,
} from "./service";

export type SupplementSafeResult<T> =
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
        | "serialization_conflict";
      message: string;
    };

const CLOSED_MESSAGES: Record<
  Extract<SupplementSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to this supplement plan.",
  invalid_input: "The supplement plan request wasn’t valid.",
  not_available: "This supplement plan isn’t available.",
  conflict: "The supplement plan changed — refresh and try again.",
  consent_missing: "Supplement plans aren’t available right now.",
  policy_not_configured: "Supplement plans aren’t available right now.",
  serialization_conflict: "The supplement plan changed — please try again.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): SupplementSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code);
}

function mapError<T>(error: unknown): SupplementSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    consent: (e) =>
      e.code === "consent_missing"
        ? fail("consent_missing")
        : fail("policy_not_configured"),
    domain: (e) => {
      if (!(e instanceof SupplementError)) return null;
      switch (e.code) {
        case "plan_not_accessible":
          return fail("not_available");
        case "stale_revision":
          return fail("conflict");
        case "serialization_conflict":
          return fail("serialization_conflict");
        case "consent_missing":
          return fail("consent_missing");
        case "policy_not_configured":
          return fail("policy_not_configured");
        case "invalid_input":
          return fail("invalid_input");
      }
    },
    fallback: () => fail("not_available"),
  });
}

/**
 * Feature boundary FIRST — flag + trusted runtime before any session or
 * database work; unknown/production fails closed.
 */
async function guard<T>(
  env: SupplementsEnv,
  fn: () => Promise<T>,
): Promise<SupplementSafeResult<T>> {
  return sharedGuard(
    {
      enabled: isSupplementsEnabled(env),
      off: () => fail<T>("not_available"),
      map: (e) => mapError<T>(e),
    },
    fn,
  );
}

type Session = { user?: { id?: string } } | null | undefined;

export async function saveSupplementPlanFromAction(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    expectedRevision: number;
    name?: string;
    items: unknown;
  },
  deps: SupplementsDeps = {},
): Promise<SupplementSafeResult<{ planId: string; revision: number }>> {
  return guard(process.env, () => saveSupplementPlan(session, input, deps));
}

export async function readStaffSupplementPlanFromAction(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: SupplementsDeps = {},
): Promise<SupplementSafeResult<StaffSupplementPlanView>> {
  return guard(process.env, () =>
    readStaffSupplementPlan(session, input, deps),
  );
}

/** Explicit staff view — the only read path that writes a READ audit. */
export async function viewSupplementPlanFromAction(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: SupplementsDeps = {},
): Promise<SupplementSafeResult<StaffSupplementPlanView>> {
  return guard(process.env, () =>
    viewStaffSupplementPlan(session, input, deps),
  );
}

export async function readOwnSupplementPlanFromAction(
  session: Session,
  input: { workspaceId: string },
  deps: SupplementsDeps = {},
): Promise<SupplementSafeResult<OwnSupplementPlanView>> {
  return guard(process.env, () => readOwnSupplementPlan(session, input, deps));
}
