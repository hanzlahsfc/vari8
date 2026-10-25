"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  SegmentedControl,
  Input as SharedInput,
  Select as SharedSelect,
} from "@/components/vari8/components";
import {
  DatePicker as SharedDatePicker,
  TextArea as SharedTextArea,
} from "@/components/vari8/inputs";
import { FormGrid, Section } from "@/components/vari8/layouts";
import type { MealPlan } from "../../ethereal/mealplan/model";
import {
  ALL_PARAMETERS,
  type CoachClient,
  type FieldConfig,
  formatDate,
  type HabitFrequency,
  type Template,
  TODAY,
  uid,
} from "../model";
import { useCoach } from "../store";
import {
  type ActivityMetric,
  type ActivityTargetVersion,
  formatActivityTarget,
  resolveActivityTarget,
} from "../targets/model";
import { useLocalToday } from "../targets/use-local-today";
import { templateSetup } from "../template-setup";
import { Button, Empty, IconButton, Status, Surface } from "../ui";
import {
  applicablePlan,
  lifecycleStatus,
  planTargets,
  scheduledOption,
  trainingWeek,
} from "./domain";
import {
  habitAdherence,
  habitFrequencyLabel,
  parseHabitFrequency,
} from "./habits";
import {
  type ClientPhase,
  canSavePhases,
  isValidPhaseStartDate,
  normalizePhases,
  phaseRanges,
} from "./phase-planning";
import {
  nutritionOptions,
  OtherTargetDialog,
  otherTargetLabel,
} from "./plan-cards-support";
import { removeTemporaryNutrition } from "./temporary-nutrition";
import { TemporaryPlanDialog, temporaryKcal } from "./temporary-plan-dialog";
import {
  type ClientGoal,
  type ClientPlans,
  emptyClientPlans,
  type PlanLifecycle,
  resolveTrainingWeek,
} from "./types";
import "./setup-ui.css";

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

function planData(client: CoachClient): ClientPlans {
  return client.plans ?? emptyClientPlans();
}

function moduleSummary<T extends { name: string; startDate: string }>(
  label: string,
  lifecycle: PlanLifecycle<T>,
) {
  const status = lifecycleStatus(lifecycle);
  const selected = applicablePlan(lifecycle, TODAY);
  const row =
    lifecycle.draft ??
    selected ??
    lifecycle.active?.content ??
    lifecycle.history.at(-1)?.content;
  return { label, status, name: row?.name, startDate: row?.startDate };
}

function nutritionScheduleSummary(
  plan:
    | {
        schedule: import("../../ethereal/mealplan/model").VariantSchedule;
        variants?: { id: string; label: string }[];
        options?: { id: string; label: string }[];
      }
    | undefined,
  date: string,
) {
  if (!plan) return undefined;
  const choices = plan.variants ?? plan.options ?? [];
  const optionId = scheduledOption(
    plan.schedule,
    choices.map((choice) => choice.id),
    date,
  );
  const option = choices.find((choice) => choice.id === optionId);
  if (!option) return undefined;
  const cadence =
    plan.schedule.mode === "manual"
      ? "Daily"
      : plan.schedule.mode === "weekly"
        ? "Weekly"
        : "Cycle";
  return `${cadence} · ${option.label} today`;
}

function configured(client: CoachClient) {
  if (!client.assignment) return undefined;
  return templateSetup(client.assignment.snapshot, client.assignment.variantId);
}

export function ClientPhasePlanEditor({
  client,
  phaseOptions,
}: {
  client: CoachClient;
  phaseOptions: string[];
}) {
  const { setState, toast } = useCoach();
  const choices = phaseOptions.length
    ? phaseOptions
    : [client.phase || "Foundation"];
  const [draft, setDraft] = useState<ClientPhase[]>(() =>
    structuredClone(
      client.phases ?? [
        {
          id: uid("phase"),
          name: choices.includes(client.phase) ? client.phase : choices[0],
          startDate: TODAY,
          durationWeeks: 4,
        },
      ],
    ),
  );
  const [saved, setSaved] = useState(() =>
    JSON.stringify(normalizePhases(client.phases ?? [])),
  );
  const ranges = phaseRanges(draft);
  const dirty = JSON.stringify(normalizePhases(draft)) !== saved;
  const valid = canSavePhases(draft);
  const startDateValid = isValidPhaseStartDate(draft[0]?.startDate);
  const patchPhase = (id: string, patch: Partial<ClientPhase>) =>
    setDraft((current) =>
      current.map((phase) =>
        phase.id === id ? { ...phase, ...patch } : phase,
      ),
    );
  const addPhase = () =>
    setDraft((current) => {
      const start = current.at(-1)
        ? (phaseRanges(current).at(-1)?.endDate ?? TODAY)
        : TODAY;
      return [
        ...current,
        {
          id: uid("phase"),
          name: choices[0],
          startDate: start,
          durationWeeks: 4,
        },
      ];
    });
  const removePhase = (id: string) =>
    setDraft((current) => current.filter((phase) => phase.id !== id));
  const savePlan = () => {
    if (!canSavePhases(draft)) return;
    const phases = draft.length ? normalizePhases(draft) : undefined;
    setState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id ? { ...item, phases } : item,
      ),
    }));
    setSaved(JSON.stringify(phases ?? []));
    toast(phases ? "Phase plan saved" : "Phase plan removed");
  };

  return (
    <Section
      className="cd-phase-plan-editor"
      title="Phases"
      description="Plan the client's phases back-to-back across consecutive weeks."
      actions={
        <Button primary disabled={!dirty || !valid} onClick={savePlan}>
          Save phases
        </Button>
      }
    >
      <datalist id="cd-phase-names">
        {choices.map((choice) => (
          <option key={choice} value={choice} />
        ))}
      </datalist>
      {draft.length ? (
        <div className="cd-phase-blocks">
          {draft.map((phase, index) => {
            const range = ranges[index];
            return (
              <article className="cd-phase-block" key={phase.id}>
                <div className="cd-phase-block-head">
                  <span>Phase {index + 1}</span>
                  <div>
                    <IconButton
                      label={`Remove ${phase.name}`}
                      onClick={() => removePhase(phase.id)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
                <FormGrid
                  columns={index === 0 ? 3 : 2}
                  className="cd-phase-block-fields"
                >
                  {index === 0 && (
                    <SharedDatePicker
                      label="Start date"
                      value={phase.startDate}
                      onValueChange={(startDate) =>
                        patchPhase(phase.id, { startDate })
                      }
                      error={
                        !startDateValid
                          ? "Choose a valid start date."
                          : undefined
                      }
                      size="md"
                    />
                  )}
                  <SharedInput
                    label="Phase"
                    list="cd-phase-names"
                    value={phase.name}
                    onChange={(event) =>
                      patchPhase(phase.id, { name: event.target.value })
                    }
                    size="md"
                  />
                  <div className="cd-phase-duration">
                    <SharedInput
                      label="Duration"
                      type="number"
                      min={1}
                      max={52}
                      value={phase.durationWeeks}
                      onChange={(event) =>
                        patchPhase(phase.id, {
                          durationWeeks: Number(event.target.value),
                        })
                      }
                      aria-label={`Duration for ${phase.name} in weeks`}
                      size="md"
                    />
                    <span>weeks</span>
                  </div>
                </FormGrid>
                {(!Number.isInteger(phase.durationWeeks) ||
                  phase.durationWeeks < 1 ||
                  phase.durationWeeks > 52) && (
                  <p className="cd-phase-error" role="alert">
                    Use a whole number from 1 to 52 weeks.
                  </p>
                )}
                {!phase.name.trim() && (
                  <p className="cd-phase-error" role="alert">
                    Choose a phase name.
                  </p>
                )}
                {range && (
                  <p className="cd-phase-range">
                    {range.startDate} – {range.endDate}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title="No phases planned">
          Add a phase to preview the client's timeline.
        </Empty>
      )}
      <Button onClick={addPhase}>
        <Plus size={14} /> Add phase
      </Button>
      {ranges.length > 0 && (
        <ol className="cd-phase-timeline" aria-label="Phase timeline preview">
          {ranges.map((range) => (
            <li
              className="cd-phase-timeline-segment"
              key={range.id}
              style={{ flexGrow: range.durationWeeks }}
              title={`${range.name}: ${range.startDate} – ${range.endDate}`}
            >
              <strong>{range.name}</strong>
              <span>{range.durationWeeks} weeks</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

const activityTargetDetail = (
  versions: ActivityTargetVersion[] | undefined,
  date: string,
) => {
  const list = versions ?? [];
  if (!list.length) return { text: "No targets saved", configured: false };
  const part = (metric: ActivityMetric) => {
    const version = resolveActivityTarget({
      versions: list,
      metric,
      date,
    });
    if (!version) return `No ${metric} target`;
    return version.target === null
      ? `${metric === "steps" ? "Steps" : "Cardio"} stopped`
      : formatActivityTarget(version);
  };
  return {
    text: `${part("steps")} · ${part("cardio")}`,
    configured: true,
  };
};

export function ClientPlansSummary({
  client,
  expanded = false,
  onAssign,
}: {
  client: CoachClient;
  expanded?: boolean;
  onAssign?: () => void;
}) {
  const { navigate, route, setState } = useCoach();
  const activityDate = useLocalToday();
  const [tempDialog, setTempDialog] = useState<"new" | { id: string } | null>(
    null,
  );
  const [targetDialog, setTargetDialog] = useState(false);
  const setup = configured(client);
  const plans = planData(client);
  const activity = activityTargetDetail(plans.activityTargets, activityDate);
  const views = setup?.views ?? [];
  const hasNutrition = views.some(
    (view) => view === "Nutrition" || view === "Mealplan",
  );
  const hasTraining = views.includes("Training Program");
  const nutritionContent =
    setup?.nutrition === "IIFYM"
      ? (applicablePlan(plans.nutrition.iifym, TODAY) ??
        plans.nutrition.iifym.draft ??
        plans.nutrition.iifym.active?.content)
      : (applicablePlan(plans.nutrition.mealPlan, TODAY) ??
        plans.nutrition.mealPlan.draft ??
        plans.nutrition.mealPlan.active?.content);
  const nutritionTotals = planTargets(client, TODAY);
  const nutritionDetail = [
    nutritionScheduleSummary(nutritionContent, TODAY),
    nutritionTotals
      ? `${Math.round(nutritionTotals.calories)} kcal · ${Math.round(nutritionTotals.protein)} g protein`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const trainingContent =
    applicablePlan(plans.training, TODAY) ??
    plans.training.draft ??
    plans.training.active?.content;
  const currentTrainingSessions = trainingContent
    ? resolveTrainingWeek(
        trainingContent,
        trainingWeek(trainingContent, activityDate),
      )
    : [];
  const trainingDetail = trainingContent
    ? `${currentTrainingSessions.length} ${currentTrainingSessions.length === 1 ? "session" : "sessions"} · ${trainingContent.program === "Evergreen" ? "Ongoing" : `${trainingContent.weeks} weeks`}`
    : undefined;
  const trainingRotationText = (() => {
    if (!trainingContent?.rotation) return undefined;
    if (trainingContent.rotation.mode === "weekly") {
      const days = Object.entries(trainingContent.rotation.weekdays)
        .filter(([, ids]) => ids.length)
        .map(([day]) => day.slice(0, 3));
      return days.length ? `Weekly · ${days.join(" ")}` : "Weekly";
    }
    const names = trainingContent.rotation.sessionIds
      .filter((id): id is string => id != null)
      .map(
        (id) => currentTrainingSessions.find((s) => s.id === id)?.name ?? id,
      );
    return `${names.length}-day cycle · ${names.join(", ")}`;
  })();
  const rows = [
    ...(hasNutrition && setup?.nutrition === "IIFYM"
      ? [
          {
            ...moduleSummary("Nutrition", plans.nutrition.iifym),
            detail: nutritionDetail,
          },
        ]
      : hasNutrition
        ? [
            {
              ...moduleSummary("Nutrition", plans.nutrition.mealPlan),
              detail: nutritionDetail,
            },
          ]
        : []),
    ...(hasTraining
      ? [
          {
            ...moduleSummary("Training", plans.training),
            detail: trainingDetail,
          },
        ]
      : []),
  ];
  const supplements = plans.supplements;
  const supplementCount = supplements?.items.length ?? 0;
  const goals = plans.goals.length;
  const hasGoalFields =
    configuredGoalFields(client.assignment?.snapshot).length > 0;
  if (!expanded)
    return (
      <section className="cd-plan-summary" aria-label="Plans and targets">
        <div className="cd-plan-summary-heading">
          <h3>Plans & targets</h3>
          <span>
            {rows.length
              ? `${rows.length} configured module${rows.length === 1 ? "" : "s"}`
              : "No plan configured"}
          </span>
        </div>
        {rows.map((row) => (
          <div className="cd-plan-summary-row" key={row.label}>
            <span>
              <strong>{row.label}</strong>
              {row.name && <small>{row.name}</small>}
            </span>
            <span className="cd-plan-summary-meta">
              <strong>{row.status}</strong>
              {row.startDate && <small>Starts {row.startDate}</small>}
              {row.detail && <small>{row.detail}</small>}
            </span>
          </div>
        ))}
        {setup && (
          <div className="cd-plan-summary-row">
            <span>
              <strong>Activity targets</strong>
              <small>{activity.text}</small>
            </span>
            <span className="cd-plan-summary-meta">Steps · weekly cardio</span>
          </div>
        )}
        {setup && (
          <div className="cd-plan-summary-row">
            <span>
              <strong>Supplements</strong>
              <small>
                {supplements
                  ? `${supplementCount} product${supplementCount === 1 ? "" : "s"} prescribed`
                  : "No supplement plan saved"}
              </small>
            </span>
            <span className="cd-plan-summary-meta">Catalogue plan</span>
          </div>
        )}
        {setup && hasGoalFields && (
          <div className="cd-plan-summary-row">
            <span>
              <strong>Goals</strong>
              <small>
                {goals
                  ? `${goals} saved goal${goals === 1 ? "" : "s"}`
                  : "No goals saved"}
              </small>
            </span>
            <span className="cd-plan-summary-meta">Configured fields only</span>
          </div>
        )}
        {setup?.habits && (
          <div className="cd-plan-summary-row">
            <span>
              <strong>Habits</strong>
              <small>
                {client.habits.length
                  ? `${client.habits.length} client habits`
                  : "No habits configured"}
              </small>
            </span>
            <span className="cd-plan-summary-meta">Enabled</span>
          </div>
        )}
      </section>
    );

  const nutritionSource = setup?.nutrition === "IIFYM" ? "iifym" : "mealPlan";
  const nutritionLifecycle =
    nutritionSource === "iifym"
      ? plans.nutrition.iifym
      : plans.nutrition.mealPlan;
  const nutritionStatus = lifecycleStatus(
    nutritionLifecycle as PlanLifecycle<MealPlan>,
  );
  const temporary = plans.nutrition.temporary ?? [];
  const shownTemporary = [
    ...temporary.filter(
      (t) => t.startDate <= activityDate && activityDate <= t.endDate,
    ),
    ...temporary
      .filter((t) => t.startDate > activityDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    ...temporary
      .filter((t) => t.endDate < activityDate)
      .sort((a, b) => b.endDate.localeCompare(a.endDate))
      .slice(0, 1),
  ];

  const openPlan = (plan: string) =>
    navigate({
      ...route,
      section: "clients",
      client: client.id,
      plan,
    });
  const updatePlan = (fn: (p: ClientPlans) => ClientPlans) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) =>
        c.id === client.id
          ? { ...c, plans: fn(c.plans ?? emptyClientPlans()) }
          : c,
      ),
    }));

  return (
    <Section
      className="cd-client-plans-summary"
      title="Plans & targets"
      description={
        client.assignment
          ? `Configured from ${client.assignment.snapshot.name}.`
          : "No setup assigned."
      }
    >
      {!setup ? (
        <Surface>
          <Empty
            title="Assign a setup to configure plans"
            action={
              onAssign ? (
                <Button primary onClick={onAssign}>
                  Choose a saved template
                </Button>
              ) : undefined
            }
          >
            Nutrition, training, goals and optional habits follow the assigned
            template.
          </Empty>
        </Surface>
      ) : (
        <div className="cp-grid">
          {hasNutrition && (
            <Surface className="cp-card">
              <div className="cp-card-head">
                <h3>Nutrition</h3>
                <Status
                  text={
                    nutritionStatus === "Active with draft changes"
                      ? "Active"
                      : nutritionStatus
                  }
                />
                {nutritionStatus === "Active with draft changes" && (
                  <span className="cp-chip-sub">Draft changes</span>
                )}
              </div>
              {nutritionContent?.name && (
                <p className="cp-card-name">{nutritionContent.name}</p>
              )}
              {nutritionLifecycle.active && (
                <p className="cp-sub">
                  Active since{" "}
                  {formatDate(
                    nutritionLifecycle.active.activatedAt.slice(0, 10),
                    { month: "short", day: "numeric" },
                  )}
                </p>
              )}
              <div className="cp-opts">
                {nutritionOptions(nutritionContent, nutritionSource).map(
                  (option) => (
                    <div className="cp-opt" key={option.id}>
                      <span className="cp-opt-head">
                        <b>{option.label}</b>
                        <small>{option.days}</small>
                      </span>
                      <span className="cp-opt-kcal">
                        {option.calories !== undefined
                          ? integer.format(Math.round(option.calories))
                          : "—"}
                        <small> kcal</small>
                      </span>
                      <span className="cp-sub">
                        P {Math.round(option.protein ?? 0)} · C{" "}
                        {Math.round(option.carbs ?? 0)} · F{" "}
                        {Math.round(option.fat ?? 0)}
                      </span>
                    </div>
                  ),
                )}
              </div>
              {shownTemporary.length > 0 && (
                <div className="cp-temps">
                  {shownTemporary.map((temp) => {
                    const kcal = temporaryKcal(temp);
                    return (
                      <div className="cp-temp" key={temp.id}>
                        <span>
                          <b>{temp.label}</b>
                          <small>
                            {formatDate(temp.startDate, {
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            –{" "}
                            {formatDate(temp.endDate, {
                              day: "numeric",
                              month: "short",
                            })}
                            {kcal !== undefined &&
                              ` · ${integer.format(Math.round(kcal))} kcal`}
                          </small>
                        </span>
                        <span className="cp-temp-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTempDialog({ id: temp.id })}
                          >
                            Edit
                          </Button>
                          <IconButton
                            label={`Remove ${temp.label}`}
                            size="sm"
                            onClick={() =>
                              setState((s) => ({
                                ...s,
                                clients: s.clients.map((c) =>
                                  c.id === client.id
                                    ? {
                                        ...c,
                                        plans: removeTemporaryNutrition(
                                          c.plans ?? emptyClientPlans(),
                                          temp.id,
                                        ),
                                      }
                                    : c,
                                ),
                              }))
                            }
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="cp-card-actions">
                <Button onClick={() => openPlan("nutrition")}>Edit plan</Button>
                <Button variant="ghost" onClick={() => setTempDialog("new")}>
                  Temporary plan
                </Button>
              </div>
            </Surface>
          )}

          {hasTraining && (
            <Surface className="cp-card">
              <div className="cp-card-head">
                <h3>Training</h3>
                {(() => {
                  const status = lifecycleStatus(plans.training);
                  return (
                    <>
                      <Status
                        text={
                          status === "Active with draft changes"
                            ? "Active"
                            : status
                        }
                      />
                      {status === "Active with draft changes" && (
                        <span className="cp-chip-sub">Draft changes</span>
                      )}
                    </>
                  );
                })()}
              </div>
              {trainingContent?.name && (
                <p className="cp-card-name">{trainingContent.name}</p>
              )}
              {trainingRotationText && (
                <p className="cp-sub">{trainingRotationText}</p>
              )}
              {trainingContent && trainingContent.program !== "Evergreen" && (
                <p className="cp-sub">
                  Plan week {trainingWeek(trainingContent, activityDate)}
                </p>
              )}
              <p className="cp-sub">{trainingDetail ?? "No plan saved"}</p>
              {trainingContent && (
                <SharedInput
                  label="Focus"
                  value={trainingContent.focus ?? ""}
                  placeholder="e.g. Hypertrophy · lower-body priority"
                  size="md"
                  onChange={(event) =>
                    updatePlan((current) => ({
                      ...current,
                      training: {
                        ...current.training,
                        ...(current.training.active
                          ? {
                              active: {
                                ...current.training.active,
                                content: {
                                  ...current.training.active.content,
                                  focus: event.target.value,
                                },
                              },
                            }
                          : {}),
                      },
                    }))
                  }
                />
              )}
              <div className="cp-card-actions">
                <Button onClick={() => openPlan("training")}>
                  {plans.training.active || plans.training.draft
                    ? "Edit plan"
                    : "Set up plan"}
                </Button>
              </div>
            </Surface>
          )}

          <Surface className="cp-card">
            <div className="cp-card-head">
              <h3>Activity targets</h3>
              <Status text={activity.configured ? "Active" : "Not set"} />
            </div>
            <p className="cp-sub">{activity.text}</p>
            <div className="cp-card-actions">
              <Button onClick={() => openPlan("activity-targets")}>
                {activity.configured ? "Edit targets" : "Set targets"}
              </Button>
            </div>
          </Surface>

          <Surface className="cp-card">
            <div className="cp-card-head">
              <h3>Supplements</h3>
              <Status text={supplements ? "Active" : "Not set"} />
            </div>
            <p className="cp-sub">
              {supplements
                ? `${supplementCount} product${supplementCount === 1 ? "" : "s"} prescribed`
                : "No supplement plan saved"}
            </p>
            <div className="cp-card-actions">
              <Button onClick={() => openPlan("supplements")}>
                {supplements ? "Edit plan" : "Set up plan"}
              </Button>
            </div>
          </Surface>

          <Surface className="cp-card">
            <div className="cp-card-head">
              <h3>Other targets</h3>
              <Status
                text={
                  plans.otherTargets?.length
                    ? `${plans.otherTargets.length} set`
                    : "Not set"
                }
              />
            </div>
            {(plans.otherTargets ?? []).map((target) => (
              <div className="cp-target-row" key={target.id}>
                <span>{otherTargetLabel(client, target)}</span>
                <IconButton
                  label="Remove target"
                  size="sm"
                  onClick={() =>
                    updatePlan((current) => ({
                      ...current,
                      otherTargets: (current.otherTargets ?? []).filter(
                        (t) => t.id !== target.id,
                      ),
                    }))
                  }
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
            <div className="cp-card-actions">
              <Button onClick={() => setTargetDialog(true)}>Add target</Button>
            </div>
          </Surface>

          {setup.habits && (
            <Surface className="cp-card">
              <div className="cp-card-head">
                <h3>Habits</h3>
                <Status
                  text={
                    client.habits.length
                      ? `${client.habits.length} set`
                      : "Not set"
                  }
                />
              </div>
              {client.habits.map((habit) => {
                const frequency = parseHabitFrequency(habit.frequency);
                const adherence = habitAdherence(
                  client,
                  habit.id,
                  frequency,
                  activityDate,
                );
                return (
                  <div className="cp-habit-row" key={habit.id}>
                    <b>{habit.name}</b>
                    <small>
                      {habitFrequencyLabel(frequency)}
                      {adherence.thisWeek !== undefined &&
                        ` · ${adherence.thisWeek}% this week · ${adherence.fourWeek}% 4 wk`}
                    </small>
                  </div>
                );
              })}
              <div className="cp-card-actions">
                <Button onClick={() => openPlan("habits")}>
                  {client.habits.length ? "Edit habits" : "Configure habits"}
                </Button>
              </div>
            </Surface>
          )}
        </div>
      )}
      {tempDialog && (
        <TemporaryPlanDialog
          client={client}
          existingId={tempDialog === "new" ? undefined : tempDialog.id}
          onClose={() => setTempDialog(null)}
        />
      )}
      {targetDialog && (
        <OtherTargetDialog
          client={client}
          onClose={() => setTargetDialog(false)}
        />
      )}
    </Section>
  );
}

const LEGACY_ACTIVITY_GOAL_FIELDS = new Set([
  "steps",
  "cardio-duration",
  "cardio-sessions",
]);

function configuredGoalFields(
  template?: Template,
): { field: FieldConfig; name: string; unit: string; units: string[] }[] {
  if (!template) return [];
  const setup = templateSetup(template);
  return setup.fields.flatMap((field) => {
    const parameter = ALL_PARAMETERS.find((item) => item.id === field.id);
    if (
      !parameter ||
      typeof parameter.sample !== "number" ||
      parameter.group === "Nutrition" ||
      LEGACY_ACTIVITY_GOAL_FIELDS.has(field.id)
    )
      return [];
    return [
      {
        field,
        name: parameter.name,
        unit: field.unit?.trim() ?? "",
        units: parameter.units,
      },
    ];
  });
}

export function ClientGoalsEditor({ client }: { client: CoachClient }) {
  const { setState, toast } = useCoach();
  const plans = planData(client);
  const choices = useMemo(
    () => configuredGoalFields(client.assignment?.snapshot),
    [client.assignment],
  );
  const [fieldId, setFieldId] = useState(choices[0]?.field.id ?? "");
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [date, setDate] = useState(TODAY);
  const selected = choices.find((choice) => choice.field.id === fieldId);
  const beginEdit = (goal: ClientGoal) => {
    setEditingGoal(goal.id);
    setFieldId(goal.fieldId);
    setValue(String(goal.value));
    setUnit(goal.unit);
    setDate(goal.date);
  };
  const save = () => {
    if (!selected || !Number.isFinite(Number(value)) || !date) return;
    const goal: ClientGoal = {
      id: editingGoal ?? uid("goal"),
      fieldId,
      value: Number(value),
      unit: unit.trim() || selected.unit,
      date,
    };
    setState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id
          ? {
              ...item,
              plans: {
                ...(item.plans ?? emptyClientPlans()),
                goals: editingGoal
                  ? (item.plans ?? emptyClientPlans()).goals.map((existing) =>
                      existing.id === editingGoal ? goal : existing,
                    )
                  : [...(item.plans ?? emptyClientPlans()).goals, goal],
              },
            }
          : item,
      ),
    }));
    setValue("");
    setUnit("");
    setEditingGoal(null);
    toast(editingGoal ? "Goal updated" : "Goal saved");
  };
  const remove = (id: string) =>
    setState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id
          ? {
              ...item,
              plans: {
                ...(item.plans ?? emptyClientPlans()),
                goals: (item.plans ?? emptyClientPlans()).goals.filter(
                  (goal) => goal.id !== id,
                ),
              },
            }
          : item,
      ),
    }));
  return (
    <Section
      className="cd-setup-editor"
      title="Goals"
      description="Use numeric fields included in the assigned setup. Nutrition targets stay in the nutrition plan."
    >
      {!choices.length ? (
        plans.goals.length ? (
          <p className="cd-caption">
            No new fields are eligible in this setup. Saved legacy entries are
            kept below; steps and cardio are prescribed in Activity targets.
          </p>
        ) : (
          <Empty title="No eligible fields in this setup">
            Add numeric tracking fields in the assigned template to set client
            goals.
          </Empty>
        )
      ) : (
        <div className="cd-goal-form">
          <SharedSelect
            label="Configured field"
            value={fieldId}
            options={[
              { value: "", label: "Select a field", disabled: true },
              ...choices.map((choice) => ({
                value: choice.field.id,
                label: choice.name,
              })),
            ]}
            onValueChange={(nextFieldId) => {
              setFieldId(nextFieldId);
              setUnit("");
            }}
            size="md"
          />
          <SharedInput
            label="Target"
            type="number"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            size="md"
          />
          {selected?.unit ? (
            <SharedInput
              label="Unit"
              value={selected.unit}
              readOnly
              size="md"
            />
          ) : (
            <SharedSelect
              label="Unit"
              value={unit}
              options={[
                { value: "", label: "Select a unit", disabled: true },
                ...(selected?.units ?? []).map((supportedUnit) => ({
                  value: supportedUnit,
                  label: supportedUnit,
                })),
              ]}
              onValueChange={setUnit}
              size="md"
            />
          )}
          <SharedDatePicker
            label="Target date"
            value={date}
            onValueChange={setDate}
            size="md"
          />
          <Button
            primary
            disabled={
              !selected ||
              value === "" ||
              !Number.isFinite(Number(value)) ||
              !date
            }
            onClick={save}
          >
            <Plus size={15} />
            {editingGoal ? "Save changes" : "Save goal"}
          </Button>
          {editingGoal && (
            <Button
              onClick={() => {
                setEditingGoal(null);
                setValue("");
                setUnit("");
                setDate(TODAY);
              }}
            >
              Cancel edit
            </Button>
          )}
        </div>
      )}
      {plans.goals.length > 0 && (
        <div className="cd-goal-list">
          {plans.goals.map((goal) => {
            const legacy = LEGACY_ACTIVITY_GOAL_FIELDS.has(goal.fieldId);
            return (
              <div className="cd-goal-row" key={goal.id}>
                <span>
                  <strong>
                    {ALL_PARAMETERS.find(
                      (parameter) => parameter.id === goal.fieldId,
                    )?.name ?? goal.fieldId}
                  </strong>
                  <small>{goal.date}</small>
                </span>
                <strong>
                  {goal.value} {goal.unit}
                </strong>
                <div className="cd-goal-actions">
                  {legacy ? (
                    <small className="cd-goal-legacy">
                      Legacy · set in Activity targets
                    </small>
                  ) : (
                    <>
                      <Button onClick={() => beginEdit(goal)}>Edit</Button>
                      <IconButton
                        label="Remove goal"
                        onClick={() => remove(goal.id)}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

const emptyFrequencyDraft = () => ({
  name: "",
  frequency: { kind: "daily" } as HabitFrequency,
  goal: "",
  reason: "",
});
const defaultFrequency = (kind: HabitFrequency["kind"]): HabitFrequency =>
  kind === "per-week"
    ? { kind, count: 3 }
    : kind === "every-n-days"
      ? { kind, n: 2 }
      : kind === "weekdays"
        ? { kind, days: [1, 2, 3, 4, 5] }
        : { kind };

export function ClientHabitsEditor({ client }: { client: CoachClient }) {
  const { setState, toast } = useCoach();
  const setup = configured(client);
  const enabled = setup?.habits ?? false;
  const activityDate = useLocalToday();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyFrequencyDraft);
  if (!enabled) return null;
  const persist = (
    habits: CoachClient["habits"],
    message: string,
    retiredHabits = client.retiredHabits ?? [],
  ) => {
    setState((state) => ({
      ...state,
      clients: state.clients.map((item) =>
        item.id === client.id ? { ...item, habits, retiredHabits } : item,
      ),
    }));
    toast(message);
  };
  const beginEdit = (habit: CoachClient["habits"][number]) => {
    setEditing(habit.id);
    setDraft({
      name: habit.name,
      frequency: parseHabitFrequency(habit.frequency),
      goal: habit.goal,
      reason: habit.reason,
    });
  };
  const save = () => {
    if (!draft.name.trim() || !draft.goal.trim()) return;
    const habits = editing
      ? client.habits.map((habit) =>
          habit.id === editing
            ? {
                ...habit,
                ...draft,
                name: draft.name.trim(),
                completed: habit.completed,
              }
            : habit,
        )
      : [
          ...client.habits,
          { id: uid("habit"), ...draft, name: draft.name.trim(), completed: 0 },
        ];
    persist(habits, editing ? "Habit updated" : "Habit added");
    setDraft(emptyFrequencyDraft());
    setEditing(null);
  };
  return (
    <Section
      className="cd-setup-editor"
      title="Habits"
      description="Client habit definitions and completion history remain with this profile."
    >
      <div className="cd-habit-list">
        {client.habits.map((habit) => {
          const frequency = parseHabitFrequency(habit.frequency);
          const adherence = habitAdherence(
            client,
            habit.id,
            frequency,
            activityDate,
          );
          return (
            <div className="cd-habit-row" key={habit.id}>
              <div>
                <strong>{habit.name}</strong>
                <small>
                  {habitFrequencyLabel(frequency)} · {habit.goal}
                  {habit.reason ? ` · ${habit.reason}` : ""}
                </small>
                <small>
                  {adherence.thisWeek !== undefined
                    ? `${adherence.thisWeek}% this week · ${adherence.fourWeek}% 4 wk`
                    : `${habit.completed} completions`}
                </small>
              </div>
              <div className="cd-habit-actions">
                <Button onClick={() => beginEdit(habit)}>Edit</Button>
                <IconButton
                  label={`Remove ${habit.name}`}
                  onClick={() =>
                    persist(
                      client.habits.filter((item) => item.id !== habit.id),
                      "Habit archived; completion history retained",
                      [...(client.retiredHabits ?? []), habit],
                    )
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </div>
          );
        })}
        {!client.habits.length && (
          <Empty title="No habits configured">
            Add a habit when it supports this client’s plan.
          </Empty>
        )}
      </div>
      <div className="cd-habit-form">
        <h3>{editing ? "Edit habit" : "Add habit"}</h3>
        <div className="cd-habit-form-fields cp-habit-stack">
          <SharedInput
            label="Name"
            value={draft.name}
            size="md"
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
          <div className="cp-freq">
            <span className="v8-field__label">Frequency</span>
            <SegmentedControl
              label="Frequency"
              value={draft.frequency.kind}
              onValueChange={(kind) =>
                setDraft((current) => ({
                  ...current,
                  frequency: defaultFrequency(kind as HabitFrequency["kind"]),
                }))
              }
              options={[
                { value: "daily", label: "Daily" },
                { value: "per-week", label: "Per week" },
                { value: "every-n-days", label: "Every N days" },
                { value: "weekdays", label: "Weekdays" },
              ]}
            />
            {draft.frequency.kind === "per-week" && (
              <SharedInput
                label="Times per week"
                type="number"
                min={1}
                max={7}
                size="md"
                value={draft.frequency.count}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    frequency: {
                      kind: "per-week",
                      count: Math.min(
                        7,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    },
                  }))
                }
              />
            )}
            {draft.frequency.kind === "every-n-days" && (
              <SharedInput
                label="Every N days"
                type="number"
                min={2}
                max={7}
                size="md"
                value={draft.frequency.n}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    frequency: {
                      kind: "every-n-days",
                      n: Math.min(
                        7,
                        Math.max(2, Number(event.target.value) || 2),
                      ),
                    },
                  }))
                }
              />
            )}
            {draft.frequency.kind === "weekdays" && (
              <fieldset className="cp-weekday-chips">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day, i) => {
                    const on =
                      draft.frequency.kind === "weekdays" &&
                      draft.frequency.days.includes(i + 1);
                    return (
                      <button
                        key={day}
                        type="button"
                        className="cp-weekday-chip"
                        data-on={on || undefined}
                        onClick={() =>
                          setDraft((current) => {
                            if (current.frequency.kind !== "weekdays")
                              return current;
                            const days = on
                              ? current.frequency.days.filter(
                                  (d) => d !== i + 1,
                                )
                              : [...current.frequency.days, i + 1];
                            return {
                              ...current,
                              frequency: {
                                kind: "weekdays",
                                days: days.sort(),
                              },
                            };
                          })
                        }
                      >
                        {day}
                      </button>
                    );
                  },
                )}
              </fieldset>
            )}
          </div>
          <SharedInput
            label="Goal"
            value={draft.goal}
            size="md"
            onChange={(event) =>
              setDraft((current) => ({ ...current, goal: event.target.value }))
            }
          />
          <SharedTextArea
            label="Reason (optional)"
            rows={2}
            value={draft.reason}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                reason: event.target.value,
              }))
            }
          />
        </div>
        <div className="cd-dialog-actions">
          {editing && (
            <Button
              onClick={() => {
                setEditing(null);
                setDraft(emptyFrequencyDraft());
              }}
            >
              Cancel edit
            </Button>
          )}
          <Button
            primary
            disabled={!draft.name.trim() || !draft.goal.trim()}
            onClick={save}
          >
            {editing ? "Save changes" : "Add habit"}
          </Button>
        </div>
      </div>
    </Section>
  );
}
