// Tracker domain provider (PR-W0). Owns the per-client daily tracker
// entries and goals of the coach store and the ethereal client-tracker
// draft key (configuration, entries and coach comments). PR-W4 wires this
// domain to the server; it edits this file only.

import type { CoachClient, CoachState } from "../coach/model";
import {
  emptyClientPlans,
  type ClientGoal,
} from "../coach/plans/types";
import {
  parameters,
  type TrackerConfig,
  type TrackerEntry,
} from "../ethereal/client-tracker/model";
import { type CoachSlice, readStorage, writeJson } from "./provider";

export const TRACKER_KEY = "coach-data-tracker-v1";

type TrackerData = {
  /** Daily entries per client id. */
  entries: Record<string, CoachClient["entries"]>;
  /** Client goals per client id (G10: goals belong to the tracker wiring). */
  goals: Record<string, ClientGoal[]>;
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
  },
};

// --- Ethereal client tracker draft (coaching-client-tracker-maya-v1) ---

const CLIENT_TRACKER_KEY = "coaching-client-tracker-maya-v1";
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
export function readClientTrackerDraft(): ClientTrackerDraft | null {
  try {
    const raw = readStorage(CLIENT_TRACKER_KEY);
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
            !/^2026-\d{2}-\d{2}$/.test(entry.date) ||
            entry.date > "2026-10-08" ||
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
          /^2026-\d{2}-\d{2}$/.test(date) &&
          date <= "2026-10-08" &&
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

export function writeClientTrackerDraft(draft: ClientTrackerDraft): void {
  writeJson(CLIENT_TRACKER_KEY, {
    version: 1,
    config: draft.config,
    entries: draft.entries,
    comments: draft.comments,
  });
}
