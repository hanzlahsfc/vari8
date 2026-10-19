"use client";

import { useMemo, useState } from "react";
import type { TrackerEntry } from "@/components/ethereal/client-tracker/model";
import {
  createInitialMealPlan,
  type Food,
} from "@/components/ethereal/mealplan/model";
import foodSource from "@/data/food-database.json";
import { bindDashboardUnits, recordsForCoach } from "./builder/coach-dashboard";
import { DashboardBuilder } from "./builder/dashboard-builder";
import type { SourceRecords } from "./builder/model";
import { createDashboardDraft } from "./builder/schema";
import { ClientPlanPreview } from "./client-plan-preview";
import { createExampleClient } from "./client-tracker-preview/example-client";
import { createExampleHistory } from "./client-tracker-preview/example-history";
import type { TrackerConfig } from "./client-tracker-preview/preview-model";
import { TrackingView } from "./client-tracker-preview/tracking-view";
import { HabitsTab } from "./habits-tab";
import {
  ALL_PARAMETERS,
  type CoachClient,
  formatDate,
  monday,
  PARAMETERS,
  TODAY,
  type Variant,
} from "./model";
import { weeklyMuscleVolume } from "./muscle-volume";
import { ActiveClientNutrition, ActiveClientTraining } from "./plans/workspace";
import { weeklyRoadmapRows } from "./roadmap-preview";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import { FormPreview } from "./templates";
import { trackerOverviewIds } from "./tracker-setup";
import { Avatar, Empty, Select } from "./ui";
import "./client-preview.css";

const foodMap = new Map<string, Food>(
  ((foodSource as { foods?: Food[] }).foods ?? []).map((food) => [
    food.id,
    food,
  ]),
);

function trackerConfig(configuration: Variant): TrackerConfig {
  const cycleTrackingEnabled =
    configuration.cycleTrackingEnabled ??
    configuration.fields.some(
      (field) =>
        PARAMETERS.find((parameter) => parameter.id === field.id)?.group ===
        "Cycle tracking",
    );
  return {
    summaryParameterIds: trackerOverviewIds(configuration),
    parameterIds: configuration.fields
      .filter((field) =>
        ALL_PARAMETERS.some(
          (parameter) =>
            parameter.id === field.id &&
            (cycleTrackingEnabled || parameter.group !== "Cycle tracking"),
        ),
      )
      .map((field) => field.id),
    cycleTrackingEnabled,
    fieldUnits: Object.fromEntries(
      configuration.fields.map((field) => [field.id, field.unit]),
    ),
    fieldOptions: Object.fromEntries(
      configuration.fields
        .filter((field) => field.options)
        .map((field) => [field.id, field.options ?? []]),
    ),
    weightUnit:
      configuration.fields.find((field) => field.id === "weight")?.unit === "lb"
        ? "lb"
        : "kg",
    lengthUnit:
      configuration.fields.find((field) => field.id === "waist")?.unit === "in"
        ? "in"
        : "cm",
    waterUnit:
      configuration.fields.find((field) => field.id === "water")?.unit ===
      "fl oz"
        ? "fl oz"
        : "L",
    ratingScale: "1-10",
    energyUnit:
      configuration.fields.find((field) => field.id === "calories")?.unit ===
      "kJ"
        ? "kJ"
        : "kcal",
    ratingScales: Object.fromEntries(
      configuration.fields
        .filter((field) => ["1–10", "1–5", "Word labels"].includes(field.unit))
        .map((field) => [
          field.id,
          field.unit === "1–5"
            ? ("1-5" as const)
            : field.unit === "Word labels"
              ? ("words" as const)
              : ("1-10" as const),
        ]),
    ),
  };
}

function trackerEntries(client: CoachClient): TrackerEntry[] {
  return client.entries.map((entry) => ({
    date: entry.date,
    values: {
      weight: entry.weight,
      sleep: entry.sleep,
      steps: entry.steps,
      calories: entry.calories,
      waist: null,
      protein: null,
      stress: null,
      energy: null,
      rhr: null,
      fbg: null,
    },
  }));
}

function parameterGroups() {
  const groups: Record<string, string> = {};
  for (const parameter of ALL_PARAMETERS)
    groups[parameter.id] = parameter.group;
  return groups;
}

function DashboardTab({
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

function TrackerTab({
  configuration,
  client,
  example = false,
}: {
  configuration: Variant;
  client: CoachClient;
  example?: boolean;
}) {
  const [initialHistory] = useState(() =>
    example
      ? createExampleHistory(trackerConfig(configuration), TODAY)
      : { entries: trackerEntries(client), textValues: {} },
  );
  const [entries, setEntries] = useState(initialHistory.entries);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>(
    initialHistory.textValues,
  );
  const groups = useMemo(parameterGroups, []);
  return (
    <TrackingView
      config={trackerConfig(configuration)}
      entries={entries}
      clientName={client.name}
      clientInitials={
        client.initials ||
        client.name
          .split(" ")
          .map((s) => s[0])
          .slice(0, 2)
          .join("")
      }
      asOf={TODAY}
      parameterGroups={groups}
      comments={comments}
      textValues={textValues}
      onUpdateText={(date, id, value) =>
        setTextValues((current) => {
          const next = { ...current };
          if (value) next[`${date}:${id}`] = value;
          else delete next[`${date}:${id}`];
          return next;
        })
      }
      onUpdateValue={(date, id, value) =>
        setEntries((current) =>
          current.some((entry) => entry.date === date)
            ? current.map((entry) =>
                entry.date === date
                  ? { ...entry, values: { ...entry.values, [id]: value } }
                  : entry,
              )
            : [...current, { date, values: { [id]: value } }],
        )
      }
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

function RoadmapTab({
  configuration,
  client,
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  const rows = useMemo(
    () => weeklyRoadmapRows(configuration, client),
    [configuration, client],
  );
  const showPhases = configuration.roadmapPhases !== false;
  const phaseChoices = useMemo(() => {
    const options = configuration.phaseOptions ?? [];
    return options.includes(client.phase)
      ? options
      : [...options, client.phase];
  }, [configuration.phaseOptions, client.phase]);
  const [phases, setPhases] = useState<Record<string, string>>({});
  const currentWeek = monday(TODAY);
  const displayedCurrentPhase = phases[currentWeek] ?? client.phase;
  if (!configuration.roadmap.length)
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
        <div className="cd-table-scroll">
          <table className="cd-table cd-roadmap-table">
            <thead>
              <tr>
                {showPhases && <th className="cd-phase-col">Phase</th>}
                <th>Week</th>
                {configuration.roadmap.map((metric) => (
                  <th key={metric.source}>
                    {ALL_PARAMETERS.find((p) => p.id === metric.source)?.name}
                    <small>{metric.calculation}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isCurrent = row.start === currentWeek;
                const phase =
                  phases[row.start] ?? (isCurrent ? client.phase : "");
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
                        <Select
                          label={`Phase for week of ${formatDate(row.start)}`}
                          value={phase}
                          options={[
                            { value: "", label: "Not set" },
                            ...phaseChoices,
                          ]}
                          onChange={(value) =>
                            setPhases((current) => ({
                              ...current,
                              [row.start]: value,
                            }))
                          }
                        />
                      </td>
                    )}
                    <td>
                      {formatDate(row.start)}–{formatDate(row.end)}
                      {isCurrent && (
                        <small className="cd-current-week">Current week</small>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="cd-caption">
        Weekly rows use {client.name}’s observed tracker entries only. Missing
        or unsupported data is shown as not recorded, never estimated.
      </p>
    </section>
  );
}

function NutritionTab(props: {
  configuration: Variant;
  client: CoachClient;
  illustrative?: boolean;
}) {
  return props.illustrative ? (
    <IllustrativeNutritionTab {...props} />
  ) : (
    <ActiveClientNutrition client={props.client} />
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

const BODY_REGIONS: Record<string, { side: "front" | "back"; path: string }[]> =
  {
    shoulders: [
      {
        side: "front",
        path: "M20 44 q6 -10 14 -6 q2 8 -4 14 q-10 2 -10 -8 z",
      },
      { side: "front", path: "M80 44 q-6 -10 -14 -6 q-2 8 4 14 q10 2 10 -8 z" },
      {
        side: "back",
        path: "M20 44 q6 -10 14 -6 q2 8 -4 14 q-10 2 -10 -8 z",
      },
      { side: "back", path: "M80 44 q-6 -10 -14 -6 q-2 8 4 14 q10 2 10 -8 z" },
    ],
    chest: [
      { side: "front", path: "M34 42 q16 -6 16 0 l0 14 q-10 4 -18 -2 z" },
      { side: "front", path: "M66 42 q-16 -6 -16 0 l0 14 q10 4 18 -2 z" },
    ],
    back: [
      { side: "back", path: "M30 38 q20 -8 40 0 l-4 30 q-16 -8 -32 0 z" },
      { side: "back", path: "M36 72 q14 -4 28 0 l-2 18 q-12 -4 -24 0 z" },
    ],
    biceps: [
      { side: "front", path: "M17 56 q7 -4 10 2 l-2 22 q-7 3 -10 -3 z" },
      { side: "front", path: "M83 56 q-7 -4 -10 2 l2 22 q7 3 10 -3 z" },
    ],
    triceps: [
      { side: "back", path: "M16 56 q7 -4 10 2 l-2 22 q-7 3 -10 -3 z" },
      { side: "back", path: "M84 56 q-7 -4 -10 2 l2 22 q7 3 10 -3 z" },
    ],
    core: [
      {
        side: "front",
        path: "M38 60 l24 0 q3 20 -3 34 l-18 0 q-6 -14 -3 -34 z",
      },
    ],
    glutes: [
      { side: "back", path: "M34 96 q16 -4 16 2 l-2 16 q-12 3 -16 -4 z" },
      { side: "back", path: "M66 96 q-16 -4 -16 2 l2 16 q12 3 16 -4 z" },
    ],
    quadriceps: [
      { side: "front", path: "M34 100 q13 -3 14 2 l-2 50 q-10 3 -13 -3 z" },
      { side: "front", path: "M66 100 q-13 -3 -14 2 l2 50 q10 3 13 -3 z" },
    ],
    hamstrings: [
      { side: "back", path: "M35 118 q12 -3 13 2 l-2 36 q-9 3 -12 -3 z" },
      { side: "back", path: "M65 118 q-12 -3 -13 2 l2 36 q9 3 12 -3 z" },
    ],
    calves: [
      { side: "back", path: "M36 162 q10 -3 11 2 l-2 26 q-8 3 -10 -3 z" },
      { side: "back", path: "M64 162 q-10 -3 -11 2 l2 26 q8 3 10 -3 z" },
    ],
  };

function BodyMap({
  groups,
}: {
  groups: { id: string; label: string; sets: number; intensity: number }[];
}) {
  const intensity = (id: string) =>
    groups.find((group) => group.id === id)?.intensity ?? 0;
  const sets = (id: string) => groups.find((g) => g.id === id)?.sets ?? 0;
  const fillFor = (id: string) =>
    intensity(id) === 0
      ? "var(--cd-field)"
      : `color-mix(in srgb, var(--cd-action-bg) ${25 + Math.round(intensity(id) * 75)}%, var(--cd-field))`;
  const figure = (side: "front" | "back") => (
    <svg
      viewBox="0 0 100 200"
      role="img"
      aria-label={`${side === "front" ? "Front" : "Back"} body muscle map`}
      className="cd-body-figure"
    >
      <circle cx="50" cy="17" r="9" className="cd-body-outline" />
      <path
        className="cd-body-outline"
        d="M30 34 q20 -8 40 0 q6 30 4 62 q1 34 -4 60 l-6 34 l-7 0 l-4 -32 l-3 -26 l-3 26 l-4 32 l-7 0 l-6 -34 q-5 -26 -4 -60 q-2 -32 4 -62 z"
      />
      <path
        className="cd-body-outline"
        d="M30 38 q-12 4 -15 16 l3 30 q2 10 6 20 l5 -2 q-3 -12 -3 -22 l3 -22 z"
      />
      <path
        className="cd-body-outline"
        d="M70 38 q12 4 15 16 l-3 30 q-2 10 -6 20 l-5 -2 q3 -12 3 -22 l-3 -22 z"
      />
      {Object.entries(BODY_REGIONS).map(([id, paths]) =>
        paths
          .filter((region) => region.side === side)
          .map((region) => (
            <path
              key={`${id}-${region.path.slice(0, 12)}`}
              d={region.path}
              className="cd-body-region"
              style={{ fill: fillFor(id) }}
            >
              <title>
                {groups.find((g) => g.id === id)?.label}: {sets(id)} sets / week
              </title>
            </path>
          )),
      )}
    </svg>
  );
  return (
    <div className="cd-body-map">
      <div className="cd-body-figures">
        {figure("front")}
        {figure("back")}
      </div>
      <ul className="cd-body-legend">
        {groups.map((group) => (
          <li key={group.id}>
            <span
              className="cd-body-swatch"
              style={{ background: fillFor(group.id) }}
            />
            <span>{group.label}</span>
            <strong>{group.sets}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrainingTab(props: {
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
function IllustrativeTrainingTab({
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
  const fields = configuration.training.fields;
  const week = records.coachingPlan?.currentWeek ?? 6;
  const schedule = [...records.workoutSchedule].sort(
    (a, b) => a.week - b.week || a.date.localeCompare(b.date),
  );
  const volume = useMemo(
    () => weeklyMuscleVolume(records.workoutSchedule, week),
    [records.workoutSchedule, week],
  );
  const heatmap = configuration.training.presentation === "Heatmap";
  const prescriptionFor = (session: (typeof schedule)[number]) =>
    records.prescriptions.find(
      (p) => p.week === session.week && p.name === session.name,
    ) ?? records.prescriptions.find((p) => p.week === session.week);
  const volumeBlock = configuration.training.volume && (
    <div className="cd-volume-block">
      <h3>
        Muscle groups / week
        <small>Sample program · Week {week} · planned working sets</small>
      </h3>
      {heatmap ? (
        <BodyMap groups={volume.groups} />
      ) : (
        <div className="cd-table-scroll">
          <table className="cd-table">
            <thead>
              <tr>
                <th>Muscle group</th>
                <th>Working sets / week</th>
              </tr>
            </thead>
            <tbody>
              {volume.groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.label}</td>
                  <td>{group.sets}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{volume.totalSets}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {volume.unassignedSets > 0 && (
        <p className="cd-caption">
          {volume.unassignedSets} sets are not assigned to a muscle group.
        </p>
      )}
    </div>
  );
  return (
    <section className="cd-preview-section" aria-label="Training program">
      <h2>Training program</h2>
      <p className="cd-muted">
        {client.plan.program} · week {week}
        {" of "}
        {client.plan.program === "Week-based" ? client.plan.weeks : "ongoing"} ·
        Sample program
      </p>
      {heatmap && volumeBlock}
      {schedule.map((session) => {
        const prescription = prescriptionFor(session);
        const exerciseNote = (id: string) =>
          prescription?.exercises.find((x) => x.id === id)?.note;
        const hasNotes = session.exercises.some((x) => exerciseNote(x.id));
        return (
          <div className="cd-logbook cd-preview-session" key={session.date}>
            <h3>
              {session.name}
              <small>
                Week {session.week} ·{" "}
                {formatDate(session.date, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </small>
            </h3>
            {session.exercises.map((exercise) => (
              <div className="cd-prescription" key={exercise.id}>
                <strong>{exercise.name}</strong>
                {fields.includes("Sets") && <span>{exercise.sets} sets</span>}
                {(fields.includes("Fixed reps") ||
                  fields.includes("Rep ranges")) && (
                  <span>{exercise.reps} reps</span>
                )}
                {fields.includes("Set type") && <span>Working set</span>}
                {fields.includes("Tempo") && <span>Tempo · not specified</span>}
                {fields.includes("Rest / pause") && (
                  <span>Rest · not specified</span>
                )}
                {fields.includes("Detailed instructions") &&
                  exerciseNote(exercise.id) && (
                    <span>{exerciseNote(exercise.id)}</span>
                  )}
              </div>
            ))}
            {fields.includes("Detailed instructions") &&
              !hasNotes &&
              client.plan.instructions && (
                <p className="cd-muted">{client.plan.instructions}</p>
              )}
            {fields.includes("Progression notes") && (
              <p className="cd-muted">Progression · not specified</p>
            )}
          </div>
        );
      })}
      {!heatmap && volumeBlock}
    </section>
  );
}

function CheckInTab({
  configuration,
  client,
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  return (
    <section className="cd-preview-section" aria-label="Check-in form">
      <h2>Check-In</h2>
      <FormPreview variant={configuration} custom={false} client={client} />
    </section>
  );
}

export function ClientPreview({
  template,
  client,
  initialTab,
}: {
  template: import("./model").Template;
  client?: CoachClient;
  initialTab?: string;
}) {
  const { state } = useCoach();
  const configuration = client?.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : templateSetup(template);
  const athlete = useMemo(() => {
    if (client) return client;
    const sample = state.clients[0];
    return sample
      ? createExampleClient(sample, trackerConfig(configuration), TODAY)
      : undefined;
  }, [client, state.clients, configuration]);
  const tabs = configuration.views.filter((v) =>
    [
      "Dashboard",
      "Tracker",
      "Timeline / Roadmap",
      "Nutrition",
      "Training Program",
      "Check-In",
    ].includes(v),
  );
  const allTabs = configuration.habits ? [...tabs, "Habits"] : tabs;
  const [tab, setTab] = useState(initialTab ?? allTabs[0] ?? "");
  const [habitDone, setHabitDone] = useState<Record<string, boolean>>({});
  const active = allTabs.includes(tab) ? tab : allTabs[0];
  if (!athlete) return <Empty title="No athlete available for preview" />;
  return (
    <div className="cd-full-client-preview">
      <div className="cd-preview-banner">
        <Avatar client={athlete} />
        <div>
          <strong>{athlete.name}</strong>
          <small>
            {client ? "Assigned athlete" : "Sample athlete"} · {template.name}
          </small>
        </div>
        <span className="cd-preview-note">
          {client
            ? "Client preview · changes stay inside preview"
            : "Client preview · 8 weeks of sample tracker data"}
        </span>
      </div>
      {allTabs.length === 0 ? (
        <Empty title="No tabs enabled">
          Enable at least one tab in the template’s Tabs section.
        </Empty>
      ) : (
        <>
          <nav className="cd-preview-tabs" aria-label="Client sections">
            {allTabs.map((name) => (
              <button
                type="button"
                key={name}
                className={active === name ? "active" : ""}
                aria-current={active === name ? "page" : undefined}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          <div className="cd-preview-body">
            {active === "Dashboard" && (
              <DashboardTab configuration={configuration} client={athlete} />
            )}
            <div hidden={active !== "Tracker"}>
              {allTabs.includes("Tracker") && (
                <TrackerTab
                  key={`${client?.id ?? "example"}:${configuration.id}`}
                  configuration={configuration}
                  client={athlete}
                  example={!client}
                />
              )}
            </div>
            {active === "Timeline / Roadmap" && (
              <RoadmapTab configuration={configuration} client={athlete} />
            )}
            {active === "Nutrition" && (
              <NutritionTab
                configuration={configuration}
                client={athlete}
                illustrative={!client}
              />
            )}
            {active === "Training Program" && (
              <TrainingTab
                configuration={configuration}
                client={athlete}
                illustrative={!client}
              />
            )}
            {active === "Check-In" && (
              <CheckInTab configuration={configuration} client={athlete} />
            )}
            {active === "Habits" && (
              <HabitsTab
                client={athlete}
                done={habitDone}
                onToggle={(id) =>
                  setHabitDone((current) => ({
                    ...current,
                    [id]: !current[id],
                  }))
                }
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
