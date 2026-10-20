/**
 * CLIENT-TASKS-I1 boundary — the only module the app layer touches.
 * The feature gate (dashboard gate, decision 109 owner rule 5) is
 * checked FIRST; every service-domain error maps to a closed,
 * non-disclosing vocabulary.
 */
import {
  fail as sharedFail,
  guard as sharedGuard,
  mapError as sharedMapError,
} from "../boundary";
import { isClientDashboardEnabled } from "../dashboard/gate";
import {
  TaskError,
  assignClientTask as serviceAssign,
  editClientTask as serviceEdit,
  cancelClientTask as serviceCancel,
  setClientTaskCompletion as serviceSetCompletion,
  listStaffClientTasks as serviceListStaff,
  listOwnClientTasks as serviceListOwn,
  type TaskDeps,
  type TaskView,
} from "./service";

export type TaskSafeResult<T> =
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
  Extract<TaskSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to this task.",
  invalid_input: "That task input wasn’t valid.",
  not_available: "This task isn’t available.",
  conflict: "The task changed — reload to continue.",
  serialization_conflict: "The task changed — please try again.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): TaskSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code);
}

// Raw serialization failures can still reach here from unwrapped
// paths (e.g. a FOR UPDATE conflict — P2034 for typed ops,
// P2010/40001|40P01 for raw statements) — the serializationConflict
// backstop maps them to the honest retry vocabulary, never a
// misleading not_available.
function mapError<T>(error: unknown): TaskSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    domain: (e) => {
      if (!(e instanceof TaskError)) return null;
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

async function guard<T>(fn: () => Promise<T>): Promise<TaskSafeResult<T>> {
  return sharedGuard(
    {
      enabled: isClientDashboardEnabled(process.env),
      off: () => fail<T>("not_available"),
      map: (e) => mapError<T>(e),
    },
    fn,
  );
}

type Session = { user?: { id?: string } } | null | undefined;

export const assignClientTaskFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    title: unknown;
    dueDate: unknown;
  },
  deps: TaskDeps = {},
): Promise<TaskSafeResult<{ id: string; revision: number }>> =>
  guard(() => serviceAssign(session as never, input, deps));

export const editClientTaskFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    taskId: string;
    title?: unknown;
    dueDate?: unknown;
    expectedRevision: number;
  },
  deps: TaskDeps = {},
): Promise<TaskSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceEdit(session as never, input, deps));

export const cancelClientTaskFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    taskId: string;
    expectedRevision: number;
  },
  deps: TaskDeps = {},
): Promise<TaskSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceCancel(session as never, input, deps));

export const setClientTaskCompletionFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    taskId: string;
    desired: "COMPLETED" | "OPEN";
    expectedRevision: number;
  },
  deps: TaskDeps = {},
): Promise<
  TaskSafeResult<{
    revision: number;
    status: "OPEN" | "COMPLETED";
    changed: boolean;
  }>
> => guard(() => serviceSetCompletion(session as never, input, deps));

export const readStaffClientTasks = (
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: TaskDeps = {},
): Promise<TaskSafeResult<{ tasks: TaskView[]; hasMore: boolean }>> =>
  guard(() => serviceListStaff(session as never, input, deps));

export const readOwnClientTasks = (
  session: Session,
  input: {
    workspaceId: string;
    option?: "open" | "completed" | "both";
  },
  deps: TaskDeps = {},
): Promise<TaskSafeResult<{ tasks: TaskView[]; hasMore: boolean }>> =>
  guard(() => serviceListOwn(session as never, input, deps));
