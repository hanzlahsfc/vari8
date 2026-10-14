/**
 * HABITS-I1 boundary — the only module the app layer touches. The
 * feature gate (dashboard gate, decision 110) is checked FIRST; every
 * service-domain error maps to a closed, non-disclosing vocabulary.
 */
import { AccessDeniedError } from "../auth/guard";
import { isClientDashboardEnabled } from "../dashboard/gate";
import {
  HabitError,
  archiveHabit as serviceArchive,
  createHabit as serviceCreate,
  editHabit as serviceEdit,
  habitConsistency as serviceConsistency,
  listHabitChoices as serviceChoices,
  listStaffHabits as serviceListStaff,
  listTodayHabits as serviceListToday,
  setHabitLog as serviceSetLog,
  type HabitConsistencyResult,
  type HabitDeps,
  type HabitView,
  type TodayHabitView,
} from "./service";

export type HabitSafeResult<T> =
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
  Extract<HabitSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to this habit.",
  invalid_input: "That habit input wasn’t valid.",
  not_available: "This habit isn’t available.",
  conflict: "The habit changed — reload to continue.",
  serialization_conflict: "The habit changed — please try again.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): HabitSafeResult<T> {
  return { ok: false, code, message: CLOSED_MESSAGES[code] };
}

function mapError<T>(error: unknown): HabitSafeResult<T> {
  if (error instanceof AccessDeniedError) return fail("denied");
  if (error instanceof HabitError) {
    if (error.code === "conflict") return fail("conflict");
    if (error.code === "serialization_conflict")
      return fail("serialization_conflict");
    if (error.code === "invalid_input") return fail("invalid_input");
    return fail("not_available");
  }
  return fail("not_available");
}

async function guard<T>(fn: () => Promise<T>): Promise<HabitSafeResult<T>> {
  if (!isClientDashboardEnabled(process.env)) return fail("not_available");
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError(error);
  }
}

type Session = { user?: { id?: string } } | null | undefined;

export const createHabitFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    name: unknown;
    target: unknown;
    startDate: unknown;
    weekdays: unknown;
    endDate?: unknown;
  },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<{ id: string; revision: number }>> =>
  guard(() => serviceCreate(session as never, input, deps));

export const editHabitFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    habitId: string;
    name?: unknown;
    target?: unknown;
    schedule?: { weekdays?: unknown; endDate?: unknown };
    expectedRevision: number;
  },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceEdit(session as never, input, deps));

export const archiveHabitFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    habitId: string;
    expectedRevision: number;
  },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceArchive(session as never, input, deps));

export const setHabitLogFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    habitId: string;
    date: unknown;
    desired: "DONE" | "CLEARED";
  },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<{ status: "DONE" | "NONE"; changed: boolean }>> =>
  guard(() => serviceSetLog(session as never, input, deps));

export const readStaffHabits = (
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<{ habits: HabitView[]; hasMore: boolean }>> =>
  guard(() => serviceListStaff(session as never, input, deps));

export const readHabitChoices = (
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: HabitDeps = {},
): Promise<
  HabitSafeResult<{ choices: { id: string; name: string }[]; hasMore: boolean }>
> => guard(() => serviceChoices(session as never, input, deps));

export const readTodayHabits = (
  session: Session,
  input: { workspaceId: string; fields?: unknown },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<{ habits: TodayHabitView[]; hasMore: boolean }>> =>
  guard(() => serviceListToday(session as never, input, deps));

export const readHabitConsistency = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId?: string;
    period: unknown;
    fields?: unknown;
  },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<HabitConsistencyResult>> =>
  guard(() => serviceConsistency(session as never, input, deps));
