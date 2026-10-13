"use client";

/**
 * Autosave coordinator (I1-R5): pending drafts, queued saves and
 * confirmed revisions live in a module-level slot keyed by
 * `userId:workspaceId:clientProfileId` — independent of whether the
 * editor component is currently mounted.
 *
 * - Unmount detaches observers only; debounce timers and in-flight
 *   saves run to completion (Back/Forward on engines without the
 *   Navigation API can no longer strand a pending edit).
 * - A terminal failed/denied/conflict keeps the draft + honest state
 *   so returning to the editor restores it — never a false "Saved".
 * - A bind under a different userId purges all slots — session/user
 *   changes cannot replay a previous user's retained work. LoginForm
 *   also calls `clearAllDashboardSlots()` at the login boundary.
 * - `abandon` (Leave anyway) cancels debounce + queued work; an
 *   already-dispatched request may still commit — the UI wording says
 *   so explicitly.
 * - Every save still goes through the injected server action, which
 *   re-authorizes each write inside its serialized transaction.
 */

import {
  canonicalizeDashboardConfig,
  type DashboardConfig,
} from "./config-schema";
import type { DashboardSafeResult } from "./boundary";
import {
  clearHeldNavigation,
  completeHeldNavigation,
  heldNavigation,
} from "./navigation-guard";

export type AutosaveState =
  "idle" | "saving" | "saved" | "failed" | "conflict" | "denied" | "readonly";

export type AutosaveSaveResult = DashboardSafeResult<{
  revision: number;
  config: DashboardConfig;
}>;

export type AutosaveActions = {
  save(input: {
    workspaceId: string;
    clientProfileId: string;
    config: DashboardConfig;
    expectedRevision: number;
  }): Promise<AutosaveSaveResult>;
  reload(input: { workspaceId: string; clientProfileId: string }): Promise<
    DashboardSafeResult<{
      layout: { revision: number; config: DashboardConfig } | null;
    }>
  >;
};

export type AutosaveSlot = {
  key: string;
  userId: string;
  workspaceId: string;
  clientProfileId: string;
  canEdit: boolean;
  actions: AutosaveActions;
  /** the draft — survives unmount */
  latestConfig: DashboardConfig;
  /** last server-confirmed revision */
  confirmedRevision: number;
  dirty: boolean;
  inFlight: boolean;
  queued: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  retries: number;
  history: { past: DashboardConfig[]; future: DashboardConfig[] };
  saveState: AutosaveState;
  leavePrompt: boolean;
  listeners: Set<() => void>;
};

const MAX_SAVE_ATTEMPTS = 3;
const DEBOUNCE_MS = 500;
/** bounded retention: clean slots are evicted oldest-first beyond this
 * cap; dirty/pending/failed slots are NEVER evicted — they hold the
 * user's recoverable work. */
const MAX_CLEAN_SLOTS = 8;

const slots = new Map<string, AutosaveSlot>();
let boundUserId: string | null = null;

const ephemeralSlot = (input: {
  userId: string;
  workspaceId: string;
  clientProfileId: string;
  initialConfig: DashboardConfig;
  initialRevision: number;
  canEdit: boolean;
  actions: AutosaveActions;
}): AutosaveSlot => ({
  key: `${input.userId}:${input.workspaceId}:${input.clientProfileId}`,
  userId: input.userId,
  workspaceId: input.workspaceId,
  clientProfileId: input.clientProfileId,
  canEdit: input.canEdit,
  actions: input.actions,
  latestConfig: input.initialConfig,
  confirmedRevision: input.initialRevision,
  dirty: false,
  inFlight: false,
  queued: false,
  timer: null,
  retries: 0,
  history: { past: [], future: [] },
  saveState: input.canEdit ? "idle" : "readonly",
  leavePrompt: false,
  listeners: new Set(),
});

const emit = (slot: AutosaveSlot) => {
  slot.listeners.forEach((l) => l());
};

export const slotPending = (slot: AutosaveSlot) =>
  slot.dirty || slot.inFlight || slot.queued || slot.timer !== null;

/** The slot currently holding pending work — used by the navigation
 * guard so popstate/navigate interception stays live even after the
 * editor view has unmounted. */
export const anyPendingSlot = (): AutosaveSlot | null => {
  for (const slot of slots.values()) if (slotPending(slot)) return slot;
  return null;
};

export const subscribeDashboardSlot = (
  slot: AutosaveSlot,
  listener: () => void,
): (() => void) => {
  slot.listeners.add(listener);
  return () => {
    slot.listeners.delete(listener);
  };
};

export const cancelSlotTimer = (slot: AutosaveSlot) => {
  if (slot.timer) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }
};

/** Flush whichever slot holds pending work — safe to call from global
 * listeners; a no-op when nothing is pending. */
export const flushPendingSlot = () => {
  const slot = anyPendingSlot();
  if (slot) {
    cancelSlotTimer(slot);
    void flushDashboardSlot(slot);
  }
};

export const cancelPendingTimer = () => {
  const slot = anyPendingSlot();
  if (slot) cancelSlotTimer(slot);
};

export async function flushDashboardSlot(
  slot: AutosaveSlot,
  attempt = 1,
): Promise<void> {
  if (slot.inFlight) {
    slot.queued = true;
    return;
  }
  slot.inFlight = true;
  slot.saveState = "saving";
  emit(slot);
  const snapshot = slot.latestConfig;
  const expected = slot.confirmedRevision;
  const releaseNavIfResolved = () => {
    if (!slot.queued) completeHeldNavigation();
  };
  let result: AutosaveSaveResult;
  try {
    result = await slot.actions.save({
      workspaceId: slot.workspaceId,
      clientProfileId: slot.clientProfileId,
      config: snapshot,
      expectedRevision: expected,
    });
  } catch {
    result = {
      ok: false,
      code: "not_available",
      message: "",
    } as AutosaveSaveResult;
  }
  slot.inFlight = false;

  if (result.ok) {
    slot.retries = 0;
    slot.confirmedRevision = result.value.revision;
    slot.dirty = slot.queued;
    slot.saveState = "saved";
    releaseNavIfResolved();
  } else if (result.code === "denied") {
    // truthful denial (e.g. revoked mid-save) — never "conflict"
    slot.saveState = "denied";
  } else if (
    result.code === "conflict" ||
    result.code === "serialization_conflict"
  ) {
    const reload = await slot.actions.reload({
      workspaceId: slot.workspaceId,
      clientProfileId: slot.clientProfileId,
    });
    if (!reload.ok) {
      // denied/failed reconciliation stays truthful
      slot.saveState = reload.code === "denied" ? "denied" : "failed";
    } else {
      const serverLayout = reload.value.layout;
      if (
        serverLayout &&
        canonicalizeDashboardConfig(serverLayout.config) ===
          canonicalizeDashboardConfig(snapshot)
      ) {
        slot.retries = 0;
        slot.confirmedRevision = serverLayout.revision;
        slot.dirty = slot.queued;
        slot.saveState = "saved";
        // reconcile proved the submitted content committed — a held
        // navigation may proceed on the confirmed revision
        releaseNavIfResolved();
      } else {
        slot.saveState = "conflict";
      }
    }
  } else {
    // bounded retry with backoff on ambiguous/failed saves
    if (attempt < MAX_SAVE_ATTEMPTS) {
      slot.retries = attempt;
      slot.timer = setTimeout(() => {
        slot.timer = null;
        void flushDashboardSlot(slot, attempt + 1);
      }, 1000 * attempt);
      slot.saveState = "saving";
    } else {
      slot.saveState = "failed";
    }
  }
  // a waiting navigation whose save did not cleanly commit requires
  // an explicit discard decision — never a silent leave
  const terminal =
    !result.ok &&
    (result.code === "denied" ||
      result.code === "conflict" ||
      attempt >= MAX_SAVE_ATTEMPTS);
  if (heldNavigation() && terminal) slot.leavePrompt = true;
  if (slot.queued) {
    slot.queued = false;
    emit(slot);
    void flushDashboardSlot(slot);
    return;
  }
  emit(slot);
}

export const scheduleDashboardSlot = (slot: AutosaveSlot) => {
  cancelSlotTimer(slot);
  slot.timer = setTimeout(() => {
    slot.timer = null;
    void flushDashboardSlot(slot);
  }, DEBOUNCE_MS);
};

export const commitDashboardConfig = (
  slot: AutosaveSlot,
  next: DashboardConfig,
) => {
  slot.history.past.push(slot.latestConfig);
  slot.history.future = [];
  slot.latestConfig = next;
  slot.dirty = true;
  if (slot.saveState !== "readonly") slot.saveState = "saving";
  scheduleDashboardSlot(slot);
  emit(slot);
};

export const travelDashboardConfig = (
  slot: AutosaveSlot,
  dir: "undo" | "redo",
) => {
  const stack = dir === "undo" ? slot.history.past : slot.history.future;
  const target = dir === "undo" ? slot.history.future : slot.history.past;
  const prev = stack.pop();
  if (!prev) return;
  target.push(slot.latestConfig);
  slot.latestConfig = prev;
  slot.dirty = true;
  scheduleDashboardSlot(slot);
  emit(slot);
};

/** Leave anyway: cancel debounce + queued work and let any held
 * navigation complete. An already-dispatched request may still commit
 * server-side — the UI wording states that honestly. */
export const abandonDashboardSlot = (slot: AutosaveSlot) => {
  cancelSlotTimer(slot);
  slot.queued = false;
  slot.dirty = false;
  slot.leavePrompt = false;
  if (!slot.inFlight) slot.saveState = slot.canEdit ? "idle" : "readonly";
  emit(slot);
};

export const stayDashboardSlot = (slot: AutosaveSlot) => {
  slot.leavePrompt = false;
  clearHeldNavigation();
  emit(slot);
};

/** Explicit user reset: re-read the server state into the slot. */
export const reloadDashboardSlot = async (slot: AutosaveSlot) => {
  const r = await slot.actions.reload({
    workspaceId: slot.workspaceId,
    clientProfileId: slot.clientProfileId,
  });
  if (r.ok && r.value.layout) {
    slot.latestConfig = r.value.layout.config;
    slot.confirmedRevision = r.value.layout.revision;
    slot.dirty = false;
    slot.saveState = slot.canEdit ? "idle" : "readonly";
    emit(slot);
  }
};

export const acquireDashboardSlot = (input: {
  userId: string;
  workspaceId: string;
  clientProfileId: string;
  initialConfig: DashboardConfig;
  initialRevision: number;
  canEdit: boolean;
  actions: AutosaveActions;
}): AutosaveSlot => {
  // SSR boundary: server rendering has no window — return a per-call
  // ephemeral slot that never registers in the shared map and never
  // binds the user. Two concurrent server renders cannot share retained
  // drafts, and server state stays deterministic per request.
  if (typeof window === "undefined") {
    // SSR marker omitted — too noisy
    return ephemeralSlot(input);
  }
  // session/user change: a different userId can never see or replay a
  // previous user's retained drafts
  if (boundUserId !== null && boundUserId !== input.userId) slots.clear();
  boundUserId = input.userId;
  const key = `${input.userId}:${input.workspaceId}:${input.clientProfileId}`;
  const existing = slots.get(key);
  if (existing) {
    existing.canEdit = input.canEdit;
    // reuse the slot only while it carries uncommitted or unresolved
    // work — a fully clean slot re-bases onto fresh server truth, but
    // ONLY when the props are actually newer than the slot's confirmed
    // revision: a restored history entry may serve a stale RSC payload
    // whose initialRevision predates the slot's committed save
    if (
      !slotPending(existing) &&
      !existing.leavePrompt &&
      (existing.saveState === "idle" ||
        existing.saveState === "saved" ||
        existing.saveState === "readonly") &&
      input.initialRevision > existing.confirmedRevision
    ) {
      existing.latestConfig = input.initialConfig;
      existing.confirmedRevision = input.initialRevision;
      existing.saveState = input.canEdit ? "idle" : "readonly";
    }
    return existing;
  }
  const slot: AutosaveSlot = {
    key,
    userId: input.userId,
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    canEdit: input.canEdit,
    actions: input.actions,
    latestConfig: input.initialConfig,
    confirmedRevision: input.initialRevision,
    dirty: false,
    inFlight: false,
    queued: false,
    timer: null,
    retries: 0,
    history: { past: [], future: [] },
    saveState: input.canEdit ? "idle" : "readonly",
    leavePrompt: false,
    listeners: new Set(),
  };
  // bounded clean-slot retention: evict the oldest CLEAN slot when the
  // cap is exceeded. Pending/failed/prompting slots are never evicted —
  // they carry the user's uncommitted work.
  if (slots.size >= MAX_CLEAN_SLOTS) {
    for (const [k, s] of slots) {
      if (
        !slotPending(s) &&
        !s.leavePrompt &&
        (s.saveState === "idle" ||
          s.saveState === "saved" ||
          s.saveState === "readonly")
      ) {
        slots.delete(k);
        break;
      }
    }
  }
  slots.set(key, slot);
  return slot;
};

/** Login boundary + explicit session teardown: drop every retained
 * draft/queued save. Already-dispatched requests are unaffected — they
 * may still commit server-side. */
export const clearAllDashboardSlots = () => {
  for (const slot of slots.values()) cancelSlotTimer(slot);
  slots.clear();
  boundUserId = null;
};
