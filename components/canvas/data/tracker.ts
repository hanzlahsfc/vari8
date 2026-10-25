// Tracker domain provider (PR-W0). Owns the per-client daily tracker
// entries and goals of the coach store and the ethereal client-tracker
// draft key (configuration, entries and coach comments). PR-W4 wires this
// domain to the server; it edits this file only.

import type { CoachClient, CoachState } from "../coach/model";
import {
  emptyClientPlans,
  type ClientGoal,
  type ClientPlans,
} from "../coach/plans/types";
import {
  parameters,
  type TrackerConfig,
  type TrackerEntry,
} from "../ethereal/client-tracker/model";
import { apiFetch } from "./http";
import { type CoachSlice, readStorage, writeJson } from "./provider";

export const TRACKER_KEY = "coach-data-tracker-v1";

type TrackerData = {
  /** Daily entries per client id. */
  entries: Record<string, CoachClient["entries"]>;
  /** Client goals per client id (G10: goals belong to the tracker wiring). */
  goals: Record<string, ClientGoal[]>;
  /** Date-less metric targets per client id; same family as goals. */
  otherTargets?: Record<string, ClientPlans["otherTargets"]>;
};

export const trackerSlice: CoachSlice = {
  key: TRACKER_KEY,
  extract: (state): TrackerData => ({
    entries: Object.fromEntries(
      state.clients.map((client) => [client.id, client.entries]),
    ),
    goals: Object.fromEntries(
      state.clients.flatMap((client) =>
        client.plans ? [[client.id, client.plans.goals]] : [],
      ),
    ),
    otherTargets: Object.fromEntries(
      state.clients.flatMap((client) =>
        client.plans ? [[client.id, client.plans.otherTargets]] : [],
      ),
    ),
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid tracker slice");
    const data = slice as Partial<TrackerData>;
    if (data.entries && typeof data.entries === "object")
      for (const client of state.clients)
        if (client.id in data.entries)
          client.entries = data.entries[client.id];
    if (data.goals && typeof data.goals === "object")
      for (const client of state.clients) {
        const goals = data.goals[client.id];
        if (goals !== undefined)
          (client.plans ??= emptyClientPlans()).goals = goals;
      }
    if (data.otherTargets && typeof data.otherTargets === "object")
      for (const client of state.clients) {
        const targets = data.otherTargets[client.id];
        if (targets !== undefined)
          (client.plans ??= emptyClientPlans()).otherTargets = targets;
      }
  },
};

// --- Ethereal client tracker draft ---

/**
 * PR-W1 (S11-18): the draft key and the upper date bound come from the pinned
 * client identity — the studio demo passes "coaching-client-tracker-maya-v1"
 * with asOf 2026-10-08; `/me` passes the viewer's own profile key and today.
 */
export type ClientTrackerIdentityRef = { storageKey: string; asOf: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const allowedIds = new Set(parameters.map((parameter) => parameter.id));

export type ClientTrackerDraft = {
  config: TrackerConfig;
  entries: TrackerEntry[];
  comments: Record<string, string>;
};

/**
 * Reads and sanitizes the stored tracker draft. Returns null when nothing is
 * stored, the JSON is unreadable, or the shape is unusable — the caller then
 * starts from the sample data, exactly like the inline read it replaces.
 */
export function readClientTrackerDraft(
  identity: ClientTrackerIdentityRef,
): ClientTrackerDraft | null {
  try {
    const raw = readStorage(identity.storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      config?: TrackerConfig & { parameterIds?: unknown };
      entries?: TrackerEntry[];
      comments?: Record<string, string>;
    };
    const config = data?.config;
    if (!config || !Array.isArray(config.parameterIds)) return null;
    const parameterIds = [
      ...new Set(
        config.parameterIds.filter(
          (id: unknown) => typeof id === "string" && allowedIds.has(id),
        ),
      ),
    ] as string[];
    if (!parameterIds.length) return null;
    const summaryParameterIds = Array.isArray(config.summaryParameterIds)
      ? [
          ...new Set(
            (config.summaryParameterIds as unknown[]).filter(
              (id): id is string =>
                typeof id === "string" &&
                parameterIds.includes(id) &&
                parameters.some(
                  (parameter) =>
                    parameter.id === id &&
                    (parameter.kind === "number" ||
                      parameter.kind === "rating"),
                ),
            ),
          ),
        ].slice(0, 4)
      : undefined;
    const safeConfig: TrackerConfig = {
      parameterIds,
      ...(summaryParameterIds === undefined ? {} : { summaryParameterIds }),
      weightUnit: config.weightUnit === "lb" ? "lb" : "kg",
      lengthUnit: config.lengthUnit === "in" ? "in" : "cm",
      waterUnit: config.waterUnit === "fl oz" ? "fl oz" : "L",
      ratingScale: ["1-10", "1-5", "words"].includes(config.ratingScale)
        ? config.ratingScale
        : "1-10",
    };
    const entries: TrackerEntry[] = Array.isArray(data.entries)
      ? data.entries.flatMap((entry: TrackerEntry) => {
          if (
            !entry ||
            typeof entry.date !== "string" ||
            !DATE_RE.test(entry.date) ||
            entry.date > identity.asOf ||
            !entry.values ||
            typeof entry.values !== "object"
          )
            return [];
          const values: Record<string, number | null> = {};
          for (const parameter of parameters) {
            const value = entry.values[parameter.id];
            values[parameter.id] =
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= parameter.min &&
              value <= parameter.max
                ? value
                : null;
          }
          return [{ date: entry.date, values }];
        })
      : [];
    const comments: Record<string, string> = {};
    if (data.comments && typeof data.comments === "object") {
      for (const [key, value] of Object.entries(data.comments)) {
        const [date, id] = key.split(":");
        if (
          DATE_RE.test(date) &&
          date <= identity.asOf &&
          allowedIds.has(id) &&
          typeof value === "string" &&
          value.trim()
        )
          comments[key] = value.slice(0, 2000);
      }
    }
    return { config: safeConfig, entries, comments };
  } catch {
    return null;
  }
}

export function writeClientTrackerDraft(
  identity: ClientTrackerIdentityRef,
  draft: ClientTrackerDraft,
): void {
  writeJson(identity.storageKey, {
    version: 1,
    config: draft.config,
    entries: draft.entries,
    comments: draft.comments,
  });
}

/* -------------------------------------------------------------------------
 * Card 05a remote surface: the own daily-entry routes the real client
 * tracker reads and writes through. Wire shapes mirror
 * `lib/daily-entry/service.ts`; duplicated here so the canvas never imports
 * server modules.
 * ---------------------------------------------------------------------- */

export type DailyEntrySurfaceItemWire = {
  ordinal: number;
  parameterKey: string;
  label: string;
  helpText: string | null;
  unit: string | null;
  kind: string;
  required: boolean;
  ratingScheme: string | null;
  options: { ordinal: number; label: string }[];
  validation: { min: number | null; max: number | null } | null;
  current: string;
};

export type DailyEntrySurfaceSectionWire = {
  sectionKey: string;
  label: string;
  items: DailyEntrySurfaceItemWire[];
};

export type DailyEntryHistoryRowWire = {
  parameterKey: string;
  label: string;
  unit: string | null;
  display: string;
};

export type DailyEntryHistoryEntryWire = {
  entryDate: string;
  declaredAt: string;
  revisionCount: number;
  values: DailyEntryHistoryRowWire[];
};

export type DailyEntrySurfaceWire =
  | {
      state: "ready";
      formToken: string;
      entryDate: string;
      sections: DailyEntrySurfaceSectionWire[];
      history: DailyEntryHistoryEntryWire[];
    }
  | { state: "not_applicable" }
  | { state: "unavailable" }
  | { state: "ineligible" }
  | { state: "consent_missing" };

/** GET daily-entries?date= — the caller's own surface for `date` (or today). */
export function fetchDailyEntrySurface(
  workspaceId: string,
  date?: string,
): Promise<DailyEntrySurfaceWire> {
  const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<DailyEntrySurfaceWire>(
    `/workspaces/${workspaceId}/daily-entries${suffix}`,
  );
}

/** PUT daily-entries/:date — one save against the caller's own day entry. */
export function saveDailyEntryRemote(
  workspaceId: string,
  entryDate: string,
  input: {
    formToken: string;
    values: { ordinal: number; raw: string }[];
  },
): Promise<{ status: "saved"; revisionSeq: number } | { status: "no_op" }> {
  return apiFetch(`/workspaces/${workspaceId}/daily-entries/${entryDate}`, {
    method: "PUT",
    body: input,
  });
}

export type StaffDailyEntryHistoryWire =
  | {
      state: "ready";
      clientName: string;
      items: {
        entryDate: string;
        revisionCount: number;
        currentRevisionSeq: number | null;
      }[];
      nextCursor: string | null;
    }
  | { state: "consent_missing" };

/** GET clients/:clientProfileId/daily-entries/history — the staff page. */
export function fetchStaffDailyEntryHistory(
  workspaceId: string,
  clientProfileId: string,
  cursor?: string,
): Promise<StaffDailyEntryHistoryWire> {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch<StaffDailyEntryHistoryWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/daily-entries/history${suffix}`,
  );
}
