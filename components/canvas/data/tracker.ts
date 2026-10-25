// Tracker domain provider (PR-W0). Owns the per-client daily tracker
// entries and goals of the coach store and the ethereal client-tracker
// draft key (configuration, entries and coach comments). PR-W4 wires this
// domain to the server; it edits this file only.

import type { CoachClient } from "../coach/model";
import type {
  TrackerConfig as PreviewTrackerConfig,
  TrackerParameter,
} from "../coach/client-tracker-preview/preview-model";
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

export type DailyEntrySurfaceReadyWire = {
  state: "ready";
  formToken: string;
  entryDate: string;
  sections: DailyEntrySurfaceSectionWire[];
  history: DailyEntryHistoryEntryWire[];
};

export type DailyEntrySurfaceWire =
  | DailyEntrySurfaceReadyWire
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

// ---------------------------------------------------------------------------
// Card 05a: daily-entry surface -> TrackingView adapter (pure functions, the
// mapping unit tests exercise). Server values stay untouched by the preview
// model's per-field unit conversion because remote parameter ids carry the
// `srv-` prefix, which matches none of its special-cased ids.
// ---------------------------------------------------------------------------

const REMOTE_PARAMETER_PREFIX = "srv-";

export const remoteParameterId = (key: string) =>
  `${REMOTE_PARAMETER_PREFIX}${key}`;

export type RemoteParameterMeta = {
  /** `srv-`-prefixed id used inside the tracker model. */
  id: string;
  /** Server parameterKey the entry and history payloads carry. */
  key: string;
  /** Positional ordinal the save payload addresses. */
  ordinal: number;
  kind: DailyEntrySurfaceItemWire["kind"];
  ratingScheme: DailyEntrySurfaceItemWire["ratingScheme"];
  optionLabels: string[];
};

export type RemoteTrackerViewModel = {
  config: PreviewTrackerConfig;
  parameterGroups: Record<string, string>;
  metas: RemoteParameterMeta[];
};

const REMOTE_NUMBER_MIN = -1e12;
const REMOTE_NUMBER_MAX = 1e12;

function remoteParameter(item: DailyEntrySurfaceItemWire): TrackerParameter {
  const id = remoteParameterId(item.parameterKey);
  const base = {
    id,
    label: item.label || item.parameterKey,
    categoryId: "",
    decimals: 0,
  };
  if (item.kind === "OPTION") {
    return {
      ...base,
      unit: "",
      kind: "number",
      summary: "latest",
      min: 0,
      max: 0,
      inputType: "choice",
      options: item.options.map((option) => option.label),
    };
  }
  if (item.kind === "TEXT") {
    return {
      ...base,
      unit: "",
      kind: "number",
      summary: "latest",
      min: 0,
      max: 0,
      inputType: "text",
    };
  }
  if (item.kind === "RATING") {
    return {
      ...base,
      unit: "rating",
      kind: "rating",
      summary: "distribution",
      min: 1,
      max: 10,
    };
  }
  return {
    ...base,
    unit: item.unit ?? "",
    kind: "number",
    summary: "average",
    decimals: 2,
    min: item.validation?.min ?? REMOTE_NUMBER_MIN,
    max: item.validation?.max ?? REMOTE_NUMBER_MAX,
  };
}

/**
 * Map a ready surface into the shared tracker's config: one TrackerParameter
 * per surface item (surface order preserved), one category label per section.
 */
export function dailyEntrySurfaceToTrackerView(
  surface: DailyEntrySurfaceReadyWire,
): RemoteTrackerViewModel {
  const metas: RemoteParameterMeta[] = [];
  const definitions: TrackerParameter[] = [];
  const parameterGroups: Record<string, string> = {};
  const ratingScales: Record<string, "1-10" | "1-5"> = {};
  const fieldOptions: Record<string, string[]> = {};
  for (const section of surface.sections) {
    for (const item of section.items) {
      const parameter = remoteParameter(item);
      definitions.push(parameter);
      parameterGroups[parameter.id] = section.label || "Tracking";
      metas.push({
        id: parameter.id,
        key: item.parameterKey,
        ordinal: item.ordinal,
        kind: item.kind,
        ratingScheme: item.ratingScheme,
        optionLabels: item.options.map((option) => option.label),
      });
      if (item.kind === "RATING" && item.ratingScheme === "SCALE_1_5") {
        ratingScales[parameter.id] = "1-5";
      }
      if (item.kind === "OPTION") {
        fieldOptions[parameter.id] = item.options.map(
          (option) => option.label,
        );
      }
    }
  }
  return {
    config: {
      parameterIds: definitions.map((parameter) => parameter.id),
      parameterDefinitions: definitions,
      weightUnit: "kg",
      lengthUnit: "cm",
      waterUnit: "L",
      ratingScale: "1-10",
      ratingScales,
      fieldOptions,
    },
    parameterGroups,
    metas,
  };
}

export type RemoteDayData = {
  /** Numeric values the shared model stores (canonical; ratings 1-10 space). */
  values: Record<string, number>;
  /** Display strings for OPTION (option label) and TEXT items. */
  texts: Record<string, string>;
};

/**
 * Translate one wire `raw` into the shared model's display form. OPTION raws
 * are positional indexes into the snapshot option list, so display carries the
 * label; SCALE_1_5 ratings expand into the cell's canonical 1-10 space.
 */
export function remoteDisplayFromRaw(
  meta: RemoteParameterMeta,
  raw: string,
): { value?: number; text?: string } {
  if (raw === "") return {};
  if (meta.kind === "OPTION") {
    return { text: meta.optionLabels[Number(raw)] ?? "" };
  }
  if (meta.kind === "TEXT") return { text: raw };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return {};
  if (meta.kind === "RATING" && meta.ratingScheme === "SCALE_1_5") {
    return { value: 1 + ((parsed - 1) * 9) / 4 };
  }
  return { value: parsed };
}

export function remoteDayDataFromRaws(
  raws: Record<string, string>,
  metas: RemoteParameterMeta[],
): RemoteDayData {
  const values: Record<string, number> = {};
  const texts: Record<string, string> = {};
  for (const meta of metas) {
    const display = remoteDisplayFromRaw(meta, raws[meta.key] ?? "");
    if (display.value !== undefined) values[meta.id] = display.value;
    if (display.text !== undefined && display.text !== "")
      texts[meta.id] = display.text;
  }
  return { values, texts };
}

/** Seed the wire raws for one date from the surface's prefilled `current`. */
export function remoteRawsFromSurface(
  surface: DailyEntrySurfaceReadyWire,
): Record<string, string> {
  const raws: Record<string, string> = {};
  for (const section of surface.sections) {
    for (const item of section.items) {
      raws[item.parameterKey] = item.current;
    }
  }
  return raws;
}

/**
 * Display rows for one history entry. Keys missing from the current surface
 * (parameters later removed from the template) fall back to a numeric parse
 * so past numbers still trend; anything else lands in the text bucket where
 * it never renders because its id is not configured.
 */
export function remoteDayDataFromHistory(
  values: DailyEntryHistoryEntryWire["values"],
  metas: RemoteParameterMeta[],
): RemoteDayData {
  const metaByKey = new Map(metas.map((meta) => [meta.key, meta]));
  const result: RemoteDayData = { values: {}, texts: {} };
  for (const row of values) {
    const meta = metaByKey.get(row.parameterKey);
    const id = remoteParameterId(row.parameterKey);
    if (meta) {
      const display = remoteDisplayFromRaw(meta, row.display);
      if (meta.kind === "OPTION" || meta.kind === "TEXT") {
        // History display already carries the rendered label/text, not a raw.
        if (row.display !== "") result.texts[id] = row.display;
      } else if (display.value !== undefined) {
        result.values[id] = display.value;
      }
      continue;
    }
    const parsed = Number(row.display);
    if (row.display !== "" && Number.isFinite(parsed)) {
      result.values[id] = parsed;
    } else if (row.display !== "") {
      result.texts[id] = row.display;
    }
  }
  return result;
}

/** Rebuild the complete ordered save payload from the current raws. */
export function remoteOrdinalValues(
  metas: RemoteParameterMeta[],
  raws: Record<string, string>,
): { ordinal: number; raw: string }[] {
  return metas.map((meta) => ({
    ordinal: meta.ordinal,
    raw: raws[meta.key] ?? "",
  }));
}

/** Wire raw for a numeric edit; `null` clears the value. */
export function remoteRawFromNumber(
  meta: RemoteParameterMeta,
  value: number | null,
): string {
  if (value === null) return "";
  if (meta.kind === "RATING" && meta.ratingScheme === "SCALE_1_5") {
    return String(
      Math.max(1, Math.min(5, Math.round(((value - 1) * 4) / 9) + 1)),
    );
  }
  if (meta.kind === "RATING") return String(Math.round(value));
  return String(value);
}

/**
 * Wire raw for a text/choice edit. Choice edits carry the option label back,
 * so the raw is the label's positional index; an unknown or empty label
 * clears the value.
 */
export function remoteRawFromText(
  meta: RemoteParameterMeta,
  value: string,
): string {
  if (meta.kind === "OPTION") {
    const index = meta.optionLabels.indexOf(value);
    return index < 0 ? "" : String(index);
  }
  return value;
}
