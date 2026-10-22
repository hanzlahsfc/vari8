"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Input as SharedInput,
  Select as SharedSelect,
} from "@/components/vari8/components";
import {
  DatePicker as SharedDatePicker,
  TextArea as SharedTextArea,
} from "@/components/vari8/inputs";
import { FormGrid, Section } from "@/components/vari8/layouts";
import {
  ALL_PARAMETERS,
  type CoachClient,
  type FieldConfig,
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
import { Button, Empty, IconButton, Surface } from "../ui";
import {
  applicablePlan,
  lifecycleStatus,
  planTargets,
  scheduledOption,
  trainingWeek,
} from "./domain";
import {
  type ClientPhasePlan,
  canSaveClientPhasePlan,
  isValidPhaseStartDate,
  phasePlanRanges,
} from "./phase-planning";
import {
  type ClientGoal,
  type ClientPlans,
  emptyClientPlans,
  type PlanLifecycle,
  resolveTrainingWeek,
} from "./types";
import "./setup-ui.css";

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
  const [draft, setDraft] = useState<ClientPhasePlan>(() =>
    structuredClone(
      client.phasePlan ?? {
        startDate: TODAY,
        phases: [
          {
            id: uid("phase"),
            name: choices.includes(client.phase) ? client.phase : choices[0],
            durationWeeks: 4,
          },
        ],
      },
    ),
  );
  const [saved, setSaved] = useState(() => JSON.stringify(client.phasePlan));
  const ranges = phasePlanRanges(draft);
  const dirty = JSON.stringify(draft) !== saved;
  const valid = canSaveClientPhasePlan(draft);
  const startDateValid = isValidPhaseStartDate(draft.startDate);
  const patchPhase = (
    id: string,
    patch: Partial<ClientPhasePlan["phases"][number]>,
  ) =>
    setDraft((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id === id ? { ...phase, ...patch } : phase,
      ),
    }));
  const addPhase = () =>
    setDraft((current) => ({
      ...current,
      phases: [
        ...current.phases,
        {
          id: uid("phase"),
          name: choices[0],
          durationWeeks: 4,
        },
      ],
    }));
  const duplicatePhase = (id: string) =>
    setDraft((current) => {
      const index = current.phases.findIndex((phase) => phase.id === id);
      if (index < 0) return current;
      const source = current.phases[index];
      const phases = [...current.phases];
      phases.splice(index + 1, 0, { ...source, id: uid("phase") });
      return { ...current, phases };
    });
  const movePhase = (id: string, offset: -1 | 1) =>
    setDraft((current) => {
      const index = current.phases.findIndex((phase) => phase.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.phases.length)
        return current;
      const phases = [...current.phases];
      [phases[index], phases[target]] = [phases[target], phases[index]];
      return { ...current, phases };
    });
  const removePhase = (id: string) =>
    setDraft((current) => ({
      ...current,
      phases: current.phases.filter((phase) => phase.id !== id),
    }));
  const savePlan = () => {
    if (!canSaveClientPhasePlan(draft)) return;
    const phasePlan = draft.phases.length ? structuredClone(draft) : undefined;
    setState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id ? { ...item, phasePlan } : item,
      ),
    }));
    setSaved(JSON.stringify(phasePlan));
    toast(phasePlan ? "Phase plan saved" : "Phase plan removed");
  };

  return (
    <Section
      className="cd-phase-plan-editor"
      title="Phase plan"
      description="Map the client’s phases across consecutive weeks."
      actions={
        <Button primary disabled={!dirty || !valid} onClick={savePlan}>
          Save phase plan
        </Button>
      }
    >
      <div className="cd-phase-start">
        <SharedDatePicker
          label="Plan starts"
          value={draft.startDate}
          onValueChange={(startDate) =>
            setDraft((current) => ({
              ...current,
              startDate,
            }))
          }
          error={
            !startDateValid ? "Choose a valid plan start date." : undefined
          }
          size="md"
        />
      </div>
      {draft.phases.length ? (
        <div className="cd-phase-blocks">
          {draft.phases.map((phase, index) => {
            const range = ranges[index];
            return (
              <article className="cd-phase-block" key={phase.id}>
                <div className="cd-phase-block-head">
                  <span>Phase {index + 1}</span>
                  <div>
                    <IconButton
                      label={`Move ${phase.name} up`}
                      disabled={index === 0}
                      onClick={() => movePhase(phase.id, -1)}
                    >
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton
                      label={`Move ${phase.name} down`}
                      disabled={index === draft.phases.length - 1}
                      onClick={() => movePhase(phase.id, 1)}
                    >
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton
                      label={`Duplicate ${phase.name}`}
                      onClick={() => duplicatePhase(phase.id)}
                    >
                      <Copy size={14} />
                    </IconButton>
                    <IconButton
                      label={`Remove ${phase.name}`}
                      onClick={() => removePhase(phase.id)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
                <FormGrid columns={2} className="cd-phase-block-fields">
                  <SharedSelect
                    label="Phase"
                    value={phase.name}
                    options={choices.map((choice) => ({
                      value: choice,
                      label: choice,
                    }))}
                    onValueChange={(name) => patchPhase(phase.id, { name })}
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
        <Empty title="No phases in this plan">
          Add a phase to preview the client’s timeline.
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
  const { navigate, route } = useCoach();
  const activityDate = useLocalToday();
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
    ? resolveTrainingWeek(trainingContent, trainingWeek(trainingContent, TODAY))
    : [];
  const trainingDetail = trainingContent
    ? `${currentTrainingSessions.length} ${currentTrainingSessions.length === 1 ? "session" : "sessions"} · ${trainingContent.program === "Evergreen" ? "Ongoing" : `${trainingContent.weeks} weeks`}`
    : undefined;
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
  const goals = plans.goals.length;
  const supplements = plans.supplements;
  const supplementCount = supplements?.items.length ?? 0;
  const hasGoalFields =
    plans.goals.length > 0 ||
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
        <div className="cd-plan-module-list">
          {rows.map((row) => (
            <Surface className="cd-plan-module" key={row.label}>
              <div>
                <h3>{row.label}</h3>
                {row.name && <p className="cd-plan-description">{row.name}</p>}
                {row.detail && <small>{row.detail}</small>}
              </div>
              <div className="cd-plan-module-detail">
                <span>{row.status}</span>
                {row.startDate && <small>Starts {row.startDate}</small>}
              </div>
              <div className="cd-plan-module-action">
                <Button
                  onClick={() =>
                    navigate({
                      ...route,
                      section: "clients",
                      client: client.id,
                      plan:
                        row.label === "Nutrition" ? "nutrition" : "training",
                    })
                  }
                >
                  {row.status.startsWith("Active")
                    ? "Edit"
                    : row.status === "Draft"
                      ? "Continue"
                      : "Create"}
                  <ArrowUpRight size={14} />
                </Button>
              </div>
            </Surface>
          ))}
          <Surface className="cd-plan-module">
            <div>
              <h3>Activity targets</h3>
              <p>{activity.text}</p>
            </div>
            <div className="cd-plan-module-detail">
              <span>Steps and weekly cardio prescriptions</span>
            </div>
            <div className="cd-plan-module-action">
              <Button
                onClick={() =>
                  navigate({
                    ...route,
                    section: "clients",
                    client: client.id,
                    plan: "activity-targets",
                  })
                }
              >
                {activity.configured ? "Edit targets" : "Set targets"}
                <ArrowUpRight size={14} />
              </Button>
            </div>
          </Surface>
          <Surface className="cd-plan-module">
            <div>
              <h3>Supplements</h3>
              <p>
                {supplements
                  ? `${supplementCount} product${supplementCount === 1 ? "" : "s"} prescribed`
                  : "No supplement plan saved"}
              </p>
            </div>
            <div className="cd-plan-module-detail">
              <span>Catalogue products, quantity, timing and status</span>
            </div>
            <div className="cd-plan-module-action">
              <Button
                onClick={() =>
                  navigate({
                    ...route,
                    section: "clients",
                    client: client.id,
                    plan: "supplements",
                  })
                }
              >
                {supplements ? "Edit plan" : "Set up plan"}
                <ArrowUpRight size={14} />
              </Button>
            </div>
          </Surface>
          {hasGoalFields && (
            <Surface className="cd-plan-module">
              <div>
                <h3>Goals</h3>
                <p>{goals ? `${goals} saved` : "No goals saved"}</p>
              </div>
              <div className="cd-plan-module-detail">
                <span>Numeric fields enabled by setup</span>
              </div>
              <div className="cd-plan-module-action">
                <Button
                  onClick={() =>
                    navigate({
                      ...route,
                      section: "clients",
                      client: client.id,
                      plan: "goals",
                    })
                  }
                >
                  {goals ? "Edit goals" : "Set goals"}
                  <ArrowUpRight size={14} />
                </Button>
              </div>
            </Surface>
          )}
          {setup.habits && (
            <Surface className="cd-plan-module">
              <div>
                <h3>Habits</h3>
                <p>
                  {client.habits.length
                    ? `${client.habits.length} configured`
                    : "No habits saved"}
                </p>
              </div>
              <div className="cd-plan-module-detail">
                <span>Optional client habits</span>
              </div>
              <div className="cd-plan-module-action">
                <Button
                  onClick={() =>
                    navigate({
                      ...route,
                      section: "clients",
                      client: client.id,
                      plan: "habits",
                    })
                  }
                >
                  {client.habits.length ? "Edit habits" : "Configure habits"}
                  <ArrowUpRight size={14} />
                </Button>
              </div>
            </Surface>
          )}
          {setup.roadmapPhases !== false && (
            <ClientPhasePlanEditor
              key={client.id}
              client={client}
              phaseOptions={setup.phaseOptions ?? []}
            />
          )}
        </div>
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

export function ClientHabitsEditor({ client }: { client: CoachClient }) {
  const { setState, toast } = useCoach();
  const setup = configured(client);
  const enabled = setup?.habits ?? false;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    frequency: "Daily",
    goal: "",
    reason: "",
  });
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
      frequency: habit.frequency,
      goal: habit.goal,
      reason: habit.reason,
    });
  };
  const save = () => {
    if (!draft.name.trim() || !draft.frequency.trim() || !draft.goal.trim())
      return;
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
    setDraft({ name: "", frequency: "Daily", goal: "", reason: "" });
    setEditing(null);
  };
  return (
    <Section
      className="cd-setup-editor"
      title="Habits"
      description="Client habit definitions and completion history remain with this profile."
    >
      <div className="cd-habit-list">
        {client.habits.map((habit) => (
          <div className="cd-habit-row" key={habit.id}>
            <div>
              <strong>{habit.name}</strong>
              <small>
                {habit.frequency} · {habit.goal}
                {habit.reason ? ` · ${habit.reason}` : ""}
              </small>
              <small>{habit.completed} completions</small>
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
        ))}
        {!client.habits.length && (
          <Empty title="No habits configured">
            Add a habit when it supports this client’s plan.
          </Empty>
        )}
      </div>
      <div className="cd-habit-form">
        <h3>{editing ? "Edit habit" : "Add habit"}</h3>
        <FormGrid columns={2} className="cd-habit-form-fields">
          <SharedInput
            label="Name"
            value={draft.name}
            size="md"
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
          <SharedInput
            label="Frequency"
            value={draft.frequency}
            size="md"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                frequency: event.target.value,
              }))
            }
            placeholder="Daily, weekdays, 3× per week"
          />
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
        </FormGrid>
        <div className="cd-dialog-actions">
          {editing && (
            <Button
              onClick={() => {
                setEditing(null);
                setDraft({
                  name: "",
                  frequency: "Daily",
                  goal: "",
                  reason: "",
                });
              }}
            >
              Cancel edit
            </Button>
          )}
          <Button
            primary
            disabled={
              !draft.name.trim() ||
              !draft.frequency.trim() ||
              !draft.goal.trim()
            }
            onClick={save}
          >
            {editing ? "Save changes" : "Add habit"}
          </Button>
        </div>
      </div>
    </Section>
  );
}
