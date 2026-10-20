import {
  calculateMealNutrients,
  calculateVariantNutrients,
  macroEnergyShares,
  type Food,
  type Nutrients,
} from "@/lib/nutrition/math";
import type {
  MealPlanDraft,
  MealPlanMeal,
  MealPlanVariant,
  MealTargets,
  TargetValue,
  VariantSchedule,
} from "@/lib/mealplan/service";

/**
 * MEAL-PLAN-I1 + PR-M5 — shared read-only renderer for a meal-plan
 * draft / published version payload (staff detail view AND client
 * current view). The payload is the canvas shape: variants with
 * optional daily targets, meals of catalog-food portions with approved
 * swaps, an active variant and a variant schedule. When a `foods` map
 * is supplied, per-meal and per-variant totals plus the 4/4/9 ring are
 * computed by `lib/nutrition/math.ts` — the same functions the canvas
 * runs (D29). Unresolved food ids render their reference and
 * contribute nothing, exactly like the canvas.
 */

function targetValueLabel(t: TargetValue): string {
  if (t.kind === "range") return `${t.min}–${t.max}`;
  if (t.kind === "minimum") return `≥${t.value}`;
  return `${t.value}`;
}

const TARGET_FIELD_LABELS: Record<string, string> = {
  calories: "kcal",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
};

function targetsSummary(targets: MealTargets): string {
  const parts: string[] = [];
  for (const field of ["calories", "protein", "carbs", "fat"] as const) {
    const t = targets[field];
    if (t) parts.push(`${TARGET_FIELD_LABELS[field]} ${targetValueLabel(t)}`);
  }
  return `${targets.style}: ${parts.join(" · ")}`;
}

function scheduleSummary(
  schedule: VariantSchedule | undefined,
  variants: MealPlanVariant[],
): string | null {
  if (!schedule) return null;
  const labelOf = (id: string) =>
    variants.find((v) => v.id === id)?.label ?? id;
  if (schedule.mode === "manual")
    return `Manual selection: ${labelOf(schedule.selectedVariantId)}`;
  if (schedule.mode === "weekly") {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const parts = names.map((n, i) => {
      const id = schedule.days[(i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7];
      return `${n} ${id ? labelOf(id) : "—"}`;
    });
    return `Weekly: ${parts.join(", ")}`;
  }
  return `Cycle from ${schedule.anchorDate}: ${schedule.steps
    .map((s) => `${labelOf(s.variantId)} × ${s.days}d`)
    .join(", ")}`;
}

function formatTotals(n: Nutrients): string {
  const round = (v: number) => Math.round(v * 10) / 10;
  return `${round(n.calories)} kcal · protein ${round(n.protein)} g · carbs ${round(n.carbs)} g · fat ${round(n.fat)} g`;
}

function MealBlock({
  meal,
  foods,
  testidPrefix,
}: {
  meal: MealPlanMeal;
  foods: ReadonlyMap<string, Food> | undefined;
  testidPrefix: string;
}) {
  const totals = foods ? calculateMealNutrients(meal, foods) : null;
  return (
    <li className="tracker-list__row" data-testid={`${testidPrefix}-meal`}>
      <span className="tracker-list__title">
        {meal.label} — {meal.time}
        {meal.frequency !== undefined ? ` · ${meal.frequency}` : ""}
      </span>
      {meal.portions.length === 0 ? (
        <span className="tracker-list__sub">No portions.</span>
      ) : (
        <span className="tracker-list__sub">
          {meal.portions.map((p, i) => {
            const food = foods?.get(p.foodId);
            const label = food
              ? `${food.name} ${p.quantity} ${food.unit}`
              : `${p.foodId} × ${p.quantity}`;
            const swaps =
              p.swaps && p.swaps.length > 0
                ? ` (or ${p.swaps
                    .map((s) => {
                      const sf = foods?.get(s.foodId);
                      return sf
                        ? `${sf.name} ${s.quantity} ${sf.unit}`
                        : `${s.foodId} × ${s.quantity}`;
                    })
                    .join(", ")})`
                : "";
            return (
              <span key={i} data-testid={`${testidPrefix}-portion`}>
                {label}
                {swaps}
                {i < meal.portions.length - 1 ? "; " : ""}
              </span>
            );
          })}
        </span>
      )}
      {totals ? (
        <span
          className="tracker-list__sub"
          data-testid={`${testidPrefix}-totals`}
        >
          {formatTotals(totals)}
        </span>
      ) : null}
      {meal.target ? (
        <span className="tracker-list__sub">
          Target: {targetsSummary(meal.target)}
        </span>
      ) : null}
    </li>
  );
}

function VariantBlock({
  variant,
  foods,
  testidPrefix,
}: {
  variant: MealPlanVariant;
  foods: ReadonlyMap<string, Food> | undefined;
  testidPrefix: string;
}) {
  const totals = foods ? calculateVariantNutrients(variant, foods) : null;
  const shares = totals ? macroEnergyShares(totals) : null;
  return (
    <section
      className="tracker-section"
      data-testid={`${testidPrefix}-variant`}
      aria-label={variant.label}
    >
      <h2 className="tracker-section__title">{variant.label}</h2>
      {variant.dailyTarget ? (
        <p className="app-lede" data-testid={`${testidPrefix}-daily-target`}>
          Daily target: {targetsSummary(variant.dailyTarget)}
        </p>
      ) : null}
      {totals ? (
        <p className="app-lede" data-testid={`${testidPrefix}-totals`}>
          {formatTotals(totals)}
          {shares
            ? ` — ring ${Math.round(shares.protein * 100)}/${Math.round(shares.carbs * 100)}/${Math.round(shares.fat * 100)}`
            : ""}
        </p>
      ) : null}
      {variant.meals.length === 0 ? (
        <p className="app-lede">No meals in this variant.</p>
      ) : (
        <ol className="tracker-list" data-testid={`${testidPrefix}-meals`}>
          {variant.meals.map((meal, j) => (
            <MealBlock
              key={meal.id || j}
              meal={meal}
              foods={foods}
              testidPrefix={`${testidPrefix}-meal-${j}`}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

export function MealPlanVersionView({
  payload,
  testidPrefix,
  foods,
}: {
  payload: MealPlanDraft;
  testidPrefix: string;
  /** Catalog foods for computed totals (D29); omit for reference-only
   * rendering. */
  foods?: ReadonlyMap<string, Food>;
}) {
  const schedule = scheduleSummary(payload.schedule, payload.variants);
  return (
    <>
      {payload.name !== undefined || payload.startDate !== undefined ? (
        <p className="app-lede" data-testid={`${testidPrefix}-plan`}>
          {payload.name ?? "Untitled plan"}
          {payload.startDate !== undefined
            ? ` — from ${payload.startDate}`
            : ""}
        </p>
      ) : null}
      {schedule ? (
        <p className="app-lede" data-testid={`${testidPrefix}-schedule`}>
          {schedule}
          {payload.activeVariantId
            ? ` — active: ${
                payload.variants.find((v) => v.id === payload.activeVariantId)
                  ?.label ?? payload.activeVariantId
              }`
            : ""}
        </p>
      ) : null}
      {payload.variants.length === 0 ? (
        <p className="app-lede">This plan has no variants.</p>
      ) : (
        payload.variants.map((v, i) => (
          <VariantBlock
            key={v.id || i}
            variant={v}
            foods={foods}
            testidPrefix={`${testidPrefix}-variant-${i}`}
          />
        ))
      )}
    </>
  );
}
