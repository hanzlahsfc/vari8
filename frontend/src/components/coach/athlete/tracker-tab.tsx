"use client";

/**
 * Athlete profile → Tracker tab: every day the client logged, chronological
 * downwards, grouped into week rows of separate column-group tiles (the
 * sheet layout). Columns come from the client's template tracker fields.
 * Coaches read values and add notes; check-ins, plan changes and training
 * sessions link out from the date and session columns.
 */

import {
  ChevronRight,
  ClipboardCheck,
  Crosshair,
  Flag,
  Pin,
  PinOff,
  Repeat,
  Shrink,
} from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  displayWeek,
  scheduledSessions,
} from "../../client-app/training-log/model";
import {
  defaultDecimals,
  defaultSummary,
} from "../client-tracker-preview/preview-model";
import {
  ALL_PARAMETERS,
  type CoachClient,
  type CoachState,
  type FieldConfig,
  formatDate,
  type Parameter,
  type Route,
} from "../model";
import { applicablePlan } from "../plans/domain";
import { phaseRanges } from "../plans/phase-planning";
import type { TrainingSessionLog } from "../plans/types";
import { useCoach } from "../store";
import { addLocalDays, localToday } from "../targets/model";
import {
  clientTracking,
  clientTrackingText,
  withTrackingText,
} from "../tracking/data";
import { Button, Dialog } from "../ui";
import { nutritionForDate } from "./timeline";
import { enumerateWeeks } from "./timeline-tab";
import "./tracker-tab.css";

// ─── Column model ───────────────────────────────────────────────────

type Summary = "avg" | "sum" | "count" | "none";
type Kind =
  | "num"
  | "rating"
  | "text"
  | "short"
  | "flow"
  | "day"
  | "session"
  | "coach";
type Col = {
  key: string;
  label: string;
  unit: string;
  kind: Kind;
  decimals: number;
  summary: Summary;
  /** Rating scale maximum (5 or 10). */
  max: number;
  lowerBetter: boolean;
  countWord?: [string, string];
};
type Group = { id: string; label: string; cols: Col[] };

const GROUPS: [string, string[]][] = [
  ["Body", ["Weight basics"]],
  ["Health", ["Health readings"]],
  ["Cycle", ["Cycle tracking"]],
  [
    "Nutrition",
    [
      "Nutrition",
      "Fluids",
      "Salt & sodium",
      "Caffeine & alcohol",
      "Fruit & vegetables",
      "Hunger & appetite",
      "Digestion",
    ],
  ],
  [
    "Recovery",
    [
      "Sleep",
      "Energy and readiness",
      "Stress, mood and focus",
      "Soreness & discomfort",
      "Recovery context note",
    ],
  ],
  ["Training", ["How training feels"]],
  ["Activity", ["Movement and cardio", "Activity context note"]],
  ["Notes", ["Day context", "Notes"]],
];
const groupOf = (parameterGroup: string) =>
  GROUPS.find(([, sources]) => sources.includes(parameterGroup))?.[0] ??
  "Notes";

const RATING_UNITS = new Set(["1–10", "1–5", "Word labels"]);
const LOWER_BETTER = new Set([
  "stress",
  "hunger",
  "muscle-soreness",
  "pain-discomfort",
  "fatigue",
  "cramps",
  "bloating",
  "nausea",
  "abdominal-discomfort",
]);
const SHORT_LABEL: Record<string, string> = {
  weight: "Weight",
  time: "Weigh-in",
  waist: "Waist",
  calories: "kcal",
  protein: "P",
  carbs: "C",
  fat: "F",
  water: "Water",
  "salt-intake": "Salt",
  "sodium-intake": "Sodium",
  "caffeine-intake": "Caffeine",
  "alcohol-intake": "Alcohol",
  hunger: "Hunger",
  bloating: "Bloating",
  sleep: "Sleep",
  "sleep-quality": "Quality",
  energy: "Energy",
  stress: "Stress",
  "muscle-soreness": "DOMS",
  rhr: "RHR",
  fbg: "Glucose",
  bp: "BP",
  hrv: "HRV",
  "bleeding-level": "Flow",
  cramps: "Cramps",
  "pms-symptoms": "Symptoms",
  "energy-in-gym": "Energy",
  "mood-in-gym": "Mood",
  "desire-to-train": "Drive",
  steps: "Steps",
  "cardio-duration": "Cardio",
  "active-minutes": "Active",
  "daily-note": "Client",
};
const UNIT_LABEL: Record<string, string> = { minutes: "min", hours: "h" };
const TEXT_TYPES = new Set(["text", "context", "multi-choice"]);
const SHORT_TYPES = new Set(["time", "blood-pressure", "choice"]);
const SKIP_TYPES = new Set(["period-start", "location-rating-map"]);

function colFor(field: FieldConfig, parameter: Parameter): Col {
  const type = parameter.inputType ?? "";
  const rating =
    parameter.units.some((unit) => RATING_UNITS.has(unit)) ||
    type === "location-rating";
  const kind: Kind =
    parameter.id === "bleeding-level"
      ? "flow"
      : TEXT_TYPES.has(type)
        ? "text"
        : SHORT_TYPES.has(type)
          ? "short"
          : rating
            ? "rating"
            : "num";
  const unit =
    kind === "num" ? (UNIT_LABEL[field.unit] ?? field.unit ?? "") : "";
  return {
    key: parameter.id,
    label: SHORT_LABEL[parameter.id] ?? parameter.name,
    unit: unit === "steps" || unit === "count" ? "" : unit,
    kind,
    decimals:
      kind === "num" ? (field.decimals ?? defaultDecimals(parameter)) : 0,
    summary:
      field.summary ??
      (parameter.id === "bleeding-level" ? "count" : defaultSummary(parameter)),
    max: field.unit === "1–5" ? 5 : 10,
    lowerBetter: LOWER_BETTER.has(parameter.id),
    countWord:
      parameter.id === "daily-note"
        ? ["note", "notes"]
        : kind === "flow"
          ? ["day", "days"]
          : kind === "text"
            ? ["day", "days"]
            : undefined,
  };
}

/** Template tracker fields: snapshot order, live template settings win. */
function trackerFields(state: CoachState, client: CoachClient): FieldConfig[] {
  const assignment = client.assignment;
  if (!assignment) return [];
  const live = state.templates
    .find((template) => template.id === assignment.templateId)
    ?.variants.find((variant) => variant.id === assignment.variantId);
  const snapshot =
    assignment.snapshot.variants.find((v) => v.id === assignment.variantId) ??
    assignment.snapshot.variants[0];
  const liveById = new Map((live?.fields ?? []).map((f) => [f.id, f]));
  const out = (snapshot?.fields ?? []).map((f) => ({
    ...f,
    ...liveById.get(f.id),
  }));
  for (const field of live?.fields ?? [])
    if (!out.some((f) => f.id === field.id)) out.push(field);
  return out;
}

function buildGroups(state: CoachState, client: CoachClient): Group[] {
  const byGroup = new Map<string, Col[]>();
  for (const field of trackerFields(state, client)) {
    const parameter = ALL_PARAMETERS.find((p) => p.id === field.id);
    if (!parameter || SKIP_TYPES.has(parameter.inputType ?? "")) continue;
    if (parameter.id === "cycle-day") continue;
    const group = groupOf(parameter.group);
    byGroup.set(group, [
      ...(byGroup.get(group) ?? []),
      colFor(field, parameter),
    ]);
  }
  const plans = client.plans;
  const hasNutrition =
    !!plans &&
    !!(
      plans.nutrition.mealPlan.active ||
      plans.nutrition.mealPlan.history.length ||
      plans.nutrition.iifym.active ||
      plans.nutrition.iifym.history.length
    );
  const hasTraining =
    !!plans && !!(plans.training.active || plans.training.history.length);
  const derived = (key: string, label: string, kind: Kind): Col => ({
    key,
    label,
    unit: "",
    kind,
    decimals: 0,
    summary: kind === "day" ? "none" : "count",
    max: 10,
    lowerBetter: false,
    countWord:
      kind === "session"
        ? ["session", "sessions"]
        : kind === "coach"
          ? ["note", "notes"]
          : undefined,
  });
  if (hasNutrition)
    byGroup.set("Nutrition", [
      derived("@day", "Day", "day"),
      ...(byGroup.get("Nutrition") ?? []),
    ]);
  if (hasTraining)
    byGroup.set("Training", [
      derived("@session", "Session", "session"),
      ...(byGroup.get("Training") ?? []),
    ]);
  byGroup.set("Notes", [
    ...(byGroup.get("Notes") ?? []),
    derived("@coach", "Coach", "coach"),
  ]);
  return GROUPS.map(([id]) => ({
    id,
    label: id,
    cols: byGroup.get(id) ?? [],
  })).filter((group) => group.cols.length > 0);
}

// ─── Formatting ─────────────────────────────────────────────────────

const weekdayFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});
const weekday = (date: string) =>
  weekdayFmt.format(new Date(`${date}T12:00:00Z`));

const fmt = (value: number, decimals: number) =>
  new Intl.NumberFormat("en", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
const signed = (value: number, decimals: number) => {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return `±${fmt(0, decimals)}`;
  return `${rounded > 0 ? "+" : "−"}${fmt(Math.abs(rounded), decimals)}`;
};
const FLOW_LEVEL: Record<string, number> = { Light: 1, Medium: 2, Heavy: 3 };
function ratingLevel(value: number, col: Col) {
  const share = Math.min(1, Math.max(0, value / col.max));
  const level = Math.min(5, Math.max(1, Math.ceil(share * 5)));
  return col.lowerBetter ? 6 - level : level;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string) {
  if (typeof document === "undefined") return text.length * 7;
  if (measureCtx === undefined)
    measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  measureCtx.font = `${font} ${family}`;
  return measureCtx.measureText(text).width;
}

// ─── Day data ───────────────────────────────────────────────────────

type Marker = {
  id: string;
  icon: ReactNode;
  short: string;
  label: string;
  route: Route;
};

type Data = {
  today: string;
  values: Map<string, Record<string, number | null>>;
  text: Record<string, string>;
  sessions: Map<string, { name: string; log?: TrainingSessionLog }>;
  markers: Map<string, Marker[]>;
};

function sessionMap(state: CoachState, client: CoachClient, mondays: string[]) {
  const out: Data["sessions"] = new Map();
  const plans = client.plans;
  if (plans)
    for (const monday of mondays) {
      const plan = applicablePlan(plans.training, monday);
      if (!plan) continue;
      for (const item of scheduledSessions(plan, displayWeek(plan, monday)))
        out.set(item.date, { name: item.session.name });
    }
  for (const log of state.trainingLogs ?? [])
    if (log.clientId === client.id)
      out.set(log.scheduledDate, { name: log.sessionName, log });
  return out;
}

function markerMap(state: CoachState, client: CoachClient) {
  const out: Data["markers"] = new Map();
  const add = (date: string, marker: Marker) =>
    out.set(date, [...(out.get(date) ?? []), marker]);
  const clientRoute = (route: Partial<Route>): Route => ({
    section: "clients",
    client: client.id,
    ...route,
  });
  for (const submission of state.submissions)
    if (submission.clientId === client.id)
      add(submission.date, {
        id: `ci-${submission.id}`,
        icon: <ClipboardCheck size={12} strokeWidth={2} />,
        short: "Check-in",
        label: "Check-in submitted · open review",
        route: {
          section: "check-ins",
          client: client.id,
          review: submission.id,
        },
      });
  const plans = client.plans;
  if (plans) {
    const lifecycles: [string, string, { activatedAt: string }[]][] = [
      [
        "Nutrition plan",
        "nutrition",
        [
          ...plans.nutrition.mealPlan.history,
          ...(plans.nutrition.mealPlan.active
            ? [plans.nutrition.mealPlan.active]
            : []),
          ...plans.nutrition.iifym.history,
          ...(plans.nutrition.iifym.active
            ? [plans.nutrition.iifym.active]
            : []),
        ],
      ],
      [
        "Training plan",
        "training",
        [
          ...plans.training.history,
          ...(plans.training.active ? [plans.training.active] : []),
        ],
      ],
    ];
    for (const [label, plan, versions] of lifecycles)
      for (const version of versions)
        add(version.activatedAt.slice(0, 10), {
          id: `${plan}-${version.activatedAt}`,
          icon: <Repeat size={12} strokeWidth={2} />,
          short: label.replace(" plan", ""),
          label: `${label} activated · open plan`,
          route: clientRoute({ tab: "Plans", plan }),
        });
    for (const version of plans.activityTargets ?? [])
      add(version.effectiveFrom, {
        id: `act-${version.effectiveFrom}-${version.metric}`,
        icon: <Repeat size={12} strokeWidth={2} />,
        short: "Activity",
        label: "Activity targets changed · open plan",
        route: clientRoute({ tab: "Plans", plan: "activity-targets" }),
      });
    for (const temp of plans.nutrition.temporary ?? [])
      add(temp.startDate, {
        id: `tmp-${temp.id}`,
        icon: <Flag size={12} strokeWidth={2} />,
        short: temp.label,
        label: `${temp.label} starts · open plan`,
        route: clientRoute({ tab: "Plans", plan: "nutrition" }),
      });
  }
  for (const event of client.timelineEvents ?? [])
    add(event.startDate, {
      id: `ev-${event.id}`,
      icon: <Flag size={12} strokeWidth={2} />,
      short:
        event.kind === "diet-break"
          ? "Diet break"
          : event.kind === "deload"
            ? "Deload"
            : "Refeed",
      label: `${event.kind === "diet-break" ? "Diet break" : event.kind === "deload" ? "Deload" : "Refeed"} starts · open timeline`,
      route: clientRoute({ tab: "Timeline" }),
    });
  for (const [date, list] of out)
    out.set(
      date,
      list.filter((m, i) => list.findIndex((o) => o.label === m.label) === i),
    );
  return out;
}

function cellValue(
  col: Col,
  date: string,
  data: Data,
  client: CoachClient,
): { text: string; raw?: number; empty: boolean } {
  if (date > data.today) return { text: "", empty: true };
  switch (col.kind) {
    case "num":
    case "rating": {
      const v = data.values.get(date)?.[col.key];
      return v == null
        ? { text: "", empty: true }
        : { text: fmt(v, col.decimals), raw: v, empty: false };
    }
    case "day": {
      const r = nutritionForDate(client, date);
      const label = r.temporary?.label ?? r.label ?? "";
      return { text: label, empty: !label };
    }
    case "session": {
      const s = data.sessions.get(date);
      return { text: s?.name ?? "Rest", empty: false };
    }
    case "coach": {
      const t = data.text[`${date}:coach-note`] ?? "";
      return { text: t, empty: !t };
    }
    default: {
      const t = data.text[`${date}:${col.key}`] ?? "";
      return { text: t, empty: !t || t === "None" };
    }
  }
}

function summaryText(
  col: Col,
  days: string[],
  data: Data,
  client: CoachClient,
): ReactNode {
  const { main, sub } = summaryParts(col, days, data, client);
  return sub ? (
    <>
      {main}
      <span className="trk-subtle"> {sub}</span>
    </>
  ) : (
    main
  );
}

function summaryParts(
  col: Col,
  days: string[],
  data: Data,
  client: CoachClient,
): { main: string; sub?: string } {
  const plain = (main: string) => ({ main });
  if (col.summary === "none") return plain("");
  const logged = days.filter((d) => d <= data.today);
  if (col.summary === "count" || col.kind === "session") {
    const count = logged.filter((d) => {
      const c = cellValue(col, d, data, client);
      if (col.kind === "session")
        return !!data.sessions.get(d) && c.text !== "Rest";
      return !c.empty;
    }).length;
    if (!count) return plain("");
    const [one, many] = col.countWord ?? ["day", "days"];
    return plain(`${count} ${count === 1 ? one : many}`);
  }
  const nums = logged
    .map((d) => data.values.get(d)?.[col.key])
    .filter((v): v is number => v != null);
  if (!nums.length) return plain("");
  const total = nums.reduce((a, b) => a + b, 0);
  if (col.summary === "sum")
    return plain(
      `${fmt(total, col.decimals)}${col.unit ? ` ${col.unit}` : ""}`,
    );
  const avg = total / nums.length;
  const decimals = col.kind === "rating" ? 1 : col.decimals;
  if (col.key === "weight") {
    const prev = days
      .map((d) => data.values.get(addLocalDays(d, -7))?.weight)
      .filter((v): v is number => v != null);
    const change = prev.length
      ? avg - prev.reduce((a, b) => a + b, 0) / prev.length
      : undefined;
    return {
      main: fmt(avg, decimals),
      sub: change !== undefined ? signed(change, 1) : undefined,
    };
  }
  const unitSuffix =
    col.unit === "L" || col.unit === "mg" ? ` ${col.unit}` : "";
  return plain(`${fmt(avg, decimals)}${unitSuffix}`);
}

/**
 * Content-sized column width: day values of the expanded weeks only (so a
 * long note in a collapsed week doesn't widen the column) plus every week's
 * summary band, which stays visible when collapsed.
 */
function colWidth(
  col: Col,
  weeks: { days: string[] }[],
  days: string[],
  data: Data,
  client: CoachClient,
) {
  const label = `${col.label}${col.unit && col.unit !== col.label ? ` ${col.unit}` : ""}`;
  let width = textWidth(label, "600 11px");
  if (col.kind === "rating") width = Math.max(width, 22);
  if (col.kind === "flow") width = Math.max(width, 34);
  const freeText = col.kind === "text" || col.kind === "coach";
  if (freeText) width = Math.max(width, 80);
  for (const d of days) {
    const c = cellValue(col, d, data, client);
    if (!c.empty) {
      const w = textWidth(c.text, "500 12px") + (col.kind === "day" ? 14 : 0);
      if (w > width) width = freeText ? Math.min(w, 340) : w;
    }
  }
  for (const week of weeks) {
    const { main, sub } = summaryParts(col, week.days, data, client);
    const w =
      textWidth(main, "600 12px") +
      (sub ? textWidth(` ${sub}`, "500 12px") : 0);
    if (w > width) width = w;
  }
  return Math.ceil(width + 26 + (col.kind === "session" ? 12 : 0));
}

// ─── Component ──────────────────────────────────────────────────────

type Week = ReturnType<typeof enumerateWeeks>[number];
type NoteTarget = {
  date: string;
  col: Col;
  value: string;
  x: number;
  y: number;
};

export function AthleteTrackerTab({ client }: { client: CoachClient }) {
  const { state, setState, navigate } = useCoach();
  const today = localToday();
  const groups = useMemo(() => buildGroups(state, client), [state, client]);
  const ranges = useMemo(() => phaseRanges(client.phases), [client.phases]);
  const weeks = useMemo(
    () =>
      enumerateWeeks(client, ranges, today).filter((w) => w.monday <= today),
    [client, ranges, today],
  );
  const data = useMemo<Data>(
    () => ({
      today,
      values: new Map(clientTracking(client).map((e) => [e.date, e.values])),
      text: clientTrackingText(client),
      sessions: sessionMap(
        state,
        client,
        weeks.map((w) => w.monday),
      ),
      markers: markerMap(state, client),
    }),
    [state, client, weeks, today],
  );
  const allDays = useMemo(() => weeks.flatMap((w) => w.days), [weeks]);

  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(
    () => new Set(weeks.slice(0, -2).map((w) => w.monday)),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [pinned, setPinned] = useState<string[]>([]);
  const [note, setNote] = useState<NoteTarget | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);

  const widths = useMemo(() => {
    const visibleDays = weeks
      .filter((w) => !collapsedWeeks.has(w.monday))
      .flatMap((w) => w.days);
    const map = new Map<string, number>();
    for (const group of groups)
      for (const col of group.cols)
        map.set(col.key, colWidth(col, weeks, visibleDays, data, client));
    return map;
  }, [groups, weeks, collapsedWeeks, data, client]);
  const groupWidth = (group: Group) => {
    if (collapsedGroups.has(group.id)) return 30;
    const cols = group.cols.reduce((a, c) => a + (widths.get(c.key) ?? 60), 0);
    return Math.max(
      cols,
      textWidth(group.label.toUpperCase(), "700 10px") + 60,
    );
  };
  const dateWidth = useMemo(() => {
    const day = textWidth("Wed", "600 12px") + 20;
    const date = textWidth("24 Sept", "500 12px") + 12;
    let markers = 0;
    for (const list of data.markers.values()) {
      const w = list
        .slice(0, 2)
        .reduce((a, m) => a + textWidth(m.short, "550 11px") + 30, 0);
      if (w > markers) markers = w;
    }
    const band = textWidth("Week 10 · 28 Sept – 4 Oct", "600 12px") + 52;
    return Math.ceil(Math.max(day + date + markers + 16, band));
  }, [data.markers]);

  const ordered = [
    ...pinned
      .map((id) => groups.find((g) => g.id === id))
      .filter((g): g is Group => !!g),
    ...groups.filter((g) => !pinned.includes(g.id)),
  ];
  const pinOffset = (id: string) => {
    let left = dateWidth + 20;
    for (const p of pinned) {
      if (p === id) return left;
      const g = groups.find((x) => x.id === p);
      if (g) left += groupWidth(g) + 20;
    }
    return left;
  };
  const lastPinned = pinned
    .filter((p) => groups.some((g) => g.id === p))
    .at(-1);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const hoverStyleRef = useRef<HTMLStyleElement | null>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const update = () => {
      setNarrow(window.innerWidth < 900);
      const el = scrollerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(420, window.innerHeight - top - 24));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const centreToday = (flash: boolean) => {
    const el = scrollerRef.current;
    const row = canvasRef.current?.querySelector<HTMLElement>(
      `.trk-date [data-date="${today}"]`,
    );
    if (!el || !row) return;
    const offset =
      row.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTop += offset - el.clientHeight / 2 + row.offsetHeight / 2;
    if (flash)
      for (const r of canvasRef.current?.querySelectorAll<HTMLElement>(
        `[data-date="${today}"]`,
      ) ?? []) {
        r.classList.remove("trk-flash");
        void r.offsetWidth;
        r.classList.add("trk-flash");
      }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: centre once after the first measured render.
  useEffect(() => {
    if (height) centreToday(false);
  }, [height]);

  // Scroll state (fade flags) + drag to pan in both axes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroller only mounts in the wide layout.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      el.dataset.scrolled = el.scrollLeft > 2 ? "1" : "0";
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      el.dataset.fade =
        el.scrollWidth > el.clientWidth + 1 && !atEnd ? "1" : "0";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    let panning = false;
    let moved = false;
    let suppress = false;
    let pointerId = -1;
    let sx = 0;
    let sy = 0;
    let sl = 0;
    let st = 0;
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, a"))
        return;
      pointerId = event.pointerId;
      sx = event.clientX;
      sy = event.clientY;
      sl = el.scrollLeft;
      st = el.scrollTop;
      panning = true;
      moved = false;
    };
    const onMove = (event: PointerEvent) => {
      if (!panning || event.pointerId !== pointerId) return;
      const dx = event.clientX - sx;
      const dy = event.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        moved = true;
        el.dataset.panning = "1";
      }
      el.scrollLeft = sl - dx;
      el.scrollTop = st - dy;
    };
    const onUp = (event: PointerEvent) => {
      if (!panning || event.pointerId !== pointerId) return;
      panning = false;
      if (moved) {
        suppress = true;
        setTimeout(() => {
          suppress = false;
        }, 0);
      }
      delete el.dataset.panning;
    };
    const onClick = (event: MouseEvent) => {
      if (!suppress) return;
      event.preventDefault();
      event.stopPropagation();
      suppress = false;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [narrow]);

  // Row hover across all tiles without re-rendering the table.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroller only mounts in the wide layout.
  useEffect(() => {
    const el = scrollerRef.current;
    const style = hoverStyleRef.current;
    if (!el || !style) return;
    let current: string | null | undefined;
    const onOver = (event: MouseEvent) => {
      const date = (event.target as HTMLElement | null)
        ?.closest<HTMLElement>("[data-date]")
        ?.getAttribute("data-date");
      if (date === current) return;
      current = date;
      style.textContent = date
        ? `.trk-canvas .trk-row[data-date="${date}"]{background:var(--trk-hover)}.trk-canvas .trk-date .trk-row[data-date="${date}"] .trk-dd{color:var(--cd-text)}`
        : "";
    };
    const onLeave = () => {
      current = undefined;
      style.textContent = "";
    };
    el.addEventListener("mouseover", onOver);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mouseover", onOver);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [narrow]);

  const updateClient = (fn: (c: CoachClient) => CoachClient) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) => (c.id === client.id ? fn(c) : c)),
    }));
  const noteKey = (target: NoteTarget) =>
    target.col.kind === "coach" ? "coach-note" : `note:${target.col.key}`;
  const openNote = (
    event: React.MouseEvent,
    date: string,
    col: Col,
    value: string,
  ) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const target = {
      date,
      col,
      value,
      x: Math.min(rect.left, window.innerWidth - 260),
      y: Math.min(rect.bottom + 6, window.innerHeight - 220),
    };
    setNote(target);
    setNoteDraft(data.text[`${date}:${noteKey(target)}`] ?? "");
  };
  const saveNote = () => {
    if (!note) return;
    const key = noteKey(note);
    updateClient((c) => withTrackingText(c, note.date, key, noteDraft.trim()));
    setNote(null);
  };

  const layoutChanged = pinned.length > 0 || collapsedGroups.size > 0;
  const toggleGroup = (id: string) =>
    setCollapsedGroups((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePin = (id: string) =>
    setPinned((list) =>
      list.includes(id) ? list.filter((p) => p !== id) : [...list, id],
    );
  const toggleWeek = (monday: string) =>
    setCollapsedWeeks((s) => {
      const next = new Set(s);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });

  if (!groups.length || !weeks.length)
    return (
      <section className="trk trk-empty">
        <p>
          No tracker fields yet. Add daily fields to this client&apos;s template
          to see their log here.
        </p>
      </section>
    );

  if (narrow) {
    const last = allDays
      .filter((d) => d <= today)
      .slice(-7)
      .reverse();
    return (
      <section className="trk trk-narrow">
        <p className="trk-narrow-note">The tracker is designed for desktop.</p>
        {last.map((d) => (
          <div className="trk-narrow-day" key={d}>
            <b>
              {formatDate(d, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </b>
            <span className="trk-narrow-vals">
              {groups[0].cols
                .slice(0, 3)
                .map((c) => cellValue(c, d, data, client).text || "—")
                .join(" · ")}
            </span>
          </div>
        ))}
      </section>
    );
  }

  const first = weeks[0].days[0];
  const rangeLabel = `${formatDate(first, { day: "numeric", month: "short" })} – ${formatDate(today, { day: "numeric", month: "short" })} · ${weeks.length} weeks`;
  const sessionDetail = session ? data.sessions.get(session) : undefined;

  const renderCell = (col: Col, date: string) => {
    const c = cellValue(col, date, data, client);
    const hasNote =
      !!data.text[`${date}:note:${col.key}`] ||
      (col.kind === "coach" && !c.empty);
    const future = date > today;
    let content: ReactNode = c.empty ? (
      <span className="trk-mut">—</span>
    ) : (
      c.text
    );
    if (!c.empty && col.kind === "rating" && c.raw != null)
      content = (
        <span className={`trk-rt trk-rt${ratingLevel(c.raw, col)}`}>
          {c.text}
        </span>
      );
    if (!c.empty && col.kind === "flow") {
      const level = FLOW_LEVEL[c.text] ?? 0;
      content = (
        <span className="trk-dots" title={c.text}>
          {[1, 2, 3].map((n) => (
            <i key={n} data-on={n <= level ? "" : undefined} />
          ))}
        </span>
      );
    }
    if (!c.empty && col.kind === "day")
      content = <span className="trk-chip">{c.text}</span>;
    if (col.kind === "session" && !future) {
      const s = data.sessions.get(date);
      return (
        <button
          type="button"
          key={col.key}
          className="trk-c trk-txt trk-link"
          data-rest={s ? undefined : ""}
          disabled={!s}
          onClick={() => setSession(date)}
          title={s ? "Open session" : undefined}
        >
          {s ? s.name : <span className="trk-mut-text">Rest</span>}
          {s?.log && <span className="trk-logged" title="Logged" />}
        </button>
      );
    }
    const align =
      col.kind === "text" ||
      col.kind === "coach" ||
      col.kind === "session" ||
      col.kind === "day"
        ? "trk-txt"
        : "trk-num";
    if (future) return <span key={col.key} className={`trk-c ${align}`} />;
    return (
      <button
        type="button"
        key={col.key}
        className={`trk-c ${align}`}
        title={col.kind === "text" || col.kind === "coach" ? c.text : undefined}
        onClick={(event) => openNote(event, date, col, c.empty ? "" : c.text)}
      >
        {content}
        {hasNote && col.kind !== "coach" && <span className="trk-cdot" />}
      </button>
    );
  };

  // The last unpinned, expanded group absorbs spare width on wide screens.
  const growId = ordered
    .filter((g) => !pinned.includes(g.id) && !collapsedGroups.has(g.id))
    .at(-1)?.id;
  const gridOf = (group: Group) => {
    const grow = group.id === growId;
    const flexible = group.cols.some(
      (c) => c.kind === "text" || c.kind === "coach",
    );
    return group.cols
      .map((c, i) => {
        const w = `${widths.get(c.key) ?? 60}px`;
        const stretch = flexible
          ? c.kind === "text" || c.kind === "coach"
          : i === group.cols.length - 1;
        return grow && stretch ? `minmax(${w}, 1fr)` : w;
      })
      .join(" ");
  };
  const sizeOf = (group: Group): CSSProperties =>
    group.id === growId
      ? { minWidth: groupWidth(group), flex: "1 0 auto" }
      : { width: groupWidth(group) };

  const renderWeek = (week: Week, phaseLabel: ReactNode) => {
    const collapsed = collapsedWeeks.has(week.monday);
    const dates = `${formatDate(week.monday, { day: "numeric", month: "short" })} – ${formatDate(week.sunday, { day: "numeric", month: "short" })}`;
    return (
      <Fragment key={week.monday}>
        {phaseLabel}
        <div className="trk-week" data-collapsed={collapsed ? "" : undefined}>
          <div className="trk-mask" style={{ width: dateWidth + 20 }}>
            <div className="trk-tile trk-date" style={{ width: dateWidth }}>
              {!collapsed &&
                week.days.map((d) => {
                  const markers = data.markers.get(d) ?? [];
                  return (
                    <div
                      key={d}
                      className="trk-row"
                      data-date={d}
                      data-today={d === today ? "" : undefined}
                      data-future={d > today ? "" : undefined}
                    >
                      <span className="trk-day">{weekday(d)}</span>
                      <span className="trk-dd">
                        {formatDate(d, { day: "numeric", month: "short" })}
                      </span>
                      <span className="trk-markers">
                        {markers.slice(0, 2).map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            className="trk-marker"
                            title={m.label}
                            onClick={() => navigate(m.route)}
                          >
                            {m.icon}
                            {m.short}
                          </button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              <button
                type="button"
                className="trk-band trk-weeklabel"
                onClick={() => toggleWeek(week.monday)}
                aria-expanded={!collapsed}
              >
                <ChevronRight size={13} className="trk-chev" />
                <b>Week {week.index}</b>
                <span className="trk-subtle">{dates}</span>
              </button>
            </div>
          </div>
          {ordered.map((group) => {
            const isPinned = pinned.includes(group.id);
            const isCollapsed = collapsedGroups.has(group.id);
            const tile = (
              <div
                key={group.id}
                className="trk-tile"
                style={sizeOf(group)}
                data-group={group.id}
              >
                {!isCollapsed &&
                  !collapsed &&
                  week.days.map((d) => (
                    <div
                      key={d}
                      className="trk-row"
                      data-date={d}
                      data-today={d === today ? "" : undefined}
                      style={{ gridTemplateColumns: gridOf(group) }}
                    >
                      {group.cols.map((col) => renderCell(col, d))}
                    </div>
                  ))}
                {isCollapsed && !collapsed && (
                  <div className="trk-collapsed-fill" />
                )}
                <div
                  className="trk-band"
                  style={
                    isCollapsed
                      ? undefined
                      : { gridTemplateColumns: gridOf(group) }
                  }
                >
                  {!isCollapsed &&
                    group.cols.map((col) => (
                      <span
                        key={col.key}
                        className={`trk-sum ${col.kind === "text" || col.kind === "coach" || col.kind === "session" || col.kind === "day" ? "trk-txt" : ""}`}
                      >
                        {summaryText(col, week.days, data, client)}
                      </span>
                    ))}
                </div>
              </div>
            );
            return isPinned ? (
              <div
                key={group.id}
                className="trk-mask trk-pinmask"
                data-last={group.id === lastPinned ? "" : undefined}
                style={{
                  left: pinOffset(group.id),
                  width: groupWidth(group) + 20,
                }}
              >
                {tile}
              </div>
            ) : (
              tile
            );
          })}
        </div>
      </Fragment>
    );
  };

  let lastPhase: string | undefined;
  return (
    <section className="trk">
      <style ref={hoverStyleRef} />
      <div className="trk-toolbar">
        <span className="trk-range">{rangeLabel}</span>
        <span className="trk-sp" />
        {layoutChanged && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPinned([]);
              setCollapsedGroups(new Set());
            }}
          >
            Reset layout
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsedWeeks(new Set())}
        >
          Expand all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsedWeeks(new Set(weeks.map((w) => w.monday)))}
        >
          Collapse all
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setCollapsedWeeks((s) => {
              const next = new Set(s);
              next.delete(weeks.at(-1)?.monday ?? "");
              return next;
            });
            requestAnimationFrame(() => centreToday(true));
          }}
        >
          <Crosshair size={14} /> Jump to today
        </Button>
      </div>
      <div
        className="trk-scroll"
        ref={scrollerRef}
        style={{ height } as CSSProperties}
      >
        <div className="trk-canvas" ref={canvasRef}>
          <div className="trk-head">
            <div className="trk-corner" style={{ width: dateWidth + 20 }} />
            {ordered.map((group) => {
              const isPinned = pinned.includes(group.id);
              const isCollapsed = collapsedGroups.has(group.id);
              const head = (
                <div
                  key={group.id}
                  className="trk-hg"
                  style={sizeOf(group)}
                  data-collapsed={isCollapsed ? "" : undefined}
                >
                  {isCollapsed ? (
                    <button
                      type="button"
                      className="trk-hg-strip"
                      onClick={() => toggleGroup(group.id)}
                      title={`Expand ${group.label}`}
                    >
                      {group.label}
                    </button>
                  ) : (
                    <>
                      <div className="trk-hg-title">
                        <span>{group.label}</span>
                        <span className="trk-hg-actions">
                          <button
                            type="button"
                            onClick={() => togglePin(group.id)}
                            aria-label={`${isPinned ? "Unpin" : "Pin"} ${group.label}`}
                            title={isPinned ? "Unpin" : "Pin next to dates"}
                            data-on={isPinned ? "" : undefined}
                          >
                            {isPinned ? (
                              <PinOff size={12} />
                            ) : (
                              <Pin size={12} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.id)}
                            aria-label={`Collapse ${group.label}`}
                            title="Collapse"
                          >
                            <Shrink size={12} />
                          </button>
                        </span>
                      </div>
                      <div
                        className="trk-hg-labels"
                        style={{ gridTemplateColumns: gridOf(group) }}
                      >
                        {group.cols.map((col) => (
                          <span
                            key={col.key}
                            className={`trk-clab ${col.kind === "text" || col.kind === "coach" || col.kind === "session" || col.kind === "day" ? "trk-txt" : ""}`}
                          >
                            {col.label}
                            {col.unit && col.unit !== col.label && (
                              <span className="trk-subtle"> {col.unit}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
              return isPinned ? (
                <div
                  key={group.id}
                  className="trk-mask trk-pinmask"
                  data-last={group.id === lastPinned ? "" : undefined}
                  style={{
                    left: pinOffset(group.id),
                    width: groupWidth(group) + 20,
                  }}
                >
                  {head}
                </div>
              ) : (
                head
              );
            })}
          </div>
          {weeks.map((week) => {
            const phase = ranges.find(
              (r) => week.monday >= r.startDate && week.monday <= r.endDate,
            );
            const name = phase?.name ?? "No phase";
            const label =
              name !== lastPhase ? (
                <div className="trk-phase" key={`ph-${week.monday}`}>
                  <span
                    className="trk-phase-label"
                    style={{ width: dateWidth + 20 }}
                  >
                    {name}
                    <span className="trk-subtle">
                      {" "}
                      · from{" "}
                      {formatDate(phase?.startDate ?? week.monday, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </span>
                  <span className="trk-phase-line" />
                </div>
              ) : null;
            lastPhase = name;
            return renderWeek(week, label);
          })}
        </div>
      </div>

      {note && (
        <>
          <button
            type="button"
            className="trk-pop-backdrop"
            aria-label="Close note"
            onClick={() => setNote(null)}
          />
          <div
            className="trk-pop"
            style={{ left: note.x, top: note.y }}
            role="dialog"
            aria-label="Add note"
          >
            <h4>
              {formatDate(note.date, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              {" · "}
              {note.col.kind === "coach" ? "Coach note" : note.col.label}
            </h4>
            {note.col.kind !== "coach" && (
              <div className="trk-pop-value">{note.value || "Not logged"}</div>
            )}
            <textarea
              // biome-ignore lint/a11y/noAutofocus: popover opens for typing a note.
              autoFocus
              rows={3}
              value={noteDraft}
              placeholder="Add note"
              onChange={(event) => setNoteDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                  saveNote();
                if (event.key === "Escape") setNote(null);
              }}
            />
            <div className="trk-pop-actions">
              <Button variant="ghost" size="sm" onClick={() => setNote(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={saveNote}>
                Save note
              </Button>
            </div>
          </div>
        </>
      )}

      {session && sessionDetail && (
        <Dialog
          title={`${sessionDetail.name} · ${formatDate(session, { weekday: "short", day: "numeric", month: "short" })}`}
          onClose={() => setSession(null)}
        >
          <SessionDetail
            log={sessionDetail.log}
            client={client}
            date={session}
            onOpenPlan={() => {
              setSession(null);
              navigate({
                section: "clients",
                client: client.id,
                tab: "Plans",
                plan: "training",
              });
            }}
          />
        </Dialog>
      )}
    </section>
  );
}

function SessionDetail({
  log,
  client,
  date,
  onOpenPlan,
}: {
  log?: TrainingSessionLog;
  client: CoachClient;
  date: string;
  onOpenPlan: () => void;
}) {
  const plan = client.plans
    ? applicablePlan(client.plans.training, date)
    : undefined;
  const scheduled = plan
    ? scheduledSessions(plan, displayWeek(plan, date)).find(
        (item) => item.date === date,
      )
    : undefined;
  const setLine = (
    s: TrainingSessionLog["exercises"][number]["sets"][number],
  ) =>
    [
      s.weight != null ? `${s.weight} ${log?.loadUnit ?? "kg"}` : undefined,
      s.reps != null ? `× ${s.reps}` : undefined,
      s.rir != null ? `RIR ${s.rir}` : undefined,
      s.rpe != null ? `RPE ${s.rpe}` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <div className="trk-session">
      <p className="trk-session-status">
        {log
          ? log.status === "finished"
            ? "Logged · finished"
            : "Logged · not finished"
          : "Not logged"}
      </p>
      {log ? (
        <ul>
          {log.exercises.map((exercise) => (
            <li key={exercise.exerciseKey}>
              <b>{exercise.prescription.name}</b>
              <span>
                {exercise.sets
                  .filter((s) => s.done)
                  .map(setLine)
                  .join(" · ") || "No sets logged"}
              </span>
            </li>
          ))}
        </ul>
      ) : scheduled ? (
        <ul>
          {scheduled.session.exercises.map((exercise) => (
            <li key={exercise.id}>
              <b>{exercise.name}</b>
              <span>{exercise.sets.length} sets planned</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="trk-session-actions">
        <Button variant="secondary" size="sm" onClick={onOpenPlan}>
          Open training plan
        </Button>
      </div>
    </div>
  );
}
