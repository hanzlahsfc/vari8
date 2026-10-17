import type {
  MealPlanDraft,
  MealPlanTarget,
  MealPlanVariant,
} from "@/lib/mealplan/service";

/**
 * MEAL-PLAN-I1 — shared read-only renderer for a published meal-plan
 * payload (staff detail view AND client current view). Displays every
 * labeled variant and every entered value VERBATIM: fixed/range/minimum
 * targets render exactly as stored, absent values render as "—", zero
 * renders as "0". No totals, percentages, attainment, conversions, or
 * automatic variant selection ever appear.
 */

function targetLabel(t: MealPlanTarget | null): string {
  if (t === null) return "—";
  if ("value" in t) return String(t.value);
  if ("max" in t) return `${t.min}–${t.max}`;
  return `${t.min}+`;
}

function VariantBlock({
  variant,
  testidPrefix,
}: {
  variant: MealPlanVariant;
  testidPrefix: string;
}) {
  const targets: readonly [string, MealPlanTarget | null][] = [
    ["Calories", variant.targets.kcal],
    ["Protein", variant.targets.proteinG],
    ["Carbs", variant.targets.carbsG],
    ["Fat", variant.targets.fatG],
  ];
  return (
    <section
      className="tracker-section"
      data-testid={`${testidPrefix}-variant`}
      aria-label={variant.label}
    >
      <h2 className="tracker-section__title">{variant.label}</h2>
      <table className="catalog-table" data-testid={`${testidPrefix}-targets`}>
        <thead>
          <tr>
            {targets.map(([name]) => (
              <th key={name} scope="col">
                {name}
                {name === "Calories" ? " (kcal)" : " (g)"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {targets.map(([name, t]) => (
              <td
                key={name}
                data-testid={`${testidPrefix}-target-${name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {targetLabel(t)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {variant.meals.length === 0 ? (
        <p className="app-lede">No meals in this variant.</p>
      ) : (
        <ol className="tracker-list" data-testid={`${testidPrefix}-meals`}>
          {variant.meals.map((meal, j) => (
            <li
              key={`${variant.id}-${j}`}
              className="tracker-list__row"
              data-testid={`${testidPrefix}-meal`}
            >
              <span className="tracker-list__title">
                {meal.order}. {meal.name}
                {meal.time !== undefined ? ` — ${meal.time}` : ""}
                {meal.frequency !== undefined ? ` · ${meal.frequency}` : ""}
              </span>
              <span className="tracker-list__sub">{meal.foodText}</span>
              <span className="tracker-list__sub">
                {[
                  ["kcal", meal.kcal],
                  ["protein", meal.proteinG],
                  ["carbs", meal.carbsG],
                  ["fat", meal.fatG],
                ]
                  .map(([k, v]) => `${k}: ${v === undefined ? "—" : v}`)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function MealPlanVersionView({
  payload,
  testidPrefix,
}: {
  payload: MealPlanDraft;
  testidPrefix: string;
}) {
  if (payload.variants.length === 0)
    return <p className="app-lede">This plan has no variants.</p>;
  return (
    <>
      {payload.variants.map((v, i) => (
        <VariantBlock
          key={v.id || i}
          variant={v}
          testidPrefix={`${testidPrefix}-variant-${i}`}
        />
      ))}
    </>
  );
}
