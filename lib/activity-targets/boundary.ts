/**
 * Issue #169 — activity-targets boundary: the ONLY module the app layer
 * touches. Every service-domain error maps to a closed, non-disclosing
 * safe vocabulary; nothing raw escapes to the client. `confirmation_required`
 * is carried as its own code because the coach editor must turn it into the
 * same-day replace confirm dialog — it is not an opaque conflict.
 */

import {
  fail as sharedFail,
  mapError as sharedMapError,
} from "../boundary";
import {
  ActivityTargetError,
  readOwnActivityTargets,
  readStaffActivityTargets,
  writeActivityTarget,
  type ActivityTargetDeps,
  type ActivityTargetsView,
} from "./service";

export type ActivityTargetSafeResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "denied"
        | "invalid_input"
        | "confirmation_required"
        | "conflict"
        | "serialization_conflict";
      message: string;
    };

const CLOSED_MESSAGES: Record<
  Extract<ActivityTargetSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to these activity targets.",
  invalid_input: "The activity target request wasn’t valid.",
  confirmation_required:
    "A target was already saved for that day — confirm to replace it.",
  conflict: "The activity targets changed — refresh and try again.",
  serialization_conflict: "The activity targets changed — please try again.",
};

function fail<T>(
  code: keyof typeof CLOSED_MESSAGES,
): ActivityTargetSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code);
}

function mapError<T>(error: unknown): ActivityTargetSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    domain: (e) => {
      if (!(e instanceof ActivityTargetError)) return null;
      switch (e.code) {
        case "invalid_input":
          return fail("invalid_input");
        case "confirmation_required":
          return fail("confirmation_required");
        case "conflict":
          return fail("conflict");
        case "serialization_conflict":
          return fail("serialization_conflict");
      }
    },
    fallback: () => fail("invalid_input"),
  });
}

async function run<T>(
  fn: () => Promise<T>,
): Promise<ActivityTargetSafeResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError<T>(error);
  }
}

type Session = { user?: { id?: string } } | null | undefined;

export async function readStaffActivityTargetsFromAction(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: ActivityTargetDeps = {},
): Promise<ActivityTargetSafeResult<ActivityTargetsView>> {
  return run(() => readStaffActivityTargets(session, input, deps));
}

export async function readOwnActivityTargetsFromAction(
  session: Session,
  input: { workspaceId: string },
  deps: ActivityTargetDeps = {},
): Promise<ActivityTargetSafeResult<ActivityTargetsView>> {
  return run(() => readOwnActivityTargets(session, input, deps));
}

export async function writeActivityTargetFromAction(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    metric: unknown;
    effectiveFrom: unknown;
    target: unknown;
    confirmSameDay?: unknown;
  },
  deps: ActivityTargetDeps = {},
): Promise<ActivityTargetSafeResult<{ id: string; revision: number }>> {
  return run(() => writeActivityTarget(session, input, deps));
}
