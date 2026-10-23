"use client";

import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  displayWeek,
  nextSession,
  scheduledSessions,
} from "../../client-app/training-log/model";
import {
  type MealPlan,
  type MealTargets,
  type TargetValue,
  validateTargets,
} from "../../ethereal/mealplan/model";
import { Input, Modal, SegmentedControl, Status } from "../../vari8/components";
import { DateRangePicker } from "../../vari8/inputs";
import {
  addDays,
  type CoachClient,
  DAYS,
  eventsBetween,
  formatDate,
  TODAY,
  uid,
  unreadCount,
} from "../model";
import {
  activateLifecycle,
  applicablePlan,
  scheduledOption,
} from "../plans/domain";
import { NutritionEditor } from "../plans/nutrition/editor";
import { phasePlanRanges } from "../plans/phase-planning";
import {
  type ClientPlans,
  emptyClientPlans,
  type IifymPlan,
} from "../plans/types";
import { useCoach } from "../store";
import { isSupplementPlan } from "../supplements/model";
import {
  type ActivityChange,
  type ActivityTargetVersion,
  addLocalDays,
  type CardioTarget,
  formatActivityTarget,
  localToday,
  resolveActivityTarget,
  type StepsTarget,
  writeActivityTarget,
} from "../targets/model";
import { templateSetup } from "../template-setup";
import {
  Avatar,
  Button,
  DateField,
  Dialog,
  Empty,
  IconButton,
  Select,
  Surface,
  Toggle,
} from "../ui";
import { nutritionTargetsModel } from "./nutrition-targets";
import {
  type AthleteWidgetId,
  layoutOverviewWidgets,
  resolveOverviewWidgets,
} from "./overview-widgets";
import {
  attentionItems,
  bodyweightSummary,
  currentPhase,
  nutritionForDate,
  TIMELINE_KIND_LABELS,
  type TimelineEvent,
  type TimelineEventKind,
  timelineInWindow,
  timelineSegment,
  timelineWindow,
  validateTimelineEvent,
} from "./timeline";
import "./overview.css";

const KIND_OPTIONS = (
  ["deload", "diet-break", "refeed"] as TimelineEventKind[]
).map((id) => ({ value: id, label: TIMELINE_KIND_LABELS[id] }));
const kindLabel = (kind: TimelineEventKind) => TIMELINE_KIND_LABELS[kind];
const REGULAR_PLAN = "__regular__";

const kindTone = (kind: TimelineEventKind) =>
  kind === "refeed"
    ? ("info" as const)
    : kind === "diet-break"
      ? ("warning" as const)
      : ("neutral" as const);

const number1 = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const DAY_MS = 86_400_000;
const daysBetween = (start: string, end: string) =>
  Math.round(
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
      DAY_MS,
  );

const formatRange = (start: string, end: string) =>
  start === end
    ? formatDate(start, { weekday: "short" })
    : `${formatDate(start, { weekday: undefined })} – ${formatDate(end, { weekday: undefined })}`;

const overrideOptionLabel = (
  client: CoachClient,
  event: TimelineEvent,
): string | undefined => {
  const override = event.nutritionOverride;
  if (!override) return undefined;
  const plan = client.plans
    ? override.source === "mealPlan"
      ? applicablePlan(client.plans.nutrition.mealPlan, event.startDate)
      : applicablePlan(client.plans.nutrition.iifym, event.startDate)
    : undefined;
  if (!plan) return override.optionId;
  const option =
    override.source === "mealPlan"
      ? (plan as MealPlan).variants.find((v) => v.id === override.optionId)
      : (plan as IifymPlan).options.find((o) => o.id === override.optionId);
  return option?.label ?? override.optionId;
};

/** Single header above the client tabs — shared by every tab. */
export function AthleteProfileHeader({
  client,
  onBack,
}: {
  client: CoachClient;
  onBack: () => void;
}) {
  const { state, navigate, route } = useCoach();
  const today = localToday();
  const phase = currentPhase(client.phasePlan, today);
  const unread = unreadCount(state, client.id);
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
      </div>
    </header>
  );
}

export function AthleteOverview({
  client,
  onAssign,
  onAddDate,
}: {
  client: CoachClient;
  onAssign: () => void;
  onAddDate: () => void;
}) {
  const { state, setState, navigate, route, toast } = useCoach();
  const today = localToday();
  const [editing, setEditing] = useState<TimelineEvent | null>(null);
  const [presetKind, setPresetKind] = useState<TimelineEventKind | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const update = (fn: (c: CoachClient) => CoachClient) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((cl) => (cl.id === client.id ? fn(cl) : cl)),
    }));

  const openDialog = (
    event: TimelineEvent | null,
    kind: TimelineEventKind | null = null,
  ) => {
    setEditing(event);
    setPresetKind(kind);
    setDialogOpen(true);
  };

  const saveEvent = (event: TimelineEvent): string | null => {
    const error = validateTimelineEvent(client, event, {
      ignoreId: event.id,
    });
    if (error) return error;
    update((c) => {
      const events = c.timelineEvents ?? [];
      const next = events.some((e) => e.id === event.id)
        ? events.map((e) => (e.id === event.id ? event : e))
        : [...events, event];
      return { ...c, timelineEvents: next };
    });
    setDialogOpen(false);
    return null;
  };

  const deleteEvent = (id: string) => {
    const removed = client.timelineEvents?.find((e) => e.id === id);
    if (!removed) return;
    update((c) => ({
      ...c,
      timelineEvents: (c.timelineEvents ?? []).filter((e) => e.id !== id),
    }));
    toast("Timeline event removed", () =>
      update((c) => ({
        ...c,
        timelineEvents: [...(c.timelineEvents ?? []), removed].sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        ),
      })),
    );
  };

  const bodyweight = bodyweightSummary(client, today);
  const nextCheckin = eventsBetween(state, today, addLocalDays(today, 35)).find(
    (e) => e.clientId === client.id && !e.submission,
  );
  const awaiting = state.submissions.filter(
    (s) => s.clientId === client.id && !s.response,
  ).length;
  const ranges = phasePlanRanges(client.phasePlan);
  // Coach-side presentation reads the live template variant; the assignment
  // snapshot is only a fallback for deleted templates.
  const liveTemplate = client.assignment
    ? state.templates.find((t) => t.id === client.assignment?.templateId)
    : undefined;
  const setup =
    (liveTemplate
      ? templateSetup(liveTemplate, client.assignment?.variantId ?? "")
      : undefined) ??
    (client.assignment
      ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
      : undefined);
  const widgets = resolveOverviewWidgets(setup?.athleteOverview).filter(
    (widget) => widget.visible,
  );
  const spans = new Map(
    layoutOverviewWidgets(widgets).map((cell) => [cell.id, cell.span]),
  );

  const renderWidget = (id: AthleteWidgetId) => {
    switch (id) {
      case "bodyweight":
        return <BodyweightTile data={bodyweight} />;
      case "next-check-in":
        return <CheckinTile next={nextCheckin?.date} awaiting={awaiting} />;
      case "nutrition-targets":
        return <NutritionTargetsWidget client={client} today={today} />;
      case "activity-targets":
        return (
          <ActivityTargetsWidget
            client={client}
            today={today}
            update={update}
          />
        );
      case "needs-attention":
        return <NeedsAttention client={client} today={today} />;
      case "recent-training":
        return <RecentTraining client={client} />;
      case "timeline":
        return (
          <TimelineCard
            client={client}
            today={today}
            ranges={ranges}
            onAdd={(kind) => openDialog(null, kind ?? null)}
            onEdit={(event) => openDialog(event)}
            onDelete={deleteEvent}
          />
        );
      case "coaching-setup":
        return (
          <CoachingSetup
            client={client}
            update={update}
            onAddDate={onAddDate}
            onAssign={onAssign}
          />
        );
      case "training-plan":
        return (
          <TrainingPlanWidget
            client={client}
            today={today}
            onNavigate={(plan) => navigate({ ...route, tab: "Plans", plan })}
          />
        );
      case "supplements":
        return (
          <SupplementsWidget
            client={client}
            onNavigate={(plan) => navigate({ ...route, tab: "Plans", plan })}
          />
        );
    }
  };

  return (
    <div className="ap">
      <div className="ap-widgets">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={`ap-w ap-w-s${String(spans.get(widget.id) ?? 12)}`}
          >
            {renderWidget(widget.id)}
          </div>
        ))}
      </div>

      {client.assignment && (
        <p className="ap-layout">
          <button
            type="button"
            className="ap-link"
            onClick={() =>
              navigate({
                section: "templates",
                editor: client.assignment?.templateId ?? "",
                templateSection: "Athlete overview",
              })
            }
          >
            Layout from template {client.assignment.snapshot.name} · Edit
          </button>
        </p>
      )}

      {dialogOpen && (
        <TimelineEventDialog
          client={client}
          event={editing}
          presetKind={presetKind}
          today={today}
          onClose={() => setDialogOpen(false)}
          onSave={saveEvent}
        />
      )}
    </div>
  );
}

function BodyweightTile({
  data,
}: {
  data: ReturnType<typeof bodyweightSummary>;
}) {
  const values = data.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = data.points
    .map(
      (point, index) =>
        `${String((index / Math.max(1, data.points.length - 1)) * 100)},${String(
          100 - ((point.value - min) / span) * 100,
        )}`,
    )
    .join(" ");
  return (
    <Surface className="ap-tile">
      <h4>Bodyweight</h4>
      {data.latest ? (
        <>
          <div className="ap-tile-value">
            {number1.format(data.latest.value)}
            <span className="ap-tile-unit">kg</span>
          </div>
          {data.points.length > 1 && (
            <svg
              className="ap-spark"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline points={points} />
            </svg>
          )}
          <p className="ap-sub">
            {data.avg7 !== undefined
              ? `7-day avg ${number1.format(data.avg7)} kg`
              : "No 7-day average yet"}
            {data.delta !== undefined
              ? ` · ${data.delta >= 0 ? "+" : ""}${number1.format(data.delta)} vs prior`
              : ""}
          </p>
        </>
      ) : (
        <Empty title="Nothing logged yet" />
      )}
    </Surface>
  );
}

function NutritionTargetsWidget({
  client,
  today,
}: {
  client: CoachClient;
  today: string;
}) {
  const { setState, navigate, route, toast } = useCoach();
  const model = nutritionTargetsModel(client, today);
  const [adjusting, setAdjusting] = useState(false);
  const [mealEditorOpen, setMealEditorOpen] = useState(false);
  const [mealDraft, setMealDraft] = useState<MealPlan | null>(null);
  const [confirmSave, setConfirmSave] = useState<{
    plan: IifymPlan;
  } | null>(null);
  const [applyDate, setApplyDate] = useState(today);
  const [drafts, setDrafts] = useState<Record<string, MealTargets> | null>(
    null,
  );
  const [errors, setErrors] = useState<string[]>([]);
  const updatePlans = (fn: (plans: ClientPlans) => ClientPlans) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((cl) =>
        cl.id === client.id
          ? { ...cl, plans: fn(cl.plans ?? emptyClientPlans()) }
          : cl,
      ),
    }));

  if (!model) {
    return (
      <Surface className="ap-widget">
        <WidgetHead title="Nutrition targets" />
        <Empty
          title="No nutrition plan"
          action={
            <Button
              primary
              onClick={() =>
                navigate({ ...route, tab: "Plans", plan: "nutrition" })
              }
            >
              Create nutrition plan
            </Button>
          }
        />
      </Surface>
    );
  }

  const plan = nutritionForDate(client, today).plan as MealPlan | IifymPlan;

  const saveMealPlan = () => {
    if (!mealDraft) return;
    const plans = client.plans ?? emptyClientPlans();
    updatePlans(() => ({
      ...plans,
      nutrition: {
        ...plans.nutrition,
        mealPlan: activateLifecycle(plans.nutrition.mealPlan, mealDraft),
      },
    }));
    setMealEditorOpen(false);
    setMealDraft(null);
    toast("Meal plan saved");
  };

  const saveIifym = () => {
    if (!drafts) return;
    const iifym = plan as IifymPlan;
    const issues = model.options.flatMap((option) => {
      const targets =
        drafts[option.id] ??
        iifym.options.find((o) => o.id === option.id)?.targets;
      return targets ? validateTargets(targets, option.label || "Option") : [];
    });
    if (issues.length) {
      setErrors(issues);
      return;
    }
    setErrors([]);
    setConfirmSave({
      plan: {
        ...iifym,
        options: iifym.options.map((o) => ({
          ...o,
          targets: drafts[o.id] ?? o.targets,
        })),
      },
    });
    setApplyDate(today);
  };

  return (
    <Surface className="ap-widget">
      <WidgetHead
        title="Nutrition targets"
        sub={model.planName}
        action={
          adjusting ? undefined : (
            <Button
              variant="secondary"
              onClick={() => {
                if (model.source === "mealPlan") {
                  setMealDraft(structuredClone(plan as MealPlan));
                  setMealEditorOpen(true);
                } else {
                  setDrafts(
                    Object.fromEntries(
                      (plan as IifymPlan).options.map((o) => [
                        o.id,
                        structuredClone(o.targets),
                      ]),
                    ),
                  );
                  setErrors([]);
                  setAdjusting(true);
                }
              }}
            >
              Adjust
            </Button>
          )
        }
      />
      <div className="ap-nt-grid">
        {model.options.map((option) => (
          <div
            key={option.id}
            className={`ap-nt-col${option.today ? " ap-nt-col-today" : ""}`}
          >
            <div className="ap-nt-label">
              {option.label}
              {option.today && <Status tone="info">Today</Status>}
            </div>
            {adjusting ? (
              <TargetFields
                targets={drafts?.[option.id]}
                onChange={(targets) =>
                  setDrafts((current) => ({
                    ...(current ?? {}),
                    [option.id]: targets,
                  }))
                }
              />
            ) : (
              <>
                <div className="ap-nt-kcal">
                  {option.cells.kcal}
                  <span className="ap-nt-unit">kcal</span>
                </div>
                <div className="ap-nt-macros">
                  <span>P {option.cells.protein} g</span>
                  <span>C {option.cells.carbs} g</span>
                  <span>F {option.cells.fat} g</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {adjusting && (
        <div className="ap-nt-actions">
          {errors.map((error) => (
            <p key={error} className="ap-dialog-error" role="alert">
              {error}
            </p>
          ))}
          <div className="cd-actions">
            <Button primary onClick={saveIifym}>
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdjusting(false);
                setDrafts(null);
                setErrors([]);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {mealEditorOpen && mealDraft && (
        <Dialog
          full
          title="Edit meal plan"
          onClose={() => setMealEditorOpen(false)}
        >
          <NutritionEditor
            value={mealDraft}
            onChange={(value) => setMealDraft(value)}
          />
          <div className="cd-dialog-actions">
            <Button variant="ghost" onClick={() => setMealEditorOpen(false)}>
              Cancel
            </Button>
            <Button primary onClick={saveMealPlan}>
              Save meal plan
            </Button>
          </div>
        </Dialog>
      )}
      {confirmSave && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setConfirmSave(null);
          }}
          title="Save nutrition targets"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmSave(null)}>
                Cancel
              </Button>
              <Button
                primary
                disabled={!applyDate || applyDate < today}
                onClick={() => {
                  const plans = client.plans ?? emptyClientPlans();
                  updatePlans(() => ({
                    ...plans,
                    nutrition: {
                      ...plans.nutrition,
                      iifym: activateLifecycle(plans.nutrition.iifym, {
                        ...confirmSave.plan,
                        startDate: applyDate,
                      }),
                    },
                  }));
                  setConfirmSave(null);
                  setAdjusting(false);
                  setDrafts(null);
                  toast("Nutrition targets saved");
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="ap-dialog">
            <p className="ap-sub">
              The previous version stays in plan history.
            </p>
            <DateField
              label="Applies from"
              value={applyDate}
              onChange={setApplyDate}
            />
            {applyDate && applyDate < today && (
              <p className="ap-dialog-error">Choose today or a later date.</p>
            )}
          </div>
        </Modal>
      )}
    </Surface>
  );
}

function CheckinTile({
  next,
  awaiting,
}: {
  next: string | undefined;
  awaiting: number;
}) {
  return (
    <Surface className="ap-tile">
      <h4>Next check-in</h4>
      <div className="ap-tile-value ap-tile-value-text">
        {next ? formatDate(next, { weekday: "short" }) : "—"}
      </div>
      <p className="ap-sub">
        {awaiting
          ? `${String(awaiting)} awaiting your feedback`
          : "Nothing awaiting feedback"}
      </p>
    </Surface>
  );
}

function TimelineCard({
  client,
  today,
  ranges,
  onAdd,
  onEdit,
  onDelete,
}: {
  client: CoachClient;
  today: string;
  ranges: ReturnType<typeof phasePlanRanges>;
  onAdd: (kind?: TimelineEventKind) => void;
  onEdit: (event: TimelineEvent) => void;
  onDelete: (id: string) => void;
}) {
  const [fullPlan, setFullPlan] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const events = useMemo(
    () =>
      [...(client.timelineEvents ?? [])].sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      ),
    [client.timelineEvents],
  );
  const ordered = [
    ...events.filter((e) => e.endDate >= today),
    ...events.filter((e) => e.endDate < today),
  ];
  const recentEvents = ordered.filter(
    (e) => e.endDate >= addLocalDays(today, -28),
  );
  const earlierEvents = ordered.filter(
    (e) => e.endDate < addLocalDays(today, -28),
  );
  const listedEvents = showEarlier ? ordered : recentEvents;

  const trackRef = useRef<HTMLDivElement>(null);
  const view = timelineWindow(today, ranges, fullPlan);
  const trackStart = view.start;
  const trackEnd = view.end;
  const totalDays = Math.max(1, daysBetween(trackStart, trackEnd));
  const pct = (date: string) =>
    Math.min(
      100,
      Math.max(
        0,
        (daysBetween(
          trackStart,
          date > trackEnd ? trackEnd : date < trackStart ? trackStart : date,
        ) /
          totalDays) *
          100,
      ),
    );
  const segment = (start: string, end: string) =>
    timelineSegment(view, start, end);
  const weeks = Math.max(1, Math.ceil(totalDays / 7));

  // Labels that do not fit inside their segment/bar are lifted outside it
  // (data-narrow) instead of being ellipsized.
  // biome-ignore lint/correctness/useExhaustiveDependencies: labels must re-measure whenever the timeline content changes
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      for (const el of track.querySelectorAll<HTMLElement>(
        ".ap-track-phase, .ap-track-bar",
      )) {
        const label = el.querySelector("span");
        if (!label) continue;
        el.removeAttribute("data-narrow");
        el.removeAttribute("data-flush");
        if (label.scrollWidth > label.clientWidth + 2) {
          el.setAttribute("data-narrow", "");
          const trackRight = track.getBoundingClientRect().right;
          if (
            el.getBoundingClientRect().left + label.scrollWidth >
            trackRight
          ) {
            el.setAttribute("data-flush", "right");
          }
        }
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [events, ranges, today, fullPlan]);

  const visibleRanges = ranges.filter((range) =>
    timelineInWindow(view, range.startDate, range.endDate),
  );
  const visibleEvents = events.filter((event) =>
    timelineInWindow(view, event.startDate, event.endDate),
  );

  return (
    <Surface className="ap-timeline">
      <header className="ap-timeline-head">
        <div>
          <h3>Timeline</h3>
          <p className="ap-sub">
            {visibleRanges.length
              ? `${formatDate(trackStart, { weekday: undefined })} – ${formatDate(trackEnd, { weekday: undefined })}`
              : "Phases and nutrition events at a glance"}
          </p>
        </div>
        <div className="ap-timeline-controls">
          <Toggle label="Full plan" checked={fullPlan} onChange={setFullPlan} />
          <Button variant="secondary" size="sm" onClick={() => onAdd("refeed")}>
            Refeed
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAdd("diet-break")}
          >
            Diet break
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAdd("deload")}>
            Deload
          </Button>
          <Button primary onClick={() => onAdd()}>
            <Plus size={15} aria-hidden="true" /> Add to timeline
          </Button>
        </div>
      </header>

      <div
        ref={trackRef}
        className="ap-track"
        role="img"
        aria-label="Plan timeline"
      >
        {Array.from({ length: weeks + 1 }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static week tick marks
            key={index}
            className="ap-track-week"
            style={{ left: `${String((index / weeks) * 100)}%` }}
          />
        ))}
        {visibleRanges.map((range) => {
          const active = today >= range.startDate && today <= range.endDate;
          const seg = segment(range.startDate, range.endDate);
          if (!seg) return null;
          return (
            <div
              key={`${range.startDate}-${range.name}`}
              className={`ap-track-phase${active ? " ap-track-phase-active" : ""}`}
              style={{
                left: `${String(seg.left)}%`,
                width: `${String(seg.width)}%`,
              }}
              title={`${range.name} · ${formatRange(range.startDate, range.endDate)}`}
            >
              <span>{range.name}</span>
            </div>
          );
        })}
        {visibleEvents.map((event) => {
          const seg = segment(event.startDate, event.endDate);
          if (!seg) return null;
          return event.kind === "refeed" ? (
            <div
              key={event.id}
              className="ap-track-event ap-track-dot"
              style={{ left: `${String(seg.left + seg.width / 2)}%` }}
              title={`${kindLabel(event.kind)} · ${formatRange(event.startDate, event.endDate)}`}
            />
          ) : (
            <div
              key={event.id}
              className={`ap-track-event ap-track-bar ap-track-${event.kind}`}
              style={{
                left: `${String(seg.left)}%`,
                width: `${String(seg.width)}%`,
              }}
              title={`${kindLabel(event.kind)} · ${formatRange(event.startDate, event.endDate)}`}
            >
              <span>{kindLabel(event.kind)}</span>
            </div>
          );
        })}
        {today >= trackStart && today <= trackEnd && (
          <div
            className="ap-track-today"
            style={{ left: `${String(pct(today))}%` }}
          >
            <span>Today</span>
          </div>
        )}
      </div>

      {listedEvents.length ? (
        <ul className="ap-events">
          {listedEvents.map((event) => {
            const override = overrideOptionLabel(client, event);
            return (
              <li
                key={event.id}
                className={`ap-event${event.endDate < today ? " ap-event-past" : ""}`}
              >
                <Status tone={kindTone(event.kind)} className="ap-event-kind">
                  {kindLabel(event.kind)}
                </Status>
                <span className="ap-event-dates">
                  {formatRange(event.startDate, event.endDate)}
                </span>
                <span className="ap-event-note ap-sub">
                  {event.note ||
                    (override
                      ? `Override: ${override}`
                      : event.kind === "deload"
                        ? "Training unchanged"
                        : "")}
                </span>
                <span className="ap-event-actions">
                  <IconButton
                    label={`Edit ${kindLabel(event.kind)}`}
                    onClick={() => onEdit(event)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${kindLabel(event.kind)}`}
                    onClick={() => onDelete(event.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="Plan an event on the timeline" />
      )}
      {earlierEvents.length > 0 && !showEarlier && (
        <button
          type="button"
          className="ap-link ap-timeline-more"
          onClick={() => setShowEarlier(true)}
        >
          Show earlier ({earlierEvents.length})
        </button>
      )}
      {showEarlier && earlierEvents.length > 0 && (
        <button
          type="button"
          className="ap-link ap-timeline-more"
          onClick={() => setShowEarlier(false)}
        >
          Hide earlier
        </button>
      )}
    </Surface>
  );
}

function TimelineEventDialog({
  client,
  event,
  presetKind,
  today,
  onClose,
  onSave,
}: {
  client: CoachClient;
  event: TimelineEvent | null;
  presetKind: TimelineEventKind | null;
  today: string;
  onClose: () => void;
  onSave: (event: TimelineEvent) => string | null;
}) {
  const [kind, setKind] = useState<TimelineEventKind>(
    event?.kind ?? presetKind ?? "deload",
  );
  const [start, setStart] = useState(event?.startDate ?? today);
  const [end, setEnd] = useState(event?.endDate ?? today);
  const [note, setNote] = useState(event?.note ?? "");
  const [overrideId, setOverrideId] = useState(
    event?.nutritionOverride?.optionId ?? REGULAR_PLAN,
  );
  const [error, setError] = useState<string | null>(null);

  const source: "mealPlan" | "iifym" =
    client.plans && applicablePlan(client.plans.nutrition.mealPlan, today)
      ? "mealPlan"
      : "iifym";
  const plan = client.plans
    ? source === "mealPlan"
      ? applicablePlan(client.plans.nutrition.mealPlan, start || today)
      : applicablePlan(client.plans.nutrition.iifym, start || today)
    : undefined;
  const options: { id: string; label: string }[] =
    source === "mealPlan"
      ? ((plan as MealPlan | undefined)?.variants ?? [])
      : ((plan as IifymPlan | undefined)?.options ?? []);
  const scheduled = plan
    ? scheduledOption(
        plan.schedule,
        options.map((o) => o.id),
        start,
      )
    : undefined;

  const nutritionKind = kind === "diet-break" || kind === "refeed";
  const submit = () => {
    const next: TimelineEvent = {
      id: event?.id ?? uid("timeline"),
      kind,
      startDate: start,
      endDate: kind === "refeed" ? start : end,
      note: note.trim(),
      nutritionOverride:
        nutritionKind && overrideId !== REGULAR_PLAN
          ? { source, optionId: overrideId }
          : undefined,
    };
    setError(onSave(next));
  };

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        event ? `Edit ${kindLabel(kind).toLowerCase()}` : "Add to timeline"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button primary onClick={submit}>
            {event ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <div className="ap-dialog">
        <SegmentedControl
          label="Event kind"
          value={kind}
          onValueChange={(value) => {
            const next = value as TimelineEventKind;
            setKind(next);
            if (next === "refeed") setEnd(start);
          }}
          options={KIND_OPTIONS}
        />
        {kind === "refeed" ? (
          <DateField label="Date" value={start} onChange={setStart} />
        ) : (
          <DateRangePicker
            label="Dates"
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
          />
        )}
        <Input
          label="Note"
          value={note}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setNote(e.currentTarget.value)
          }
          placeholder="Optional note"
        />
        {nutritionKind && (
          <Select
            label="Nutrition while this runs"
            value={overrideId}
            onChange={setOverrideId}
            options={[
              {
                value: REGULAR_PLAN,
                label: scheduled
                  ? `Keep regular plan (${options.find((o) => o.id === scheduled)?.label ?? "scheduled"})`
                  : "Keep regular plan",
              },
              ...options.map((o) => ({ value: o.id, label: o.label })),
            ]}
          />
        )}
        {kind === "deload" && (
          <p className="ap-sub ap-dialog-hint">Training unchanged</p>
        )}
        {kind === "refeed" && (
          <p className="ap-sub ap-dialog-hint">
            Overrides nutrition for this day.
          </p>
        )}
        {error && <p className="ap-dialog-error">{error}</p>}
      </div>
    </Modal>
  );
}

const ATTENTION_TONE: Record<
  ReturnType<typeof attentionItems>[number]["kind"],
  "danger" | "warning" | "info"
> = {
  "check-in": "warning",
  "flagged-note": "info",
  "missed-session": "danger",
  "in-progress": "info",
};

function NeedsAttention({
  client,
  today,
}: {
  client: CoachClient;
  today: string;
}) {
  const { state, navigate, route } = useCoach();
  const items = attentionItems(state, client, today);
  const go = (item: ReturnType<typeof attentionItems>[number]) => {
    if (item.kind === "check-in")
      navigate({
        section: "check-ins",
        client: client.id,
        review: item.reviewId ?? "",
      });
    else
      navigate({
        ...route,
        section: "clients",
        client: client.id,
        tab: "Plans",
      });
  };
  return (
    <Surface className="ap-attention">
      <h3>Needs attention</h3>
      {items.length ? (
        <ul className="ap-attention-list">
          {items.map((item) => (
            <li key={`${item.kind}-${item.date}-${item.label}`}>
              <button
                type="button"
                className="ap-attention-row"
                onClick={() => go(item)}
              >
                <Status tone={ATTENTION_TONE[item.kind]}>
                  {item.kind === "check-in"
                    ? "Check-in"
                    : item.kind === "flagged-note"
                      ? "Note"
                      : item.kind === "missed-session"
                        ? "Missed"
                        : "Training"}
                </Status>
                <span className="ap-attention-text">
                  <b>{item.label}</b>
                  <span className="ap-attention-meta">{item.detail}</span>
                </span>
                <span className="ap-attention-link">
                  {item.kind === "check-in"
                    ? "Review"
                    : item.kind === "flagged-note"
                      ? "Open"
                      : "View"}
                  <ChevronRight size={14} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nothing needs attention" />
      )}
    </Surface>
  );
}

function RecentTraining({ client }: { client: CoachClient }) {
  const { state } = useCoach();
  const logs = useMemo(
    () =>
      (state.trainingLogs ?? [])
        .filter((log) => log.clientId === client.id)
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
        .slice(0, 5),
    [state.trainingLogs, client.id],
  );
  return (
    <Surface className="ap-recent">
      <h3>Recent training</h3>
      {logs.length ? (
        <ul className="ap-recent-list">
          {logs.map((log) => {
            const sets = log.exercises.flatMap((exercise) => exercise.sets);
            const done = sets.filter((set) => set.done).length;
            const flagged = sets.some((set) => set.flagged && set.note.trim());
            return (
              <li key={log.id} className="ap-recent-row">
                <span className="ap-recent-date ap-sub">
                  {formatDate(log.scheduledDate, { weekday: "short" })}
                </span>
                <span className="ap-recent-name">
                  <span className="ap-recent-name-text">{log.sessionName}</span>
                  {flagged && (
                    <Flag
                      size={12}
                      className="ap-flag"
                      aria-label="Flagged note"
                    />
                  )}
                </span>
                <span className="ap-recent-sets ap-sub">
                  {done} of {sets.length} sets
                </span>
                <Status
                  tone={log.status === "finished" ? "positive" : "warning"}
                >
                  {log.status === "finished" ? "Done" : "In progress"}
                </Status>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No training logged yet" />
      )}
    </Surface>
  );
}

function WidgetHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ap-widget-head">
      <div>
        <h3>{title}</h3>
        {sub && <p className="ap-sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function TrainingPlanWidget({
  client,
  today,
  onNavigate,
}: {
  client: CoachClient;
  today: string;
  onNavigate: (plan: string) => void;
}) {
  const { state } = useCoach();
  const training = client.plans
    ? applicablePlan(client.plans.training, today)
    : undefined;
  const week = training ? displayWeek(training, today) : undefined;
  const next = training
    ? nextSession(
        scheduledSessions(training, displayWeek(training, today)),
        (state.trainingLogs ?? []).filter((log) => log.clientId === client.id),
        today,
      )
    : undefined;
  return (
    <Surface className="ap-widget">
      <WidgetHead
        title="Training program"
        action={
          <Button variant="ghost" onClick={() => onNavigate("training")}>
            Change
          </Button>
        }
      />
      {training ? (
        <div className="ap-plan-text">
          <b>{training.name}</b>
          <span className="ap-sub">
            {week !== undefined
              ? `Week ${String(week)}${training.weeks ? ` of ${String(training.weeks)}` : ""}${next ? ` · next ${next.session.name}` : ""}`
              : "Not scheduled"}
          </span>
        </div>
      ) : (
        <Empty title="No training plan" />
      )}
    </Surface>
  );
}

function SupplementsWidget({
  client,
  onNavigate,
}: {
  client: CoachClient;
  onNavigate: (plan: string) => void;
}) {
  const supplements =
    client.plans?.supplements && isSupplementPlan(client.plans.supplements)
      ? client.plans.supplements
      : undefined;
  const mustHaves = supplements?.items.filter(
    (item) => item.status === "must-have",
  ).length;
  return (
    <Surface className="ap-widget">
      <WidgetHead
        title="Supplements"
        action={
          <Button variant="ghost" onClick={() => onNavigate("supplements")}>
            Change
          </Button>
        }
      />
      {supplements ? (
        <div className="ap-plan-text">
          <b>{supplements.items.length} supplements</b>
          {mustHaves !== undefined && (
            <span className="ap-sub">
              {mustHaves} must-have{mustHaves === 1 ? "" : "s"}
            </span>
          )}
        </div>
      ) : (
        <Empty title="No supplement plan" />
      )}
    </Surface>
  );
}

function TargetFields({
  targets,
  onChange,
}: {
  targets: MealTargets | undefined;
  onChange: (targets: MealTargets) => void;
}) {
  const style = targets?.style ?? "calories";
  const keys =
    style === "calories"
      ? (["calories"] as const)
      : (["protein", "carbs", "fat"] as const);
  const labelFor = (key: string) =>
    key === "calories" ? "kcal" : key[0].toUpperCase();
  const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
  return (
    <div className="ap-nt-fields">
      {keys.map((key) => {
        const tv = targets?.[key];
        const write = (next: TargetValue) =>
          onChange({ ...(targets ?? { style }), style, [key]: next });
        return (
          <div className="ap-nt-field" key={key}>
            {tv?.kind === "range" ? (
              <>
                <Input
                  label={`${labelFor(key)} min`}
                  type="number"
                  value={String(tv.min)}
                  onChange={(e) =>
                    write({
                      kind: "range",
                      min: num(e.target.value),
                      max: tv.max,
                    })
                  }
                />
                <Input
                  label={`${labelFor(key)} max`}
                  type="number"
                  value={String(tv.max)}
                  onChange={(e) =>
                    write({
                      kind: "range",
                      min: tv.min,
                      max: num(e.target.value),
                    })
                  }
                />
              </>
            ) : (
              <Input
                label={labelFor(key)}
                type="number"
                value={tv ? String(tv.value) : ""}
                onChange={(e) =>
                  write({
                    kind: tv?.kind ?? "fixed",
                    value: num(e.target.value),
                  })
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityTargetsWidget({
  client,
  today,
  update,
}: {
  client: CoachClient;
  today: string;
  update: (fn: (c: CoachClient) => CoachClient) => void;
}) {
  const { toast } = useCoach();
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
  const prevFor = (
    metric: "steps" | "cardio",
    current: ActivityTargetVersion | undefined,
  ) =>
    [...versions]
      .filter(
        (v) =>
          v.metric === metric &&
          (!current || v.effectiveFrom < current.effectiveFrom),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  const [editing, setEditing] = useState(false);
  const [stepsDraft, setStepsDraft] = useState<StepsTarget | null>(null);
  const [cardioDraft, setCardioDraft] = useState<CardioTarget | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<{
    versions: ActivityTargetVersion[];
    changes: ActivityChange[];
  } | null>(null);

  const persist = (nextVersions: ActivityTargetVersion[]) => {
    update((c) => ({
      ...c,
      plans: {
        ...(c.plans ?? emptyClientPlans()),
        activityTargets: nextVersions,
      },
    }));
    setEditing(false);
    setErrors([]);
    toast("Activity targets saved");
  };

  const save = () => {
    const changes: ActivityChange[] = [];
    if (stepsDraft) changes.push({ metric: "steps", target: stepsDraft });
    if (cardioDraft) changes.push({ metric: "cardio", target: cardioDraft });
    let next = versions;
    const needConfirm: ActivityChange[] = [];
    const errs: string[] = [];
    for (const change of changes) {
      const result = writeActivityTarget({
        versions: next,
        change,
        effectiveFrom: today,
        id: uid("target"),
      });
      if (result.kind === "invalid") errs.push(...result.errors);
      else if (result.kind === "confirmation-required")
        needConfirm.push(change);
      else next = result.versions;
    }
    if (errs.length) {
      setErrors(errs);
      return;
    }
    if (needConfirm.length) {
      setPending({ versions: next, changes: needConfirm });
      return;
    }
    persist(next);
  };

  const stepsPrev = prevFor("steps", steps);
  const cardioPrev = prevFor("cardio", cardio);

  return (
    <Surface className="ap-widget">
      <WidgetHead
        title="Activity targets"
        sub="per week"
        action={
          editing ? undefined : (
            <Button
              variant="secondary"
              onClick={() => {
                setStepsDraft(
                  (steps?.target as StepsTarget | null) ?? {
                    kind: "fixed",
                    value: 8000,
                  },
                );
                setCardioDraft(
                  (cardio?.target as CardioTarget | null) ?? {
                    sessionsPerWeek: 0,
                    minutesPerSession: 0,
                  },
                );
                setErrors([]);
                setEditing(true);
              }}
            >
              Adjust
            </Button>
          )
        }
      />
      <div className="ap-at-row">
        <span className="ap-sub">Steps</span>
        <div className="ap-at-text">
          <b>{formatActivityTarget(steps)}</b>
          {steps && (
            <span className="ap-sub">
              from {formatDate(steps.effectiveFrom, { weekday: undefined })}
              {stepsPrev &&
                ` · was ${formatActivityTarget(stepsPrev)} until ${formatDate(addLocalDays(steps.effectiveFrom, -1), { weekday: undefined })}`}
            </span>
          )}
        </div>
        {editing && stepsDraft && (
          <div className="ap-at-edit">
            <SegmentedControl
              label="Steps target kind"
              value={stepsDraft.kind}
              onValueChange={(value) => {
                const kind = value as StepsTarget["kind"];
                setStepsDraft(
                  kind === "range"
                    ? { kind: "range", min: 6000, max: 8000 }
                    : {
                        kind,
                        value:
                          stepsDraft.kind === "range"
                            ? stepsDraft.min
                            : stepsDraft.value,
                      },
                );
              }}
              options={[
                { value: "minimum", label: "Min" },
                { value: "maximum", label: "Max" },
                { value: "fixed", label: "Fixed" },
                { value: "range", label: "Range" },
              ]}
            />
            {stepsDraft.kind === "range" ? (
              <>
                <Input
                  label="Min steps"
                  type="number"
                  value={String(stepsDraft.min)}
                  onChange={(e) =>
                    setStepsDraft({
                      kind: "range",
                      min: Number(e.target.value),
                      max: stepsDraft.kind === "range" ? stepsDraft.max : 0,
                    })
                  }
                />
                <Input
                  label="Max steps"
                  type="number"
                  value={String(stepsDraft.max)}
                  onChange={(e) =>
                    setStepsDraft({
                      kind: "range",
                      min: stepsDraft.kind === "range" ? stepsDraft.min : 0,
                      max: Number(e.target.value),
                    })
                  }
                />
              </>
            ) : (
              <Input
                label="Steps"
                type="number"
                value={String(stepsDraft.value)}
                onChange={(e) =>
                  setStepsDraft({
                    kind: stepsDraft.kind,
                    value: Number(e.target.value),
                  })
                }
              />
            )}
          </div>
        )}
      </div>
      <div className="ap-at-row">
        <span className="ap-sub">Cardio</span>
        <div className="ap-at-text">
          <b>{formatActivityTarget(cardio)}</b>
          {cardio && (
            <span className="ap-sub">
              from {formatDate(cardio.effectiveFrom, { weekday: undefined })}
              {cardioPrev &&
                ` · was ${formatActivityTarget(cardioPrev)} until ${formatDate(addLocalDays(cardio.effectiveFrom, -1), { weekday: undefined })}`}
            </span>
          )}
        </div>
        {editing && cardioDraft && (
          <div className="ap-at-edit ap-at-edit-cardio">
            <Input
              label="Sessions / week"
              type="number"
              value={String(cardioDraft.sessionsPerWeek)}
              onChange={(e) =>
                setCardioDraft({
                  ...cardioDraft,
                  sessionsPerWeek: Number(e.target.value),
                })
              }
            />
            <Input
              label="Minutes / session"
              type="number"
              value={String(cardioDraft.minutesPerSession)}
              onChange={(e) =>
                setCardioDraft({
                  ...cardioDraft,
                  minutesPerSession: Number(e.target.value),
                })
              }
            />
          </div>
        )}
      </div>
      {editing && (
        <div className="ap-nt-actions">
          {errors.map((error) => (
            <p key={error} className="ap-dialog-error" role="alert">
              {error}
            </p>
          ))}
          <div className="cd-actions">
            <Button primary onClick={save}>
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setErrors([]);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {pending && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          title="Replace today's target?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                primary
                onClick={() => {
                  let next = pending.versions;
                  for (const change of pending.changes) {
                    const result = writeActivityTarget({
                      versions: next,
                      change,
                      effectiveFrom: today,
                      id: uid("target"),
                      confirmSameDay: true,
                    });
                    if (result.kind === "saved") next = result.versions;
                  }
                  setPending(null);
                  persist(next);
                }}
              >
                Replace
              </Button>
            </>
          }
        >
          <p className="ap-sub">
            A target already starts today. Save anyway? The earlier version will
            be replaced.
          </p>
        </Modal>
      )}
    </Surface>
  );
}

function CoachingSetup({
  client,
  update,
  onAddDate,
  onAssign,
}: {
  client: CoachClient;
  update: (fn: (c: CoachClient) => CoachClient) => void;
  onAddDate: () => void;
  onAssign: () => void;
}) {
  const { state, navigate, toast } = useCoach();
  const activeSchedule = client.schedules.at(-1);
  return (
    <Surface className="ap-setup">
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
        <Button variant="ghost" onClick={onAssign}>
          Change
        </Button>
      </div>
      <h4>Recurring check-in</h4>
      <p className="ap-sub">Recurring check-ins · Europe/Vienna</p>
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
              onClick={() =>
                navigate({ section: "check-ins", client: client.id })
              }
            >
              Manage
            </Button>
          </div>
        ))}
      {!state.extras.some((e) => e.clientId === client.id) && (
        <p className="ap-sub">No additional dates.</p>
      )}
      <Button variant="secondary" onClick={onAddDate}>
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
    </Surface>
  );
}
