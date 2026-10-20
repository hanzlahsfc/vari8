// Clients domain provider (PR-W0). Owns the roster slice of the persisted
// coach state and the ethereal client-workspace draft key. PR-W2 wires this
// domain to the server; it edits this file only.

import type { CoachClient, CoachState } from "../coach/model";
import type { WorkspaceClient } from "../ethereal/clients/model";
import { type CoachSlice, readStorage, writeJson } from "./provider";

export const CLIENTS_KEY = "coach-data-clients-v1";

/** Client record minus the collections owned by other domain slices. */
export type ClientCore = Omit<
  CoachClient,
  "assignment" | "schedules" | "plans" | "entries" | "habits" | "retiredHabits"
>;

/**
 * The roster slice: every client core. `assignment` is owned by the templates
 * slice, `schedules` by checkins, `plans` by nutrition, training and tracker,
 * `entries` by tracker, and `habits`/`retiredHabits` by habits — each merge
 * folds its own data back onto these cores, in registry order.
 */
export const clientsSlice: CoachSlice = {
  key: CLIENTS_KEY,
  extract: (state) =>
    state.clients.map((client) => {
      const core = { ...client } as Partial<CoachClient>;
      delete core.assignment;
      delete core.schedules;
      delete core.plans;
      delete core.entries;
      delete core.habits;
      delete core.retiredHabits;
      return core;
    }),
  merge: (slice, state) => {
    if (!Array.isArray(slice)) throw new Error("Invalid clients slice");
    // Cores stay incomplete until the per-domain merges run; isCoachState is
    // the gate before the assembled state is used.
    state.clients = slice as CoachClient[];
  },
};

// --- Ethereal client workspace draft (coaching-clients-workspace-v1) ---

export type Invitation = { name: string; email: string };
export type ClientsWorkspaceSnapshot = {
  clients?: WorkspaceClient[];
  invitations?: Invitation[];
};

const ETHEREAL_CLIENTS_KEY = "coaching-clients-workspace-v1";

export function isWorkspaceClient(value: unknown): value is WorkspaceClient {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    [
      "id",
      "name",
      "initials",
      "email",
      "label",
      "phase",
      "coachingSince",
      "recurringCheckIn",
      "template",
      "checkInStatus",
    ].every((key) => typeof item[key] === "string") &&
    [
      "week",
      "unreadCount",
      "overdueTaskCount",
      "heightCm",
      "bodyweightKg",
      "trainingFlags",
    ].every((key) => typeof item[key] === "number") &&
    [
      "additionalCheckInDates",
      "clientTasks",
      "coachTasks",
      "internalNotes",
      "generalNotes",
      "checkIns",
      "messages",
      "onboarding",
      "weightTrend",
    ].every((key) => Array.isArray(item[key])) &&
    typeof item.priorityMessages === "boolean"
  );
}

const isInvitation = (item: unknown): item is Invitation =>
  !!item &&
  typeof (item as Invitation).name === "string" &&
  typeof (item as Invitation).email === "string";

/**
 * Reads the stored workspace draft. Undefined when nothing is stored;
 * malformed JSON throws so the caller can show its usual recovery notice.
 * Each half applies independently, exactly like the inline read it replaces.
 */
export function loadClientsWorkspace(): ClientsWorkspaceSnapshot | undefined {
  const raw = readStorage(ETHEREAL_CLIENTS_KEY);
  if (!raw) return undefined;
  const saved = JSON.parse(raw) as {
    clients?: unknown;
    invitations?: unknown;
  };
  const snapshot: ClientsWorkspaceSnapshot = {};
  if (Array.isArray(saved.clients) && saved.clients.every(isWorkspaceClient))
    snapshot.clients = saved.clients;
  if (Array.isArray(saved.invitations))
    snapshot.invitations = saved.invitations.filter(isInvitation);
  return snapshot;
}

export function saveClientsWorkspace(snapshot: {
  clients: WorkspaceClient[];
  invitations: Invitation[];
}): void {
  writeJson(ETHEREAL_CLIENTS_KEY, {
    version: 1,
    clients: snapshot.clients,
    invitations: snapshot.invitations,
  });
}
