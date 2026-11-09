"use client";

import { useMemo, useState } from "react";
import type { TrackerEntry } from "@/components/ethereal/client-tracker/model";
import {
  createInitialMealPlan,
  type Food,
} from "@/components/ethereal/mealplan/model";
import foodSource from "@/data/food-database.json";
import { nutritionForDate } from "../coach/athlete/timeline";
import {
  bindDashboardUnits,
  recordsForCoach,
} from "../coach/builder/coach-dashboard";
import { DashboardBuilder } from "../coach/builder/dashboard-builder";
import type { SourceRecords } from "../coach/builder/model";
import { createDashboardDraft } from "../coach/builder/schema";
import { ClientPlanPreview } from "../coach/client-plan-preview";
import { createExampleHistory } from "../coach/client-tracker-preview/example-history";
import { TrackingView } from "../coach/client-tracker-preview/tracking-view";
import {
  allParameters,
  type CoachClient,
  formatDate,
  monday,
  TODAY,
  type Variant,
} from "../coach/model";
import { phaseForDate, phaseRanges } from "../coach/plans/phase-planning";
import { TrainingPrescription } from "../coach/plans/training/editor";
import {
  ActiveClientNutrition,
  ActiveClientTraining,
} from "../coach/plans/workspace";
import { weeklyRoadmapRows } from "../coach/roadmap-preview";
import { useCoach } from "../coach/store";
import {
  type ActivityMetric,
  type ActivitySegment,
  formatActivityTarget,
} from "../coach/targets/model";
import { TargetSummary } from "../coach/targets/target-summary";
import { useLocalToday } from "../coach/targets/use-local-today";
import {
  clientTracking,
  clientTrackingText,
  withTrackingText,
  withTrackingValue,
} from "../coach/tracking/data";
import { Empty } from "../coach/ui";
import { CheckInForm } from "./check-in";
import "../coach/client-preview.css";

const foodMap = new Map<string, Food>(
  ((foodSource as { foods?: Food[] }).foods ?? []).map((food) => [
    food.id,
    food,
  ]),
);

import { trackerConfig } from "./tracker-config";

export { trackerConfig };

function parameterGroups() {
  const groups: Record<string, string> = {};
  for (const parameter of allParameters())
    groups[parameter.id] = parameter.group;
  return groups;
}

export function DashboardTab({
  configuration,
  client,
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  const { state } = useCoach();
  const records = useMemo(
    () => recordsForCoach(configuration, client, state),
    [configuration, client, state],
  );
  const dashboard = useMemo(
    () =>
      bindDashboardUnits(
        configuration.dashboard ?? createDashboardDraft(),
        configuration,
      ),
    [configuration],
  );
  return (
    <DashboardBuilder
      value={dashboard}
      onChange={() => undefined}
      sourceRecords={records}
      previewOnly
    />
  );
}

export function TrackerTab({
  configuration,
  client,
  example = false,
}: {
  configuration: Variant;
  client: CoachClient;
  example?: boolean;
}) {
  const liveToday = useLocalToday();
  const { setState } = useCoach();
  const [exampleHistory, setExampleHistory] = useState<{
    entries: TrackerEntry[];
    textValues: Record<string, string>;
  }>(() =>
    example
      ? createExampleHistory(trackerConfig(configuration), TODAY)
      : { entries: [], textValues: {} },
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const groups = useMemo(parameterGroups, []);
  const entries = example ? exampleHistory.entries : clientTracking(client);
  const textValues = example
    ? exampleHistory.textValues
    : clientTrackingText(client);
  const writeClient = (update: (item: CoachClient) => CoachClient) =>
    setState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id ? update(item) : item,
      ),
    }));
  return (
    <TrackingView
      config={trackerConfig(configuration)}
      entries={entries}
      clientName={client.name}
      renderTargets={({ date, view }) => (
        <TargetSummary
          versions={client.plans?.activityTargets ?? []}
          date={date}
          mode={view === "Today" ? "day" : "week"}
        />
      )}
      clientInitials={
        client.initials ||
        client.name
          .split(" ")
          .map((s) => s[0])
          .slice(0, 2)
          .join("")
      }
      asOf={example ? TODAY : liveToday}
      parameterGroups={groups}
      comments={comments}
      textValues={textValues}
      onUpdateText={(date, id, value) => {
        if (!example) {
          writeClient((item) => withTrackingText(item, date, id, value));
          return;
        }
        setExampleHistory((current) => {
          const next = { ...current.textValues };
          if (value) next[`${date}:${id}`] = value;
          else delete next[`${date}:${id}`];
          return { ...current, textValues: next };
        });
      }}
      onUpdateValue={(date, id, value) => {
        if (!example) {
          writeClient((item) => withTrackingValue(item, date, id, value));
          return;
        }
        setExampleHistory((current) => ({
          ...current,
          entries: current.entries.some((entry) => entry.date === date)
            ? current.entries.map((entry) =>
                entry.date === date
                  ? { ...entry, values: { ...entry.values, [id]: value } }
                  : entry,
              )
            : [...current.entries, { date, values: { [id]: value } }],
        }));
      }}
      onSaveComment={(date, id, text) =>
        setComments((current) => {
          const next = { ...current };
          if (text) next[`${date}:${id}`] = text;
          else delete next[`${date}:${id}`];
          return next;
        })
      }
    />
  );
}

const SEGMENT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const segmentDay = (date: string) =>
  SEGMENT_DAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
const segmentDayRange = (segment: ActivitySegment) =>
  segment.start === segment.end
    ? segmentDay(segment.start)
    : `${segmentDay(segment.start)}–${segmentDay(segment.end)}`;
const ACTIVITY_COLUMN_LABELS: Record<ActivityMetric, string> = {
  steps: "Steps target",
  cardio: "Cardio target",
};

export function RoadmapTab({
  configuration,
  client,
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  const liveToday = useLocalToday();
  const rows = useMemo(
    () => weeklyRoadmapRows(configuration, client, { asOf: liveToday }),
    [configuration, client, liveToday],
  );
  const planning = configuration.roadmapActivityTargets ?? [];
  const showPhases = configuration.roadmapPhases !== false;
  const currentWeek = monday(liveToday);
  const displayedCurrentPhase =
    phaseForDate(client.phases, liveToday) ?? client.phase;
  const savedPhaseRanges = phaseRanges(client.phases);
  if (!configuration.roadmap.length && !planning.length)
    return (
      <Empty title="No weekly metrics configured">
        This template does not summarize any weekly metrics.
      </Empty>
    );
  return (
    <section className="cd-preview-section" aria-label="Timeline and roadmap">
      <h2>
        Timeline / Roadmap
        {showPhases && (
          <span className="cd-phase-badge">
            Current phase · {displayedCurrentPhase || "Not set"}
          </span>
        )}
      </h2>
      {rows.length === 0 ? (
        <Empty title="No recorded weeks yet">
          Weekly rows appear once {client.name} has logged entries.
        </Empty>
      ) : (
        <>
          {showPhases && savedPhaseRanges.length > 0 && (
            <section
              className="cd-saved-phase-ranges"
              aria-label="Saved phase plan"
            >
              {savedPhaseRanges.map((range) => (
                <span key={range.id}>
                  {range.name}
                  <small>
                    {formatDate(range.startDate)}–{formatDate(range.endDate)}
                  </small>
                </span>
              ))}
            </section>
          )}
          <div className="cd-table-scroll">
            <table className="cd-table cd-roadmap-table">
              <thead>
                <tr>
                  {showPhases && <th className="cd-phase-col">Phase</th>}
                  <th>Week</th>
                  {configuration.roadmap.map((metric) => (
                    <th key={metric.source}>
                      {
                        allParameters().find((p) => p.id === metric.source)
                          ?.name
                      }
                      <small>{metric.calculation}</small>
                    </th>
                  ))}
                  {planning.map((metric) => (
                    <th key={`activity-${metric}`}>
                      {ACTIVITY_COLUMN_LABELS[metric]}
                      <small>Prescription</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isCurrent = row.start === currentWeek;
                  const phase =
                    phaseForDate(client.phases, row.start) ??
                    (isCurrent ? client.phase : "");
                  return (
                    <tr key={row.start}>
                      {showPhases && (
                        <td
                          className={`cd-phase-cell${isCurrent ? " is-current" : ""}`}
                        >
                          <span
                            className={`cd-phase-marker${phase ? " is-set" : ""}`}
                            aria-hidden="true"
                          />
                          <span className="cd-phase-value">
                            {phase || "Not set"}
                          </span>
                        </td>
                      )}
                      <td>
                        {formatDate(row.start)}–{formatDate(row.end)}
                        {isCurrent && (
                          <small className="cd-current-week">
                            Current week
                          </small>
                        )}
                      </td>
                      {row.metrics.map((metric) => (
                        <td key={metric.source}>
                          {metric.value === null ? (
                            <span className="cd-muted">Not recorded</span>
                          ) : (
                            <strong>
                              {metric.calculation === "Adherence"
                                ? `${Math.round(metric.value)}%`
                                : `${Number(metric.value.toFixed(1))} ${metric.unit}`}
                            </strong>
                          )}
                          {metric.comparison && metric.target !== null && (
                            <small>
                              Target: {Number(metric.target.toFixed(1))}{" "}
                              {metric.unit}
                            </small>
                          )}
                        </td>
                      ))}
                      {row.activityTargets.map((entry) => (
                        <td key={`activity-${entry.metric}`}>
                          <ul className="cd-target-segments">
                            {entry.segments.map((segment) => (
                              <li key={segment.start}>
                                <span className="cd-segment-days">
                                  {segmentDayRange(segment)}
                                </span>
                                {!segment.version ? (
                                  <span className="cd-muted">No target</span>
                                ) : segment.version.target === null ? (
                                  <span className="cd-muted">Stopped</span>
                                ) : (
                                  <strong>
                                    {formatActivityTarget(segment.version)}
                                  </strong>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="cd-caption">
        Weekly observations use {client.name}’s recorded tracker entries.
        Missing or unsupported data is shown as not recorded, never estimated.
        {planning.length > 0 &&
          " Planning rows show saved target prescriptions by their effective dates, including weeks with no recorded entries."}
      </p>
    </section>
  );
}

export function NutritionTab(props: {
  configuration: Variant;
  client: CoachClient;
  illustrative?: boolean;
}) {
  return props.illustrative ? (
    <IllustrativeNutritionTab {...props} />
  ) : (
    <ClientNutritionTab client={props.client} />
  );
}
function ClientNutritionTab({ client }: { client: CoachClient }) {
  const liveToday = useLocalToday();
  const [date, setDate] = useState(liveToday);
  const resolved = nutritionForDate(client, date);
  return (
    <>
      {resolved.temporary && (
        <div className="cd-nutrition-banner" role="status">
          <strong className="cd-nutrition-banner-kind">
            {resolved.temporary.label}
          </strong>
          <span className="cd-nutrition-banner-text">
            {resolved.temporary.startDate === resolved.temporary.endDate
              ? formatDate(resolved.temporary.startDate)
              : `${formatDate(resolved.temporary.startDate)} – ${formatDate(resolved.temporary.endDate)}`}
            {resolved.label ? ` · ${resolved.label} applies` : ""}
          </span>
        </div>
      )}
      <ActiveClientNutrition
        client={client}
        date={date}
        onDateChange={setDate}
        override={
          resolved.temporary
            ? { plan: resolved.temporary.plan, optionId: resolved.optionId }
            : undefined
        }
      />
    </>
  );
}
function IllustrativeNutritionTab({
  configuration,
  client,
  illustrative = false,
}: {
  configuration: Variant;
  client: CoachClient;
  illustrative?: boolean;
}) {
  const { state } = useCoach();
  const samplePlan = useMemo(() => {
    const plan = createInitialMealPlan(client.id, [...foodMap.values()]);
    return plan.variants[0];
  }, [client.id]);
  if (configuration.nutrition === "IIFYM") {
    const records = recordsForCoach(configuration, client, state);
    const sampleRecords = recordsForCoach(configuration);
    const targetFor = (
      source: SourceRecords,
      nutrient: "calories" | "protein" | "carbs" | "fat",
      option: "TD" | "NTD",
    ) => {
      const matchesDate = (target: {
        effectiveFrom: string;
        effectiveTo?: string;
      }) =>
        target.effectiveFrom <= TODAY &&
        (!target.effectiveTo || target.effectiveTo >= TODAY);
      return nutrient === "calories"
        ? source.calorieTargets?.find(
            (target) => target.option === option && matchesDate(target),
          )
        : source.macroTargets.find(
            (target) =>
              target.macro === nutrient &&
              target.option === option &&
              matchesDate(target),
          );
    };
    const targetValue = (target: ReturnType<typeof targetFor>) =>
      target?.kind === "range"
        ? (target.low + (target.high ?? target.low)) / 2
        : target?.low;
    const macroLabel = (target: ReturnType<typeof targetFor>) => {
      if (!target) return "Not set";
      if (target.kind === "range")
        return `${Math.round(target.low)}–${Math.round(target.high ?? target.low)} g`;
      if (target.kind === "minimum") return `≥${Math.round(target.low)} g`;
      return `${Math.round(target.low)} g`;
    };
    const targetDays = (["TD", "NTD"] as const).map((option) => {
      const resolve = (nutrient: "calories" | "protein" | "carbs" | "fat") =>
        targetFor(records, nutrient, option) ??
        (illustrative ? targetFor(sampleRecords, nutrient, option) : undefined);
      return {
        option,
        calories: resolve("calories"),
        macros: [
          { id: "protein", label: "Protein", target: resolve("protein") },
          { id: "carbs", label: "Carbs", target: resolve("carbs") },
          { id: "fat", label: "Fat", target: resolve("fat") },
        ],
      };
    });
    return (
      <section className="cd-preview-section" aria-label="Nutrition targets">
        <h2>Nutrition · daily macro targets</h2>
        <div className="cd-iifym-days">
          {targetDays.map((day) => {
            const macros = day.macros.map((macro) => ({
              ...macro,
              grams: targetValue(macro.target),
            }));
            const energyValues = macros.map(
              (macro) => (macro.grams ?? 0) * (macro.id === "fat" ? 9 : 4),
            );
            const totalEnergy = energyValues.reduce(
              (sum, value) => sum + value,
              0,
            );
            let offset = 0;
            const ringSegments = macros.map((macro, index) => {
              const circumference = 2 * Math.PI * 47;
              const share =
                totalEnergy > 0 ? energyValues[index] / totalEnergy : 0;
              const length = circumference * share;
              const segment = (
                <circle
                  key={macro.id}
                  className={`cd-iifym-ring-segment is-${macro.id}`}
                  cx="60"
                  cy="60"
                  r="47"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return segment;
            });
            return (
              <article className="cd-iifym-day" key={day.option}>
                <header>
                  <h3>
                    {day.option === "TD" ? "Training day" : "Non-training day"}
                  </h3>
                  <span>{day.option}</span>
                </header>
                <div className="cd-iifym-day-content">
                  <div className="cd-iifym-values">
                    <div className="cd-iifym-energy">
                      <span>Energy</span>
                      <strong>
                        {targetValue(day.calories) == null
                          ? "Not set"
                          : `${Math.round(targetValue(day.calories) ?? 0)} kcal`}
                      </strong>
                    </div>
                    <dl>
                      {day.macros.map((macro) => (
                        <div key={macro.id}>
                          <dt>{macro.label}</dt>
                          <dd>{macroLabel(macro.target)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="cd-iifym-distribution">
                    <svg
                      className="cd-iifym-ring"
                      viewBox="0 0 120 120"
                      role="img"
                      aria-label={`${day.option} macro distribution by target energy: ${macros.map((macro, index) => `${macro.label} ${Math.round((totalEnergy > 0 ? energyValues[index] / totalEnergy : 0) * 100)}%`).join(", ")}`}
                    >
                      <circle
                        className="cd-iifym-ring-track"
                        cx="60"
                        cy="60"
                        r="47"
                      />
                      {ringSegments}
                      <text
                        x="60"
                        y="56"
                        textAnchor="middle"
                        className="cd-iifym-ring-total"
                      >
                        {totalEnergy > 0
                          ? `${Math.round(totalEnergy)} kcal`
                          : "No targets"}
                      </text>
                      <text
                        x="60"
                        y="72"
                        textAnchor="middle"
                        className="cd-iifym-ring-caption"
                      >
                        from macros
                      </text>
                    </svg>
                    <ul>
                      {macros.map((macro, index) => (
                        <li key={macro.id}>
                          <span className={`cd-iifym-key is-${macro.id}`} />
                          <span>{macro.label}</span>
                          <strong>
                            {Math.round(
                              (totalEnergy > 0
                                ? energyValues[index] / totalEnergy
                                : 0) * 100,
                            )}
                            %
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <p className="cd-caption">
          Macro distribution uses 4 kcal per gram of protein or carbohydrate and
          9 kcal per gram of fat. Ranges use their midpoint; minimums use the
          stated minimum.
        </p>
      </section>
    );
  }
  return (
    <section className="cd-preview-section" aria-label="Meal plan">
      <h2>Nutrition · Meal plan</h2>
      <ClientPlanPreview
        variant={samplePlan}
        foodMap={foodMap}
        clientName={client.name}
      />
      <p className="cd-caption">
        Sample prescription for preview. {client.name}’s actual foods, swaps and
        schedule are set in client setup.
      </p>
    </section>
  );
}

function illustrativeTrainingPlan(
  clientId: string,
): import("../coach/plans/types").TrainingPlan {
  const set = (id: string, reps: number) => ({
    id,
    reps,
    tempo: "2-0-2",
    type: "Working",
    rest: "90 sec",
    instructions: "",
  });
  return {
    id: "sample-training-plan",
    clientId,
    name: "Sample strength plan",
    startDate: TODAY,
    program: "Week-based",
    weeks: 4,
    overrides: {
      "1": [
        {
          id: "sample-session-a",
          name: "Session A · Upper",
          exercises: [
            {
              id: "sample-bench",
              name: "Bench press",
              muscle: "chest",
              instructions: "",
              progression: "Add reps, then load",
              sets: [
                set("sample-bench-1", 8),
                set("sample-bench-2", 8),
                set("sample-bench-3", 6),
              ],
            },
            {
              id: "sample-row",
              name: "Seated row",
              muscle: "back",
              instructions: "",
              progression: "Add reps, then load",
              sets: [set("sample-row-1", 10), set("sample-row-2", 10)],
            },
          ],
        },
        {
          id: "sample-session-b",
          name: "Session B · Lower",
          exercises: [
            {
              id: "sample-squat",
              name: "Goblet squat",
              muscle: "quadriceps",
              instructions: "",
              progression: "Add reps, then load",
              sets: [
                set("sample-squat-1", 10),
                set("sample-squat-2", 10),
                set("sample-squat-3", 8),
              ],
            },
            {
              id: "sample-hip-thrust",
              name: "Hip thrust",
              muscle: "glutes",
              instructions: "",
              progression: "Add reps, then load",
              sets: [
                set("sample-hip-thrust-1", 10),
                set("sample-hip-thrust-2", 10),
              ],
            },
          ],
        },
      ],
    },
    rotation: {
      mode: "cycle",
      sessionIds: ["sample-session-a", "sample-session-b"],
    },
  };
}

export function TrainingTab(props: {
  configuration: Variant;
  client: CoachClient;
  illustrative?: boolean;
}) {
  return props.illustrative ? (
    <IllustrativeTrainingTab {...props} />
  ) : (
    <ActiveClientTraining client={props.client} />
  );
}

export function IllustrativeTrainingTab({
  configuration,
  client,
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  const plan = useMemo(() => illustrativeTrainingPlan(client.id), [client.id]);
  return (
    <section className="cd-preview-section" aria-label="Training program">
      <TrainingPrescription value={plan} configuration={configuration} />
      <p className="cd-caption">
        Isolated sample prescription. It does not change {client.name}’s saved
        plan.
      </p>
    </section>
  );
}

export function CheckInTab({
  configuration,
  client,
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  return <CheckInForm configuration={configuration} client={client} />;
}
