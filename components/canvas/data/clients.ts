// Clients domain provider (PR-W0). Owns the roster slice of the persisted
// coach state and the ethereal client-workspace draft key.
//
// W2-A1: the client-detail fields (phases, internalNotes, generalNotes,
// weekNotes, plus the pin flag on internalNotes) also sync through
// /api/v1 via the functions below. The local slice still persists them so
// the seam keeps its full-state round-trip: the local copy is the cache and
// first paint, the remote reads overwrite it once they land.

import type { CoachClient } from "../coach/model";
import type { WorkspaceClient } from "../ethereal/clients/model";
import { apiFetch } from "./http";
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
 * `entries` by tracker, and `habits`/`retiredHabits` by habits - each merge
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
    // the gate before the assembled state is used. Envelopes stored before
    // the detail fields joined this slice carry no note arrays, so the
    // merge re-defaults them or the client guard rejects the whole state.
    state.clients = (slice as Partial<CoachClient>[]).map((client) => ({
      internalNotes: [],
      generalNotes: [],
      ...client,
    })) as CoachClient[];
  },
};

// --- W2-A1 remote detail wiring ---

/** Server note shape: PRIVATE notes may carry the pin flag. */
export type RemoteNote = { id: string; text: string; pinned?: boolean };
export type RemotePhase = {
  id: string;
  name: string;
  startDate: string;
  durationWeeks: number;
};
export type RemoteClientDetail = {
  clientProfileId: string;
  name: string;
  label: string | null;
  email: string | null;
  coachingSince: string | null;
  heightCm: number | null;
  phases: RemotePhase[];
  internalNotes: RemoteNote[];
  generalNotes: RemoteNote[];
  weekNotes: Record<string, string>;
};
export type ClientDetailBundle = {
  clients: RemoteClientDetail[];
  workspaceNotes: RemoteNote[];
};

/** Canonical note: the server omits `pinned` unless it is true. */
const canonicalNote = (note: { id: string; text: string; pinned?: boolean }) => ({
  id: note.id,
  text: note.text,
  ...(note.pinned === true ? { pinned: true } : {}),
});

/** The owned detail fields, normalized to the remote write shape. */
export function clientDetailPayload(client: CoachClient) {
  return {
    phases: client.phases ?? [],
    internalNotes: (client.internalNotes ?? []).map(canonicalNote),
    generalNotes: (client.generalNotes ?? []).map(canonicalNote),
    weekNotes: Object.fromEntries(
      Object.entries(client.weekNotes ?? {})
        .filter(([, body]) => body.trim())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  };
}

/**
 * A stable comparison key for the owned fields. It matches the shape a
 * server round-trip produces: unpinned notes carry no flag, empty week
 * notes are absent, and weekNotes keys are sorted because the server
 * returns them in week order while the local record may carry insertion
 * order.
 */
export function clientDetailKey(client: {
  phases?: CoachClient["phases"];
  internalNotes: CoachClient["internalNotes"];
  generalNotes: CoachClient["generalNotes"];
  weekNotes?: CoachClient["weekNotes"];
}): string {
  return JSON.stringify(clientDetailPayload(client as CoachClient));
}

/** Folds a remote detail into the local client record. */
export function mergeRemoteDetail(
  client: CoachClient,
  detail: RemoteClientDetail,
): CoachClient {
  return {
    ...client,
    label: detail.label ?? client.label,
    email: detail.email ?? client.email,
    coachingSince: detail.coachingSince ?? client.coachingSince,
    heightCm: detail.heightCm ?? client.heightCm,
    phases: detail.phases,
    internalNotes: detail.internalNotes,
    generalNotes: detail.generalNotes,
    weekNotes: detail.weekNotes,
  };
}

/** GET the workspace-wide detail bundle (all clients + workspace notes). */
export function fetchClientDetailBundle(
  workspaceId: string,
): Promise<ClientDetailBundle> {
  return apiFetch<ClientDetailBundle>(
    `/workspaces/${workspaceId}/client-detail`,
  );
}

/** PUT the owned detail collections for one client (full replace). */
export function putClientDetail(
  workspaceId: string,
  clientProfileId: string,
  client: CoachClient,
): Promise<RemoteClientDetail> {
  return apiFetch<RemoteClientDetail>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}`,
    { method: "PUT", body: clientDetailPayload(client) },
  );
}

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
