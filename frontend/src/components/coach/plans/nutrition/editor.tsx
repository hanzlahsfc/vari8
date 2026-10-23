"use client";

import { Popover } from "@base-ui/react/popover";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  GripVertical,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  Input as SharedInput,
  Select as ThemedSelect,
} from "@/components/vari8/components";
import {
  DatePicker as SharedDatePicker,
  TimePicker as SharedTimePicker,
} from "@/components/vari8/inputs";
import foodData from "@/data/food-database.json";
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
  addFoodAlternative,
  alternativeQuantity,
  duplicateIifymOption,
  duplicateMealOption,
  mealDropTargetIndex,
  moveMeal,
  removeIifymOption,
  removeMealOption,
  replacementQuantity,
  replacePortionFood,
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
        aria-label="Add food"
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
            <div className="cn-search cn-food-picker-search">
              <Search size={15} />
              <SharedInput
                ref={searchInputRef}
                label="Search food database"
                placeholder="Search foods…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                size="sm"
              />
            </div>
            <fieldset className="cn-food-picker-list" aria-label="Food results">
              {results.map((food) => {
                const selected = selectedIds.has(food.id);
                return (
                  <button
                    className="cn-food-picker-row"
                    key={food.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${selected ? "Remove" : "Select"} ${food.name}`}
                    onClick={() => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (selected) next.delete(food.id);
                        else next.add(food.id);
                        return next;
                      });
                      requestAnimationFrame(() => {
                        searchInputRef.current?.focus();
                        searchInputRef.current?.select();
                      });
                    }}
                  >
                    <span>
                      <strong>{food.name}</strong>
                      <small>
                        {food.calories} kcal per {food.amount} {food.unit}
                      </small>
                    </span>
                    {selected ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                );
              })}
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

function FoodChoicePicker({
  food,
  quantity,
  triggerLabel,
  excludedIds,
  replaceFood,
  onSelect,
}: {
  food: Food;
  quantity: number;
  triggerLabel: "Add alternative" | "Swap food";
  excludedIds: string[];
  replaceFood: boolean;
  onSelect: (choice: Food, quantity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const results = catalog
    .filter(
      (item) =>
        (!excludedIds.includes(item.id) || selectedIds.has(item.id)) &&
        item.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .slice(0, 25);
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
        className="cn-text-button"
        aria-label={triggerLabel}
        type="button"
      >
        <span className="cn-food-choice-label" aria-hidden="true">
          {triggerLabel}
        </span>
      </Popover.Trigger>
      <Popover.Portal container={anchor?.closest<HTMLElement>(".coach-root")}>
        <Popover.Positioner
          className="cn-popover-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup
            className="cn-popover cn-swap-popover"
            aria-label={`${triggerLabel} for ${food.name}`}
            initialFocus={searchInputRef}
          >
            <div className="cn-food-picker-head">
              <div>
                <strong>{triggerLabel}</strong>
                <span>
                  {replaceFood
                    ? `Replace ${food.name}`
                    : `Alternative to ${food.name}`}
                </span>
              </div>
              <Popover.Close
                className="cn-remove"
                aria-label="Close food picker"
                type="button"
              >
                <X size={15} />
              </Popover.Close>
            </div>
            <div className="cn-search cn-swap-search">
              <Search size={14} />
              <SharedInput
                ref={searchInputRef}
                label="Search approved alternatives"
                placeholder="Search foods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                size="sm"
              />
            </div>
            <ul className="cn-results" aria-label="Food alternatives">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={`${selectedIds.has(item.id) ? "Selected" : triggerLabel}: ${item.name}`}
                    aria-pressed={selectedIds.has(item.id)}
                    onClick={() => {
                      if (selectedIds.has(item.id)) return;
                      setSelectedIds(
                        replaceFood
                          ? new Set([item.id])
                          : new Set([...selectedIds, item.id]),
                      );
                      const equivalent = replaceFood
                        ? replacementQuantity(food, quantity, item)
                        : alternativeQuantity(food, quantity, item);
                      onSelect(item, equivalent);
                      if (replaceFood) {
                        setOpen(false);
                        return;
                      }
                      requestAnimationFrame(() => {
                        searchInputRef.current?.focus();
                        searchInputRef.current?.select();
                      });
                    }}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.calories} kcal per {item.amount} {item.unit}
                      </small>
                    </span>
                    {selectedIds.has(item.id) ? (
                      <Check size={14} />
                    ) : (
                      <Plus size={14} />
                    )}
                  </button>
                </li>
              ))}
              {!results.length && (
                <li className="cn-swap-empty">No matching foods.</li>
              )}
            </ul>
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
    <SharedDatePicker
      label={label}
      value={value}
      onValueChange={onChange}
      size="md"
    />
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
    <div className="cn-time">
      <SharedTimePicker
        label={label}
        value={value}
        onValueChange={onChange}
        size="md"
      />
    </div>
  );
}

function Schedule({
  schedule,
  variants,
  startDate,
  activeVariantId,
  onChange,
}: {
  schedule: VariantSchedule;
  variants: MealPlanVariant[];
  startDate?: string;
  activeVariantId: string;
  onChange: (v: VariantSchedule) => void;
}) {
  const [enabled, setEnabled] = useState(() => schedule.mode !== "manual");
  const fallback = variants[0]?.id ?? "";
  const manualSelection = useRef(
    schedule.mode === "manual" ? schedule.selectedVariantId : activeVariantId,
  );
  const weekdayKey = (index: number) =>
    (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
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
  const weeklyDays =
    schedule.mode === "weekly"
      ? schedule.days
      : Object.fromEntries(
          weekdays.map((_, index) => [weekdayKey(index), everydayId]),
        );
  const changePattern = (mode: "weekly" | "cycle") => {
    if (schedule.mode === mode) return;
    if (mode === "weekly") {
      const days =
        schedule.mode === "weekly"
          ? schedule.days
          : Object.fromEntries(
              weekdays.map((_, index) => [weekdayKey(index), everydayId]),
            );
      onChange({ mode: "weekly", days });
      return;
    }
    const today = new Date();
    const anchorDate =
      startDate ||
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const second =
      variants.find((variant) => variant.id !== everydayId)?.id ?? everydayId;
    onChange({
      mode: "cycle",
      anchorDate,
      steps: [
        { variantId: everydayId, days: 1 },
        { variantId: second, days: 1 },
      ],
    });
  };
  const enableSchedule = () => {
    const selected =
      schedule.mode === "manual"
        ? validId(schedule.selectedVariantId)
        : validId(activeVariantId);
    manualSelection.current = selected;
    onChange({
      mode: "weekly",
      days: Object.fromEntries(
        weekdays.map((_, index) => [weekdayKey(index), selected]),
      ),
    });
    setEnabled(true);
  };

  if (!enabled) {
    return (
      <section className="cn-schedule cn-schedule-off">
        <div className="cn-section-title">
          <div>
            <h3>Variant schedule</h3>
            <p>Use one option every day.</p>
          </div>
          <button type="button" aria-pressed="false" onClick={enableSchedule}>
            Set a schedule
          </button>
        </div>
      </section>
    );
  }

  const cycleDays =
    schedule.mode === "cycle"
      ? schedule.steps.reduce((total, step) => total + step.days, 0)
      : 0;
  return (
    <section className="cn-schedule">
      <div className="cn-section-title">
        <div>
          <h3>Variant schedule</h3>
          <p>Choose how options change over time.</p>
        </div>
        <button
          className="cn-schedule-toggle"
          type="button"
          aria-pressed="true"
          onClick={() => {
            onChange({
              mode: "manual",
              selectedVariantId: validId(manualSelection.current),
            });
            setEnabled(false);
          }}
        >
          Turn off
        </button>
      </div>
      <div
        className="cn-option-tabs cn-schedule-modes"
        role="tablist"
        aria-label="Meal plan schedule type"
      >
        {(
          [
            ["weekly", "Custom weekdays"],
            ["cycle", "Repeating cycle"],
          ] as const
        ).map(([mode, modeLabel]) => (
          <button
            key={mode}
            id={`nutrition-schedule-${mode}`}
            type="button"
            role="tab"
            aria-selected={schedule.mode === mode}
            aria-controls="nutrition-schedule-configuration"
            tabIndex={schedule.mode === mode ? 0 : -1}
            onClick={() => changePattern(mode)}
            onKeyDown={(event) => {
              const target =
                event.key === "ArrowRight" || event.key === "ArrowLeft"
                  ? schedule.mode === "weekly"
                    ? "cycle"
                    : "weekly"
                  : event.key === "Home"
                    ? "weekly"
                    : event.key === "End"
                      ? "cycle"
                      : undefined;
              if (!target) return;
              event.preventDefault();
              changePattern(target);
              event.currentTarget.parentElement
                ?.querySelector<HTMLButtonElement>(
                  `#nutrition-schedule-${target}`,
                )
                ?.focus();
            }}
          >
            {modeLabel}
          </button>
        ))}
      </div>
      {schedule.mode === "weekly" ? (
        <div
          id="nutrition-schedule-configuration"
          className="cn-week cn-week-custom"
          role="tabpanel"
          aria-labelledby="nutrition-schedule-weekly"
        >
          {weekdays.map((day, index) => (
            <div key={weekdayKey(index)} className="cn-weekday-select">
              <ThemedSelect
                label={day}
                value={validId(weeklyDays[weekdayKey(index)])}
                options={variants.map((variant) => ({
                  value: variant.id,
                  label: variant.label || "Untitled",
                }))}
                onValueChange={(value) =>
                  onChange({
                    mode: "weekly",
                    days: {
                      ...weeklyDays,
                      [weekdayKey(index)]: validId(value),
                    },
                  })
                }
                className="cn-weekday-select-trigger"
              />
            </div>
          ))}
        </div>
      ) : schedule.mode === "cycle" ? (
        <div
          id="nutrition-schedule-configuration"
          className="cn-cycle"
          role="tabpanel"
          aria-labelledby="nutrition-schedule-cycle"
        >
          <div className="cn-cycle-header">
            <CoachPlanDatePicker
              label="Cycle starts"
              value={schedule.anchorDate}
              onChange={(anchorDate) => onChange({ ...schedule, anchorDate })}
            />
            <button
              type="button"
              disabled={
                schedule.steps.length >= MAX_CYCLE_DAYS ||
                cycleDays >= MAX_CYCLE_DAYS
              }
              onClick={() =>
                onChange({
                  ...schedule,
                  steps: [...schedule.steps, { variantId: fallback, days: 1 }],
                })
              }
            >
              <Plus size={14} /> Add step
            </button>
          </div>
          <div className="cn-cycle-steps">
            {schedule.steps.map((step, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Cycle steps are positional and keep their inputs mounted when a variant changes.
              <div className="cn-cycle-step" key={index}>
                <b>Step {index + 1}</b>
                <ThemedSelect
                  label={`Step ${index + 1} plan option`}
                  value={validId(step.variantId)}
                  options={variants.map((variant) => ({
                    value: variant.id,
                    label: variant.label || "Untitled",
                  }))}
                  onValueChange={(value) =>
                    onChange({
                      ...schedule,
                      steps: schedule.steps.map((current, at) =>
                        at === index
                          ? {
                              ...current,
                              variantId: validId(value),
                            }
                          : current,
                      ),
                    })
                  }
                  className="cn-cycle-option-select"
                />
                <SharedInput
                  label={`Step ${index + 1} duration in days`}
                  type="number"
                  min="1"
                  max={Math.min(
                    28,
                    MAX_CYCLE_DAYS -
                      schedule.steps.reduce(
                        (sum, current, at) =>
                          at === index ? sum : sum + current.days,
                        0,
                      ),
                  )}
                  value={step.days}
                  size="sm"
                  onChange={(event) =>
                    onChange({
                      ...schedule,
                      steps: schedule.steps.map((current, at) =>
                        at === index
                          ? {
                              ...current,
                              days: Math.max(
                                1,
                                Number(event.target.value) || 1,
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
                      steps: schedule.steps.filter((_, at) => at !== index),
                    })
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="cn-schedule-enable-choice">
          <p>Choose a schedule type above to assign options.</p>
        </div>
      )}
      <p className="cn-schedule-note">
        {schedule.mode === "weekly"
          ? "Each weekday has its own plan assignment."
          : schedule.mode === "cycle"
            ? `Repeats every ${cycleDays} ${cycleDays === 1 ? "day" : "days"} · ${schedule.steps.map((step) => `${label(validId(step.variantId))} for ${step.days} ${step.days === 1 ? "day" : "days"}`).join(" → ")}`
            : "Every day · one plan option"}
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
  onMoveTo,
  onDragTarget,
  dropTarget,
  dropEdge,
  mealIds,
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
  onMoveTo: (mealId: string, targetIndex: number) => void;
  onDragTarget: (sourceMealId: string, targetMealId: string | null) => void;
  dropTarget: boolean;
  dropEdge?: "before" | "after";
  mealIds: string[];
}) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const total = calculateMealNutrients(meal, foodMap);
  const clearDrag = () => {
    dragRef.current = null;
    setDragging(false);
    setDragOffset({ x: 0, y: 0 });
    onDragTarget(meal.id, null);
  };
  const patchPortion = (at: number, patch: Partial<FoodPortion>) =>
    onChange({
      ...meal,
      portions: meal.portions.map((p, i) =>
        i === at ? { ...p, ...patch } : p,
      ),
    });
  return (
    <fieldset
      className={`cn-meal${dragging ? " cn-meal--dragging" : ""}`}
      data-meal-id={meal.id}
      data-drop-target={dropTarget || undefined}
      data-drop-edge={dropTarget ? dropEdge : undefined}
      data-drop-label={
        dropTarget
          ? `Drop ${dropEdge} meal ${index + 1}: ${meal.label}`
          : undefined
      }
      style={{
        transform: dragging
          ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
          : undefined,
      }}
      aria-label={`${meal.label || "Meal"} contents`}
    >
      <header>
        <button
          className="cn-meal-drag"
          type="button"
          aria-label={`Drag ${meal.label} to reorder`}
          title="Drag to reorder meals"
          style={{
            touchAction: "none",
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const x = event.clientX - drag.startX;
            const y = event.clientY - drag.startY;
            if (!drag.moved && Math.hypot(x, y) < 5) return;
            drag.moved = true;
            setDragging(true);
            setDragOffset({ x, y });
            const target = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>("[data-meal-id]");
            onDragTarget(meal.id, target?.dataset.mealId ?? null);
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (drag.moved) {
              const target = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>("[data-meal-id]");
              const targetIndex = target?.dataset.mealId
                ? mealDropTargetIndex(mealIds, meal.id, target.dataset.mealId)
                : undefined;
              if (targetIndex !== undefined) onMoveTo(meal.id, targetIndex);
            }
            clearDrag();
          }}
          onPointerCancel={clearDrag}
          onLostPointerCapture={clearDrag}
        >
          <GripVertical size={14} />
        </button>
        <span className="cn-meal-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        {dragging && (
          <span className="cn-meal-drag-preview" aria-live="polite">
            Moving meal {index + 1}: {meal.label}
          </span>
        )}
        <SharedInput
          label="Meal name"
          value={meal.label}
          size="sm"
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
              <SharedInput
                label={`${food.name} quantity`}
                type="number"
                min="0"
                step="any"
                value={portion.quantity}
                size="sm"
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
              <div className="cn-food-actions">
                <FoodChoicePicker
                  food={food}
                  quantity={portion.quantity}
                  triggerLabel="Add alternative"
                  replaceFood={false}
                  excludedIds={[
                    food.id,
                    ...(portion.swaps ?? []).map((swap) => swap.foodId),
                  ]}
                  onSelect={(choice, quantity) =>
                    patchPortion(
                      i,
                      addFoodAlternative(portion, choice.id, quantity),
                    )
                  }
                />
                <FoodChoicePicker
                  food={food}
                  quantity={portion.quantity}
                  triggerLabel="Swap food"
                  replaceFood
                  excludedIds={[food.id]}
                  onSelect={(choice) =>
                    patchPortion(i, replacePortionFood(portion, food, choice))
                  }
                />
              </div>
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
                    <SharedInput
                      label={`${alt.name} equivalent portion`}
                      type="number"
                      min="0"
                      step="1"
                      value={Math.round(swap.quantity)}
                      size="sm"
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
            <div className="cn-load">
              <span>Use saved meal</span>
              <ThemedSelect
                label="Saved meal"
                labelHidden
                value=""
                options={[
                  { value: "", label: "Select…", disabled: true },
                  ...reusable.map((meal) => ({
                    value: meal.id,
                    label: meal.name,
                  })),
                ]}
                onValueChange={(value) => {
                  const saved = reusable.find((meal) => meal.id === value);
                  if (saved)
                    onChange({
                      ...meal,
                      portions: saved.meal.portions.map((p) => ({
                        ...p,
                        swaps: p.swaps?.map((s) => ({ ...s })),
                      })),
                    });
                }}
                className="cn-load-select"
              />
            </div>
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
    </fieldset>
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
  const [dropTargetMealId, setDropTargetMealId] = useState<string | null>(null);
  const [draggedMealId, setDraggedMealId] = useState<string | null>(null);
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
        activeVariantId={active.id}
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
          <SharedInput
            label="Option label"
            value={active.label}
            onChange={(e) => renameOption(active.id, e.target.value)}
            size="sm"
          />
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
            <div className="cn-library-search">
              <SharedInput
                label="Search saved meals or foods"
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Search meals or foods…"
                size="sm"
              />
            </div>
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
                      <SharedInput
                        label="Saved meal name"
                        value={saved.name}
                        size="sm"
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
            mealIds={active.meals.map((item) => item.id)}
            dropTarget={
              dropTargetMealId === meal.id && draggedMealId !== meal.id
            }
            dropEdge={
              dropTargetMealId === meal.id && draggedMealId
                ? active.meals.findIndex((item) => item.id === draggedMealId) <
                  index
                  ? "after"
                  : "before"
                : undefined
            }
            onDragTarget={(sourceMealId, targetMealId) => {
              setDraggedMealId(targetMealId ? sourceMealId : null);
              setDropTargetMealId(targetMealId);
            }}
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
              updateVariant(active.id, (v) =>
                moveMeal(v, meal.id, index + direction),
              )
            }
            onMoveTo={(draggedMealId, targetIndex) =>
              updateVariant(active.id, (v) =>
                moveMeal(v, draggedMealId, targetIndex),
              )
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
      <ThemedSelect
        label={`${name} target type`}
        value={kind}
        options={[
          { value: "fixed", label: "Fixed" },
          { value: "range", label: "Range" },
          { value: "minimum", label: "Minimum" },
        ]}
        onValueChange={(value) => {
          const k: TargetValue["kind"] =
            value === "range" || value === "minimum" ? value : "fixed";
          onChange(
            k === "range" ? { kind: k, min: 0, max: 0 } : { kind: k, value: 0 },
          );
        }}
        className="cn-target-type-select"
      />
      {kind === "range" ? (
        <>
          <SharedInput
            label={`${name} minimum`}
            type="number"
            min="0"
            value={value?.kind === "range" ? value.min : 0}
            size="sm"
            onChange={(e) =>
              onChange({
                kind: "range",
                min: Number(e.target.value) || 0,
                max: value?.kind === "range" ? value.max : 0,
              })
            }
          />
          <span>to</span>
          <SharedInput
            label={`${name} maximum`}
            type="number"
            min="0"
            value={value?.kind === "range" ? value.max : 0}
            size="sm"
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
        <SharedInput
          label={`${name} ${kind} value`}
          type="number"
          min="0"
          value={value?.kind !== "range" ? (value?.value ?? 0) : 0}
          size="sm"
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
        <SharedInput
          label="Target option name"
          value={option.label}
          size="sm"
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
        activeVariantId={
          value.schedule.mode === "manual"
            ? value.schedule.selectedVariantId
            : value.schedule.mode === "cycle"
              ? (value.schedule.steps[0]?.variantId ??
                value.options[0]?.id ??
                "")
              : (value.schedule.days[1] ?? value.options[0]?.id ?? "")
        }
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
  allOptions = false,
}: {
  value: MealPlan;
  variantId?: string;
  clientName?: string;
  allOptions?: boolean;
}) {
  const selectedVariant =
    value.variants.find(
      (item) => item.id === (variantId ?? value.activeVariantId),
    ) ?? value.variants[0];
  if (!selectedVariant) return null;
  const variants = allOptions ? value.variants : [selectedVariant];
  return (
    <div className="cn-preview">
      {allOptions && (
        <p className="cn-preview-options">
          <strong>{variants.length} plan options</strong>
          <span>{variants.map((variant) => variant.label).join(" · ")}</span>
        </p>
      )}
      <p className="cn-preview-schedule">
        {scheduleInstruction(value.schedule, value.variants)}
      </p>
      {variants.map((variant, index) => (
        <ClientPlanPreview
          key={variant.id}
          variant={variant}
          foodMap={foodMap}
          clientName={allOptions && index > 0 ? undefined : clientName}
        />
      ))}
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
  allOptions = false,
}: {
  value: IifymPlan;
  optionId?: string;
  allOptions?: boolean;
}) {
  const id =
    optionId ??
    (value.schedule.mode === "manual"
      ? value.schedule.selectedVariantId
      : value.options[0]?.id);
  const selectedOption =
    value.options.find((item) => item.id === id) ?? value.options[0];
  if (!selectedOption) return null;
  const options = allOptions ? value.options : [selectedOption];
  return (
    <div className="cn-preview cn-iifym-preview">
      {allOptions && (
        <p className="cn-preview-options">
          <strong>{options.length} plan options</strong>
          <span>{options.map((option) => option.label).join(" · ")}</span>
        </p>
      )}
      <p className="cn-preview-schedule">
        {scheduleInstruction(value.schedule, value.options)}
      </p>
      {options.map((option) => (
        <IifymOptionPreview key={option.id} option={option} />
      ))}
    </div>
  );
}

function IifymOptionPreview({ option }: { option: IifymOption }) {
  const { targets } = option;
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
  );
}
