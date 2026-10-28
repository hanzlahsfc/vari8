"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import {
  Archive,
  Check,
  Copy,
  Eye,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ComponentPropsWithoutRef,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { loadMealPlans, saveMealPlans } from "@/components/canvas/data/nutrition";
import {
  Button,
  Input,
  Select,
  IconButton as V8IconButton,
} from "@/components/canvas/vari8/components";
import { DatePicker, TimePicker } from "@/components/canvas/vari8/inputs";
import foodSource from "@/lib/canvas/data/food-database.json";
import { useReducedMotion } from "@/lib/canvas/reduced-motion";
import { createInitialClients } from "../clients/model";
import { assignSavedMealToClient } from "./assign-saved-meal";
import { ClientPlanPreview } from "./client-plan-preview";
import {
  addMealToVariant,
  calculateMealNutrients,
  calculatePortionNutrients,
  cloneMeal,
  cloneVariant,
  createInitialMealPlan,
  createReusableMeal,
  type Food,
  type Meal,
  type MealPlan,
  type MealPlanVariant,
  type ReusableMeal,
  validateMealPlan,
} from "./model";
import { PlanOverview } from "./plan-overview";
import { SavedMealLibrary } from "./saved-meal-library";
import { SwapFoodPicker } from "./swap-food-picker";
import { VariantSchedule } from "./variant-schedule";
import "./mealplan-workspace.css";

const WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const foods = foodSource as { foods?: Food[] } | Food[];
const catalog: Food[] = Array.isArray(foods) ? foods : (foods.foods ?? []);
const foodMap = new Map(catalog.map((food) => [food.id, food]));

function format(value: number, digits = 0) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(
    value,
  );
}
function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatStartDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Start date not set"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
}

function NutrientLine({
  calories,
  protein,
  carbs,
  fat,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  return (
    <span className="mp-nutrients">
      <b>{format(calories)} kcal</b>
      <span>P {format(protein, 1)}g</span>
      <span>C {format(carbs, 1)}g</span>
      <span>F {format(fat, 1)}g</span>
    </span>
  );
}

function TooltipIconButton({
  title,
  children,
  ...props
}: ComponentPropsWithoutRef<"button">) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const tooltipId = useId();
  const label = props["aria-label"] ?? title ?? "Action";
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        {...props}
        ref={setAnchor}
        delay={350}
        aria-describedby={tooltipId}
        render={<V8IconButton label={label} title={title} />}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal container={anchor?.closest<HTMLElement>(".mp-workspace")}>
        <Tooltip.Positioner className="mp-tooltip-positioner" sideOffset={8}>
          <Tooltip.Popup id={tooltipId} role="tooltip" className="mp-tooltip">
            {title || props["aria-label"]}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function MealplanWorkspace({ workspaceId }: { workspaceId?: string }) {
  const reduceMotion = useReducedMotion();
  const clients = useMemo(
    () => createInitialClients().filter((client) => !client.archived),
    [],
  );
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [plans, setPlans] = useState<Record<string, MealPlan>>({});
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [searchMeal, setSearchMeal] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [swapFor, setSwapFor] = useState<{
    mealId: string;
    portionIndex: number;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const plan = plans[clientId];

  useEffect(() => {
    let saved: Record<string, MealPlan> = {};
    try {
      saved = loadMealPlans() ?? {};
    } catch {
      setNotice("Saved plans could not be opened. A fresh demo plan is ready.");
    }
    const loaded = { ...saved };
    clients.forEach((client) => {
      if (!loaded[client.id])
        loaded[client.id] = createInitialMealPlan(client.id, catalog);
    });
    setPlans(loaded);
    setReady(true);
  }, [clients]);

  useEffect(() => {
    if (!ready) return;
    try {
      saveMealPlans(plans);
    } catch {
      setNotice(
        "Browser storage is unavailable. Changes will last for this session.",
      );
    }
  }, [plans, ready]);

  const variant = plan
    ? (plan.variants.find((item) => item.id === plan.activeVariantId) ??
      plan.variants[0])
    : undefined;
  const filteredFoods = useMemo(
    () =>
      catalog
        .filter((food) =>
          food.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 32),
    [query],
  );
  const selectedClient = clients.find((client) => client.id === clientId);

  async function assignSavedMeal(meal: ReusableMeal): Promise<boolean> {
    if (!workspaceId || !selectedClient) return false;
    const sortOrder = plan?.reusableMeals.findIndex(
      (entry) => entry.id === meal.id,
    );
    return assignSavedMealToClient(
      workspaceId,
      selectedClient.name,
      meal,
      sortOrder !== undefined && sortOrder >= 0 ? sortOrder : undefined,
    );
  }

  function update(next: MealPlan) {
    setPlans((current) => ({ ...current, [clientId]: next }));
  }
  function updateVariant(
    id: string,
    change: (current: MealPlanVariant) => MealPlanVariant,
  ) {
    if (!plan) return;
    update({
      ...plan,
      variants: plan.variants.map((item) =>
        item.id === id ? change(item) : item,
      ),
    });
  }
  function updateMeal(mealId: string, change: (meal: Meal) => Meal) {
    if (!variant) return;
    updateVariant(variant.id, (current) => ({
      ...current,
      meals: current.meals.map((meal) =>
        meal.id === mealId ? change(meal) : meal,
      ),
    }));
  }
  function addFood(
    mealId: string,
    food: Food,
    asSwap = false,
    portionIndex?: number,
  ) {
    if (asSwap && portionIndex !== undefined) {
      updateMeal(mealId, (meal) => ({
        ...meal,
        portions: meal.portions.map((portion, index) => {
          if (index !== portionIndex) return portion;
          const sourceFood = foodMap.get(portion.foodId);
          const sourceCalories = sourceFood
            ? calculatePortionNutrients(sourceFood, portion.quantity).calories
            : 0;
          const equivalent =
            sourceCalories > 0 && food.calories > 0
              ? (sourceCalories / food.calories) * food.amount
              : food.amount;
          return {
            ...portion,
            swaps: [
              ...(portion.swaps ?? []),
              { foodId: food.id, quantity: Math.round(equivalent * 10) / 10 },
            ],
          };
        }),
      }));
    } else
      updateMeal(mealId, (meal) => ({
        ...meal,
        portions: [
          ...meal.portions,
          { foodId: food.id, quantity: food.amount },
        ],
      }));
    setSearchMeal(null);
    setSwapFor(null);
    setQuery("");
  }
  function removeMeal(id: string) {
    if (!variant) return;
    updateVariant(variant.id, (current) => ({
      ...current,
      meals: current.meals.filter((meal) => meal.id !== id),
    }));
  }
  function saveMeal(meal: Meal) {
    if (!plan) return;
    const reusable = createReusableMeal(meal);
    update({ ...plan, reusableMeals: [...plan.reusableMeals, reusable] });
    setNotice(`${meal.label} saved to reusable meals.`);
  }
  function archivePlan() {
    if (!plan) return;
    const now = new Date();
    const next = {
      ...plan,
      archivedPlans: [
        ...plan.archivedPlans,
        {
          id: `${plan.id}-${now.getTime()}`,
          planId: plan.id,
          name: plan.name,
          startDate: plan.startDate,
          archivedAt: now.toISOString(),
          variants: structuredClone(plan.variants),
          activeVariantId: plan.activeVariantId,
          schedule: structuredClone(plan.schedule),
        },
      ],
      name: `${plan.name} (new)`,
      startDate: localDateString(now),
    };
    update(next);
    setNotice("Current plan archived. The new version is ready to edit.");
  }
  function changeVariantLabel(id: string, label: string) {
    updateVariant(id, (current) => ({ ...current, label }));
  }
  function addVariant() {
    if (!plan || !variant) return;
    const next = cloneVariant(variant, `Variant ${plan.variants.length + 1}`);
    update({
      ...plan,
      variants: [...plan.variants, next],
      activeVariantId: next.id,
      schedule: plan.schedule,
    });
  }
  function deleteVariant(id: string) {
    if (!plan || plan.variants.length <= 1) return;
    const variants = plan.variants.filter((item) => item.id !== id);
    const active =
      (plan.activeVariantId === id ? variants[0] : variant) ?? variants[0];
    if (!active) return;
    const schedule: MealPlan["schedule"] =
      plan.schedule.mode === "weekly"
        ? {
            mode: "weekly",
            days: Object.fromEntries(
              WEEK.map((_, index) => {
                const weekday = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                const scheduled =
                  plan.schedule.mode === "weekly"
                    ? plan.schedule.days[weekday]
                    : active.id;
                return [
                  weekday,
                  scheduled === id ? active.id : (scheduled ?? active.id),
                ];
              }),
            ) as Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>,
          }
        : plan.schedule.mode === "cycle"
          ? {
              ...plan.schedule,
              steps: plan.schedule.steps.map((step) => ({
                ...step,
                variantId: step.variantId === id ? active.id : step.variantId,
              })),
            }
          : plan.schedule.mode === "flexible"
            ? plan.schedule
            : {
              mode: "manual",
              selectedVariantId:
                plan.schedule.selectedVariantId === id
                  ? active.id
                  : plan.schedule.selectedVariantId,
            };
    update({
      ...plan,
      variants,
      activeVariantId: active.id,
      schedule,
    });
  }

  if (!ready || !plan || !variant)
    return (
      <div className="mp-workspace" role="status">
        Opening meal plan…
      </div>
    );
  const errors = validateMealPlan(plan, foodMap);

  return (
    <div className={`mp-workspace ${preview ? "is-preview" : ""}`}>
      <header className="mp-header">
        <div className="mp-title">
          <h1>Meal plans</h1>
          <span className="mp-demo-status">Demo workspace</span>
        </div>
        <div className="mp-header-controls">
          <div className="mp-client-select">
            <Select
              label="Client"
              value={clientId}
              onValueChange={(value) => {
                setClientId(value);
                setPreview(false);
              }}
              options={clients.map((client) => ({
                value: client.id,
                label: client.name,
              }))}
            />
          </div>
          <Button
            variant={preview ? "primary" : "secondary"}
            size="sm"
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview((value) => !value)}
          >
            <Eye size={15} />
            {preview ? "Coach edit" : "Plan preview"}
          </Button>
          {!preview && (
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => {
                const issue = errors[0];
                if (issue) {
                  setNotice(issue);
                  return;
                }
                try {
                  saveMealPlans({ ...plans, [clientId]: plan });
                  setNotice("Meal plan saved in this browser.");
                } catch {
                  setNotice(
                    "Could not save this plan. Browser storage is unavailable.",
                  );
                }
              }}
            >
              <Check size={15} />
              Save plan
            </Button>
          )}
        </div>
      </header>
      {preview ? (
        <div className="mp-client-meta">
          <div>
            <span>Meal plan</span>
            <h2>{plan.name}</h2>
          </div>
          <div>
            <span>Starts</span>
            <time dateTime={plan.startDate}>
              {formatStartDate(plan.startDate)}
            </time>
          </div>
        </div>
      ) : (
        <div className="mp-planbar">
          <div className="mp-name-field">
            <Input
              label="Plan name"
              value={plan.name}
              onChange={(event) =>
                update({ ...plan, name: event.target.value })
              }
              disabled={preview}
            />
          </div>
          <div className="mp-date-field">
            <DatePicker
              value={plan.startDate}
              onValueChange={(startDate) => update({ ...plan, startDate })}
              label="Starts"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mp-planbar-action"
            onClick={archivePlan}
            disabled={preview}
          >
            <Archive size={14} />
            Archive & start version
          </Button>
          <Button
            type="button"
            variant={historyOpen ? "secondary" : "ghost"}
            size="sm"
            className="mp-history-trigger mp-planbar-action"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((value) => !value)}
          >
            {historyOpen
              ? "Hide history"
              : `History · ${plan.archivedPlans.length}`}
          </Button>
          <SavedMealLibrary
            key={clientId}
            meals={plan.reusableMeals}
            foodMap={foodMap}
            clientName={selectedClient?.name ?? "Client"}
            onChange={(reusableMeals) => update({ ...plan, reusableMeals })}
            onAssign={workspaceId ? assignSavedMeal : undefined}
          />
        </div>
      )}
      {!preview && historyOpen && (
        <section className="mp-history" aria-label="Archived plans">
          {plan.archivedPlans.length ? (
            plan.archivedPlans.map((item) => (
              <details key={item.id}>
                <summary>
                  <strong>{item.name}</strong>
                  <span>
                    Started {item.startDate} · archived{" "}
                    {new Date(item.archivedAt).toLocaleDateString()}
                  </span>
                </summary>
                <div className="mp-archive-variants">
                  {item.variants.map((archivedVariant) => (
                    <div key={archivedVariant.id}>
                      <b>{archivedVariant.label}</b>
                      {archivedVariant.meals.map((archivedMeal) => (
                        <p key={archivedMeal.id}>
                          <strong>
                            {archivedMeal.label} · {archivedMeal.time}
                          </strong>
                          <span>
                            {archivedMeal.portions
                              .map((portion) => {
                                const food = foodMap.get(portion.foodId);
                                return food
                                  ? `${food.name} ${format(portion.quantity, 1)} ${food.unit}`
                                  : "Unavailable food";
                              })
                              .join(" · ") || "No foods"}
                          </span>
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            ))
          ) : (
            <p>No archived plans for {selectedClient?.name}.</p>
          )}
        </section>
      )}
      {notice && (
        <div className="mp-notice" role="status">
          {notice}
          <TooltipIconButton
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </TooltipIconButton>
        </div>
      )}
      <PlanOverview
        plan={plan}
        activeVariantId={variant.id}
        onSelectVariant={(id: string) =>
          update({
            ...plan,
            activeVariantId: id,
            schedule: plan.schedule,
          })
        }
      />
      <VariantSchedule
        plan={plan}
        preview={preview}
        onChange={(schedule) => update({ ...plan, schedule })}
      />
      <div className="mp-layout">
        <section className="mp-main">
          <div className="mp-main-core">
            <section className="mp-variants" aria-label="Plan variants">
              <div
                className="mp-variant-tabs"
                role="tablist"
                aria-label="Nutrition variants"
              >
                {plan.variants.map((item, itemIndex) => (
                  <div
                    className={`mp-variant-tab ${item.id === variant.id ? "is-selected" : ""}`}
                    key={item.id}
                  >
                    <button
                      id={`mp-tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={item.id === variant.id}
                      aria-controls="mp-plan-panel"
                      tabIndex={item.id === variant.id ? 0 : -1}
                      onClick={() =>
                        update({
                          ...plan,
                          activeVariantId: item.id,
                          schedule: plan.schedule,
                        })
                      }
                      onKeyDown={(event) => {
                        const direction =
                          event.key === "ArrowRight"
                            ? 1
                            : event.key === "ArrowLeft"
                              ? -1
                              : 0;
                        const nextIndex =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? plan.variants.length - 1
                              : (itemIndex + direction + plan.variants.length) %
                                plan.variants.length;
                        if (
                          !direction &&
                          event.key !== "Home" &&
                          event.key !== "End"
                        )
                          return;
                        event.preventDefault();
                        const next = plan.variants[nextIndex];
                        update({
                          ...plan,
                          activeVariantId: next.id,
                          schedule: plan.schedule,
                        });
                        requestAnimationFrame(() =>
                          document.getElementById(`mp-tab-${next.id}`)?.focus(),
                        );
                      }}
                    >
                      {item.label || "Untitled"}
                    </button>
                  </div>
                ))}
              </div>
              {!preview && (
                <div className="mp-variant-meta">
                  <span>
                    {variant.meals.length} meals · edits apply to{" "}
                    {variant.label || "this variant"}
                  </span>
                </div>
              )}
              {!preview && (
                <div className="mp-variant-actions">
                  <div className="mp-variant-name">
                    <Input
                      id={`mp-variant-name-${variant.id}`}
                      size="sm"
                      label="Variant name"
                      value={variant.label}
                      onChange={(event) =>
                        changeVariantLabel(variant.id, event.target.value)
                      }
                    />
                  </div>
                  <TooltipIconButton
                    type="button"
                    aria-label={`Duplicate ${variant.label}`}
                    title="Duplicate variant"
                    onClick={() => {
                      const duplicate = cloneVariant(variant);
                      update({
                        ...plan,
                        variants: [...plan.variants, duplicate],
                        activeVariantId: duplicate.id,
                        schedule: plan.schedule,
                      });
                    }}
                  >
                    <Copy size={14} />
                  </TooltipIconButton>
                  {plan.variants.length > 1 && (
                    <TooltipIconButton
                      type="button"
                      aria-label={`Delete ${variant.label}`}
                      title="Delete variant"
                      onClick={() => deleteVariant(variant.id)}
                    >
                      <X size={14} />
                    </TooltipIconButton>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addVariant}
                  >
                    <Plus size={14} />
                    Add variant
                  </Button>
                </div>
              )}
            </section>
            <div
              id="mp-plan-panel"
              role="tabpanel"
              aria-labelledby={`mp-tab-${variant.id}`}
            >
              {preview ? (
                <ClientPlanPreview
                  variant={variant}
                  foodMap={foodMap}
                  clientName={selectedClient?.name}
                />
              ) : (
                <>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {variant.meals.map((meal, index) => {
                      const total = calculateMealNutrients(meal, foodMap);
                      return (
                        <motion.section
                          layout={!reduceMotion}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={
                            reduceMotion ? undefined : { opacity: 0, height: 0 }
                          }
                          transition={{ duration: 0.18 }}
                          className="mp-meal"
                          key={meal.id}
                        >
                          <div className="mp-meal-core">
                            <div className="mp-meal-top">
                              <span className="mp-meal-index">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <Input
                                size="sm"
                                className="mp-meal-label"
                                label="Meal name"
                                value={meal.label}
                                onChange={(event) =>
                                  updateMeal(meal.id, (current) => ({
                                    ...current,
                                    label: event.target.value,
                                  }))
                                }
                                disabled={preview}
                              />
                              <TimePicker
                                value={meal.time}
                                label="Meal time"
                                onValueChange={(time) =>
                                  updateMeal(meal.id, (current) => ({
                                    ...current,
                                    time,
                                  }))
                                }
                              />
                              <div className="mp-meal-actions">
                                {!preview && (
                                  <>
                                    <TooltipIconButton
                                      type="button"
                                      aria-label={`Save ${meal.label} to reusable meals`}
                                      title="Save reusable meal"
                                      onClick={() => saveMeal(meal)}
                                    >
                                      <Archive size={14} />
                                    </TooltipIconButton>
                                    <TooltipIconButton
                                      type="button"
                                      aria-label={`Duplicate ${meal.label}`}
                                      title="Duplicate meal"
                                      onClick={() =>
                                        updateVariant(
                                          variant.id,
                                          (current) => ({
                                            ...current,
                                            meals: [
                                              ...current.meals.slice(
                                                0,
                                                index + 1,
                                              ),
                                              cloneMeal(meal),
                                              ...current.meals.slice(index + 1),
                                            ],
                                          }),
                                        )
                                      }
                                    >
                                      <Copy size={14} />
                                    </TooltipIconButton>
                                    <TooltipIconButton
                                      type="button"
                                      aria-label={`Delete ${meal.label}`}
                                      title="Delete meal"
                                      onClick={() => removeMeal(meal.id)}
                                    >
                                      <Trash2 size={14} />
                                    </TooltipIconButton>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="mp-food-list">
                              {meal.portions.map((portion, portionIndex) => {
                                const food = foodMap.get(portion.foodId);
                                if (!food) return null;
                                const nutrients = calculateMealNutrients(
                                  { ...meal, portions: [portion] },
                                  foodMap,
                                );
                                return (
                                  <div
                                    className="mp-food-entry"
                                    // biome-ignore lint/suspicious/noArrayIndexKey: portions have no persisted ID and duplicate catalog rows are valid
                                    key={`${portion.foodId}-${portionIndex}`}
                                  >
                                    <div className="mp-food-main">
                                      <span className="mp-food-name">
                                        {food.name}
                                      </span>
                                    </div>
                                    {preview ? (
                                      <span className="mp-readonly-quantity">
                                        {format(portion.quantity, 1)}
                                      </span>
                                    ) : (
                                      <Input
                                        size="sm"
                                        className="mp-quantity"
                                        label={`${food.name} quantity in ${food.unit}`}
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={portion.quantity}
                                        onChange={(event) =>
                                          updateMeal(meal.id, (current) => ({
                                            ...current,
                                            portions: current.portions.map(
                                              (item, i) =>
                                                i === portionIndex
                                                  ? {
                                                      ...item,
                                                      quantity:
                                                        Number(
                                                          event.target.value,
                                                        ) || 0,
                                                    }
                                                  : item,
                                            ),
                                          }))
                                        }
                                      />
                                    )}
                                    <span className="mp-unit">{food.unit}</span>
                                    <span className="mp-food-macros">
                                      <span className="mp-food-mobile-kcal">
                                        {format(nutrients.calories)} kcal
                                      </span>
                                      <span>
                                        Protein {format(nutrients.protein, 1)}g
                                      </span>
                                      <span>
                                        Carbs {format(nutrients.carbs, 1)}g
                                      </span>
                                      <span>
                                        Fat {format(nutrients.fat, 1)}g
                                      </span>
                                    </span>
                                    <span className="mp-food-kcal">
                                      {format(nutrients.calories)} kcal
                                    </span>
                                    {!preview && (
                                      <SwapFoodPicker
                                        sourceFood={food}
                                        foods={catalog}
                                        open={
                                          swapFor?.mealId === meal.id &&
                                          swapFor.portionIndex === portionIndex
                                        }
                                        onOpenChange={(open) => {
                                          if (open) {
                                            setSearchMeal(null);
                                            setQuery("");
                                            setSwapFor({
                                              mealId: meal.id,
                                              portionIndex,
                                            });
                                          } else {
                                            setSwapFor((current) =>
                                              current?.mealId === meal.id &&
                                              current.portionIndex ===
                                                portionIndex
                                                ? null
                                                : current,
                                            );
                                          }
                                        }}
                                        onSelect={(selectedFood) =>
                                          addFood(
                                            meal.id,
                                            selectedFood,
                                            true,
                                            portionIndex,
                                          )
                                        }
                                      />
                                    )}
                                    {!preview && (
                                      <TooltipIconButton
                                        type="button"
                                        className="mp-remove-food"
                                        aria-label={`Remove ${food.name}`}
                                        onClick={() =>
                                          updateMeal(meal.id, (current) => ({
                                            ...current,
                                            portions: current.portions.filter(
                                              (_, i) => i !== portionIndex,
                                            ),
                                          }))
                                        }
                                      >
                                        <X size={13} />
                                      </TooltipIconButton>
                                    )}
                                    {Boolean(portion.swaps?.length) && (
                                      <fieldset
                                        className="mp-food-alternatives"
                                        aria-label={`Approved alternatives for ${food.name}`}
                                      >
                                        {portion.swaps?.map(
                                          (swap, swapIndex) => {
                                            const swapFood = foodMap.get(
                                              swap.foodId,
                                            );
                                            const swapNutrients = swapFood
                                              ? calculatePortionNutrients(
                                                  swapFood,
                                                  swap.quantity,
                                                )
                                              : undefined;
                                            return swapFood ? (
                                              <div
                                                className="mp-swap-label"
                                                // biome-ignore lint/suspicious/noArrayIndexKey: duplicate food swaps are allowed and have no persisted ID
                                                key={`${swap.foodId}-${swapIndex}`}
                                              >
                                                <span className="mp-swap-food">
                                                  <span className="mp-swap-equivalent">
                                                    Or
                                                  </span>
                                                  <span className="mp-swap-name">
                                                    {swapFood.name}
                                                  </span>
                                                </span>
                                                {preview ? (
                                                  <span className="mp-readonly-quantity">
                                                    {format(swap.quantity, 1)}
                                                  </span>
                                                ) : (
                                                  <Input
                                                    size="sm"
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    label={`${swapFood.name} equivalent portion`}
                                                    value={swap.quantity}
                                                    onChange={(event) =>
                                                      updateMeal(
                                                        meal.id,
                                                        (current) => ({
                                                          ...current,
                                                          portions:
                                                            current.portions.map(
                                                              (item, i) =>
                                                                i ===
                                                                portionIndex
                                                                  ? {
                                                                      ...item,
                                                                      swaps:
                                                                        item.swaps?.map(
                                                                          (
                                                                            entry,
                                                                            j,
                                                                          ) =>
                                                                            j ===
                                                                            swapIndex
                                                                              ? {
                                                                                  ...entry,
                                                                                  quantity:
                                                                                    Number(
                                                                                      event
                                                                                        .target
                                                                                        .value,
                                                                                    ) ||
                                                                                    0,
                                                                                }
                                                                              : entry,
                                                                        ),
                                                                    }
                                                                  : item,
                                                            ),
                                                        }),
                                                      )
                                                    }
                                                  />
                                                )}
                                                <span className="mp-unit">
                                                  {swapFood.unit}
                                                </span>
                                                {swapNutrients && (
                                                  <span className="mp-swap-macros">
                                                    {format(
                                                      swapNutrients.calories,
                                                    )}{" "}
                                                    kcal · P{" "}
                                                    {format(
                                                      swapNutrients.protein,
                                                      1,
                                                    )}{" "}
                                                    · C{" "}
                                                    {format(
                                                      swapNutrients.carbs,
                                                      1,
                                                    )}{" "}
                                                    · F{" "}
                                                    {format(
                                                      swapNutrients.fat,
                                                      1,
                                                    )}
                                                  </span>
                                                )}
                                                {!preview && (
                                                  <TooltipIconButton
                                                    type="button"
                                                    className="mp-remove-swap"
                                                    aria-label={`Remove ${swapFood.name} swap`}
                                                    onClick={() =>
                                                      updateMeal(
                                                        meal.id,
                                                        (current) => ({
                                                          ...current,
                                                          portions:
                                                            current.portions.map(
                                                              (item, i) =>
                                                                i ===
                                                                portionIndex
                                                                  ? {
                                                                      ...item,
                                                                      swaps:
                                                                        item.swaps?.filter(
                                                                          (
                                                                            _,
                                                                            j,
                                                                          ) =>
                                                                            j !==
                                                                            swapIndex,
                                                                        ),
                                                                    }
                                                                  : item,
                                                            ),
                                                        }),
                                                      )
                                                    }
                                                  >
                                                    <X size={11} />
                                                  </TooltipIconButton>
                                                )}
                                              </div>
                                            ) : null;
                                          },
                                        )}
                                      </fieldset>
                                    )}
                                  </div>
                                );
                              })}
                              {meal.portions.length === 0 && (
                                <div className="mp-empty-food">
                                  No foods yet. Add an item to build this meal.
                                </div>
                              )}
                            </div>
                            {!preview && (
                              <div className="mp-meal-tools">
                                {searchMeal === meal.id ? (
                                  <div className="mp-food-search">
                                    <Search size={15} />
                                    <Input
                                      size="sm"
                                      className="mp-food-search-input"
                                      value={query}
                                      onChange={(event) =>
                                        setQuery(event.target.value)
                                      }
                                      placeholder="Search foods…"
                                      label="Search food database"
                                    />
                                    <TooltipIconButton
                                      type="button"
                                      aria-label="Close food search"
                                      onClick={() => {
                                        setSearchMeal(null);
                                        setSwapFor(null);
                                      }}
                                    >
                                      <X size={14} />
                                    </TooltipIconButton>
                                    <div className="mp-food-results">
                                      {filteredFoods.length ? (
                                        filteredFoods.map((food) => (
                                          <button
                                            type="button"
                                            key={food.id}
                                            onClick={() =>
                                              addFood(meal.id, food)
                                            }
                                          >
                                            <span>
                                              <strong>{food.name}</strong>
                                              <small>
                                                {food.calories} kcal · per{" "}
                                                {food.amount} {food.unit}
                                              </small>
                                            </span>
                                            <Plus size={14} />
                                          </button>
                                        ))
                                      ) : (
                                        <p>No matching foods.</p>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="mp-text-action"
                                    onClick={() => {
                                      setSearchMeal(meal.id);
                                      setSwapFor(null);
                                      setQuery("");
                                    }}
                                  >
                                    <Plus size={14} />
                                    Add food
                                  </Button>
                                )}
                                {plan.reusableMeals.length > 0 && (
                                  <div className="mp-reusable-select">
                                    <Select
                                      label="Use saved meal"
                                      size="sm"
                                      value=""
                                      onValueChange={(reusableMealId) => {
                                        const saved = plan.reusableMeals.find(
                                          (item) => item.id === reusableMealId,
                                        );
                                        if (saved)
                                          updateMeal(meal.id, (current) => ({
                                            ...current,
                                            portions: saved.meal.portions.map(
                                              (portion) => ({
                                                ...portion,
                                                swaps: portion.swaps?.map(
                                                  (swap) => ({ ...swap }),
                                                ),
                                              }),
                                            ),
                                          }));
                                      }}
                                      options={[
                                        {
                                          value: "",
                                          label: "Select…",
                                          disabled: true,
                                        },
                                        ...plan.reusableMeals.map((saved) => ({
                                          value: saved.id,
                                          label: saved.name,
                                        })),
                                      ]}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            <footer className="mp-meal-footer">
                              <span>Meal total</span>
                              <NutrientLine {...total} />
                            </footer>
                          </div>
                        </motion.section>
                      );
                    })}
                  </AnimatePresence>
                  {!preview && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mp-add-meal"
                      onClick={() =>
                        updateVariant(variant.id, (current) =>
                          addMealToVariant(current),
                        )
                      }
                    >
                      <Plus size={16} />
                      Add meal
                    </Button>
                  )}
                </>
              )}
            </div>
            <div className="mp-workspace-footer">
              {!preview && errors.length > 0 && (
                <p className="mp-validation">{errors[0]}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
