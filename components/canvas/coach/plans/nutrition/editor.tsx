"use client";

import { Popover } from "@base-ui/react/popover";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Copy,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import foodData from "@/lib/canvas/data/food-database.json";
import {
  addMealToVariant,
  calculateMealNutrients,
  calculatePortionNutrients,
  calculateVariantNutrients,
  cloneMeal,
  createReusableMeal,
  type Food,
  type FoodPortion,
  MAX_CYCLE_DAYS,
  type Meal,
  type MealPlan,
  type MealPlanVariant,
  type MealTargets,
  type ReusableMeal,
  type TargetValue,
  type VariantSchedule,
} from "../../../ethereal/mealplan/model";
import { macroEnergyShares } from "../../../ethereal/mealplan/overview-model";
import { ClientPlanPreview } from "../../client-plan-preview";
import type { IifymOption, IifymPlan } from "../types";
import {
  DatePicker as ReferenceDatePicker,
  TimePicker as ReferenceTimePicker,
} from "./date-time-fields";
import {
  type CoachWeeklySchedule,
  duplicateIifymOption,
  duplicateMealOption,
  removeIifymOption,
  removeMealOption,
} from "./model";
import "./editor.css";

const catalog = (foodData as { foods: Food[] }).foods;
const foodMap = new Map(catalog.map((food) => [food.id, food]));
const n = (value: number, digits = 1) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
const uid = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
const objectKeys = new WeakMap<object, string>();
const objectKey = (value: object) => {
  const existing = objectKeys.get(value);
  if (existing) return existing;
  const key = uid("row");
  objectKeys.set(value, key);
  return key;
};
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function FoodPicker({ onAdd }: { onAdd: (foods: Food[]) => void }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const results = useMemo(
    () =>
      catalog
        .filter((food) =>
          food.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 30),
    [query],
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setQuery("");
          setSelectedIds(new Set());
        }
      }}
    >
      <Popover.Trigger
        ref={setAnchor}
        className="cn-text-button cn-food-picker-trigger"
        type="button"
      >
        <Plus size={14} /> Add food
      </Popover.Trigger>
      <Popover.Portal container={anchor?.closest<HTMLElement>(".coach-root")}>
        <Popover.Positioner
          className="cn-popover-positioner"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup
            className="cn-popover cn-food-picker"
            aria-label="Add foods to meal"
            initialFocus={searchInputRef}
          >
            <div className="cn-food-picker-head">
              <div>
                <strong>Add foods</strong>
                <span>Select several foods, then add them together.</span>
              </div>
              <Popover.Close
                className="cn-remove"
                aria-label="Close food picker"
                type="button"
              >
                <X size={15} />
              </Popover.Close>
            </div>
            <label className="cn-search cn-food-picker-search">
              <Search size={15} />
              <input
                ref={searchInputRef}
                aria-label="Search food database"
                placeholder="Search foods…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <fieldset className="cn-food-picker-list" aria-label="Food results">
              {results.map((food) => (
                <label className="cn-food-picker-row" key={food.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(food.id)}
                    onChange={(event) =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(food.id);
                        else next.delete(food.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>{food.name}</strong>
                    <small>
                      {food.calories} kcal per {food.amount} {food.unit}
                    </small>
                  </span>
                </label>
              ))}
              {!results.length && (
                <p className="cn-food-picker-empty">No matching foods.</p>
              )}
            </fieldset>
            <div className="cn-food-picker-actions">
              <span className="cn-food-picker-count" aria-live="polite">
                {selectedIds.size} selected
              </span>
              <button
                className="cn-text-button"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedIds.size}
                onClick={() => {
                  onAdd(
                    Array.from(selectedIds).flatMap((id) => {
                      const food = foodMap.get(id);
                      return food ? [food] : [];
                    }),
                  );
                  setOpen(false);
                }}
              >
                Add {selectedIds.size}{" "}
                {selectedIds.size === 1 ? "food" : "foods"}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SwapPicker({
  food,
  quantity,
  onAdd,
}: {
  food: Food;
  quantity: number;
  onAdd: (swap: { foodId: string; quantity: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const results = catalog
    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 25);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger ref={setAnchor} className="cn-text-button" type="button">
        Swap
      </Popover.Trigger>
      <Popover.Portal container={anchor?.closest<HTMLElement>(".coach-root")}>
        <Popover.Positioner
          className="cn-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup className="cn-popover">
            <strong>Alternative for {food.name}</strong>
            <div className="cn-search cn-swap-search">
              <Search size={14} />
              <input
                aria-label="Search approved alternatives"
                placeholder="Search foods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="cn-results">
              {results.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    const sourceCalories = calculatePortionNutrients(
                      food,
                      quantity,
                    ).calories;
                    const equivalent =
                      sourceCalories > 0 && item.calories > 0
                        ? (sourceCalories / item.calories) * item.amount
                        : item.amount;
                    onAdd({
                      foodId: item.id,
                      quantity: Math.max(1, Math.round(equivalent)),
                    });
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.calories} kcal per {item.amount} {item.unit}
                    </small>
                  </span>
                  <Plus size={14} />
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CoachPlanDatePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="cn-date">
      <span>{label}</span>
      <ReferenceDatePicker
        value={value}
        onChange={onChange}
        ariaLabel={label}
      />
    </div>
  );
}
function TimePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <ReferenceTimePicker
      value={value}
      onChange={onChange}
      ariaLabel={label}
      className="cn-time"
    />
  );
}

function Schedule({
  schedule,
  variants,
  startDate,
  onChange,
}: {
  schedule: VariantSchedule;
  variants: MealPlanVariant[];
  startDate?: string;
  onChange: (v: VariantSchedule) => void;
}) {
  const fallback = variants[0]?.id ?? "";
  const namedTraining = variants.find((variant) =>
    /training|workout|\btd\b/i.test(variant.label),
  );
  const weekdayKey = (index: number) =>
    (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const savedWeeklyIds =
    schedule.mode === "weekly"
      ? [
          ...new Set(
            weekdays
              .map((_, index) => schedule.days[weekdayKey(index)])
              .filter((id): id is string =>
                Boolean(id && variants.some((variant) => variant.id === id)),
              ),
          ),
        ]
      : [];
  const savedRoles =
    schedule.mode === "weekly"
      ? (schedule as CoachWeeklySchedule).roles
      : undefined;
  const hasSavedRoles =
    Boolean(savedRoles) &&
    variants.some((variant) => variant.id === savedRoles?.training) &&
    variants.some((variant) => variant.id === savedRoles?.rest) &&
    savedRoles?.training !== savedRoles?.rest;
  const inferredTraining =
    (hasSavedRoles ? savedRoles?.training : undefined) ??
    (savedWeeklyIds.length === 2 && !namedTraining
      ? savedWeeklyIds[0]
      : (namedTraining?.id ?? variants[0]?.id ?? fallback));
  const inferredRest =
    (hasSavedRoles ? savedRoles?.rest : undefined) ??
    (savedWeeklyIds.length === 2 &&
    !variants.some((variant) => /rest|\bntd\b/i.test(variant.label))
      ? savedWeeklyIds[1]
      : (variants.find(
          (variant) =>
            variant.id !== inferredTraining &&
            /rest|\bntd\b/i.test(variant.label),
        )?.id ??
        variants.find((variant) => variant.id !== inferredTraining)?.id ??
        inferredTraining));
  const trainingDefault = inferredTraining;
  const restDefault = inferredRest;
  const validId = (id?: string) =>
    id && variants.some((variant) => variant.id === id) ? id : fallback;
  const label = (id?: string) =>
    variants.find((variant) => variant.id === id)?.label || "Not assigned";
  const everydayId =
    schedule.mode === "manual"
      ? validId(schedule.selectedVariantId)
      : schedule.mode === "cycle"
        ? validId(schedule.steps[0]?.variantId)
        : validId(schedule.days[1]);
  const currentDays =
    schedule.mode === "weekly"
      ? schedule.days
      : Object.fromEntries(weekdays.map((_, index) => [index + 1, everydayId]));
  const normalizedDays = Object.fromEntries(
    weekdays.map((_, index) => [
      index + 1,
      validId(currentDays[weekdayKey(index)]),
    ]),
  ) as Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>;
  const uniqueWeeklyIds = new Set(Object.values(normalizedDays));
  const roleIds = new Set([trainingDefault, restDefault]);
  const isRoleSchedule =
    schedule.mode === "weekly" &&
    uniqueWeeklyIds.size <= 2 &&
    [...uniqueWeeklyIds].every((id) => roleIds.has(id));
  const cycleDays =
    schedule.mode === "cycle"
      ? schedule.steps.reduce((total, step) => total + step.days, 0)
      : 0;

  const writeWeekly = (
    days: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>,
    roles = { training: trainingDefault, rest: restDefault },
  ) => {
    const next: CoachWeeklySchedule = {
      mode: "weekly",
      days: Object.fromEntries(
        weekdays.map((_, index) => [
          weekdayKey(index),
          validId(days[weekdayKey(index)]),
        ]),
      ) as Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>,
      roles: {
        training: validId(roles.training),
        rest: validId(roles.rest),
      },
    };
    onChange(next);
  };
  const choosePattern = (mode: "manual" | "weekly") => {
    if (mode === "manual") {
      onChange({ mode, selectedVariantId: everydayId });
      return;
    }
    if (schedule.mode === "weekly") return;
    writeWeekly(
      Object.fromEntries(
        weekdays.map((_, index) => [weekdayKey(index), everydayId]),
      ) as Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>,
    );
  };
  const setRoleVariant = (role: "training" | "rest", id: string) => {
    if (
      schedule.mode !== "weekly" ||
      !variants.some((variant) => variant.id === id)
    )
      return;
    if (id === (role === "training" ? restDefault : trainingDefault)) return;
    const previous = role === "training" ? trainingDefault : restDefault;
    const nextRoles =
      role === "training"
        ? { training: id, rest: restDefault }
        : { training: trainingDefault, rest: id };
    const nextDays = { ...normalizedDays };
    for (const day of weekdays.keys()) {
      const key = weekdayKey(day);
      if (nextDays[key] === previous) nextDays[key] = id;
    }
    writeWeekly(nextDays, nextRoles);
  };
  const toggleDayRole = (index: number) => {
    if (schedule.mode !== "weekly" || !trainingDefault || !restDefault) return;
    const key = weekdayKey(index);
    const assigned = normalizedDays[key];
    const next = assigned === trainingDefault ? restDefault : trainingDefault;
    writeWeekly({ ...normalizedDays, [key]: next });
  };
  const startCycle = () => {
    const today = new Date();
    const anchorDate =
      startDate ||
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    onChange({
      mode: "cycle",
      anchorDate,
      steps: [
        { variantId: trainingDefault, days: 1 },
        { variantId: restDefault, days: 1 },
      ],
    });
  };

  return (
    <section className="cn-schedule">
      <div className="cn-section-title">
        <h3>Variant schedule</h3>
        <label className="cn-schedule-pattern">
          <span>Pattern</span>
          <select
            aria-label="Schedule pattern"
            value={schedule.mode}
            onChange={(event) => {
              if (
                event.target.value === "manual" ||
                event.target.value === "weekly"
              ) {
                choosePattern(event.target.value);
              }
            }}
          >
            <option value="manual">Every day</option>
            <option value="weekly">Weekly</option>
            {schedule.mode === "cycle" && (
              <option value="cycle" disabled>
                Repeating cycle · Advanced
              </option>
            )}
          </select>
        </label>
      </div>
      {schedule.mode === "manual" ? (
        <label className="cn-assignment">
          <span>Plan for every day</span>
          <select
            value={everydayId}
            onChange={(event) =>
              onChange({
                mode: "manual",
                selectedVariantId: validId(event.target.value),
              })
            }
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label || "Untitled"}
              </option>
            ))}
          </select>
        </label>
      ) : schedule.mode === "weekly" ? (
        <>
          <div className="cn-schedule-roles">
            <label>
              <span>Training day</span>
              <select
                aria-label="Training day variant"
                value={trainingDefault}
                onChange={(event) =>
                  setRoleVariant("training", event.target.value)
                }
              >
                {variants.map((variant) => (
                  <option
                    key={variant.id}
                    value={variant.id}
                    disabled={
                      variant.id === restDefault &&
                      variant.id !== trainingDefault
                    }
                  >
                    {variant.label || "Untitled"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Rest day</span>
              <select
                aria-label="Rest day variant"
                value={restDefault}
                onChange={(event) => setRoleVariant("rest", event.target.value)}
              >
                {variants.map((variant) => (
                  <option
                    key={variant.id}
                    value={variant.id}
                    disabled={
                      variant.id === trainingDefault &&
                      variant.id !== restDefault
                    }
                  >
                    {variant.label || "Untitled"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset
            className={`cn-week-strip ${isRoleSchedule ? "is-role-schedule" : "is-custom-schedule"}`}
            aria-label={`Weekly assignments${isRoleSchedule ? "" : ", custom weekday assignments"}`}
          >
            <legend className="sr-only">Weekly assignments</legend>
            {weekdays.map((day, index) => {
              const assigned = normalizedDays[weekdayKey(index)];
              const isTraining = assigned === trainingDefault;
              return (
                <button
                  className={`cn-week-day ${assigned ? "is-assigned" : "is-empty"}`}
                  type="button"
                  key={weekdayKey(index)}
                  aria-pressed={isTraining}
                  disabled={
                    variants.length < 2 || trainingDefault === restDefault
                  }
                  aria-label={`${day}: ${label(assigned)}. ${isTraining ? "Training day" : "Rest or custom day"}. Tap to assign ${isTraining ? label(restDefault) : label(trainingDefault)}.`}
                  onClick={() => toggleDayRole(index)}
                >
                  <span className="cn-week-day-name">{day.slice(0, 3)}</span>
                  <span className="cn-week-day-variant" title={label(assigned)}>
                    {label(assigned)}
                  </span>
                </button>
              );
            })}
          </fieldset>
          <details className="cn-schedule-advanced">
            <summary>Advanced</summary>
            <div className="cn-schedule-advanced-content">
              <strong className="cn-schedule-custom-label">
                Custom weekdays
              </strong>
              <div className="cn-week">
                {weekdays.map((day, index) => (
                  <label key={weekdayKey(index)}>
                    <span>{day}</span>
                    <select
                      aria-label={`${day} plan`}
                      value={normalizedDays[weekdayKey(index)]}
                      onChange={(event) =>
                        writeWeekly({
                          ...normalizedDays,
                          [weekdayKey(index)]: event.target.value,
                        })
                      }
                    >
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label || "Untitled"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                className="cn-text-button"
                type="button"
                onClick={startCycle}
              >
                Repeating cycle
              </button>
            </div>
          </details>
        </>
      ) : (
        <details className="cn-schedule-advanced" open>
          <summary>Advanced · Repeating cycle</summary>
          <div className="cn-schedule-advanced-content">
            <div className="cn-cycle">
              <CoachPlanDatePicker
                label="Rhythm starts"
                value={schedule.anchorDate}
                onChange={(anchorDate) => onChange({ ...schedule, anchorDate })}
              />
              <span>Repeats every {cycleDays} days</span>
              <button
                type="button"
                disabled={
                  schedule.steps.length >= MAX_CYCLE_DAYS ||
                  cycleDays >= MAX_CYCLE_DAYS
                }
                onClick={() =>
                  onChange({
                    ...schedule,
                    steps: [
                      ...schedule.steps,
                      { variantId: fallback, days: 1 },
                    ],
                  })
                }
              >
                <Plus size={14} /> Add step
              </button>
              {schedule.steps.map((step, index) => (
                <div
                  className="cn-cycle-step"
                  // biome-ignore lint/suspicious/noArrayIndexKey: Cycle steps have positional meaning and no reorder action; keep inputs mounted while their variant changes.
                  key={index}
                >
                  <b>Step {index + 1}</b>
                  <label>
                    <span className="sr-only">Step {index + 1} variant</span>
                    <select
                      aria-label={`Step ${index + 1} variant`}
                      value={validId(step.variantId)}
                      onChange={(event) =>
                        onChange({
                          ...schedule,
                          steps: schedule.steps.map((current, stepIndex) =>
                            stepIndex === index
                              ? {
                                  ...current,
                                  variantId: validId(event.target.value),
                                }
                              : current,
                          ),
                        })
                      }
                    >
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label || "Untitled"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    aria-label={`Step ${index + 1} duration in days`}
                    type="number"
                    min="1"
                    max={Math.min(
                      28,
                      MAX_CYCLE_DAYS -
                        schedule.steps.reduce(
                          (total, current, stepIndex) =>
                            stepIndex === index ? total : total + current.days,
                          0,
                        ),
                    )}
                    value={step.days}
                    onChange={(event) =>
                      onChange({
                        ...schedule,
                        steps: schedule.steps.map((current, stepIndex) =>
                          stepIndex === index
                            ? {
                                ...current,
                                days: Math.min(
                                  28,
                                  MAX_CYCLE_DAYS -
                                    schedule.steps.reduce(
                                      (total, item, itemIndex) =>
                                        itemIndex === index
                                          ? total
                                          : total + item.days,
                                      0,
                                    ),
                                  Math.max(1, Number(event.target.value) || 1),
                                ),
                              }
                            : current,
                        ),
                      })
                    }
                  />
                  <span>days</span>
                  <button
                    type="button"
                    aria-label={`Remove step ${index + 1}`}
                    disabled={schedule.steps.length === 1}
                    onClick={() =>
                      onChange({
                        ...schedule,
                        steps: schedule.steps.filter(
                          (_, stepIndex) => stepIndex !== index,
                        ),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                className="cn-text-button"
                type="button"
                onClick={() => choosePattern("weekly")}
              >
                Use weekly schedule
              </button>
            </div>
          </div>
        </details>
      )}
      {schedule.mode === "manual" && (
        <details className="cn-schedule-advanced">
          <summary>Advanced</summary>
          <div className="cn-schedule-advanced-content">
            <button
              className="cn-text-button"
              type="button"
              onClick={startCycle}
            >
              Repeating cycle
            </button>
          </div>
        </details>
      )}
      <p className="cn-schedule-note">
        {schedule.mode === "manual"
          ? `Every day · ${label(everydayId)}`
          : schedule.mode === "weekly"
            ? isRoleSchedule
              ? "Tap a weekday to switch between its training and rest plan."
              : "Custom weekdays · assignments are preserved individually."
            : `Starts ${schedule.anchorDate} · ${schedule.steps.map((step) => `${label(validId(step.variantId))} for ${step.days} ${step.days === 1 ? "day" : "days"}`).join(" → ")}`}
      </p>
    </section>
  );
}

function Overview({ variants }: { variants: MealPlanVariant[] }) {
  return (
    <section className="cn-overview">
      <div className="cn-overview-title">
        <h3>Plan overview</h3>
        <span>
          {variants.length} {variants.length === 1 ? "option" : "options"}
        </span>
      </div>
      <div className="cn-overview-head">
        <span>Option</span>
        <span>Calories</span>
        <span>Macros</span>
        <span>Macro distribution</span>
      </div>
      {variants.map((v) => {
        const t = calculateVariantNutrients(v, foodMap);
        const s = macroEnergyShares(t);
        return (
          <div className="cn-overview-row" key={v.id}>
            <span className="cn-overview-option">
              {v.label || "Untitled"}
              <small>
                {v.meals.length} {v.meals.length === 1 ? "meal" : "meals"}
              </small>
            </span>
            <b>
              {n(t.calories, 0)} <small>kcal</small>
            </b>
            <dl className="cn-overview-macros">
              <div>
                <dt>Protein</dt>
                <dd>
                  {n(t.protein)} <span>g</span>
                </dd>
              </div>
              <div>
                <dt>Carbs</dt>
                <dd>
                  {n(t.carbs)} <span>g</span>
                </dd>
              </div>
              <div>
                <dt>Fat</dt>
                <dd>
                  {n(t.fat)} <span>g</span>
                </dd>
              </div>
            </dl>
            <div className="cn-energy">
              <svg
                viewBox="0 0 56 56"
                role="img"
                aria-label={`Macro energy: protein ${n(s.protein * 100, 0)}%, carbs ${n(s.carbs * 100, 0)}%, fat ${n(s.fat * 100, 0)}%`}
              >
                <circle className="cn-ring-track" cx="28" cy="28" r="22" />
                {(
                  [
                    ["protein", s.protein],
                    ["carbs", s.carbs],
                    ["fat", s.fat],
                  ] as const
                ).reduce<React.ReactNode[]>(
                  (nodes, [key, share], index, array) => {
                    const before = array
                      .slice(0, index)
                      .reduce((sum, item) => sum + item[1], 0);
                    if (share > 0)
                      nodes.push(
                        <circle
                          key={key}
                          className={`cn-ring-${key}`}
                          cx="28"
                          cy="28"
                          r="22"
                          pathLength="100"
                          strokeDasharray={`${Math.max(0, share * 100 - 0.8)} ${100 - Math.max(0, share * 100 - 0.8)}`}
                          strokeDashoffset={-before * 100}
                          transform="rotate(-90 28 28)"
                        />,
                      );
                    return nodes;
                  },
                  [],
                )}
              </svg>
              <div className="cn-energy-key">
                <span>P {n(s.protein * 100, 0)}%</span>
                <span>C {n(s.carbs * 100, 0)}%</span>
                <span>F {n(s.fat * 100, 0)}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function MealEditor({
  meal,
  index,
  count,
  reusable,
  onChange,
  onRemove,
  onSave,
  onDuplicate,
  onMove,
}: {
  meal: Meal;
  index: number;
  count: number;
  reusable: MealPlan["reusableMeals"];
  onChange: (m: Meal) => void;
  onRemove: () => void;
  onSave: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const total = calculateMealNutrients(meal, foodMap);
  const patchPortion = (at: number, patch: Partial<FoodPortion>) =>
    onChange({
      ...meal,
      portions: meal.portions.map((p, i) =>
        i === at ? { ...p, ...patch } : p,
      ),
    });
  return (
    <section className="cn-meal">
      <header>
        <span className="cn-meal-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <input
          aria-label="Meal name"
          value={meal.label}
          onChange={(e) => onChange({ ...meal, label: e.target.value })}
        />
        <TimePicker
          label={`Time for ${meal.label || "meal"}`}
          value={meal.time}
          onChange={(time) => onChange({ ...meal, time })}
        />
        <div className="cn-actions">
          <button
            type="button"
            title="Move meal up"
            aria-label={`Move ${meal.label} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            title="Move meal down"
            aria-label={`Move ${meal.label} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={14} />
          </button>
          <button
            title="Save meal"
            aria-label={`Save ${meal.label} to saved meals`}
            type="button"
            onClick={onSave}
          >
            <Archive size={15} />
          </button>
          <button
            title="Duplicate meal"
            aria-label={`Duplicate ${meal.label}`}
            type="button"
            onClick={onDuplicate}
          >
            <Copy size={15} />
          </button>
          <button
            title="Delete meal"
            aria-label={`Delete ${meal.label}`}
            type="button"
            onClick={onRemove}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      <div className="cn-foods">
        {meal.portions.map((portion, i) => {
          const food = foodMap.get(portion.foodId);
          if (!food) return null;
          const nutrients = calculatePortionNutrients(food, portion.quantity);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: duplicate catalog foods are valid portions and have no persistent identifier.
            <div className="cn-food" key={`${portion.foodId}-${i}`}>
              <div className="cn-food-main">
                <strong>{food.name}</strong>
              </div>
              <input
                aria-label={`${food.name} quantity`}
                type="number"
                min="0"
                step="any"
                value={portion.quantity}
                onChange={(e) =>
                  patchPortion(i, { quantity: Number(e.target.value) || 0 })
                }
              />
              <span>{food.unit}</span>
              <span className="cn-food-metrics">
                <b>{n(nutrients.calories, 0)} kcal</b>
                <span>P {n(nutrients.protein)} g</span>
                <span>C {n(nutrients.carbs)} g</span>
                <span>F {n(nutrients.fat)} g</span>
              </span>
              <SwapPicker
                food={food}
                quantity={portion.quantity}
                onAdd={(swap) =>
                  patchPortion(i, { swaps: [...(portion.swaps ?? []), swap] })
                }
              />
              <button
                className="cn-remove"
                type="button"
                aria-label={`Remove ${food.name}`}
                onClick={() =>
                  onChange({
                    ...meal,
                    portions: meal.portions.filter((_, j) => i !== j),
                  })
                }
              >
                <X size={14} />
              </button>
              {portion.swaps?.map((swap, j) => {
                const alt = foodMap.get(swap.foodId);
                if (!alt) return null;
                const st = calculatePortionNutrients(alt, swap.quantity);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: duplicate swap foods are valid and swaps have no persistent identifier.
                  <div className="cn-swap" key={`${swap.foodId}-${j}`}>
                    <span>Or&nbsp; {alt.name}</span>
                    <input
                      aria-label={`${alt.name} equivalent portion`}
                      type="number"
                      min="0"
                      step="1"
                      value={Math.round(swap.quantity)}
                      onChange={(e) =>
                        patchPortion(i, {
                          swaps: portion.swaps?.map((s, k) =>
                            k === j
                              ? {
                                  ...s,
                                  quantity: Math.max(
                                    0,
                                    Math.round(Number(e.target.value) || 0),
                                  ),
                                }
                              : s,
                          ),
                        })
                      }
                    />
                    <span>{alt.unit}</span>
                    <small className="cn-swap-metrics">
                      <b>{n(st.calories, 0)} kcal</b>
                      <span>P {n(st.protein)} g</span>
                      <span>C {n(st.carbs)} g</span>
                      <span>F {n(st.fat)} g</span>
                    </small>
                    <button
                      className="cn-remove"
                      type="button"
                      aria-label={`Remove ${alt.name} alternative`}
                      onClick={() =>
                        patchPortion(i, {
                          swaps: portion.swaps?.filter((_, k) => k !== j),
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        {!meal.portions.length && (
          <p className="cn-empty">
            No foods yet. Add an item to build this meal.
          </p>
        )}
      </div>
      <div className="cn-meal-footer">
        <div className="cn-meal-tools">
          <FoodPicker
            onAdd={(foods) =>
              onChange({
                ...meal,
                portions: [
                  ...meal.portions,
                  ...foods.map((food) => ({
                    foodId: food.id,
                    quantity: food.amount,
                  })),
                ],
              })
            }
          />
          {reusable.length > 0 && (
            <label className="cn-load">
              Use saved meal
              <select
                value=""
                onChange={(e) => {
                  const saved = reusable.find((s) => s.id === e.target.value);
                  if (saved)
                    onChange({
                      ...meal,
                      portions: saved.meal.portions.map((p) => ({
                        ...p,
                        swaps: p.swaps?.map((s) => ({ ...s })),
                      })),
                    });
                }}
              >
                <option value="" disabled>
                  Select…
                </option>
                {reusable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <footer>
          <span>Meal total</span>
          <strong>{n(total.calories, 0)} kcal</strong>
          <span>
            P {n(total.protein)} g · C {n(total.carbs)} g · F {n(total.fat)} g
          </span>
        </footer>
      </div>
    </section>
  );
}

export function NutritionEditor({
  value,
  onChange,
}: {
  value: MealPlan;
  onChange: (value: MealPlan) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [deletedSaved, setDeletedSaved] = useState<{
    meal: ReusableMeal;
    index: number;
  } | null>(null);
  const active =
    value.variants.find((v) => v.id === value.activeVariantId) ??
    value.variants[0];
  if (!active)
    return (
      <div className="cn-editor">
        <button
          type="button"
          onClick={() => {
            const v: MealPlanVariant = {
              id: uid("variant"),
              label: "Option 1",
              meals: [],
            };
            onChange({
              ...value,
              variants: [v],
              activeVariantId: v.id,
              schedule: { mode: "manual", selectedVariantId: v.id },
            });
          }}
        >
          Add first option
        </button>
      </div>
    );
  const updateVariant = (
    id: string,
    updater: (v: MealPlanVariant) => MealPlanVariant,
  ) =>
    onChange({
      ...value,
      variants: value.variants.map((v) => (v.id === id ? updater(v) : v)),
    });
  const renameOption = (id: string, label: string) =>
    onChange({
      ...value,
      variants: value.variants.map((v) => (v.id === id ? { ...v, label } : v)),
    });
  const removeOption = (id: string) => onChange(removeMealOption(value, id));
  const duplicateOption = () => {
    onChange(duplicateMealOption(value, active.id));
  };
  const addOption = () => {
    const v: MealPlanVariant = {
      id: uid("variant"),
      label: `Option ${value.variants.length + 1}`,
      meals: [],
    };
    onChange({
      ...value,
      variants: [...value.variants, v],
      activeVariantId: v.id,
    });
  };
  const saveMeal = (meal: Meal) => {
    onChange({
      ...value,
      reusableMeals: [...value.reusableMeals, createReusableMeal(meal)],
    });
    setLibraryOpen(true);
    setDeletedSaved(null);
  };
  const filteredSaved = value.reusableMeals.filter((saved) => {
    const query = libraryQuery.trim().toLowerCase();
    return (
      !query ||
      saved.name.toLowerCase().includes(query) ||
      saved.meal.portions.some((portion) => {
        const food = foodMap.get(portion.foodId);
        return (
          food?.name.toLowerCase().includes(query) ||
          portion.swaps?.some((swap) =>
            foodMap.get(swap.foodId)?.name.toLowerCase().includes(query),
          )
        );
      })
    );
  });
  const updateSaved = (
    id: string,
    update: (saved: ReusableMeal) => ReusableMeal,
  ) =>
    onChange({
      ...value,
      reusableMeals: value.reusableMeals.map((saved) =>
        saved.id === id ? update(saved) : saved,
      ),
    });
  const duplicateSaved = (saved: ReusableMeal) => {
    const base = `${saved.name} (copy)`;
    let name = base;
    let suffix = 2;
    while (value.reusableMeals.some((item) => item.name === name))
      name = `${base} ${suffix++}`;
    const duplicate = createReusableMeal(saved.meal, name);
    duplicate.meal.label = name;
    onChange({ ...value, reusableMeals: [...value.reusableMeals, duplicate] });
  };
  const deleteSaved = (saved: ReusableMeal) => {
    const index = value.reusableMeals.findIndex((item) => item.id === saved.id);
    setDeletedSaved({ meal: saved, index });
    onChange({
      ...value,
      reusableMeals: value.reusableMeals.filter((item) => item.id !== saved.id),
    });
  };
  const undoSavedDelete = () => {
    if (!deletedSaved) return;
    const reusableMeals = [...value.reusableMeals];
    reusableMeals.splice(
      Math.min(deletedSaved.index, reusableMeals.length),
      0,
      deletedSaved.meal,
    );
    onChange({ ...value, reusableMeals });
    setDeletedSaved(null);
  };
  return (
    <div className="cn-editor">
      <Overview variants={value.variants} />
      <Schedule
        schedule={value.schedule}
        variants={value.variants}
        startDate={value.startDate}
        onChange={(schedule) => onChange({ ...value, schedule })}
      />
      <div className="cn-options">
        <div
          className="cn-option-tabs"
          role="tablist"
          aria-label="Nutrition options"
        >
          {value.variants.map((v) => (
            <button
              role="tab"
              tabIndex={v.id === active.id ? 0 : -1}
              onKeyDown={(event) => {
                const delta =
                  event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowLeft"
                      ? -1
                      : 0;
                const at = value.variants.findIndex((item) => item.id === v.id);
                const target =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? value.variants.length - 1
                      : delta
                        ? (at + delta + value.variants.length) %
                          value.variants.length
                        : undefined;
                if (target === undefined) return;
                event.preventDefault();
                onChange({
                  ...value,
                  activeVariantId: value.variants[target].id,
                });
                const buttons =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    "[role=tab]",
                  );
                buttons?.[target]?.focus();
              }}
              aria-selected={v.id === active.id}
              key={v.id}
              type="button"
              onClick={() => onChange({ ...value, activeVariantId: v.id })}
            >
              {v.label || "Untitled"}
            </button>
          ))}
          <button type="button" onClick={addOption}>
            <Plus size={14} /> Add option
          </button>
        </div>
        <div className="cn-option-tools">
          <label>
            Option label
            <input
              aria-label="Option label"
              value={active.label}
              onChange={(e) => renameOption(active.id, e.target.value)}
            />
          </label>
          <button type="button" onClick={duplicateOption}>
            <Copy size={14} /> Duplicate option
          </button>
          <button
            type="button"
            disabled={value.variants.length <= 1}
            onClick={() => removeOption(active.id)}
          >
            <Trash2 size={14} /> Delete option
          </button>
        </div>
      </div>
      <section className="cn-library">
        <div className="cn-library-head">
          <button
            type="button"
            aria-expanded={libraryOpen}
            onClick={() => setLibraryOpen(!libraryOpen)}
          >
            <BookOpen size={15} /> Saved meals{" "}
            <span>{value.reusableMeals.length}</span>
          </button>
          {deletedSaved && (
            <button type="button" className="cn-undo" onClick={undoSavedDelete}>
              <Undo2 size={14} /> Undo delete
            </button>
          )}
        </div>
        {libraryOpen && (
          <div className="cn-library-body">
            <label className="cn-library-search">
              Search saved meals or foods
              <input
                aria-label="Search saved meals or foods"
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Search meals or foods…"
              />
            </label>
            {!filteredSaved.length ? (
              <p>
                {value.reusableMeals.length
                  ? "No matching saved meals."
                  : "No saved meals yet. Use Save on a meal to add it here."}
              </p>
            ) : (
              filteredSaved.map((saved) => {
                const total = calculateMealNutrients(saved.meal, foodMap);
                return (
                  <article className="cn-saved-row" key={saved.id}>
                    <div className="cn-saved-title">
                      <input
                        aria-label="Saved meal name"
                        value={saved.name}
                        onChange={(e) =>
                          updateSaved(saved.id, (current) => ({
                            ...current,
                            name: e.target.value,
                            meal: { ...current.meal, label: e.target.value },
                          }))
                        }
                      />
                      <span>
                        {saved.meal.portions.length} foods ·{" "}
                        {n(total.calories, 0)} kcal · P {n(total.protein)} g · C{" "}
                        {n(total.carbs)} g · F {n(total.fat)} g
                      </span>
                    </div>
                    <div className="cn-saved-foods">
                      {saved.meal.portions.map((portion, index) => {
                        const food = foodMap.get(portion.foodId);
                        if (!food) return null;
                        const part = calculatePortionNutrients(
                          food,
                          portion.quantity,
                        );
                        return (
                          // biome-ignore lint/suspicious/noArrayIndexKey: identical foods can be separate saved portions and have no stored IDs.
                          <span key={`${portion.foodId}-${index}`}>
                            {food.name} · {n(portion.quantity)} {food.unit} ·{" "}
                            {n(part.calories, 0)} kcal
                            {portion.swaps?.map((swap) => {
                              const alternative = foodMap.get(swap.foodId);
                              if (!alternative) return null;
                              const nutrients = calculatePortionNutrients(
                                alternative,
                                swap.quantity,
                              );
                              return (
                                <span
                                  className="cn-saved-swap"
                                  key={objectKey(swap)}
                                >
                                  Or {alternative.name} ·{" "}
                                  {n(Math.round(swap.quantity))}{" "}
                                  {alternative.unit} ·{" "}
                                  {n(nutrients.calories, 0)} kcal · P{" "}
                                  {n(nutrients.protein)} · C{" "}
                                  {n(nutrients.carbs)} · F {n(nutrients.fat)}
                                </span>
                              );
                            })}
                          </span>
                        );
                      })}
                    </div>
                    <div className="cn-saved-actions">
                      <button
                        type="button"
                        onClick={() => duplicateSaved(saved)}
                      >
                        <Copy size={13} /> Duplicate
                      </button>
                      <button type="button" onClick={() => deleteSaved(saved)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>
      <div className="cn-meal-list">
        {active.meals.map((meal, index) => (
          <MealEditor
            key={meal.id}
            meal={meal}
            index={index}
            count={active.meals.length}
            reusable={value.reusableMeals}
            onChange={(m) =>
              updateVariant(active.id, (v) => ({
                ...v,
                meals: v.meals.map((x) => (x.id === meal.id ? m : x)),
              }))
            }
            onRemove={() =>
              updateVariant(active.id, (v) => ({
                ...v,
                meals: v.meals.filter((x) => x.id !== meal.id),
              }))
            }
            onSave={() => saveMeal(meal)}
            onDuplicate={() =>
              updateVariant(active.id, (v) => ({
                ...v,
                meals: [
                  ...v.meals.slice(0, index + 1),
                  cloneMeal(meal),
                  ...v.meals.slice(index + 1),
                ],
              }))
            }
            onMove={(direction) =>
              updateVariant(active.id, (v) => {
                const meals = [...v.meals];
                const target = index + direction;
                if (target < 0 || target >= meals.length) return v;
                [meals[index], meals[target]] = [meals[target], meals[index]];
                return { ...v, meals };
              })
            }
          />
        ))}
        <button
          className="cn-add-meal"
          type="button"
          onClick={() => updateVariant(active.id, (v) => addMealToVariant(v))}
        >
          <Plus size={16} /> Add meal
        </button>
      </div>
    </div>
  );
}

function emptyTargets(style: MealTargets["style"]): MealTargets {
  return { style };
}
function TargetField({
  name,
  value,
  onChange,
}: {
  name: string;
  value?: TargetValue;
  onChange: (value: TargetValue | undefined) => void;
}) {
  const kind = value?.kind ?? "fixed";
  return (
    <div className="cn-target-field">
      <strong>{name}</strong>
      <select
        aria-label={`${name} target type`}
        value={kind}
        onChange={(e) => {
          const k = e.target.value as TargetValue["kind"];
          onChange(
            k === "range" ? { kind: k, min: 0, max: 0 } : { kind: k, value: 0 },
          );
        }}
      >
        <option value="fixed">Fixed</option>
        <option value="range">Range</option>
        <option value="minimum">Minimum</option>
      </select>
      {kind === "range" ? (
        <>
          <input
            aria-label={`${name} minimum`}
            type="number"
            min="0"
            value={value?.kind === "range" ? value.min : 0}
            onChange={(e) =>
              onChange({
                kind: "range",
                min: Number(e.target.value) || 0,
                max: value?.kind === "range" ? value.max : 0,
              })
            }
          />
          <span>to</span>
          <input
            aria-label={`${name} maximum`}
            type="number"
            min="0"
            value={value?.kind === "range" ? value.max : 0}
            onChange={(e) =>
              onChange({
                kind: "range",
                min: value?.kind === "range" ? value.min : 0,
                max: Number(e.target.value) || 0,
              })
            }
          />
        </>
      ) : (
        <input
          aria-label={`${name} ${kind} value`}
          type="number"
          min="0"
          value={value?.kind !== "range" ? (value?.value ?? 0) : 0}
          onChange={(e) =>
            onChange({ kind, value: Number(e.target.value) || 0 })
          }
        />
      )}
    </div>
  );
}
function OptionTargets({
  option,
  onChange,
  onRemove,
  onDuplicate,
}: {
  option: IifymOption;
  onChange: (v: IifymOption) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const targets = option.targets;
  const keys =
    targets.style === "calories"
      ? (["calories"] as const)
      : (["protein", "carbs", "fat"] as const);
  return (
    <section className="cn-target-option">
      <header>
        <input
          aria-label="Target option name"
          value={option.label}
          onChange={(e) => onChange({ ...option, label: e.target.value })}
        />
        <button type="button" title="Duplicate option" onClick={onDuplicate}>
          <Copy size={14} />
        </button>
        <button type="button" title="Delete option" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </header>
      <div className="cn-target-style">
        <span>Targets in</span>
        <button
          type="button"
          aria-pressed={targets.style === "calories"}
          onClick={() =>
            onChange({ ...option, targets: emptyTargets("calories") })
          }
        >
          Calories
        </button>
        <button
          type="button"
          aria-pressed={targets.style === "macros"}
          onClick={() =>
            onChange({ ...option, targets: emptyTargets("macros") })
          }
        >
          Macros
        </button>
      </div>
      {keys.map((key) => (
        <TargetField
          key={key}
          name={
            key === "calories"
              ? "Calories"
              : key[0].toUpperCase() + key.slice(1)
          }
          value={targets[key]}
          onChange={(next) =>
            onChange({ ...option, targets: { ...targets, [key]: next } })
          }
        />
      ))}
    </section>
  );
}
export function IifymEditor({
  value,
  onChange,
}: {
  value: IifymPlan;
  onChange: (value: IifymPlan) => void;
}) {
  const updateOption = (id: string, next: IifymOption) =>
    onChange({
      ...value,
      options: value.options.map((o) => (o.id === id ? next : o)),
    });
  const add = () => {
    const option: IifymOption = {
      id: uid("target"),
      label: `Option ${value.options.length + 1}`,
      targets: emptyTargets("calories"),
    };
    let schedule = value.schedule;
    if (!value.options.length && schedule.mode === "manual")
      schedule = { mode: "manual", selectedVariantId: option.id };
    onChange({ ...value, options: [...value.options, option], schedule });
  };
  const remove = (id: string) => onChange(removeIifymOption(value, id));
  return (
    <div className="cn-editor cn-iifym">
      <Schedule
        schedule={value.schedule}
        startDate={value.startDate}
        variants={value.options.map((o) => ({
          id: o.id,
          label: o.label,
          meals: [],
        }))}
        onChange={(schedule) => onChange({ ...value, schedule })}
      />
      <div className="cn-iifym-head">
        <h3>Daily target options</h3>
        <button type="button" onClick={add}>
          <Plus size={14} /> Add option
        </button>
      </div>
      <p>
        Each option gives the client a distinct nutrition target for the
        assigned day.
      </p>
      <div className="cn-target-options">
        {value.options.map((option) => (
          <OptionTargets
            key={option.id}
            option={option}
            onChange={(next) => updateOption(option.id, next)}
            onDuplicate={() => onChange(duplicateIifymOption(value, option.id))}
            onRemove={() => remove(option.id)}
          />
        ))}
      </div>
    </div>
  );
}

function scheduleInstruction(
  schedule: VariantSchedule,
  options: Array<{ id: string; label: string }>,
) {
  const label = (id?: string) =>
    options.find((option) => option.id === id)?.label || "Not assigned";
  if (schedule.mode === "manual")
    return `Every day: ${label(schedule.selectedVariantId)}`;
  if (schedule.mode === "weekly")
    return weekdays
      .map(
        (day, index) =>
          `${day}: ${label(schedule.days[(index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7])}`,
      )
      .join(" · ");
  return `Starting ${schedule.anchorDate}, repeat ${schedule.steps.map((step) => `${label(step.variantId)} for ${step.days} ${step.days === 1 ? "day" : "days"}`).join(" then ")}.`;
}

export function NutritionPlanPreview({
  value,
  variantId,
  clientName,
}: {
  value: MealPlan;
  variantId?: string;
  clientName?: string;
}) {
  const variant =
    value.variants.find(
      (item) => item.id === (variantId ?? value.activeVariantId),
    ) ?? value.variants[0];
  if (!variant) return null;
  return (
    <div className="cn-preview">
      <p className="cn-preview-schedule">
        {scheduleInstruction(value.schedule, value.variants)}
      </p>
      <ClientPlanPreview
        variant={variant}
        foodMap={foodMap}
        clientName={clientName}
      />
    </div>
  );
}

function targetText(target?: TargetValue, unit = "g") {
  if (!target) return "Not set";
  if (target.kind === "range")
    return `${n(target.min, 0)}–${n(target.max, 0)} ${unit}`;
  return `${target.kind === "minimum" ? "At least " : ""}${n(target.value, 0)} ${unit}`;
}

function targetAmount(target?: TargetValue) {
  if (!target) return 0;
  return target.kind === "range" ? (target.min + target.max) / 2 : target.value;
}

export function IifymPlanPreview({
  value,
  optionId,
}: {
  value: IifymPlan;
  optionId?: string;
}) {
  const id =
    optionId ??
    (value.schedule.mode === "manual"
      ? value.schedule.selectedVariantId
      : value.options[0]?.id);
  const option =
    value.options.find((item) => item.id === id) ?? value.options[0];
  if (!option) return null;
  const targets = option.targets;
  const protein = targetAmount(targets.protein);
  const carbs = targetAmount(targets.carbs);
  const fat = targetAmount(targets.fat);
  const macroCalories = protein * 4 + carbs * 4 + fat * 9;
  const macroShares = macroEnergyShares({
    calories: macroCalories,
    protein,
    carbs,
    fat,
  });
  return (
    <div className="cn-preview cn-iifym-preview">
      <p className="cn-preview-schedule">
        {scheduleInstruction(value.schedule, value.options)}
      </p>
      <section>
        <h3>{option.label}</h3>
        {targets.style === "calories" ? (
          <p>
            <strong>{targetText(targets.calories, "kcal")}</strong>
          </p>
        ) : (
          <>
            <div className="cn-iifym-derived">
              <strong>~{n(macroCalories, 0)} kcal</strong>
              <span>derived from macro targets at 4/4/9 kcal per gram</span>
              <div className="cn-energy">
                <svg
                  viewBox="0 0 56 56"
                  role="img"
                  aria-label={`Macro energy distribution: protein ${n(macroShares.protein * 100, 0)}%, carbs ${n(macroShares.carbs * 100, 0)}%, fat ${n(macroShares.fat * 100, 0)}%`}
                >
                  <circle className="cn-ring-track" cx="28" cy="28" r="22" />
                  {(
                    [
                      ["protein", macroShares.protein],
                      ["carbs", macroShares.carbs],
                      ["fat", macroShares.fat],
                    ] as const
                  ).reduce<React.ReactNode[]>(
                    (nodes, [key, share], index, all) => {
                      const before = all
                        .slice(0, index)
                        .reduce((total, item) => total + item[1], 0);
                      if (share > 0)
                        nodes.push(
                          <circle
                            key={key}
                            className={`cn-ring-${key}`}
                            cx="28"
                            cy="28"
                            r="22"
                            pathLength="100"
                            strokeDasharray={`${Math.max(0, share * 100 - 0.8)} ${100 - Math.max(0, share * 100 - 0.8)}`}
                            strokeDashoffset={-before * 100}
                            transform="rotate(-90 28 28)"
                          />,
                        );
                      return nodes;
                    },
                    [],
                  )}
                </svg>
                <div className="cn-energy-key">
                  <span>P {n(macroShares.protein * 100, 0)}%</span>
                  <span>C {n(macroShares.carbs * 100, 0)}%</span>
                  <span>F {n(macroShares.fat * 100, 0)}%</span>
                </div>
              </div>
            </div>
            <dl>
              <div>
                <dt>Protein</dt>
                <dd>{targetText(targets.protein)}</dd>
              </div>
              <div>
                <dt>Carbs</dt>
                <dd>{targetText(targets.carbs)}</dd>
              </div>
              <div>
                <dt>Fat</dt>
                <dd>{targetText(targets.fat)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </div>
  );
}
