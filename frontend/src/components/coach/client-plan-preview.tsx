import { Fragment } from "react";
import {
  calculateMealNutrients,
  calculatePortionNutrients,
  type Food,
  type MealPlanVariant,
} from "@/components/ethereal/mealplan/model";
import { PageHeader } from "@/components/vari8/layouts";
import "./client-plan-preview.css";

const quantityFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});
const calorieFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 0,
});
const macroFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

function formatTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${match[2]} ${suffix}`;
}

function Quantity({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="mp-client-quantity">
      {quantityFormat.format(value)} <span>{unit}</span>
    </span>
  );
}

function NutrientValues({
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
    <>
      <td className="mp-client-calories" data-label="kcal">
        {calorieFormat.format(calories)}
      </td>
      <td data-label="Protein (g)">{macroFormat.format(protein)}</td>
      <td data-label="Carbs (g)">{macroFormat.format(carbs)}</td>
      <td data-label="Fat (g)">{macroFormat.format(fat)}</td>
    </>
  );
}

export function ClientPlanPreview({
  variant,
  foodMap,
  clientName,
}: {
  variant: MealPlanVariant;
  foodMap: Map<string, Food>;
  clientName?: string;
}) {
  return (
    <div className="mp-client-plan">
      <PageHeader
        className="mp-client-plan-heading"
        width="wide"
        title={variant.label || "Meal plan"}
        description={clientName ? `Prepared for ${clientName}` : undefined}
      />

      {variant.meals.length ? (
        <div className="mp-client-meals">
          {variant.meals.map((meal, index) => {
            const total = calculateMealNutrients(meal, foodMap);
            const portions = meal.portions.flatMap((portion, portionIndex) => {
              const food = foodMap.get(portion.foodId);
              if (!food) return [];
              const nutrients = calculatePortionNutrients(
                food,
                portion.quantity,
              );
              const swaps = (portion.swaps ?? []).flatMap((swap, swapIndex) => {
                const swapFood = foodMap.get(swap.foodId);
                if (!swapFood) return [];
                return [{ swap, swapFood, swapIndex }];
              });
              return [{ portion, portionIndex, food, nutrients, swaps }];
            });

            return (
              <section
                className="mp-client-meal"
                key={meal.id}
                aria-labelledby={`mp-client-meal-${meal.id}`}
              >
                <div className="mp-client-meal-heading">
                  <span className="mp-client-meal-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 id={`mp-client-meal-${meal.id}`}>
                    {meal.label || `Meal ${index + 1}`}
                  </h3>
                  <time>{formatTime(meal.time)}</time>
                </div>

                <table className="mp-client-food-table">
                  <thead>
                    <tr>
                      <th scope="col">Food</th>
                      <th scope="col">Portion</th>
                      <th scope="col">kcal</th>
                      <th scope="col">Protein (g)</th>
                      <th scope="col">Carbs (g)</th>
                      <th scope="col">Fat (g)</th>
                    </tr>
                  </thead>
                  {portions.map(
                    ({ portion, portionIndex, food, nutrients, swaps }) => (
                      <tbody
                        className="mp-client-food-group"
                        key={`${portion.foodId}-${portionIndex}`}
                      >
                        <tr className="mp-client-food-row">
                          <th scope="row" className="mp-client-food-name">
                            {food.name}
                          </th>
                          <td className="mp-client-food-portion">
                            <Quantity
                              value={portion.quantity}
                              unit={food.unit}
                            />
                          </td>
                          <NutrientValues {...nutrients} />
                        </tr>
                        {swaps.map(({ swap, swapFood, swapIndex }) => (
                          <Fragment key={`${swap.foodId}-${swapIndex}`}>
                            <tr className="mp-client-swap-row">
                              <th scope="row">
                                <span className="mp-client-swap-branch">
                                  <span className="mp-client-swap-label">
                                    Or
                                  </span>
                                  <span className="mp-client-swap-name">
                                    {swapFood.name}
                                  </span>
                                </span>
                              </th>
                              <td>
                                <Quantity
                                  value={swap.quantity}
                                  unit={swapFood.unit}
                                />
                              </td>
                              <td colSpan={4} />
                            </tr>
                            {swap.note ? (
                              <tr className="mp-client-swap-note-row">
                                <td colSpan={6}>
                                  <p>{swap.note}</p>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        ))}
                      </tbody>
                    ),
                  )}
                  {!portions.length ? (
                    <tbody>
                      <tr>
                        <td colSpan={6} className="mp-client-empty">
                          No foods listed for this meal.
                        </td>
                      </tr>
                    </tbody>
                  ) : null}
                  <tfoot>
                    <tr>
                      <th
                        scope="row"
                        className="mp-client-meal-total-label"
                        colSpan={2}
                      >
                        Meal total
                      </th>
                      <NutrientValues {...total} />
                    </tr>
                  </tfoot>
                </table>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="mp-client-empty mp-client-empty-plan">
          No meals are listed in this plan.
        </p>
      )}
    </div>
  );
}
