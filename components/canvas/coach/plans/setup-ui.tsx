"use client";

import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ALL_PARAMETERS,
  type CoachClient,
  type FieldConfig,
  type Template,
  TODAY,
  uid,
} from "../model";
import { useCoach } from "../store";
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
  const setup = configured(client);
  const plans = planData(client);
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
    <section
      className="cd-client-plans-summary"
      aria-label={`${client.name} plans`}
    >
      <header>
        <div>
          <h2>Plans & targets</h2>
          <p className="cd-plan-description">
            {client.assignment
              ? `Configured from ${client.assignment.snapshot.name}.`
              : "No setup assigned."}
          </p>
        </div>
      </header>
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
        </div>
      )}
    </section>
  );
}

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
      parameter.group === "Nutrition"
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
    <section className="cd-setup-editor">
      <header>
        <h2>Goals</h2>
        <p className="cd-setup-description">
          Use numeric fields included in the assigned setup. Nutrition targets
          stay in the nutrition plan.
        </p>
      </header>
      {!choices.length ? (
        <Empty title="No eligible fields in this setup">
          Add numeric tracking fields in the assigned template to set client
          goals.
        </Empty>
      ) : (
        <>
          <div className="cd-goal-form">
            <label className="cd-field">
              <span>Configured field</span>
              <select
                value={fieldId}
                onChange={(event) => {
                  setFieldId(event.target.value);
                  setUnit("");
                }}
              >
                <option value="" disabled>
                  Select a field
                </option>
                {choices.map((choice) => (
                  <option key={choice.field.id} value={choice.field.id}>
                    {choice.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="cd-field">
              <span>Target</span>
              <input
                type="number"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            {selected?.unit ? (
              <label className="cd-field">
                <span>Unit</span>
                <input value={selected.unit} readOnly aria-readonly="true" />
              </label>
            ) : (
              <label className="cd-field">
                <span>Unit</span>
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                >
                  <option value="" disabled>
                    Select a unit
                  </option>
                  {selected?.units.map((supportedUnit) => (
                    <option key={supportedUnit} value={supportedUnit}>
                      {supportedUnit}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="cd-field">
              <span>Target date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
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
          <div className="cd-goal-list">
            {plans.goals.map((goal) => (
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
                  <Button onClick={() => beginEdit(goal)}>Edit</Button>
                  <IconButton
                    label="Remove goal"
                    onClick={() => remove(goal.id)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
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
    <section className="cd-setup-editor">
      <header>
        <h2>Habits</h2>
        <p>
          Client habit definitions and completion history remain with this
          profile.
        </p>
      </header>
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
        <label className="cd-field">
          <span>Name</span>
          <input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <label className="cd-field">
          <span>Frequency</span>
          <input
            value={draft.frequency}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                frequency: event.target.value,
              }))
            }
            placeholder="Daily, weekdays, 3× per week"
          />
        </label>
        <label className="cd-field">
          <span>Goal</span>
          <input
            value={draft.goal}
            onChange={(event) =>
              setDraft((current) => ({ ...current, goal: event.target.value }))
            }
          />
        </label>
        <label className="cd-field">
          <span>Reason (optional)</span>
          <textarea
            rows={2}
            value={draft.reason}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                reason: event.target.value,
              }))
            }
          />
        </label>
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
    </section>
  );
}
