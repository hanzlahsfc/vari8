"use client";

import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  MessageCircle,
  Pin,
  Plus,
  Settings,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  displayWeek,
  scheduledSessions,
  sessionStatus,
} from "../../client-app/training-log/model";
import {
  calculateVariantNutrients,
  type MealPlan,
  type Nutrients,
  type TargetValue,
} from "../../ethereal/mealplan/model";
import { SegmentedControl, Status } from "../../vari8/components";
import {
  addDays,
  type CoachClient,
  type CoachState,
  checkInDeadline,
  DAYS,
  pickCheckInCard,
  resolvedTimeZone,
  TODAY,
  unreadCount,
  zonedToday,
} from "../model";
import {
  applicablePlan,
  planFoodMap,
  scheduledOption,
  targetNumber,
  trainingWeek,
} from "../plans/domain";
import { phaseRanges } from "../plans/phase-planning";
import { optionDaysLabel } from "../plans/plan-cards-support";
import { type IifymPlan, resolveTrainingWeek } from "../plans/types";
import { useCoach, useCoachNow, useDisplay } from "../store";
import {
  addLocalDays,
  type CardioTarget,
  formatActivityTarget,
  localToday,
  resolveActivityTarget,
  type StepsTarget,
} from "../targets/model";
import { clientTracking } from "../tracking/data";
import {
  Avatar,
  Button,
  Dialog,
  IconButton,
  Select,
  Surface,
  Toggle,
} from "../ui";
import {
  currentPhase,
  nutritionForDate,
  weekTrainingSummary,
} from "./timeline";
import "./overview.css";

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const number1 = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const DAY_MS = 86_400_000;
const daysBetween = (start: string, end: string) =>
  Math.round(
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
      DAY_MS,
  );

/** Single header above the client tabs — shared by every tab. */
export function AthleteProfileHeader({
  client,
  onBack,
  onAssign,
  onAddDate,
}: {
  client: CoachClient;
  onBack: () => void;
  onAssign: () => void;
  onAddDate: () => void;
}) {
  const { formatDate } = useDisplay();
  const { state, navigate, route } = useCoach();
  const today = localToday();
  const phase = currentPhase(client.phases, today);
  const unread = unreadCount(state, client.id);
  const [settings, setSettings] = useState(false);
  const subline = phase
    ? `${phase.name} · Week ${String(phase.week)} of ${String(phase.weeks)}`
    : [client.label, client.phase, `Week ${String(client.week)}`]
        .filter(Boolean)
        .join(" · ");
  const meta = [
    client.email,
    client.coachingSince
      ? `Coaching since ${formatDate(client.coachingSince, { year: "numeric" })}`
      : undefined,
    client.heightCm ? `${String(client.heightCm)} cm` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className="ap-header">
      <div className="ap-header-id">
        <IconButton label="Back to clients" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
        </IconButton>
        <Avatar client={client} />
        <div className="ap-header-text">
          <h1>{client.name}</h1>
          {subline && <p className="ap-sub">{subline}</p>}
          {meta && <p className="ap-meta">{meta}</p>}
        </div>
      </div>
      <div className="ap-header-actions">
        <Button
          primary
          onClick={() => navigate({ ...route, tab: "Plans", plan: "setup" })}
        >
          Edit plans
        </Button>
        <Button
          variant="secondary"
          onClick={() => window.open(`/client?client=${client.id}`, "_blank")}
        >
          <ExternalLink size={15} aria-hidden="true" /> Open client app
        </Button>
        <IconButton
          label={`Open chat${unread ? ` (${String(unread)} unread)` : ""}`}
          onClick={() => navigate({ section: "messages", client: client.id })}
        >
          <MessageCircle size={16} aria-hidden="true" />
          {unread > 0 && <span className="ap-unread">{unread}</span>}
        </IconButton>
        <IconButton label="Client settings" onClick={() => setSettings(true)}>
          <Settings size={16} aria-hidden="true" />
        </IconButton>
      </div>
      {settings && (
        <ClientSettingsDialog
          client={client}
          onAssign={onAssign}
          onAddDate={onAddDate}
          onClose={() => setSettings(false)}
        />
      )}
    </header>
  );
}

/** Client settings: coaching setup (assignment, check-in rhythm, priority
 *  messages) and the client's submitted onboarding answers. */
function ClientSettingsDialog({
  client,
  onAssign,
  onAddDate,
  onClose,
}: {
  client: CoachClient;
  onAssign: () => void;
  onAddDate: () => void;
  onClose: () => void;
}) {
  const { formatDate } = useDisplay();
  const { state, setState, navigate, toast } = useCoach();
  const update = (fn: (c: CoachClient) => CoachClient) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((cl) => (cl.id === client.id ? fn(cl) : cl)),
    }));
  const activeSchedule = client.schedules.at(-1);
  return (
    <Dialog title="Client settings" onClose={onClose} wide>
      <section className="ap-settings-section">
        <h3>Coaching setup</h3>
        <h4>Template</h4>
        <div className="ap-plan-row">
          <div className="ap-plan-text">
            <b>{client.assignment?.snapshot.name ?? "No template"}</b>
            {client.assignment && (
              <span className="ap-sub">
                Variant{" "}
                {client.assignment.snapshot.variants.find(
                  (v) => v.id === client.assignment?.variantId,
                )?.name ?? client.assignment.variantId}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
              onAssign();
            }}
          >
            Change
          </Button>
        </div>
        <h4>Recurring check-in</h4>
        <p className="ap-sub">
          Recurring check-ins · {resolvedTimeZone(state.preferences)}
        </p>
        <div className="cd-weekdays">
          {DAYS.map((day, index) => (
            <button
              type="button"
              key={day}
              aria-label={day}
              aria-pressed={activeSchedule?.weekdays.includes(index) ?? false}
              onClick={() => {
                const oldDays = client.schedules.at(-1)?.weekdays ?? [];
                const weekdays = oldDays.includes(index)
                  ? oldDays.filter((d) => d !== index)
                  : [...oldDays, index];
                update((cl) => ({
                  ...cl,
                  schedules: [
                    ...cl.schedules.filter(
                      (s) => s.effective !== addDays(TODAY, 1),
                    ),
                    { effective: addDays(TODAY, 1), weekdays },
                  ],
                }));
                toast(
                  "Recurring schedule updated from tomorrow. Submitted history retained.",
                );
              }}
            >
              {day.slice(0, 2)}
            </button>
          ))}
        </div>
        {client.schedules.some((s) => s.effective > TODAY) && (
          <p className="ap-sub">
            From tomorrow:{" "}
            {client.schedules
              .at(-1)
              ?.weekdays.map((d) => DAYS[d])
              .join(", ") || "No recurring days"}
          </p>
        )}
        <h4>Additional dates</h4>
        {state.extras
          .filter((e) => e.clientId === client.id)
          .map((extra) => (
            <div className="cd-setting-row" key={extra.id}>
              <span>
                {formatDate(extra.date)}
                <small>
                  {extra.type} · {extra.note}
                </small>
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                  navigate({ section: "check-ins", client: client.id });
                }}
              >
                Manage
              </Button>
            </div>
          ))}
        {!state.extras.some((e) => e.clientId === client.id) && (
          <p className="ap-sub">No additional dates.</p>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            onClose();
            onAddDate();
          }}
        >
          <Plus size={14} aria-hidden="true" /> Add date
        </Button>
        <h4>Priority message</h4>
        <Toggle
          label="Allow priority flags"
          detail="Applies to new chat flags. Training set notes stay separate."
          checked={client.priorityMessages}
          onChange={(priorityMessages) =>
            update((cl) => ({ ...cl, priorityMessages }))
          }
        />
      </section>
      <section className="ap-settings-section">
        <h3>Onboarding answers</h3>
        {client.onboarding.length ? (
          client.onboarding.map((a) => (
            <div className="cd-answer" key={a.question}>
              <h4>{a.question}</h4>
              <p>{a.answer}</p>
            </div>
          ))
        ) : (
          <p className="ap-sub">No onboarding submission on file.</p>
        )}
      </section>
    </Dialog>
  );
}

// ─── Shared card pieces ─────────────────────────────────────────────

/** Clickable card header — every overview card links to its data home. */
function CardLink({
  title,
  sub,
  onOpen,
}: {
  title: string;
  sub?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="ap-card-link" onClick={onOpen}>
      <span>
        <h3>{title}</h3>
        {sub && <p className="ap-sub">{sub}</p>}
      </span>
      <span className="ap-card-open">
        Open <ChevronRight size={14} aria-hidden="true" />
      </span>
    </button>
  );
}

const open = (
  navigate: ReturnType<typeof useCoach>["navigate"],
  clientId: string,
  route: { tab?: string; plan?: string },
) =>
  navigate({
    section: "clients",
    client: clientId,
    tab: route.tab,
    ...(route.tab === "Plans" && route.plan
      ? { module: route.plan }
      : { plan: route.plan }),
  });

// ─── Accuracy (targets vs tracked actuals) ──────────────────────────

type NumericTarget = number | TargetValue | undefined;

function accuracyRatio(
  actual: number | undefined,
  target: NumericTarget,
): number | undefined {
  if (actual === undefined || target === undefined) return undefined;
  if (typeof target === "number")
    return target > 0 ? actual / target : undefined;
  if (target.kind === "range") {
    if (actual >= target.min && actual <= target.max) return 1;
    return actual < target.min ? actual / target.min : actual / target.max;
  }
  return target.value > 0 ? actual / target.value : undefined;
}

const accuracyTone = (ratio: number | undefined) =>
  ratio === undefined
    ? undefined
    : Math.abs(ratio - 1) <= 0.05
      ? "positive"
      : Math.abs(ratio - 1) <= 0.1
        ? "neutral"
        : "warning";

function AccuracyChip({ ratio }: { ratio: number | undefined }) {
  if (ratio === undefined) return <span className="ap-acc ap-sub">—</span>;
  const pct = Math.round(ratio * 100);
  return (
    <span className="ap-acc" data-tone={accuracyTone(ratio)}>
      {pct}%
    </span>
  );
}

const targetMid = (target: NumericTarget): number | undefined =>
  typeof target === "number"
    ? target
    : target
      ? targetNumber(target) || undefined
      : undefined;

const targetText = (target: NumericTarget, decimals = false): string => {
  if (target === undefined) return "—";
  const format = decimals ? number1 : integer;
  if (typeof target === "number") return format.format(target);
  if (target.kind === "range")
    return `${format.format(target.min)}–${format.format(target.max)}`;
  return `${target.kind === "minimum" ? "≥" : ""}${format.format(target.value)}`;
};

// ─── Data helpers ───────────────────────────────────────────────────

type OptionTargets = {
  calories: NumericTarget;
  protein: NumericTarget;
  carbs: NumericTarget;
  fat: NumericTarget;
};

function optionTargets(
  plan: MealPlan | IifymPlan,
  source: "mealPlan" | "iifym",
  optionId: string | undefined,
): OptionTargets | undefined {
  if (!optionId) return undefined;
  if (source === "iifym") {
    const option = (plan as IifymPlan).options.find(
      (entry) => entry.id === optionId,
    );
    if (!option) return undefined;
    const protein = option.targets.protein;
    const carbs = option.targets.carbs;
    const fat = option.targets.fat;
    const derived =
      targetNumber(protein) * 4 +
      targetNumber(carbs) * 4 +
      targetNumber(fat) * 9;
    return {
      calories: option.targets.calories ?? (derived > 0 ? derived : undefined),
      protein,
      carbs,
      fat,
    };
  }
  const variant = (plan as MealPlan).variants.find(
    (entry) => entry.id === optionId,
  );
  if (!variant) return undefined;
  const totals: Nutrients = calculateVariantNutrients(variant, planFoodMap);
  return {
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
  };
}

/** Mean of a tracked metric on the days where `match` holds. */
function trackedAverage(
  client: CoachClient,
  days: string[],
  metric: string,
  match: (date: string) => boolean,
): number | undefined {
  const entries = clientTracking(client);
  const values = days
    .filter(match)
    .map((date) => entries.find((entry) => entry.date === date)?.values[metric])
    .filter((value): value is number => value != null);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

const lastDays = (today: string, count: number) =>
  Array.from({ length: count }, (_, i) => addLocalDays(today, i - count + 1));

const weightOn = (client: CoachClient, date: string): number | undefined => {
  const entries = clientTracking(client)
    .filter((entry) => entry.values.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return ([...entries].reverse().find((entry) => entry.date <= date)?.values
    .weight ??
    entries[0]?.values.weight ??
    undefined) as number | undefined;
};

const dayLabel = (
  formatDate: (d: string, o?: Intl.DateTimeFormatOptions) => string,
  date: string,
) => formatDate(date, { weekday: "short", day: "numeric", month: "short" });

const relDay = (date: string, today: string) => {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${String(diff)} days` : `${String(-diff)} days overdue`;
};

// ─── Cards ──────────────────────────────────────────────────────────

function PhaseProgressCard({
  client,
  today,
  onOpen,
}: {
  client: CoachClient;
  today: string;
  onOpen: () => void;
}) {
  const { formatDate } = useDisplay();
  const labelsRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState<Set<number>>(new Set());
  const ranges = phaseRanges(client.phases);
  // Labels that don't fit their segment are moved to a small legend row.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the segment count changes; ranges content is read via the DOM.
  useLayoutEffect(() => {
    const row = labelsRef.current;
    if (!row) return;
    const measure = () => {
      const next = new Set<number>();
      row.querySelectorAll<HTMLElement>("[data-seg]").forEach((el, i) => {
        if (el.scrollWidth > el.clientWidth + 2) next.add(i);
      });
      setOverflowing((prev) =>
        prev.size === next.size && [...next].every((i) => prev.has(i))
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [ranges.length]);
  const totalWeeks = ranges.reduce((sum, r) => sum + r.durationWeeks, 0);
  const phase = currentPhase(client.phases, today);
  const next = ranges.find((r) => r.startDate > today);
  return (
    <Surface className="ap-card ap-w-s6">
      <CardLink title="Phase progress" onOpen={onOpen} />
      {ranges.length ? (
        <>
          <div className="ap-phase-head">
            <div>
              <b>{phase?.name ?? "Outside the plan window"}</b>
              {phase && (
                <p className="ap-sub">
                  Week {phase.week} of {phase.weeks}
                </p>
              )}
            </div>
            {phase && (
              <span className="ap-sub">
                {formatDate(phase.startDate, {
                  day: "numeric",
                  month: "short",
                })}{" "}
                –{" "}
                {formatDate(phase.endDate, { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
          <div className="ap-phase-bar" role="img" aria-label="Phase progress">
            {ranges.map((range) => {
              const width = (range.durationWeeks / totalWeeks) * 100;
              const fill =
                today < range.startDate
                  ? 0
                  : today > range.endDate
                    ? 100
                    : ((daysBetween(range.startDate, today) + 1) /
                        (range.durationWeeks * 7)) *
                      100;
              return (
                <span
                  key={range.name + range.startDate}
                  className="ap-phase-seg"
                  style={{ width: `${width}%` }}
                  title={`${range.name} · ${formatDate(range.startDate, { weekday: "short" })} – ${formatDate(range.endDate, { weekday: "short" })}`}
                >
                  <span
                    className="ap-phase-fill"
                    style={{ width: `${Math.min(100, fill)}%` }}
                  />
                </span>
              );
            })}
          </div>
          <div className="ap-phase-labels" ref={labelsRef}>
            {ranges.map((range, index) => (
              <span
                key={range.name}
                data-seg
                className="ap-sub"
                style={{
                  width: `${(range.durationWeeks / totalWeeks) * 100}%`,
                }}
              >
                {overflowing.has(index) ? "" : range.name}
              </span>
            ))}
          </div>
          {overflowing.size > 0 && (
            <div className="ap-phase-legend">
              {ranges.map((range, index) =>
                overflowing.has(index) ? (
                  <span key={range.name} className="ap-sub">
                    <i className="ap-phase-dot" />
                    {range.name} · {range.durationWeeks}w
                  </span>
                ) : null,
              )}
            </div>
          )}
          <p className="ap-sub ap-phase-next">
            {next
              ? `Next: ${next.name} in ${String(Math.max(0, Math.round(daysBetween(today, next.startDate) / 7)))} weeks`
              : today > (ranges.at(-1)?.endDate ?? "9999-12-31")
                ? "Plan complete"
                : "Final phase"}
          </p>
        </>
      ) : (
        <div className="ap-empty">
          <p>No phase plan yet.</p>
          <Button variant="secondary" onClick={onOpen}>
            Plan phases
          </Button>
        </div>
      )}
    </Surface>
  );
}

function CheckinCard({
  client,
  state,
  today,
  onOpenTab,
  onOpenReview,
}: {
  client: CoachClient;
  state: CoachState;
  today: string;
  onOpenTab: () => void;
  onOpenReview: (submissionId: string) => void;
}) {
  const { formatDate, formatClock } = useDisplay();
  const waiting = state.submissions
    .filter((s) => s.clientId === client.id && !s.response)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const now = useCoachNow();
  const coachToday = zonedToday(resolvedTimeZone(state.preferences), now);
  const { overdue, next } = pickCheckInCard(state, client.id, today, now);
  const go = waiting ? () => onOpenReview(waiting.id) : onOpenTab;
  return (
    <Surface className="ap-card ap-w-s3">
      <CardLink title="Check-in" onOpen={go} />
      {waiting ? (
        <>
          <Status tone="warning">Awaiting feedback</Status>
          <b className="ap-big">
            {formatDate(waiting.date, { weekday: "short" })}
          </b>
          <p className="ap-sub">
            {waiting.type} check-in · submitted {(() => {
              const days = daysBetween(waiting.date, today);
              return days === 0
                ? "today"
                : days === 1
                  ? "yesterday"
                  : `${String(days)} days ago`;
            })()}
          </p>
        </>
      ) : overdue ? (
        <>
          <Status tone="warning">Overdue</Status>
          <b className="ap-big">{relDay(overdue.date, coachToday)}</b>
          <p className="ap-sub">
            Scheduled {dayLabel(formatDate, overdue.date)}
          </p>
        </>
      ) : next ? (
        <>
          <Status tone={next.date === coachToday ? "info" : "neutral"}>
            {next.date === coachToday
              ? `Due today by ${formatClock(checkInDeadline(state.preferences))}`
              : "Scheduled"}
          </Status>
          <b className="ap-big">{relDay(next.date, coachToday)}</b>
          <p className="ap-sub">{dayLabel(formatDate, next.date)}</p>
        </>
      ) : (
        <p className="ap-sub">Nothing scheduled.</p>
      )}
    </Surface>
  );
}

function PinnedNotesCard({
  client,
  onOpen,
}: {
  client: CoachClient;
  onOpen: () => void;
}) {
  const pinned = client.internalNotes.filter((note) => note.pinned);
  return (
    <Surface className="ap-card ap-w-s3">
      <CardLink title="Pinned notes" onOpen={onOpen} />
      {pinned.length ? (
        <>
          <ul className="ap-note-list">
            {pinned.slice(0, 3).map((note) => (
              <li key={note.id}>
                <Pin size={11} aria-hidden="true" />
                <span>{note.text}</span>
              </li>
            ))}
          </ul>
          {pinned.length > 3 && (
            <p className="ap-sub">+{pinned.length - 3} more</p>
          )}
        </>
      ) : (
        <p className="ap-sub">No pinned notes.</p>
      )}
    </Surface>
  );
}

function NutritionCard({
  client,
  today,
  onOpen,
}: {
  client: CoachClient;
  today: string;
  onOpen: () => void;
}) {
  const { formatDate } = useDisplay();
  const days = lastDays(today, 7);
  const resolved = nutritionForDate(client, today);
  const source = resolved.source;
  // Columns always come from the regular active plan; an active temporary
  // plan is a compact secondary strip below the columns.
  const regular = client.plans
    ? source === "iifym"
      ? applicablePlan(client.plans.nutrition.iifym, today)
      : applicablePlan(client.plans.nutrition.mealPlan, today)
    : undefined;
  // Active temporary plan today, else the nearest upcoming one of this source.
  const temp =
    resolved.temporary ??
    (client.plans?.nutrition.temporary ?? [])
      .filter((entry) => entry.source === source && entry.startDate > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const tempTargets = temp
    ? optionTargets(
        temp.plan,
        temp.source,
        scheduledOption(
          temp.plan.schedule,
          temp.source === "iifym"
            ? (temp.plan as IifymPlan).options.map((o) => o.id)
            : (temp.plan as MealPlan).variants.map((v) => v.id),
          temp.startDate <= today ? today : temp.startDate,
        ),
      )
    : undefined;
  type Col = {
    id: string;
    label: string;
    days: string;
    targets: OptionTargets | undefined;
    applied: (date: string) => boolean;
  };
  const columns: Col[] = [];
  if (regular) {
    const all =
      source === "iifym"
        ? (regular as IifymPlan).options
        : (regular as MealPlan).variants;
    // Every variant/option of the plan gets a column, scheduled or not.
    for (const option of all)
      columns.push({
        id: option.id,
        label: option.label || "Untitled day",
        days: optionDaysLabel(regular.schedule, option.id),
        targets: optionTargets(regular, source, option.id),
        applied: (date) => {
          const r = nutritionForDate(client, date);
          return !r.temporary && r.optionId === option.id;
        },
      });
  }
  const macroRows: { key: keyof OptionTargets; label: string }[] = [
    { key: "protein", label: "P" },
    { key: "carbs", label: "C" },
    { key: "fat", label: "F" },
  ];
  return (
    <Surface className="ap-card ap-w-s6">
      <CardLink
        title="Nutrition targets vs actual"
        sub={
          regular
            ? ((regular as { name?: string }).name ?? undefined)
            : undefined
        }
        onOpen={onOpen}
      />
      {columns.length ? (
        <div className="ap-nt-cols">
          {columns.map((column) => {
            const kcalActual = trackedAverage(
              client,
              days,
              "calories",
              column.applied,
            );
            return (
              <div key={column.id} className="ap-nt-col">
                <span className="ap-nt-label">
                  {column.label}
                  <small> · {column.days}</small>
                </span>
                <b className="ap-nt-kcal">
                  {targetText(column.targets?.calories)}
                </b>
                <span className="ap-nt-actual ap-sub">
                  ø{" "}
                  {kcalActual !== undefined
                    ? integer.format(Math.round(kcalActual))
                    : "—"}
                  <AccuracyChip
                    ratio={accuracyRatio(kcalActual, column.targets?.calories)}
                  />
                </span>
                <dl className="ap-nt-macros">
                  {macroRows.map((macro) => {
                    const actual = trackedAverage(
                      client,
                      days,
                      macro.key,
                      column.applied,
                    );
                    return (
                      <div key={macro.key}>
                        <dt>{macro.label}</dt>
                        <dd>
                          <b>{targetText(column.targets?.[macro.key], true)}</b>
                          <span className="ap-sub">
                            ø{" "}
                            {actual !== undefined
                              ? number1.format(Math.round(actual * 10) / 10)
                              : "—"}
                          </span>
                          <AccuracyChip
                            ratio={accuracyRatio(
                              actual,
                              column.targets?.[macro.key],
                            )}
                          />
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="ap-sub">No nutrition plan active.</p>
      )}
      {temp && (
        <div className="ap-nt-temp">
          <span className="ap-nt-temp-kind">{temp.label}</span>
          <span className="ap-nt-temp-text">
            {temp.label} ·{" "}
            {formatDate(temp.startDate, { day: "numeric", month: "short" })} –{" "}
            {formatDate(temp.endDate, { day: "numeric", month: "short" })}
            {tempTargets && (
              <>
                {" "}
                · {targetText(tempTargets.calories)} kcal · P{" "}
                {targetText(tempTargets.protein, true)} · C{" "}
                {targetText(tempTargets.carbs, true)} · F{" "}
                {targetText(tempTargets.fat, true)}
              </>
            )}
          </span>
        </div>
      )}
    </Surface>
  );
}

type MiniBar = {
  label: string;
  value?: number;
  valueLabel?: string;
  target?: number;
};

/** Small bar chart: accent bars, per-bar dashed target marker, legend. */
function MiniBars({
  bars,
  label,
  showValues = true,
}: {
  bars: MiniBar[];
  label: string;
  showValues?: boolean;
}) {
  const shown = bars.flatMap((b) =>
    [b.value, b.target].filter((v): v is number => v != null),
  );
  const floor = shown.length
    ? Math.max(0, Math.floor(Math.min(...shown) * 0.7))
    : 0;
  const ceil = shown.length
    ? Math.max(floor + 1, Math.ceil(Math.max(...shown) * 1.05))
    : floor + 1;
  const pct = (v: number) =>
    Math.min(100, Math.max(0, ((v - floor) / (ceil - floor)) * 100));
  const targets = [
    ...new Set(
      bars
        .map((b) => b.target)
        .filter((v): v is number => v != null)
        .map((v) => Math.round(v)),
    ),
  ];
  const targetLabel = targets.length
    ? `Target${targets.length === 1 ? ` ${integer.format(targets[0])}` : ""}`
    : undefined;
  return (
    <>
      <div className="ap-kcal-chart" role="img" aria-label={label}>
        {bars.map((bar) => {
          const off =
            bar.value !== undefined &&
            bar.target !== undefined &&
            bar.target > 0 &&
            Math.abs(bar.value / bar.target - 1) > 0.1;
          return (
            <div className="ap-kcal-col" key={bar.label}>
              <div className="ap-kcal-track">
                {bar.target !== undefined && (
                  <span
                    className="ap-kcal-target"
                    style={{ bottom: `${pct(bar.target)}%` }}
                    title={`Target ${integer.format(Math.round(bar.target))}`}
                  />
                )}
                {bar.value !== undefined && (
                  <span
                    className="ap-kcal-bar"
                    data-off={off || undefined}
                    style={{ height: `${pct(bar.value)}%` }}
                    title={integer.format(Math.round(bar.value))}
                  />
                )}
              </div>
              {showValues && (
                <small className="ap-kcal-val">
                  {bar.valueLabel ??
                    (bar.value !== undefined
                      ? integer.format(Math.round(bar.value))
                      : "—")}
                </small>
              )}
              <small>{bar.label}</small>
            </div>
          );
        })}
      </div>
      {targetLabel && (
        <div className="ap-chart-legend">
          <span className="ap-chart-legend-dash" aria-hidden="true" />
          <span>{targetLabel}</span>
        </div>
      )}
    </>
  );
}

function CalorieCard({
  client,
  today,
  onOpen,
}: {
  client: CoachClient;
  today: string;
  onOpen: () => void;
}) {
  const { formatDate } = useDisplay();
  const [view, setView] = useState<"7d" | "4w">("7d");
  const entries = clientTracking(client);
  const valueOn = (date: string) =>
    entries.find((e) => e.date === date)?.values.calories ?? undefined;
  const targetOn = (date: string) => {
    const r = nutritionForDate(client, date);
    const targets = r.plan
      ? optionTargets(r.plan, r.source, r.optionId)
      : undefined;
    return targetMid(targets?.calories);
  };
  const days = lastDays(today, 7);
  const prior = lastDays(addLocalDays(today, -7), 7);
  const mean = (list: (number | undefined)[]) => {
    const vals = list.filter((v): v is number => v != null);
    return vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : undefined;
  };
  const bars =
    view === "7d"
      ? days.map((date) => ({
          label: formatDate(date, { weekday: "narrow" }),
          value: valueOn(date),
          target: targetOn(date),
        }))
      : [0, 1, 2, 3].map((week) => {
          const range = lastDays(addLocalDays(today, (week - 3) * 7), 7);
          return {
            label: week === 3 ? "This week" : `W${String(week + 1)}`,
            value: mean(range.map(valueOn)),
            target: mean(range.map(targetOn)),
          };
        });
  const avg =
    view === "7d" ? mean(days.map(valueOn)) : mean(bars.map((b) => b.value));
  const priorAvg = mean(prior.map(valueOn));
  const diff =
    avg !== undefined && priorAvg !== undefined ? avg - priorAvg : undefined;
  return (
    <Surface className="ap-card ap-w-s6">
      <CardLink
        title="Calorie intake"
        sub={
          avg !== undefined
            ? `ø ${integer.format(Math.round(avg))} avg intake${diff !== undefined ? ` · ${diff >= 0 ? "+" : "−"}${integer.format(Math.abs(Math.round(diff)))} vs last week` : ""}`
            : undefined
        }
        onOpen={onOpen}
      />
      <SegmentedControl
        label="Calorie intake range"
        value={view}
        onValueChange={(v) => setView(v as "7d" | "4w")}
        options={[
          { value: "7d", label: "7 days" },
          { value: "4w", label: "4 weeks" },
        ]}
      />
      <MiniBars bars={bars} label="Calorie intake per day against target" />
    </Surface>
  );
}

function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Catmull-Rom → cubic bézier smooth line through the points. */
function smoothLinePath(points: { x: number; y: number }[]): string {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Bodyweight line: tight y gutter, full-width plot, round ticks. */
function BodyweightChart({
  rows,
}: {
  rows: { date: string; value: number }[];
}) {
  const { formatDate } = useDisplay();
  const [ref, size] = useElementSize();
  if (!rows.length) return null;
  const values = rows.map((r) => r.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = Math.max(dataMax - dataMin, 0.4);
  const step = span <= 1.5 ? 0.5 : span <= 3 ? 1 : span <= 7 ? 2 : 5;
  const lo = Math.floor(dataMin / step) * step;
  const hi = Math.max(lo + step, Math.ceil(dataMax / step) * step);
  const pad = step * 0.3;
  const y0 = lo - pad;
  const y1 = hi + pad;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(+t.toFixed(2));

  const w = Math.max(200, size.w);
  const h = Math.max(110, size.h);
  const gutter = 36;
  const x0 = gutter;
  const x1 = w - 4;
  const yTop = 8;
  const yBot = h - 20;
  const stamp = (d: string) => new Date(`${d}T12:00:00`).valueOf();
  const t0 = stamp(rows[0].date);
  const t1 = stamp(rows.at(-1)?.date ?? rows[0].date);
  const px = (d: string) =>
    t1 === t0 ? (x0 + x1) / 2 : x0 + ((stamp(d) - t0) / (t1 - t0)) * (x1 - x0);
  const py = (v: number) => yTop + ((y1 - v) / (y1 - y0)) * (yBot - yTop);
  const points = rows.map((r) => ({ x: px(r.date), y: py(r.value) }));
  const xLabels = [
    { row: rows[0], x: x0, anchor: "start" as const },
    {
      row: rows[Math.floor((rows.length - 1) / 2)],
      x: (x0 + x1) / 2,
      anchor: "middle" as const,
    },
    { row: rows.at(-1) ?? rows[0], x: x1, anchor: "end" as const },
  ];
  return (
    <div
      ref={ref}
      className="ap-bw-chart"
      role="img"
      aria-label="Bodyweight trend"
    >
      {size.w > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <title>Bodyweight trend over the selected range</title>
          {ticks.map((t) => {
            const yy = py(t);
            return (
              <g key={t}>
                <line x1={x0} x2={x1} y1={yy} y2={yy} className="ap-bw-grid" />
                <text
                  x={x0 - 7}
                  y={yy + 3.5}
                  textAnchor="end"
                  className="ap-bw-ylabel"
                >
                  {number1.format(t)}
                </text>
              </g>
            );
          })}
          <path d={smoothLinePath(points)} className="ap-bw-line" />
          {points.map((p) => (
            <circle key={p.x} cx={p.x} cy={p.y} r={2.4} className="ap-bw-dot" />
          ))}
          {xLabels.map(
            (l) =>
              l.row && (
                <text
                  key={l.row.date}
                  x={l.x}
                  y={h - 4}
                  textAnchor={l.anchor}
                  className="ap-bw-xlabel"
                >
                  {formatDate(l.row.date, { day: "numeric", month: "short" })}
                </text>
              ),
          )}
        </svg>
      )}
    </div>
  );
}

function BodyweightCard({
  client,
  today,
  onOpen,
}: {
  client: CoachClient;
  today: string;
  onOpen: () => void;
}) {
  const { formatDate } = useDisplay();
  const [range, setRange] = useState<"2w" | "4w" | "12w" | "all">("4w");
  const entries = clientTracking(client)
    .filter((e) => e.values.weight != null && e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const points = entries.map((e) => ({
    date: e.date,
    value: e.values.weight as number,
  }));
  const cutoff: Record<typeof range, string | undefined> = {
    "2w": addLocalDays(today, -13),
    "4w": addLocalDays(today, -27),
    "12w": addLocalDays(today, -83),
    all: undefined,
  };
  const rows = points.filter((p) => !cutoff[range] || p.date >= cutoff[range]);
  const avg = (from: string, to: string) => {
    const slice = points.filter((p) => p.date >= from && p.date <= to);
    return slice.length
      ? slice.reduce((s, p) => s + p.value, 0) / slice.length
      : undefined;
  };
  const avg7 = avg(addLocalDays(today, -6), today);
  const prev7 = avg(addLocalDays(today, -13), addLocalDays(today, -7));
  const fourBack = avg(addLocalDays(today, -34), addLocalDays(today, -28));
  const weeklyDelta =
    avg7 !== undefined && prev7 !== undefined ? avg7 - prev7 : undefined;
  const trend4w =
    avg7 !== undefined && fourBack !== undefined
      ? (avg7 - fourBack) / 4
      : undefined;
  const latest = points.at(-1);
  const fmt = (v: number | undefined, signed = false) =>
    v === undefined
      ? "—"
      : `${signed && v > 0 ? "+" : v < 0 ? "−" : ""}${number1.format(Math.abs(v))}`;
  return (
    <Surface className="ap-card ap-w-s8">
      <CardLink
        title="Bodyweight"
        sub={
          latest ? `Last entry ${dayLabel(formatDate, latest.date)}` : undefined
        }
        onOpen={onOpen}
      />
      <div className="ap-bw-stats">
        <div>
          <b className="ap-big">
            {latest ? `${number1.format(latest.value)} kg` : "—"}
          </b>
          <span className="ap-sub">Latest</span>
        </div>
        <div>
          <b>{fmt(avg7)} kg</b>
          <span className="ap-sub">7-day avg</span>
        </div>
        <div>
          <b
            data-tone={
              weeklyDelta !== undefined && weeklyDelta <= 0
                ? "positive"
                : "neutral"
            }
          >
            {fmt(weeklyDelta, true)} kg
          </b>
          <span className="ap-sub">Weekly change</span>
        </div>
        <div>
          <b>{fmt(trend4w, true)} kg/wk</b>
          <span className="ap-sub">4-week trend</span>
        </div>
      </div>
      <SegmentedControl
        label="Bodyweight range"
        value={range}
        onValueChange={(v) => setRange(v as typeof range)}
        options={[
          { value: "2w", label: "2W" },
          { value: "4w", label: "4W" },
          { value: "12w", label: "12W" },
          { value: "all", label: "All" },
        ]}
      />
      <BodyweightChart rows={rows} />
    </Surface>
  );
}

function stepsTargetNumber(target: StepsTarget | null | undefined) {
  if (!target) return undefined;
  return target.kind === "range" ? (target.min + target.max) / 2 : target.value;
}

function ExpenditureCard({
  client,
  today,
  onOpen,
}: {
  client: CoachClient;
  today: string;
  onOpen: () => void;
}) {
  const versions = client.plans?.activityTargets ?? [];
  const steps = resolveActivityTarget({
    versions,
    metric: "steps",
    date: today,
  });
  const cardio = resolveActivityTarget({
    versions,
    metric: "cardio",
    date: today,
  });
  const days = lastDays(today, 7);
  const entries = clientTracking(client);
  const stepsActual =
    entries
      .filter((e) => days.includes(e.date) && e.values.steps != null)
      .map((e) => e.values.steps as number)
      .reduce((a, b, _i, all) => a + b / all.length, 0) || undefined;
  const cardioActual = entries
    .filter((e) => days.includes(e.date) && e.values["cardio-duration"] != null)
    .reduce((sum, e) => sum + (e.values["cardio-duration"] as number), 0);
  const stepsT = stepsTargetNumber(steps?.target as StepsTarget | null);
  const cardioT =
    cardio?.metric === "cardio" && cardio.target
      ? (cardio.target as CardioTarget).sessionsPerWeek *
        (cardio.target as CardioTarget).minutesPerSession
      : undefined;
  const stepBars = days.map((date) => {
    const value = entries.find((e) => e.date === date)?.values.steps as
      | number
      | undefined;
    return {
      label: DAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7].slice(
        0,
        3,
      ),
      value,
      valueLabel: value !== undefined ? compact.format(Math.round(value)) : "—",
      target: stepsT,
    };
  });
  return (
    <Surface className="ap-card ap-w-s4">
      <CardLink title="Expenditure" onOpen={onOpen} />
      <div className="ap-exp-row">
        <span className="ap-sub">Steps</span>
        <b>
          {steps?.target
            ? formatActivityTarget(steps).replace(" steps/day", "")
            : "No target"}
        </b>
        <span className="ap-sub">
          ø{" "}
          {stepsActual !== undefined
            ? integer.format(Math.round(stepsActual))
            : "—"}
          <AccuracyChip ratio={accuracyRatio(stepsActual, stepsT)} />
        </span>
      </div>
      <div className="ap-exp-row">
        <span className="ap-sub">Cardio</span>
        <b>{formatActivityTarget(cardio)}</b>
        <span className="ap-sub">
          {integer.format(Math.round(cardioActual))} min this week
          <AccuracyChip
            ratio={
              cardioT
                ? cardioActual > 0
                  ? cardioActual / cardioT
                  : undefined
                : undefined
            }
          />
        </span>
      </div>
      <div className="ap-exp-chart">
        <MiniBars bars={stepBars} label="Daily steps vs target" />
      </div>
    </Surface>
  );
}

function PhysiqueCard({
  client,
  state,
  onOpenReview,
  onOpenTemplate,
}: {
  client: CoachClient;
  state: CoachState;
  onOpenReview: (submissionId: string) => void;
  onOpenTemplate?: () => void;
}) {
  const { formatDate } = useDisplay();
  const submissions = state.submissions
    .filter((s) => s.clientId === client.id && s.photos?.length)
    .sort((a, b) => a.date.localeCompare(b.date));
  const poses = [
    ...new Set(submissions.flatMap((s) => (s.photos ?? []).map((p) => p.pose))),
  ];
  const [pose, setPose] = useState(poses[0] ?? "");
  const [leftId, setLeftId] = useState(submissions[0]?.id ?? "");
  const [rightId, setRightId] = useState(submissions.at(-1)?.id ?? "");
  const left = submissions.find((s) => s.id === leftId) ?? submissions[0];
  const right = submissions.find((s) => s.id === rightId) ?? submissions.at(-1);
  const shot = (submission: (typeof submissions)[number] | undefined) =>
    submission?.photos?.find((p) => p.pose === pose) ?? submission?.photos?.[0];
  const options = submissions.map((s) => ({
    value: s.id,
    label: formatDate(s.date, { weekday: "short" }),
  }));
  const figure = (
    submission: (typeof submissions)[number] | undefined,
    label: string,
  ) => {
    const photo = shot(submission);
    const weight = submission ? weightOn(client, submission.date) : undefined;
    return (
      <figure className="ap-phys">
        {photo ? (
          // biome-ignore lint/performance/noImgElement: demo photo previews are dynamic data srcs
          <img src={photo.src} alt={`${photo.pose} — ${label}`} />
        ) : (
          <div className="ap-phys-empty">No photo for this pose</div>
        )}
        <figcaption>
          <b>
            {submission
              ? formatDate(submission.date, { weekday: "short" })
              : "—"}
          </b>
          <span className="ap-sub">
            {weight !== undefined ? `${number1.format(weight)} kg` : "—"}
          </span>
        </figcaption>
      </figure>
    );
  };
  return (
    <Surface className="ap-card ap-w-s8">
      <CardLink
        title="Physique comparison"
        onOpen={() => right && onOpenReview(right.id)}
      />
      {submissions.length ? (
        <>
          <div className="ap-phys-controls">
            <Select
              label="Pose"
              value={pose}
              onChange={setPose}
              options={poses}
            />
            <Select
              label="From"
              value={left?.id ?? ""}
              onChange={setLeftId}
              options={options}
            />
            <Select
              label="To"
              value={right?.id ?? ""}
              onChange={setRightId}
              options={options}
            />
          </div>
          <div className="ap-phys-grid">
            {figure(left, "earlier check-in")}
            {figure(right, "latest check-in")}
          </div>
        </>
      ) : (
        <div className="ap-empty">
          <p className="ap-sub">
            Add a photo upload question to the check-in form.
          </p>
          <Button variant="secondary" onClick={onOpenTemplate}>
            Open check-in section
          </Button>
        </div>
      )}
    </Surface>
  );
}

function TrainingCard({
  client,
  state,
  today,
  onOpen,
}: {
  client: CoachClient;
  state: CoachState;
  today: string;
  onOpen: () => void;
}) {
  const { formatDate } = useDisplay();
  const plan = client.plans
    ? applicablePlan(client.plans.training, today)
    : undefined;
  const week = plan ? displayWeek(plan, today) : undefined;
  const sessions =
    plan && week !== undefined ? resolveTrainingWeek(plan, week) : [];
  const summary = weekTrainingSummary(state, client, today);
  const logs = (state.trainingLogs ?? []).filter(
    (log) => log.clientId === client.id,
  );
  const weekSessions =
    plan && week !== undefined ? scheduledSessions(plan, week) : [];
  const statusLabel = {
    done: "Done",
    "in-progress": "Unfinished",
    today: "Today",
    upcoming: "Upcoming",
    missed: "Missed",
  } as const;
  const rotationText = (() => {
    if (!plan?.rotation) return undefined;
    if (plan.rotation.mode === "weekly") {
      const days = Object.entries(plan.rotation.weekdays)
        .filter(([, ids]) => ids.length)
        .map(([day]) => day.slice(0, 3));
      return days.length ? `Weekly · ${days.join(" ")}` : "Weekly";
    }
    const names = plan.rotation.sessionIds
      .filter((sid): sid is string => sid != null)
      .map((sid) => sessions.find((s) => s.id === sid)?.name ?? sid);
    return `${String(names.length)}-day cycle · ${names.join(", ")}`;
  })();
  const notes: string[] = [];
  if (summary.inProgress > 0)
    notes.push(
      `${String(summary.inProgress)} session${summary.inProgress === 1 ? "" : "s"} unfinished`,
    );
  if (summary.flagged > 0)
    notes.push(
      `${String(summary.flagged)} flagged note${summary.flagged === 1 ? "" : "s"}`,
    );
  return (
    <Surface className="ap-card ap-w-s4">
      <CardLink title="Training program" onOpen={onOpen} />
      {plan ? (
        <>
          <b>{plan.name}</b>
          {rotationText && <p className="ap-sub">{rotationText}</p>}
          {plan.focus && <p className="ap-sub">{plan.focus}</p>}
          {weekSessions.length > 0 && (
            <ul className="ap-sessions">
              {weekSessions.map((item) => {
                const status = sessionStatus(item, logs, today);
                return (
                  <li key={`${item.occurrenceKey}:${item.date}`}>
                    <span className="ap-session-day">
                      {item.weekdayLabel
                        ? item.weekdayLabel.slice(0, 3)
                        : formatDate(item.date, { weekday: "short" })}
                    </span>
                    <span className="ap-session-name">{item.session.name}</span>
                    <span className="ap-session-status" data-status={status}>
                      {status === "done" ? "✓ " : ""}
                      {statusLabel[status]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="ap-training-stats">
            <span>
              {plan
                ? `Plan week ${String(trainingWeek(plan, today))}`
                : "Not scheduled"}
            </span>
            <span className="ap-sub">
              {summary.done} of {summary.scheduled} sessions this week
            </span>
          </div>
          {notes.length > 0 && (
            <p className="ap-sub ap-flagged">
              <Flag size={11} aria-hidden="true" /> {notes.join(" · ")}
            </p>
          )}
        </>
      ) : (
        <p className="ap-sub">No training plan active.</p>
      )}
    </Surface>
  );
}

// ─── Overview ───────────────────────────────────────────────────────

export function AthleteOverview({
  client,
  viewer = "coach",
  onOpen,
}: {
  client: CoachClient;
  viewer?: "coach" | "client";
  onOpen?: (tab: string, plan?: string) => void;
}) {
  const { state, navigate } = useCoach();
  const today = localToday();
  const go = (tab: string, plan?: string) =>
    onOpen ? onOpen(tab, plan) : open(navigate, client.id, { tab, plan });
  const openReview = (submissionId: string) =>
    onOpen
      ? onOpen("Check-ins")
      : navigate({
          section: "check-ins",
          review: submissionId,
          client: client.id,
        });
  return (
    <div className="ap-grid">
      <PhaseProgressCard
        client={client}
        today={today}
        onOpen={() => go("Timeline")}
      />
      <CheckinCard
        client={client}
        state={state}
        today={today}
        onOpenTab={() => go("Check-ins")}
        onOpenReview={openReview}
      />
      {viewer === "coach" && (
        <PinnedNotesCard client={client} onOpen={() => go("Notes & tasks")} />
      )}
      <NutritionCard
        client={client}
        today={today}
        onOpen={() => go("Plans", "nutrition")}
      />
      <CalorieCard
        client={client}
        today={today}
        onOpen={() => go("Timeline")}
      />
      <BodyweightCard
        client={client}
        today={today}
        onOpen={() => go("Timeline")}
      />
      <ExpenditureCard
        client={client}
        today={today}
        onOpen={() => go("Plans", "activity-targets")}
      />
      <PhysiqueCard
        client={client}
        state={state}
        onOpenReview={openReview}
        onOpenTemplate={
          viewer === "coach"
            ? () =>
                client.assignment &&
                navigate({
                  section: "templates",
                  editor: client.assignment.templateId,
                })
            : undefined
        }
      />
      <TrainingCard
        client={client}
        state={state}
        today={today}
        onOpen={() =>
          open(navigate, client.id, { tab: "Plans", plan: "training" })
        }
      />
    </div>
  );
}
