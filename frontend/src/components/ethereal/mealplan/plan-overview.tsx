import foodSource from "@/data/food-database.json";
import { calculateVariantNutrients, type Food, type MealPlan } from "./model";
import { macroEnergyShares } from "./overview-model";
import "./plan-overview.css";

const foodMap = new Map(
  (foodSource.foods as Food[]).map((food) => [food.id, food]),
);
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const calories = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const macros = [
  { key: "protein", label: "Protein" },
  { key: "carbs", label: "Carbs" },
  { key: "fat", label: "Fat" },
] as const;

export function PlanOverview({
  plan,
  activeVariantId,
  onSelectVariant,
}: {
  plan: MealPlan;
  activeVariantId: string;
  onSelectVariant: (id: string) => void;
}) {
  return (
    <section className="mp-overview" aria-label="Plan overview">
      <div className="mp-overview-core">
        <div className="mp-overview-heading">
          <h2>Plan overview</h2>
          <span>
            {plan.variants.length}{" "}
            {plan.variants.length === 1 ? "variant" : "variants"}
          </span>
        </div>
        <div className="mp-overview-columns" aria-hidden="true">
          <span>Variant</span>
          <span>Calories</span>
          <span>Macros</span>
          <span>Macro distribution</span>
        </div>
        <div className="mp-overview-rows">
          {plan.variants.map((variant) => {
            const totals = calculateVariantNutrients(variant, foodMap);
            const shares = macroEnergyShares(totals);
            let offset = 0;
            const selected = variant.id === activeVariantId;
            return (
              <div
                className="mp-overview-row"
                key={variant.id}
                data-selected={selected}
              >
                <div className="mp-overview-variant">
                  <button
                    type="button"
                    aria-label={`Open ${variant.label || "Untitled"} variant`}
                    aria-pressed={selected}
                    onClick={() => onSelectVariant(variant.id)}
                  >
                    {variant.label || "Untitled"}
                  </button>
                  <span>{variant.meals.length} meals</span>
                </div>
                <div className="mp-overview-calories">
                  <strong>{calories.format(totals.calories)}</strong>
                  <span>kcal</span>
                </div>
                <dl className="mp-overview-macros">
                  {macros.map(({ key, label }) => (
                    <div key={key} className={`mp-macro-${key}`}>
                      <dt>{label}</dt>
                      <dd>
                        {number.format(totals[key])}
                        <span> g</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mp-overview-distribution">
                  <svg
                    viewBox="0 0 56 56"
                    role="img"
                    aria-label={`Share of macro energy: ${macros.map(({ key, label }) => `${label} ${number.format(shares[key] * 100)}%`).join(", ")}`}
                  >
                    <title>Macro energy distribution</title>
                    <circle className="mp-ring-track" cx="28" cy="28" r="22" />
                    {macros.map(({ key }) => {
                      const percent = shares[key] * 100;
                      const start = offset;
                      const segmentLength = Math.max(0, percent - 0.8);
                      offset += percent;
                      return percent > 0 ? (
                        <circle
                          key={key}
                          className={`mp-ring-segment mp-macro-${key}`}
                          cx="28"
                          cy="28"
                          r="22"
                          pathLength="100"
                          strokeDasharray={`${segmentLength} ${100 - segmentLength}`}
                          strokeDashoffset={-start}
                          transform="rotate(-90 28 28)"
                        />
                      ) : null;
                    })}
                  </svg>
                  <div className="mp-overview-percentages">
                    {macros.map(({ key, label }) => (
                      <span key={key} className={`mp-macro-${key}`}>
                        <i aria-hidden="true" />
                        <abbr title={label}>{label.charAt(0)}</abbr>
                        {number.format(shares[key] * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
