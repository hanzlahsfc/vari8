/**
 * PR-M3 coach-tasks boundary — the only module the app layer touches.
 * Coach to-dos are staff-only product surface (no feature gate); every
 * service error maps to a closed, non-disclosing vocabulary.
 */
import { fail as sharedFail, mapError as sharedMapError } from "../boundary";
import {
  CoachTaskError,
  createCoachTask as serviceCreate,
  updateCoachTaskTitle as serviceUpdate,
  setCoachTaskCompletion as serviceSetCompletion,
  deleteCoachTask as serviceDelete,
  restoreCoachTask as serviceRestore,
  listCoachTasks as serviceList,
  type CoachTaskCaller,
  type CoachTaskDeps,
  type CoachTaskView,
} from "./service";

export type CoachTaskSafeResult<T> =
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
  Extract<CoachTaskSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to these to-dos.",
  invalid_input: "That to-do input wasn’t valid.",
  not_available: "This to-do isn’t available.",
  conflict: "The to-do changed — reload to continue.",
  serialization_conflict: "The to-do changed — please try again.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): CoachTaskSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code);
}

function mapError<T>(error: unknown): CoachTaskSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    domain: (e) => {
      if (!(e instanceof CoachTaskError)) return null;
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

async function guard<T>(fn: () => Promise<T>): Promise<CoachTaskSafeResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError<T>(error);
  }
}

export const createCoachTaskFromRoute = (
  caller: CoachTaskCaller,
  input: { clientProfileId?: string | null; title: unknown },
  deps: CoachTaskDeps = {},
): Promise<CoachTaskSafeResult<{ id: string; revision: number }>> =>
  guard(() => serviceCreate(caller, input, deps));

export const updateCoachTaskTitleFromRoute = (
  caller: CoachTaskCaller,
  input: { taskId: string; title: unknown; expectedRevision: number },
  deps: CoachTaskDeps = {},
): Promise<CoachTaskSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceUpdate(caller, input, deps));

export const setCoachTaskCompletionFromRoute = (
  caller: CoachTaskCaller,
  input: { taskId: string; complete: boolean; expectedRevision: number },
  deps: CoachTaskDeps = {},
): Promise<
  CoachTaskSafeResult<{ revision: number; complete: boolean; changed: boolean }>
> => guard(() => serviceSetCompletion(caller, input, deps));

export const deleteCoachTaskFromRoute = (
  caller: CoachTaskCaller,
  input: { taskId: string; expectedRevision: number },
  deps: CoachTaskDeps = {},
): Promise<CoachTaskSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceDelete(caller, input, deps));

export const restoreCoachTaskFromRoute = (
  caller: CoachTaskCaller,
  input: { taskId: string },
  deps: CoachTaskDeps = {},
): Promise<CoachTaskSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceRestore(caller, input, deps));

export const readCoachTasks = (
  caller: CoachTaskCaller,
  input: { clientProfileId?: string | null } = {},
  deps: CoachTaskDeps = {},
): Promise<CoachTaskSafeResult<{ tasks: CoachTaskView[]; hasMore: boolean }>> =>
  guard(() => serviceList(caller, input, deps));
