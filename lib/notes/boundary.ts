/**
 * PR-M3 coach-notes boundary — the only module the app layer touches.
 * Coach notes are product surface (no feature gate); every service error
 * maps to a closed, non-disclosing vocabulary.
 */
import { fail as sharedFail, mapError as sharedMapError } from "../boundary";
import {
  NoteError,
  createCoachNote as serviceCreate,
  updateCoachNoteBody as serviceUpdate,
  deleteCoachNote as serviceDelete,
  restoreCoachNote as serviceRestore,
  listCoachNotes as serviceList,
  listClientVisibleNotes as serviceListVisible,
  type NoteCaller,
  type NoteDeps,
  type NoteView,
} from "./service";

export type NoteSafeResult<T> =
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
  Extract<NoteSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to these notes.",
  invalid_input: "That note input wasn’t valid.",
  not_available: "This note isn’t available.",
  conflict: "The note changed — reload to continue.",
  serialization_conflict: "The note changed — please try again.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): NoteSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code);
}

function mapError<T>(error: unknown): NoteSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    domain: (e) => {
      if (!(e instanceof NoteError)) return null;
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

async function guard<T>(fn: () => Promise<T>): Promise<NoteSafeResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError<T>(error);
  }
}

export const createCoachNoteFromRoute = (
  caller: NoteCaller,
  input: {
    clientProfileId?: string | null;
    visibility: unknown;
    body: unknown;
  },
  deps: NoteDeps = {},
): Promise<NoteSafeResult<{ id: string; revision: number }>> =>
  guard(() => serviceCreate(caller, input, deps));

export const updateCoachNoteBodyFromRoute = (
  caller: NoteCaller,
  input: { noteId: string; body: unknown; expectedRevision: number },
  deps: NoteDeps = {},
): Promise<NoteSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceUpdate(caller, input, deps));

export const deleteCoachNoteFromRoute = (
  caller: NoteCaller,
  input: { noteId: string; expectedRevision: number },
  deps: NoteDeps = {},
): Promise<NoteSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceDelete(caller, input, deps));

export const restoreCoachNoteFromRoute = (
  caller: NoteCaller,
  input: { noteId: string },
  deps: NoteDeps = {},
): Promise<NoteSafeResult<{ revision: number; changed: boolean }>> =>
  guard(() => serviceRestore(caller, input, deps));

export const readCoachNotes = (
  caller: NoteCaller,
  input: { clientProfileId?: string | null } = {},
  deps: NoteDeps = {},
): Promise<NoteSafeResult<{ notes: NoteView[]; hasMore: boolean }>> =>
  guard(() => serviceList(caller, input, deps));

export const readClientVisibleNotes = (
  caller: NoteCaller,
  input: { clientProfileId?: string | null } = {},
  deps: NoteDeps = {},
): Promise<NoteSafeResult<{ notes: NoteView[]; hasMore: boolean }>> =>
  guard(() => serviceListVisible(caller, input, deps));
