"use client";

/**
 * Athlete profile → Tracker tab: every day the client logged, chronological
 * downwards, grouped into week rows of separate column-group tiles (the
 * sheet layout). Columns come from the client's snapshot tracker fields and
 * configured tracker layout (falling back to automatic grouping).
 * Coaches read values and add notes; check-ins, plan changes and training
 * sessions link out from the date and session columns.
 */

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  ChevronRight,
  ClipboardCheck,
  Crosshair,
  Flag,
  Info,
  Pin,
  PinOff,
  Repeat,
  Shrink,
} from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
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
  allParameters,
  type CoachClient,
  type CoachState,
  formatDate,
  type Route,
} from "../model";
import { trainingPlanAt } from "../plans/domain";
import { phaseRanges } from "../plans/phase-planning";
import type { TrainingSessionLog } from "../plans/types";
import { useCoach } from "../store";
import { addLocalDays, localToday } from "../targets/model";
import {
  clientTracking,
  clientTrackingText,
  withTrackingText,
  withTrackingValue,
} from "../tracking/data";
import {
  dayTypeOptions,
  loggedDayType,
  planFollowed,
  prescribedDayType,
  withDayType,
  withPlanFollowed,
} from "../tracking/nutrition-day";
import { Button, Dialog } from "../ui";
import {
  COLLAPSE_EXPAND_MS,
  Collapsible,
  useFadePresence,
} from "./collapsible";
import { fillColumns } from "./fill-columns";
import { enumerateWeeks } from "./timeline-tab";
import { buildGroups, type Col, type Group } from "./tracker-columns";
import { temporaryPlanRoute, temporaryPlanTargets } from "./tracker-temporary";
import "./tracker-tab.css";

// ─── Column model ───────────────────────────────────────────────────

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
  /** Set on a temporary nutrition plan marker so its tooltip can resolve targets. */
  temporaryId?: string;
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
      const plan = trainingPlanAt(plans.training, monday);
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
        label: `${temp.label} (${temp.startDate} – ${temp.endDate}) · open temporary plan`,
        route: clientRoute({
          tab: "Plans",
          plan: temporaryPlanRoute(temp),
        }),
        temporaryId: temp.id,
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
            : event.kind === "intro"
              ? "Intro"
              : "Refeed",
      label: `${event.kind === "diet-break" ? "Diet break" : event.kind === "deload" ? "Deload" : event.kind === "intro" ? "Intro week" : "Refeed"} starts · open timeline`,
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
      const label = loggedDayType(client, date) ?? "";
      return { text: label, empty: !label };
    }
    case "plan": {
      const on = planFollowed(client, date);
      return { text: on ? "✓" : "", empty: !on };
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
  if (col.kind === "plan") {
    const n = logged.filter((d) => planFollowed(client, d)).length;
    return plain(n ? `${n}/${days.length} days` : "");
  }
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
  let width = textWidth(label, "500 12px");
  if (col.kind === "rating") width = Math.max(width, 22);
  if (col.kind === "flow") width = Math.max(width, 34);
  const freeText = col.kind === "text" || col.kind === "coach";
  if (freeText) width = Math.max(width, 134);
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

// ─── Tooltip ────────────────────────────────────────────────────────

const TIP_DELAY_MS = 300;

/**
 * Tracker tooltip on the Base UI primitive. Hover opens after the shared
 * delay and keyboard focus opens immediately; the popup renders in a portal
 * outside `.trk-scroll` so the scroller cannot clip it. Scrolling or panning
 * closes it, and a pointer press suppresses it until release so drag-to-pan
 * never leaves a bubble hanging over the grid.
 */
function TrackerTooltip({
  trigger,
  children,
  delay = TIP_DELAY_MS,
}: {
  trigger: ReactElement;
  children: ReactNode;
  delay?: number;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const pointerDown = useRef(false);
  // `.coach-root` carries the theme variables; it also sits outside the
  // tracker scroller, so the portal escapes the clip without losing tokens.
  const container = anchor?.closest<HTMLElement>(".coach-root") ?? undefined;

  useEffect(() => {
    if (!anchor) return;
    const scroller = anchor.closest<HTMLElement>(".trk-scroll");
    if (!scroller) return;
    const close = () => setOpen(false);
    const press = () => {
      pointerDown.current = true;
      setOpen(false);
    };
    const release = () => {
      pointerDown.current = false;
    };
    scroller.addEventListener("scroll", close, { passive: true });
    window.addEventListener("scroll", close, { passive: true });
    scroller.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      scroller.removeEventListener("scroll", close);
      window.removeEventListener("scroll", close);
      scroller.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [anchor]);

  return (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          return;
        }
        const scroller = anchor?.closest<HTMLElement>(".trk-scroll");
        if (pointerDown.current || scroller?.dataset.panning) return;
        setOpen(true);
      }}
    >
      <TooltipPrimitive.Trigger
        ref={setAnchor}
        delay={delay}
        aria-describedby={id}
        render={trigger}
      />
      <TooltipPrimitive.Portal container={container}>
        <TooltipPrimitive.Positioner
          className="trk-tip-pos"
          side="top"
          align="center"
          sideOffset={8}
        >
          <TooltipPrimitive.Popup id={id} role="tooltip" className="trk-tip">
            {children}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
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

export function AthleteTrackerTab({
  client,
  viewer = "coach",
  onOpen,
}: {
  client: CoachClient;
  viewer?: "coach" | "client";
  onOpen?: (tab: string, plan?: string) => void;
}) {
  const { state, setState, navigate } = useCoach();
  const today = localToday();
  const groups = useMemo(() => {
    const all = buildGroups(client);
    if (viewer === "client")
      return all
        .map((g) => ({ ...g, cols: g.cols.filter((c) => c.kind !== "coach") }))
        .filter((g) => g.cols.length > 0);
    return all;
  }, [client, viewer]);
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
  /** Configured defaults seed the layout until the coach toggles it. */
  const configuredCollapsed = useMemo(
    () => new Set(groups.filter((g) => g.collapsed).map((g) => g.id)),
    [groups],
  );
  const configuredPinned = useMemo(
    () => groups.filter((g) => g.pinned).map((g) => g.id),
    [groups],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.collapsed).map((g) => g.id)),
  );
  const [pinned, setPinned] = useState<string[]>(() =>
    groups.filter((g) => g.pinned).map((g) => g.id),
  );
  // Re-seed when the configured layout actually changes (a snapshot edit or a
  // live template edit), without discarding the coach's manual layout on
  // unrelated renders.
  const configuredLayoutKey = useMemo(
    () =>
      JSON.stringify(
        groups.map((group) => [
          group.id,
          group.collapsed === true,
          group.pinned === true,
        ]),
      ),
    [groups],
  );
  const seededLayoutKey = useRef(configuredLayoutKey);
  useEffect(() => {
    if (seededLayoutKey.current === configuredLayoutKey) return;
    seededLayoutKey.current = configuredLayoutKey;
    setCollapsedGroups(new Set(configuredCollapsed));
    setPinned([...configuredPinned]);
  }, [configuredLayoutKey, configuredCollapsed, configuredPinned]);
  const [note, setNote] = useState<NoteTarget | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [edit, setEdit] = useState<NoteTarget | null>(null);
  const [inline, setInline] = useState<{ date: string; key: string } | null>(
    null,
  );
  const [editMulti, setEditMulti] = useState<string[]>([]);
  const [session, setSession] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  /** Bulk week actions settle instantly instead of animating every row. */
  const [instant, setInstant] = useState(false);
  const instantTimerRef = useRef<number | undefined>(undefined);
  const widthAnimTimerRef = useRef<number | undefined>(undefined);
  /** Width of the scroll frame; the table fills it without ever measuring the canvas. */
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(
    () => () => {
      window.clearTimeout(instantTimerRef.current);
      window.clearTimeout(widthAnimTimerRef.current);
    },
    [],
  );

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

  /**
   * Natural column widths with spare frame width shared across the data
   * columns of expanded groups. The date column, inter-group gaps and
   * collapsed strips are fixed; a group's label minimum is folded into its
   * last column so every tile can grow to meet the frame without dead space.
   */
  const layout = useMemo(() => {
    const expandedWidths = new Map<string, number>();
    const groupWidths = new Map<string, number>();
    const grids = new Map<string, string>();
    const columnsPerGroup = new Map<string, number[]>();
    const stretchable: {
      group: Group;
      column: number;
      natural: number;
    }[] = [];
    let fixed = dateWidth + groups.length * 20;
    for (const group of groups) {
      const columns = group.cols.map((col) => widths.get(col.key) ?? 60);
      const columnTotal = columns.reduce((sum, width) => sum + width, 0);
      const labelWidth = Math.ceil(
        textWidth(group.label.toUpperCase(), "600 11px") + 60,
      );
      if (collapsedGroups.has(group.id)) {
        groupWidths.set(group.id, 30);
        expandedWidths.set(group.id, Math.max(columnTotal, labelWidth));
        fixed += 30;
        continue;
      }
      if (labelWidth > columnTotal)
        columns[columns.length - 1] += labelWidth - columnTotal;
      columnsPerGroup.set(group.id, columns);
      for (let index = 0; index < columns.length; index += 1)
        stretchable.push({
          group,
          column: index,
          natural: columns[index],
        });
    }
    const filled = fillColumns(
      stretchable.map((entry) => entry.natural),
      frameWidth - fixed,
    );
    for (let index = 0; index < stretchable.length; index += 1) {
      const entry = stretchable[index];
      const columns = columnsPerGroup.get(entry.group.id) ?? [];
      columns[entry.column] = filled[index];
    }
    for (const group of groups) {
      const columns = columnsPerGroup.get(group.id);
      if (!columns) continue;
      const total = columns.reduce((sum, width) => sum + width, 0);
      expandedWidths.set(group.id, total);
      groupWidths.set(group.id, total);
      grids.set(
        group.id,
        columns.map((width) => `${String(width)}px`).join(" "),
      );
    }
    return { expandedWidths, groupWidths, grids };
  }, [dateWidth, frameWidth, groups, widths, collapsedGroups]);
  const groupFullWidth = (group: Group) =>
    layout.expandedWidths.get(group.id) ?? 0;
  const groupWidth = (group: Group) =>
    layout.groupWidths.get(group.id) ??
    (collapsedGroups.has(group.id) ? 30 : groupFullWidth(group));
  const gridOf = (group: Group) => layout.grids.get(group.id) ?? "";

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
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const hoverStyleRef = useRef<HTMLStyleElement | null>(null);
  const [height, setHeight] = useState<number>();

  // Measure the scroll frame, never the canvas: the canvas is sized from this
  // width, so observing it would feed its own output back into the measurement.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reattach when the desktop scroller mounts.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setFrameWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [narrow]);

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
      if (
        (event.target as HTMLElement | null)?.closest(
          "input, textarea, select, a, .trk-editing",
        )
      )
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
  const openEdit = (
    event: React.MouseEvent,
    date: string,
    col: Col,
    value: string,
  ) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setEdit({
      date,
      col,
      value,
      x: Math.min(rect.left, window.innerWidth - 260),
      y: Math.min(rect.bottom + 6, window.innerHeight - 220),
    });
    setEditMulti(
      value
        ? value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
    );
  };
  const saveEdit = (raw: string) => {
    if (!edit) return;
    const { date, col } = edit;
    const v = raw.trim();
    if (col.kind === "num" || col.kind === "rating") {
      const n = v === "" ? null : Number(v.replace(",", "."));
      if (v !== "" && !Number.isFinite(n)) return;
      updateClient((c) => withTrackingValue(c, date, col.key, n));
    } else {
      updateClient((c) => withTrackingText(c, date, col.key, v));
    }
  };
  const closeEdit = () => setEdit(null);
  const editParam = edit
    ? allParameters().find((param) => param.id === edit.col.key)
    : undefined;
  const commitEdit = (value: string) => {
    saveEdit(value);
    setEdit(null);
  };

  // Inline cell editing (client viewer): ordered list of editable column keys
  // for Tab navigation, plus day stepping within the displayed range.
  const editableKeys = ordered
    .flatMap((g) => g.cols)
    .filter(
      (c) =>
        c.kind !== "coach" &&
        c.kind !== "session" &&
        c.kind !== "plan" &&
        c.type !== "multi-choice",
    )
    .map((c) => c.key);
  const stepCol = (key: string, dir: number) => {
    const i = editableKeys.indexOf(key);
    return i < 0 ? undefined : editableKeys[i + dir];
  };
  const stepDate = (date: string, dir: number) => {
    const i = allDays.indexOf(date);
    const d = i < 0 ? undefined : allDays[i + dir];
    return d && d <= today ? d : undefined;
  };
  /** Writes an inline edit; returns false when the input is invalid. */
  const saveInline = (col: Col, date: string, raw: string) => {
    const v = raw.trim();
    if (col.kind === "num") {
      const n = v === "" ? null : Number(v.replace(",", "."));
      if (v !== "" && !Number.isFinite(n)) return false;
      updateClient((c) => withTrackingValue(c, date, col.key, n));
      return true;
    }
    if (col.kind === "rating") {
      const n = v === "" ? null : Number(v);
      if (
        v !== "" &&
        (!Number.isInteger(n) || n == null || n < 1 || n > col.max)
      )
        return false;
      updateClient((c) => withTrackingValue(c, date, col.key, n));
      return true;
    }
    if (col.kind === "day") {
      updateClient((c) => withDayType(c, date, v));
      return true;
    }
    updateClient((c) => withTrackingText(c, date, col.key, v));
    return true;
  };
  const commitInline = (
    col: Col,
    date: string,
    raw: string,
    next: { date: string; key: string } | null,
  ) => {
    if (saveInline(col, date, raw)) setInline(next);
    else setInline(null);
  };
  const onEditKey = (
    event: React.KeyboardEvent<HTMLElement>,
    col: Col,
    date: string,
  ) => {
    const v = (event.currentTarget as HTMLInputElement).value;
    if (event.key === "Enter") {
      event.preventDefault();
      const d = stepDate(date, 1);
      commitInline(col, date, v, d ? { date: d, key: col.key } : null);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const k = stepCol(col.key, event.shiftKey ? -1 : 1);
      commitInline(col, date, v, k ? { date, key: k } : null);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const d = stepDate(date, 1);
      commitInline(col, date, v, d ? { date: d, key: col.key } : null);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const d = stepDate(date, -1);
      commitInline(col, date, v, d ? { date: d, key: col.key } : null);
    } else if (event.key === "Escape") {
      setInline(null);
    }
  };
  const inlineEditor = (col: Col, date: string, initial: string) => {
    const param = allParameters().find((p) => p.id === col.key);
    if (col.kind === "day") {
      const options = dayTypeOptions(client, date);
      const prescribed = prescribedDayType(client, date);
      return (
        <select
          // biome-ignore lint/a11y/noAutofocus: cell enters edit mode on click.
          autoFocus
          className="trk-in"
          defaultValue={initial}
          onChange={(event) =>
            updateClient((c) => withDayType(c, date, event.target.value))
          }
          onBlur={() => setInline(null)}
          onKeyDown={(event) => onEditKey(event, col, date)}
          aria-label={col.label}
        >
          {options.map((o) => (
            <option key={o.label} value={o.label}>
              {o.label}
              {o.label === prescribed ? " (prescribed)" : ""}
            </option>
          ))}
        </select>
      );
    }
    if (
      col.kind === "flow" ||
      param?.inputType === "choice" ||
      param?.inputType === "context"
    ) {
      return (
        <select
          // biome-ignore lint/a11y/noAutofocus: cell enters edit mode on click.
          autoFocus
          className="trk-in"
          defaultValue={initial}
          onChange={(event) =>
            updateClient((c) =>
              withTrackingText(c, date, col.key, event.target.value),
            )
          }
          onBlur={() => setInline(null)}
          onKeyDown={(event) => onEditKey(event, col, date)}
          aria-label={col.label}
        >
          <option value="">—</option>
          {(param?.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        // biome-ignore lint/a11y/noAutofocus: cell enters edit mode on click.
        autoFocus
        className="trk-in"
        inputMode={
          col.kind === "num" || col.kind === "rating" ? "decimal" : undefined
        }
        defaultValue={initial}
        placeholder={col.key === "blood-pressure" ? "118 / 76" : undefined}
        onKeyDown={(event) => onEditKey(event, col, date)}
        onBlur={(event) => {
          saveInline(col, date, event.target.value);
          setInline(null);
        }}
        aria-label={col.label}
      />
    );
  };

  const sameSet = (a: Set<string>, b: Set<string>) =>
    a.size === b.size && [...a].every((id) => b.has(id));
  const sameList = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, index) => id === b[index]);
  const layoutChanged =
    !sameSet(collapsedGroups, configuredCollapsed) ||
    !sameList(pinned, configuredPinned);
  /** Opt group widths into the existing transition for this toggle only. */
  const markWidthAnimating = () => {
    const section = sectionRef.current;
    if (!section) return;
    section.dataset.widthAnim = "1";
    window.clearTimeout(widthAnimTimerRef.current);
    widthAnimTimerRef.current = window.setTimeout(() => {
      if (sectionRef.current === section) delete section.dataset.widthAnim;
    }, COLLAPSE_EXPAND_MS + 80);
  };
  const resetLayout = () => {
    if (!sameSet(collapsedGroups, configuredCollapsed)) markWidthAnimating();
    setPinned([...configuredPinned]);
    setCollapsedGroups(new Set(configuredCollapsed));
  };
  const toggleGroup = (id: string) => {
    markWidthAnimating();
    setCollapsedGroups((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePin = (id: string) =>
    setPinned((list) =>
      list.includes(id) ? list.filter((p) => p !== id) : [...list, id],
    );
  const toggleWeek = (monday: string) => {
    // Column widths recompute from the post-toggle state immediately so the
    // table never waits for the row height animation.
    setCollapsedWeeks((s) => {
      const next = new Set(s);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  };
  /** Expand/Collapse all: only animate when a handful of weeks change. */
  const setAllWeeks = (next: Set<string>) => {
    const changed = weeks.reduce(
      (count, week) =>
        count +
        (collapsedWeeks.has(week.monday) !== next.has(week.monday) ? 1 : 0),
      0,
    );
    if (changed > 12) {
      setInstant(true);
      window.clearTimeout(instantTimerRef.current);
      instantTimerRef.current = window.setTimeout(() => {
        instantTimerRef.current = undefined;
        setInstant(false);
      }, 50);
    }
    setCollapsedWeeks(next);
  };

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
    let dayType: { logged: string; prescribed: string } | undefined;
    const editableCell =
      viewer === "client" &&
      !future &&
      col.kind !== "coach" &&
      col.kind !== "session" &&
      col.kind !== "plan";
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
    if (!c.empty && col.kind === "day") {
      const prescribed = prescribedDayType(client, date);
      const overridden = !!prescribed && c.text !== prescribed;
      if (overridden) dayType = { logged: c.text, prescribed };
      content = (
        <span className={`trk-chip${overridden ? " trk-chip-alt" : ""}`}>
          {c.text}
        </span>
      );
    }
    if (col.kind === "plan") {
      const on = planFollowed(client, date);
      const mark = on ? (
        <span className="trk-plan-on">✓</span>
      ) : (
        <span className="trk-mut">—</span>
      );
      if (future) return <span key={col.key} className="trk-c trk-num" />;
      if (viewer !== "client")
        return (
          <span key={col.key} className="trk-c trk-num">
            {mark}
          </span>
        );
      return (
        <button
          type="button"
          key={col.key}
          className="trk-c trk-num trk-plan"
          title={on ? "Followed plan" : "Mark plan as followed"}
          aria-pressed={on}
          onClick={() => updateClient((cc) => withPlanFollowed(cc, date, !on))}
        >
          {mark}
        </button>
      );
    }
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
    if (
      editableCell &&
      inline?.date === date &&
      inline?.key === col.key &&
      col.type !== "multi-choice"
    ) {
      const initial =
        col.kind === "num" || col.kind === "rating"
          ? c.raw == null
            ? ""
            : String(c.raw)
          : c.text;
      return (
        <span key={col.key} className={`trk-c ${align} trk-editing`}>
          {inlineEditor(col, date, initial)}
        </span>
      );
    }
    const cell = (
      <button
        type="button"
        key={col.key}
        className={`trk-c ${align}`}
        title={col.kind === "text" || col.kind === "coach" ? c.text : undefined}
        onClick={(event) =>
          viewer === "client"
            ? !editableCell
              ? undefined
              : col.type === "multi-choice"
                ? openEdit(event, date, col, c.empty ? "" : c.text)
                : setInline({ date, key: col.key })
            : openNote(event, date, col, c.empty ? "" : c.text)
        }
      >
        {content}
        {viewer === "coach" && hasNote && col.kind !== "coach" && (
          <span className="trk-cdot" />
        )}
      </button>
    );
    const targets =
      col.kind === "day" ? temporaryPlanTargets(client, date) : undefined;
    if (!dayType && !targets) return cell;
    return (
      <TrackerTooltip key={col.key} trigger={cell}>
        {dayType && (
          <span className="trk-tip-line">
            Logged: {dayType.logged} · Plan: {dayType.prescribed}
          </span>
        )}
        {dayType && (
          <span className="trk-tip-detail">
            Athlete logged a different day type than the plan schedules
          </span>
        )}
        {targets && (
          <span className="trk-tip-line">
            {targets.label} · {fmt(targets.kcal, 0)} kcal
          </span>
        )}
        {targets && (
          <span className="trk-tip-detail">
            {targets.optionLabel !== targets.label
              ? `${targets.optionLabel} · `
              : ""}
            P {fmt(targets.protein, 0)} · C {fmt(targets.carbs, 0)} · F{" "}
            {fmt(targets.fat, 0)} g
          </span>
        )}
      </TrackerTooltip>
    );
  };

  const sizeOf = (group: Group): CSSProperties => ({
    width: groupWidth(group),
  });

  const renderMarker = (m: Marker, date: string) => {
    const targets = m.temporaryId
      ? temporaryPlanTargets(client, date)
      : undefined;
    const trigger = (
      <button
        type="button"
        key={targets ? undefined : m.id}
        className="trk-marker"
        // Temporary/refeed markers already have a TrackerTooltip; a native
        // title would stack a second browser tooltip on top of it.
        title={targets ? undefined : m.label}
        onClick={() =>
          onOpen
            ? onOpen(
                m.route.tab === "Plans"
                  ? "Plans"
                  : m.route.tab === "Timeline"
                    ? "Timeline"
                    : m.route.section === "check-ins"
                      ? "Check-ins"
                      : (m.route.tab ?? "Overview"),
                m.route.plan,
              )
            : navigate(m.route)
        }
      >
        {m.icon}
        {m.short}
      </button>
    );
    if (!targets) return trigger;
    return (
      <TrackerTooltip key={m.id} trigger={trigger}>
        <span className="trk-tip-line">
          {targets.label} · {fmt(targets.kcal, 0)} kcal
        </span>
        <span className="trk-tip-detail">
          {targets.optionLabel !== targets.label
            ? `${targets.optionLabel} · `
            : ""}
          P {fmt(targets.protein, 0)} · C {fmt(targets.carbs, 0)} · F{" "}
          {fmt(targets.fat, 0)} g
        </span>
      </TrackerTooltip>
    );
  };

  const renderWeek = (week: Week, phaseLabel: ReactNode) => {
    const collapsed = collapsedWeeks.has(week.monday);
    const dates = `${formatDate(week.monday, { day: "numeric", month: "short" })} – ${formatDate(week.sunday, { day: "numeric", month: "short" })}`;
    return (
      <Fragment key={week.monday}>
        {phaseLabel}
        <div className="trk-week" data-collapsed={collapsed ? "" : undefined}>
          <div className="trk-mask" style={{ width: dateWidth + 20 }}>
            <div className="trk-tile trk-date" style={{ width: dateWidth }}>
              <Collapsible
                open={!collapsed}
                instant={instant}
                className="trk-week-rows"
              >
                {() =>
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
                          {markers.slice(0, 2).map((m) => renderMarker(m, d))}
                        </span>
                      </div>
                    );
                  })
                }
              </Collapsible>
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
                data-collapsed={isCollapsed ? "" : undefined}
              >
                <Collapsible
                  open={!collapsed}
                  instant={instant}
                  className="trk-week-rows"
                >
                  {() => (
                    <TrackerGroupRows
                      group={group}
                      days={week.days}
                      grid={gridOf(group)}
                      width={groupFullWidth(group)}
                      isCollapsed={isCollapsed}
                      today={today}
                      renderCell={renderCell}
                    />
                  )}
                </Collapsible>
                <TrackerSummaryBand
                  isCollapsed={isCollapsed}
                  grid={gridOf(group)}
                >
                  {() =>
                    group.cols.map((col) => (
                      <span
                        key={col.key}
                        className={`trk-sum ${col.kind === "text" || col.kind === "coach" || col.kind === "session" || col.kind === "day" ? "trk-txt" : ""}`}
                      >
                        {summaryText(col, week.days, data, client)}
                      </span>
                    ))
                  }
                </TrackerSummaryBand>
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
    <section className="trk" ref={sectionRef}>
      <style ref={hoverStyleRef} />
      <div className="trk-toolbar">
        <span className="trk-range">{rangeLabel}</span>
        <span className="trk-sp" />
        {layoutChanged && (
          <Button variant="ghost" size="sm" onClick={resetLayout}>
            Reset layout
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAllWeeks(new Set())}
        >
          Expand all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAllWeeks(new Set(weeks.map((w) => w.monday)))}
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
                <TrackerGroupHead
                  key={group.id}
                  group={group}
                  isPinned={isPinned}
                  isCollapsed={isCollapsed}
                  width={groupWidth(group)}
                  fullWidth={groupFullWidth(group)}
                  grid={gridOf(group)}
                  onTogglePin={() => togglePin(group.id)}
                  onToggleGroup={() => toggleGroup(group.id)}
                />
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

      {edit && (
        <>
          <button
            type="button"
            className="trk-pop-backdrop"
            aria-label="Close editor"
            onClick={closeEdit}
          />
          <div
            className="trk-pop"
            style={{ left: edit.x, top: edit.y }}
            role="dialog"
            aria-label={`Edit ${edit.col.label}`}
          >
            <h4>
              {formatDate(edit.date, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              {" · "}
              {edit.col.label}
            </h4>
            <div className="trk-edit-chips">
              {(editParam?.options ?? []).map((opt) => {
                const on = editMulti.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`cm-optchip${on ? " on" : ""}`}
                    aria-pressed={on}
                    onClick={() =>
                      setEditMulti(
                        on
                          ? editMulti.filter((v) => v !== opt)
                          : [...editMulti, opt],
                      )
                    }
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            <div className="trk-pop-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  saveEdit("");
                  setEdit(null);
                }}
              >
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => commitEdit(editMulti.join(", "))}
              >
                Done
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

function TrackerGroupHead({
  group,
  isPinned,
  isCollapsed,
  width,
  fullWidth,
  grid,
  onTogglePin,
  onToggleGroup,
}: {
  group: Group;
  isPinned: boolean;
  isCollapsed: boolean;
  width: number;
  fullWidth: number;
  grid: string;
  onTogglePin: () => void;
  onToggleGroup: () => void;
}) {
  const full = useFadePresence(!isCollapsed);
  const strip = useFadePresence(isCollapsed);

  return (
    <div
      className="trk-hg"
      style={{ width }}
      data-group={group.id}
      data-collapsed={isCollapsed ? "" : undefined}
    >
      {full.mounted && (
        <div
          className="trk-hg-full"
          style={{ width: fullWidth }}
          data-visible={full.visible ? "" : undefined}
          aria-hidden={!full.visible || undefined}
          inert={!full.visible || undefined}
        >
          <div className="trk-hg-title v8-overline">
            <span>{group.label}</span>
            <span className="trk-hg-actions">
              <button
                type="button"
                onClick={onTogglePin}
                aria-label={`${isPinned ? "Unpin" : "Pin"} ${group.label}`}
                title={isPinned ? "Unpin" : "Pin next to dates"}
                data-on={isPinned ? "" : undefined}
              >
                {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
              <button
                type="button"
                onClick={onToggleGroup}
                aria-label={`Collapse ${group.label}`}
                title="Collapse"
              >
                <Shrink size={12} />
              </button>
            </span>
          </div>
          <div className="trk-hg-labels" style={{ gridTemplateColumns: grid }}>
            {group.cols.map((col) => (
              <span
                key={col.key}
                className={`trk-clab ${col.kind === "text" || col.kind === "coach" || col.kind === "session" || col.kind === "day" ? "trk-txt" : ""}`}
              >
                {col.label}
                {col.unit && col.unit !== col.label && (
                  <span className="trk-subtle"> {col.unit}</span>
                )}
                {col.kind === "day" && (
                  <TrackerTooltip
                    trigger={
                      <button
                        type="button"
                        className="trk-clab-info"
                        aria-label="About the Day column"
                      >
                        <Info size={10} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    }
                  >
                    <span className="trk-tip-line">
                      Pink border: logged day type differs from the plan
                    </span>
                  </TrackerTooltip>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      {strip.mounted && (
        <button
          type="button"
          className="trk-hg-strip"
          data-visible={strip.visible ? "" : undefined}
          onClick={onToggleGroup}
          title={`Expand ${group.label}`}
          aria-label={`Expand ${group.label}`}
          aria-expanded={false}
          aria-hidden={!strip.visible || undefined}
          tabIndex={strip.visible ? undefined : -1}
        >
          {group.label}
        </button>
      )}
    </div>
  );
}

function TrackerGroupRows({
  group,
  days,
  grid,
  width,
  isCollapsed,
  today,
  renderCell,
}: {
  group: Group;
  days: string[];
  grid: string;
  width: number;
  isCollapsed: boolean;
  today: string;
  renderCell: (col: Col, date: string) => ReactNode;
}) {
  const cells = useFadePresence(!isCollapsed);

  return (
    <div className="trk-grouprows" style={{ width }}>
      {cells.mounted ? (
        <div
          className="trk-grouprows-fade"
          data-visible={cells.visible ? "" : undefined}
        >
          {days.map((d) => (
            <div
              key={d}
              className="trk-row"
              data-date={d}
              data-today={d === today ? "" : undefined}
              style={{ gridTemplateColumns: grid }}
            >
              {group.cols.map((col) => renderCell(col, d))}
            </div>
          ))}
        </div>
      ) : (
        <div className="trk-collapsed-fill" />
      )}
    </div>
  );
}

function TrackerSummaryBand({
  isCollapsed,
  grid,
  children,
}: {
  isCollapsed: boolean;
  grid: string;
  children: ReactNode | (() => ReactNode);
}) {
  const summary = useFadePresence(!isCollapsed);

  return (
    <div
      className="trk-band"
      data-visible={summary.visible ? "" : undefined}
      style={summary.mounted ? { gridTemplateColumns: grid } : undefined}
    >
      {summary.mounted
        ? typeof children === "function"
          ? children()
          : children
        : null}
    </div>
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
    ? trainingPlanAt(client.plans.training, date)
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
