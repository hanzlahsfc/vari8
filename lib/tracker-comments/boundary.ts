/**
 * PR-M3 tracker-comments boundary — the only module the app layer
 * touches (O7: the sole staff write surface on a client tracker). No
 * feature gate; every service error maps to a closed, non-disclosing
 * vocabulary.
 */
import { fail as sharedFail, mapError as sharedMapError } from "../boundary";
import {
  TrackerCommentError,
  saveTrackerComment as serviceSave,
  listTrackerComments as serviceList,
  listOwnTrackerComments as serviceListOwn,
  type TrackerCommentCaller,
  type TrackerCommentDeps,
  type TrackerCommentView,
} from "./service";

export type TrackerCommentSafeResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "denied"
        | "invalid_input"
        | "not_available"
        | "conflict"
        | "serialization_conflict";
      message: string;
    };

const CLOSED_MESSAGES: Record<
  Extract<TrackerCommentSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to these comments.",
  invalid_input: "That comment input wasn’t valid.",
  not_available: "This comment target isn’t available.",
  conflict: "The comment changed — reload to continue.",
  serialization_conflict: "The comment changed — please try again.",
};

function fail<T>(
  code: keyof typeof CLOSED_MESSAGES,
): TrackerCommentSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code);
}

function mapError<T>(error: unknown): TrackerCommentSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    domain: (e) => {
      if (!(e instanceof TrackerCommentError)) return null;
      if (e.code === "conflict") return fail("conflict");
      if (e.code === "serialization_conflict")
        return fail("serialization_conflict");
      if (e.code === "invalid_input") return fail("invalid_input");
      return fail("not_available");
    },
    serializationConflict: () => fail("serialization_conflict"),
    fallback: () => fail("not_available"),
  });
}

async function guard<T>(
  fn: () => Promise<T>,
): Promise<TrackerCommentSafeResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError<T>(error);
  }
}

export const saveTrackerCommentFromRoute = (
  caller: TrackerCommentCaller,
  input: {
    clientProfileId: string;
    entryDate: unknown;
    parameterId: string;
    body: unknown;
  },
  deps: TrackerCommentDeps = {},
): Promise<
  TrackerCommentSafeResult<{
    id: string | null;
    outcome: "created" | "updated" | "deleted" | "unchanged";
  }>
> => guard(() => serviceSave(caller, input, deps));

export const readTrackerComments = (
  caller: TrackerCommentCaller,
  input: { clientProfileId: string; from?: string; to?: string },
  deps: TrackerCommentDeps = {},
): Promise<
  TrackerCommentSafeResult<{
    comments: TrackerCommentView[];
    hasMore: boolean;
  }>
> => guard(() => serviceList(caller, input, deps));

export const readOwnTrackerComments = (
  caller: TrackerCommentCaller,
  input: { from?: string; to?: string } = {},
  deps: TrackerCommentDeps = {},
): Promise<
  TrackerCommentSafeResult<{
    comments: TrackerCommentView[];
    hasMore: boolean;
  }>
> => guard(() => serviceListOwn(caller, input, deps));
