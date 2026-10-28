/**
 * HABITS-I1 boundary — the only module the app layer touches. The
 * feature gate (dashboard gate, decision 110) is checked FIRST; every
 * service-domain error maps to a closed, non-disclosing vocabulary.
 */
import {
  fail as sharedFail,
  guard as sharedGuard,
  mapError as sharedMapError,
} from "../boundary";
import { isClientDashboardEnabled } from "../dashboard/gate";
import {
  HabitError,
  archiveHabit as serviceArchive,
  createHabit as serviceCreate,
  editHabit as serviceEdit,
  habitConsistency as serviceConsistency,
  listHabitChoices as serviceChoices,
  listHabitCompletions as serviceCompletions,
  listStaffHabits as serviceListStaff,
  listTodayHabits as serviceListToday,
  setHabitLog as serviceSetLog,
  type HabitCompletionRow,
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
  return sharedFail(CLOSED_MESSAGES, code);
}

// Raw serialization failures can still reach here from unwrapped
// paths (e.g. a FOR UPDATE conflict under RepeatableRead — P2034 for
// typed ops, P2010/40001 for raw statements) — the serializationConflict
// backstop maps them to the honest retry vocabulary, never a
// misleading not_available.
function mapError<T>(error: unknown): HabitSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    domain: (e) => {
      if (!(e instanceof HabitError)) return null;
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

async function guard<T>(fn: () => Promise<T>): Promise<HabitSafeResult<T>> {
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

export const createHabitFromAction = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    name: unknown;
    target: unknown;
    reason?: unknown;
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
    reason?: unknown;
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
): Promise<
  HabitSafeResult<{
    habits: TodayHabitView[];
    hasMore: boolean;
    /** The server-UTC day the cohort was computed for (mark/undo date). */
    date: string;
  }>
> => guard(() => serviceListToday(session as never, input, deps));

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

/** PR-M7 — the canvas "Recorded completions" aside (all-time counts). */
export const readHabitCompletions = (
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId?: string;
    fields?: unknown;
  },
  deps: HabitDeps = {},
): Promise<HabitSafeResult<{ habits: HabitCompletionRow[] }>> =>
  guard(() => serviceCompletions(session as never, input, deps));
