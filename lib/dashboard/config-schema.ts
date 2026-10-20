/**
 * DASHBOARD-I1 (decision 108): bounded, allowlisted validation for the
 * persisted `client_dashboard_layout.config` document — the untrusted-
 * input contract. Allowlists are frozen from the pinned Lily source
 * (`ccef621`): `sourceOptions`/`summaryOptions` (model.ts:693–769),
 * `periodChoices` (gallery.tsx:1108–1150), inline option dropdowns
 * (gallery.tsx:580–700), `unitChoices`/`fieldChoices`/`targetAvailable`
 * (gallery.tsx:1152–1190), per-kind defaults (model.ts:465–685).
 * Fixture source ids (e.g. "exercise:deadlift") validate as shape only —
 * unconnected widgets render honest placeholders, never record queries.
 *
 * PR-M9 (D31): settings keep the current canvas optionality verbatim —
 * `labels` and `historyPeriod` are optional on the canvas WidgetSettings
 * (frontend/src/components/ethereal/builder/model.ts:25-37) and are
 * validated only when present, so a canvas DashboardDraft round-trips
 * unchanged through `lib/dashboard/adapter.ts`. `visibility` remains
 * required: it is the backend-only provenance the canvas has no field
 * for. The widget-id alphabet widened to accept canvas seed ids
 * (`seed-BN01`) alongside generated UUIDs.
 */

export type BreakpointName = "desktop" | "tablet" | "mobile";
export type WidgetVisibility = "staff" | "client";

export type WidgetSettings = {
  title: string;
  source: string;
  summary: string;
  period: string;
  historyPeriod?: "auto" | "3m" | "6m" | "1y";
  target: boolean;
  size: SizeName;
  fields: string[];
  labels?: Record<string, string>;
  option: string;
  unit: string;
  visibility: WidgetVisibility;
};

export type WidgetInstance = {
  id: string;
  kind: WidgetKind;
  settings: WidgetSettings;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  size: SizeName;
};
export type DashboardConfig = {
  version: 1;
  name: string;
  widgets: WidgetInstance[];
  layouts: Partial<Record<BreakpointName, Record<string, Rect>>>;
  widths: Partial<Record<BreakpointName, number>>;
};

const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;
const COLUMNS: Record<BreakpointName, number> = {
  desktop: 12,
  tablet: 6,
  mobile: 2,
};
const MIN_HEIGHT: Record<BreakpointName, number> = {
  desktop: 2,
  tablet: 2,
  mobile: 3,
};
const SIZES = ["Compact", "Regular", "Wide", "Tall", "Expanded"] as const;
export type SizeName = (typeof SIZES)[number];

export const WIDGET_KINDS = [
  "BN21",
  "BN01",
  "BN08",
  "BN15",
  "BN19",
  "TL26",
  "TL28",
  "TL06",
  "TL11",
  "TL14",
  "TL21",
  "TL22",
  "CU01",
  "CU02",
  "CU03",
  "CU04",
  "CU06",
  "CU09",
  "CU10",
  "CU16",
] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

// Placeholder-capable widget kinds whose data contract does not yet
// exist — every kind except the first-slice connected CU04/CU16.
export const CONNECTED_KINDS = new Set<WidgetKind>([
  "CU04",
  "CU16",
  "CU03",
  "TL21",
  "TL22",
]);

const SOURCE: Record<WidgetKind, readonly string[]> = {
  BN21: ["bodyweight", "waist", "steps"],
  BN01: ["bodyweight"],
  BN08: ["bodyweight"],
  BN15: ["nutrition:active", "nutrition:TD", "nutrition:NTD"],
  BN19: ["nutrition:active", "nutrition:TD", "nutrition:NTD"],
  TL26: ["workouts"],
  TL28: ["exercise:deadlift", "exercise:hip-thrust"],
  TL06: ["steps"],
  TL11: ["sleep"],
  TL14: ["recovery"],
  TL21: ["habits"],
  TL22: ["habits"],
  CU01: ["coaching:current"],
  CU02: ["roadmap:current-week"],
  CU03: ["tasks"],
  CU04: ["checkins"],
  CU06: ["feedback"],
  CU09: ["roadmap:selected"],
  CU10: ["milestones:published"],
  CU16: ["links"],
};

function summaryOptions(kind: WidgetKind, source: string): readonly string[] {
  switch (kind) {
    case "BN21":
      return source === "steps"
        ? ["latest", "average", "total"]
        : ["latest", "average"];
    case "BN01":
      return ["daily", "weekly-average"];
    case "BN08":
      return ["weekly-average-change", "weekly-history"];
    case "BN15":
      return ["daily"];
    case "BN19":
      return ["actual-target", "actual"];
    case "TL26":
      return ["current", "next", "both"];
    case "TL28":
      return ["load", "reps", "sets"];
    case "TL06":
      return ["latest", "average", "total"];
    case "TL11":
      return ["average", "latest", "history"];
    case "TL14":
      return ["latest", "distribution", "history"];
    case "TL21":
      return ["today"];
    case "TL22":
      return ["scheduled-statuses", "completion-count"];
    case "CU01":
      return ["phase-focus", "focus"];
    case "CU02":
      return ["selected-metrics"];
    case "CU03":
      return ["open", "completed", "both"];
    case "CU04":
      return ["status", "schedule", "submission"];
    case "CU06":
      return ["latest", "unread"];
    case "CU09":
      return ["weekly-trends", "latest-values"];
    case "CU10":
      return ["phase-progress"];
    case "CU16":
      return ["enabled"];
  }
}

// Frozen per-kind period sets: union of every periodChoices branch that
// kind can reach plus its model.ts default (gallery.tsx:1108–1150,
// chart-period-control.tsx:20–41).
const DAILY = ["today", "7d", "14d", "30d", "90d"];
const WEEKLY = ["4w", "8w", "12w"];
const LONG = ["week", "month", "6month", "year"];
const HABIT = ["today", "7d", "14d", "4w", "6w", "8w", "12w"];
const PERIOD: Record<WidgetKind, readonly string[]> = {
  BN21: [...DAILY, ...LONG],
  BN01: [...DAILY, ...LONG],
  BN08: [...WEEKLY, ...LONG],
  BN15: ["today"],
  BN19: [...DAILY, ...LONG],
  TL26: ["week"],
  TL28: [...WEEKLY, ...LONG],
  TL06: DAILY,
  TL11: [...DAILY, ...LONG],
  TL14: DAILY,
  TL21: HABIT,
  TL22: HABIT,
  CU01: ["current-week"],
  CU02: ["current-week"],
  CU03: DAILY,
  CU04: DAILY,
  CU06: DAILY,
  CU09: WEEKLY,
  CU10: ["current-phase"],
  CU16: [""],
};

// Frozen per-kind option sets: gallery.tsx dropdown options ∪ model.ts
// defaults ∪ "default".
const OPTION: Record<WidgetKind, readonly string[]> = {
  BN21: ["default"],
  BN01: ["default"],
  BN08: ["absolute", "percentage", "default"],
  BN15: ["circles", "lines", "active", "default"],
  BN19: ["line", "stacked", "single", "active", "default"],
  TL26: ["current", "next", "default"],
  TL28: ["default"],
  TL06: ["default"],
  TL11: ["hours", "default"],
  TL14: ["default"],
  TL21: ["list", "contributions", "default"],
  TL22: ["scheduled", "default"],
  CU01: ["published", "default"],
  CU02: ["current-week", "default"],
  CU03: ["open", "completed", "both", "default"],
  CU04: ["default", "scheduled", "recurring"],
  CU06: ["default"],
  CU09: ["selected", "default"],
  CU10: ["published", "default"],
  CU16: ["default"],
};

// Static field allowlists (fieldChoices). Connected kinds only —
// record-derived kinds (TL21/TL22/CU02/CU09/CU10) keep bounded opaque
// strings that are never resolved against health records.
const STATIC_FIELDS: Partial<Record<WidgetKind, readonly string[]>> = {
  BN15: ["protein", "carbs", "fat"],
  BN19: ["protein", "carbs", "fat", "calories"],
  TL26: ["exercise", "sets", "reps", "coach instructions"],
  TL14: ["energy", "stress", "readiness"],
  CU01: ["phase", "focus", "successCue"],
  CU16: ["Tracker", "Mealplan", "Training", "Check-in", "Habit Tracker"],
};

const TARGET_KINDS = new Set<WidgetKind>([
  "BN21",
  "TL06",
  "BN15",
  "BN19",
  "CU02",
  "CU09",
]);

const SETTING_KEYS = new Set([
  "title",
  "source",
  "summary",
  "period",
  "historyPeriod",
  "target",
  "size",
  "fields",
  "labels",
  "option",
  "unit",
  "visibility",
]);
const TOP_KEYS = new Set(["version", "name", "widgets", "layouts", "widths"]);

const LIMITS = {
  payloadBytes: 24 * 1024,
  widgets: 24,
  idPattern: /^[A-Za-z0-9-]{1,40}$/,
  string: 80,
  unit: 16,
  period: 40,
  fields: 8,
  labels: 8,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export type ValidationResult =
  { ok: true; config: DashboardConfig } | { ok: false; reason: string };

export function validateDashboardConfig(value: unknown): ValidationResult {
  const bytes = (() => {
    try {
      return Buffer.byteLength(JSON.stringify(value));
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  })();
  if (bytes > LIMITS.payloadBytes)
    return { ok: false, reason: "payload_too_large" };
  // explicit depth bound — objects/arrays nested beyond 6 levels reject
  // before any structural reading (P3-4)
  const depthOf = (v: unknown, d: number): number => {
    if (d > 6) return d;
    if (Array.isArray(v))
      return v.reduce<number>((m, i) => Math.max(m, depthOf(i, d + 1)), d);
    if (isObj(v))
      return Object.values(v).reduce<number>(
        (m, i) => Math.max(m, depthOf(i, d + 1)),
        d,
      );
    return d;
  };
  if (depthOf(value, 0) > 6) return { ok: false, reason: "depth" };
  if (!isObj(value)) return { ok: false, reason: "not_object" };
  for (const k of Object.keys(value))
    if (!TOP_KEYS.has(k)) return { ok: false, reason: "unknown_key" };
  if (value.version !== 1 && value.version !== undefined)
    return { ok: false, reason: "version" };
  if (typeof value.name !== "string" || value.name.length > 80)
    return { ok: false, reason: "name" };

  const widgets = value.widgets;
  if (!Array.isArray(widgets) || widgets.length > LIMITS.widgets)
    return { ok: false, reason: "widgets_count" };
  const ids = new Set<string>();
  const out: WidgetInstance[] = [];
  for (const w of widgets) {
    if (!isObj(w)) return { ok: false, reason: "widget_shape" };
    for (const k of Object.keys(w))
      if (!["id", "kind", "settings"].includes(k))
        return { ok: false, reason: "widget_key" };
    if (typeof w.id !== "string" || !LIMITS.idPattern.test(w.id))
      return { ok: false, reason: "widget_id" };
    if (ids.has(w.id)) return { ok: false, reason: "duplicate_id" };
    ids.add(w.id);
    const kind = w.kind as WidgetKind;
    if (!WIDGET_KINDS.includes(kind)) return { ok: false, reason: "kind" };
    const s = w.settings;
    if (!isObj(s)) return { ok: false, reason: "settings_shape" };
    for (const k of Object.keys(s))
      if (!SETTING_KEYS.has(k)) return { ok: false, reason: "settings_key" };
    const str = (k: keyof WidgetSettings) =>
      typeof s[k] !== "string" || (s[k] as string).length > LIMITS.string
        ? null
        : (s[k] as string);
    const title = str("title");
    const source = str("source");
    const summary = str("summary");
    const period = str("period");
    // Optional per the canvas WidgetSettings — absent stays absent; when
    // present it is a bounded string checked against the enum below.
    const historyPeriod =
      s.historyPeriod === undefined ? undefined : str("historyPeriod");
    const option = str("option");
    const unit = str("unit");
    const visibility = str("visibility");
    if (
      title === null ||
      source === null ||
      summary === null ||
      period === null ||
      historyPeriod === null ||
      option === null ||
      unit === null ||
      visibility === null
    )
      return { ok: false, reason: "settings_strings" };
    if (unit.length > LIMITS.unit || period.length > LIMITS.period)
      return { ok: false, reason: "settings_strings" };
    if (
      historyPeriod !== undefined &&
      !["auto", "3m", "6m", "1y"].includes(historyPeriod)
    )
      return { ok: false, reason: "history_period" };
    if (!SOURCE[kind].includes(source)) return { ok: false, reason: "source" };
    if (!summaryOptions(kind, source).includes(summary))
      return { ok: false, reason: "summary" };
    if (!PERIOD[kind].includes(period)) return { ok: false, reason: "period" };
    if (!OPTION[kind].includes(option)) return { ok: false, reason: "option" };
    if (visibility !== "staff" && visibility !== "client")
      return { ok: false, reason: "visibility" };
    if (typeof s.target !== "boolean" || (s.target && !TARGET_KINDS.has(kind)))
      return { ok: false, reason: "target" };
    if (!SIZES.includes(s.size as SizeName))
      return { ok: false, reason: "size" };
    if (!Array.isArray(s.fields) || s.fields.length > LIMITS.fields)
      return { ok: false, reason: "fields" };
    const allowed = STATIC_FIELDS[kind];
    for (const f of s.fields) {
      if (typeof f !== "string" || f.length === 0 || f.length > 40)
        return { ok: false, reason: "field_value" };
      if (allowed && !allowed.includes(f))
        return { ok: false, reason: "field_allowlist" };
    }
    if (
      s.labels !== undefined &&
      (!isObj(s.labels) || Object.keys(s.labels).length > LIMITS.labels)
    )
      return { ok: false, reason: "labels" };
    const fieldSet = new Set(s.fields as string[]);
    for (const k2 of Object.keys(s.labels ?? {}))
      if (!fieldSet.has(k2)) return { ok: false, reason: "labels" };
    for (const [k2, v2] of Object.entries(s.labels ?? {}))
      if (
        typeof k2 !== "string" ||
        k2.length > 40 ||
        typeof v2 !== "string" ||
        v2.length > LIMITS.string
      )
        return { ok: false, reason: "label_value" };
    const settings: WidgetSettings = {
      title,
      source,
      summary,
      period,
      target: s.target as boolean,
      size: s.size as SizeName,
      fields: s.fields as string[],
      option,
      unit,
      visibility: visibility as WidgetVisibility,
    };
    // Optional canvas settings are preserved verbatim — absent stays
    // absent so a draft converts back unchanged.
    if (historyPeriod !== undefined)
      settings.historyPeriod = historyPeriod as WidgetSettings["historyPeriod"];
    if (s.labels !== undefined)
      settings.labels = s.labels as Record<string, string>;
    out.push({
      id: w.id,
      kind,
      settings,
    });
  }

  const layouts = value.layouts;
  const widths = value.widths;
  if (!isObj(layouts) || !isObj(widths))
    return { ok: false, reason: "layout_shape" };
  const cleanLayouts: DashboardConfig["layouts"] = {};
  for (const [bp, rects] of Object.entries(layouts)) {
    if (!BREAKPOINTS.includes(bp as BreakpointName) || !isObj(rects))
      return { ok: false, reason: "breakpoint" };
    const columns = COLUMNS[bp as BreakpointName];
    const clean: Record<string, Rect> = {};
    for (const [id, r] of Object.entries(rects)) {
      if (!ids.has(id)) return { ok: false, reason: "orphan_rect" };
      if (!isObj(r)) return { ok: false, reason: "rect_shape" };
      for (const k of Object.keys(r))
        if (!["x", "y", "w", "h", "size"].includes(k))
          return { ok: false, reason: "rect_key" };
      if (
        ![r.x, r.y, r.w, r.h].every(Number.isSafeInteger) ||
        (r.x as number) < 0 ||
        (r.y as number) < 0 ||
        (r.w as number) < 1 ||
        (r.h as number) < 1 ||
        (r.x as number) + (r.w as number) > columns ||
        (r.h as number) < MIN_HEIGHT[bp as BreakpointName] ||
        (bp === "mobile" && r.w !== columns) ||
        !SIZES.includes(r.size as SizeName)
      )
        return { ok: false, reason: "rect_bounds" };
      clean[id] = r as unknown as Rect;
    }
    cleanLayouts[bp as BreakpointName] = clean;
  }
  // every widget must have a rect in every present breakpoint
  for (const w of out)
    for (const [bp, rects] of Object.entries(cleanLayouts))
      if (!rects[w.id]) return { ok: false, reason: "missing_rect" };

  const cleanWidths: DashboardConfig["widths"] = {};
  for (const [bp, w] of Object.entries(widths)) {
    if (!BREAKPOINTS.includes(bp as BreakpointName))
      return { ok: false, reason: "breakpoint" };
    if (typeof w !== "number" || !Number.isFinite(w) || w < 1 || w > 10000)
      return { ok: false, reason: "width" };
    cleanWidths[bp as BreakpointName] = w;
  }

  return {
    ok: true,
    config: {
      version: 1,
      name: value.name as string,
      widgets: out,
      layouts: cleanLayouts,
      widths: cleanWidths,
    },
  };
}

/**
 * Client-subset projection (owner rules 1/5/6): drop staff widgets and
 * their rects from every breakpoint, then produce a coherent geometry
 * with no dangling references. Provenance/revision never leaves the
 * staff read — this returns the client shape only.
 */
export function projectClientDashboardConfig(
  config: DashboardConfig,
): DashboardConfig {
  const widgets = config.widgets.filter(
    (w) => w.settings.visibility === "client",
  );
  const keep = new Set(widgets.map((w) => w.id));
  const layouts: DashboardConfig["layouts"] = {};
  for (const [bpKey, rects] of Object.entries(config.layouts)) {
    const sub: Record<string, Rect> = {};
    for (const [id, r] of Object.entries(rects)) if (keep.has(id)) sub[id] = r;
    layouts[bpKey as BreakpointName] = compactRects(sub);
  }

  return {
    version: config.version,
    name: config.name,
    widgets,
    layouts,
    widths: config.widths,
  };
}

/**
 * Gravity compaction — each widget rises until it would overlap another
 * or leave the grid. Used after staff-widget removal so the client
 * subset carries tight, coherent geometry (no orphan gaps).
 */
export function compactRects(
  rects: Record<string, Rect>,
): Record<string, Rect> {
  const ordered = Object.entries(rects).sort(
    ([, a], [, b]) => a.y - b.y || a.x - b.x,
  );
  const out: Record<string, Rect> = {};
  const placed: Rect[] = [];
  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [id, r] of ordered) {
    const next = { ...r };
    while (
      next.y > 0 &&
      !placed.some((p) => overlaps({ ...next, y: next.y - 1 }, p))
    )
      next.y -= 1;
    placed.push(next);
    out[id] = next;
  }
  return out;
}

/** Canonical JSON for saved-content equality — key-sorted, stable. */
export function canonicalizeDashboardConfig(config: DashboardConfig): string {
  const order = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(order)
      : isObj(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, order((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(order(config));
}

/**
 * Catalogue metadata (name/category) + per-kind default settings —
 * frozen from Lily model.ts:260–685. `connected` marks the first-slice
 * data contract (CU04/CU16); every other kind renders a placeholder.
 */
export const WIDGET_CATALOGUE: Record<
  WidgetKind,
  { name: string; category: string; connected: boolean }
> = {
  BN21: {
    name: "Custom metric card",
    category: "Data/Progress",
    connected: false,
  },
  BN01: {
    name: "Bodyweight trend",
    category: "Data/Progress",
    connected: false,
  },
  BN08: {
    name: "Weekly bodyweight change",
    category: "Data/Progress",
    connected: false,
  },
  BN15: {
    name: "Macro target summary",
    category: "Nutrition",
    connected: false,
  },
  BN19: {
    name: "Nutrition intake trend",
    category: "Nutrition",
    connected: false,
  },
  TL26: {
    name: "Current / next workout",
    category: "Training",
    connected: false,
  },
  TL28: {
    name: "Exercise performance trend",
    category: "Training",
    connected: false,
  },
  TL06: { name: "Step count", category: "Activity", connected: false },
  TL11: { name: "Sleep duration", category: "Recovery", connected: false },
  TL14: { name: "Recovery ratings", category: "Recovery", connected: false },
  TL21: { name: "Today’s habits", category: "Habits", connected: true },
  TL22: { name: "Habit consistency", category: "Habits", connected: true },
  CU01: { name: "Weekly focus", category: "Coaching", connected: false },
  CU02: {
    name: "This week at a glance",
    category: "Coaching",
    connected: false,
  },
  CU03: { name: "Client tasks", category: "Coaching", connected: true },
  CU04: { name: "Check-in status", category: "Coaching", connected: true },
  CU06: { name: "Coach feedback", category: "Coaching", connected: false },
  CU09: {
    name: "Selected roadmap metrics",
    category: "Roadmap",
    connected: false,
  },
  CU10: {
    name: "Current phase progress",
    category: "Roadmap",
    connected: false,
  },
  CU16: {
    name: "Quick links launcher",
    category: "Shortcuts",
    connected: true,
  },
};

const DEFAULTS: Record<WidgetKind, Omit<WidgetSettings, "visibility">> = {
  BN21: {
    title: "Body measurements",
    source: "waist",
    summary: "latest",
    period: "30d",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: [],
    labels: {},
    option: "default",
    unit: "cm",
  },
  BN01: {
    title: "Bodyweight trend",
    source: "bodyweight",
    summary: "daily",
    period: "30d",
    historyPeriod: "auto",
    target: false,
    size: "Wide",
    fields: [],
    labels: {},
    option: "default",
    unit: "kg",
  },
  BN08: {
    title: "Weekly bodyweight change",
    source: "bodyweight",
    summary: "weekly-average-change",
    period: "8w",
    historyPeriod: "auto",
    target: false,
    size: "Regular",
    fields: [],
    labels: {},
    option: "absolute",
    unit: "kg",
  },
  BN15: {
    title: "Nutrition today",
    source: "nutrition:active",
    summary: "daily",
    period: "today",
    historyPeriod: "auto",
    target: true,
    size: "Wide",
    fields: ["protein", "carbs", "fat"],
    labels: {},
    option: "circles",
    unit: "g",
  },
  BN19: {
    title: "Nutrition intake trend",
    source: "nutrition:active",
    summary: "actual-target",
    period: "month",
    historyPeriod: "auto",
    target: true,
    size: "Wide",
    fields: ["calories"],
    labels: {},
    option: "line",
    unit: "kcal",
  },
  TL26: {
    title: "Your training",
    source: "workouts",
    summary: "current",
    period: "week",
    historyPeriod: "auto",
    target: false,
    size: "Regular",
    fields: ["exercise", "sets", "reps"],
    labels: {},
    option: "current",
    unit: "",
  },
  TL28: {
    title: "Deadlift progress",
    source: "exercise:deadlift",
    summary: "load",
    period: "8w",
    historyPeriod: "auto",
    target: false,
    size: "Wide",
    fields: [],
    labels: {},
    option: "default",
    unit: "kg",
  },
  TL06: {
    title: "Daily steps",
    source: "steps",
    summary: "average",
    period: "7d",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: [],
    labels: {},
    option: "default",
    unit: "steps",
  },
  TL11: {
    title: "Sleep duration",
    source: "sleep",
    summary: "average",
    period: "7d",
    historyPeriod: "auto",
    target: false,
    size: "Regular",
    fields: [],
    labels: {},
    option: "hours",
    unit: "h",
  },
  TL14: {
    title: "Recovery",
    source: "recovery",
    summary: "latest",
    period: "30d",
    historyPeriod: "auto",
    target: false,
    size: "Regular",
    fields: ["energy", "stress", "readiness"],
    labels: {},
    option: "default",
    unit: "",
  },
  TL21: {
    title: "Today’s habits",
    source: "habits",
    summary: "today",
    period: "today",
    historyPeriod: "auto",
    target: false,
    size: "Tall",
    fields: [],
    labels: {},
    option: "list",
    unit: "",
  },
  TL22: {
    title: "Habit consistency",
    source: "habits",
    summary: "scheduled-statuses",
    period: "7d",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: [],
    labels: {},
    option: "scheduled",
    unit: "%",
  },
  CU01: {
    title: "This week’s focus",
    source: "coaching:current",
    summary: "phase-focus",
    period: "current-week",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: ["phase", "focus", "successCue"],
    labels: {},
    option: "published",
    unit: "",
  },
  CU02: {
    title: "This week at a glance",
    source: "roadmap:current-week",
    summary: "selected-metrics",
    period: "current-week",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: [],
    labels: {},
    option: "current-week",
    unit: "",
  },
  CU03: {
    title: "Your tasks",
    source: "tasks",
    summary: "open",
    period: "30d",
    historyPeriod: "auto",
    target: false,
    size: "Regular",
    fields: [],
    labels: {},
    option: "open",
    unit: "",
  },
  CU04: {
    title: "Check-in",
    source: "checkins",
    summary: "status",
    period: "30d",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: [],
    labels: {},
    option: "default",
    unit: "",
  },
  CU06: {
    title: "Coach feedback",
    source: "feedback",
    summary: "latest",
    period: "30d",
    historyPeriod: "auto",
    target: false,
    size: "Wide",
    fields: [],
    labels: {},
    option: "default",
    unit: "",
  },
  CU09: {
    title: "Selected roadmap metrics",
    source: "roadmap:selected",
    summary: "weekly-trends",
    period: "8w",
    historyPeriod: "auto",
    target: false,
    size: "Regular",
    fields: [],
    labels: {},
    option: "selected",
    unit: "",
  },
  CU10: {
    title: "Current phase progress",
    source: "milestones:published",
    summary: "phase-progress",
    period: "current-phase",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: ["strength-foundation-end"],
    labels: {},
    option: "published",
    unit: "days",
  },
  CU16: {
    title: "Quick links",
    source: "links",
    summary: "enabled",
    period: "",
    historyPeriod: "auto",
    target: false,
    size: "Regular",
    fields: ["Tracker", "Mealplan", "Training", "Check-in"],
    labels: {},
    option: "default",
    unit: "",
  },
};

export function defaultWidgetSettings(kind: WidgetKind): WidgetSettings {
  return {
    ...DEFAULTS[kind],
    fields: [...DEFAULTS[kind].fields],
    labels: {},
    // fail-closed: new widgets are staff-only until a coach shares them
    visibility: "staff",
  };
}

/** Canonical reading order for a breakpoint's rects (y, then x, then id). */
export function readingOrder(layout: Record<string, Rect>): string[] {
  return Object.entries(layout)
    .sort(
      ([a, ra], [b, rb]) => ra.y - rb.y || ra.x - rb.x || a.localeCompare(b),
    )
    .map(([id]) => id);
}

// ---- Editor-facing allowlist accessors (same frozen tables the server
// validates against — the editor can only choose valid values) ----

export const SIZE_OPTIONS = SIZES;
export const HISTORY_PERIODS = ["auto", "3m", "6m", "1y"] as const;

export const widgetSourceOptions = (kind: WidgetKind) => SOURCE[kind];
export const widgetSummaryOptions = (kind: WidgetKind, source: string) =>
  summaryOptions(kind, source);
export const widgetPeriodOptions = (kind: WidgetKind) => PERIOD[kind];
export const widgetOptionOptions = (kind: WidgetKind) => OPTION[kind];
export const widgetStaticFieldOptions = (kind: WidgetKind) =>
  STATIC_FIELDS[kind];
export const widgetTargetAvailable = (kind: WidgetKind) =>
  TARGET_KINDS.has(kind);
export const widgetSizeOptions = () => SIZES;
export const SETTINGS_LIMITS = LIMITS;
