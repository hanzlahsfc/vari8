import {
  NUTRITION_SEARCH_MIN_QUERY_LENGTH,
  type NutritionSearchResult,
} from "@/lib/nutrition/search";

/**
 * Phase 2.1 Nutrition catalog results. Server-rendered and source-backed: each
 * item shows the verbatim source fields for one imported food row. Formatted
 * numbers are the source values only — nothing is scaled or calculated.
 */

const dash = "—";

function display(value: string | number | null): string {
  if (value === null) return dash;
  return String(value);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="catalog-field">
      <dt className="catalog-field__label">{label}</dt>
      <dd className="catalog-field__value">{value}</dd>
    </div>
  );
}

export function NutritionResults({
  result,
}: {
  result: NutritionSearchResult;
}) {
  if (!result.queryApplied) {
    return (
      <p className="catalog-empty" data-testid="nutrition-empty" role="status">
        Enter at least {NUTRITION_SEARCH_MIN_QUERY_LENGTH} characters to search
        the Nutrition Database.
      </p>
    );
  }

  if (result.total === 0) {
    return (
      <p className="catalog-empty" data-testid="nutrition-empty" role="status">
        No foods match “{result.query}”
        {result.category ? ` in category ${result.category}` : ""}.
      </p>
    );
  }

  return (
    <section
      className="catalog-results"
      data-testid="nutrition-results"
      aria-labelledby="nutrition-results-heading"
    >
      <h2 id="nutrition-results-heading" className="catalog-results__count">
        {result.total} {result.total === 1 ? "match" : "matches"} — showing{" "}
        {result.items.length}
        {result.category ? ` · CAT ${result.category}` : ""}
      </h2>
      <ol className="catalog-list">
        {result.items.map((item) => (
          <li
            className="catalog-item"
            key={item.id}
            data-testid="nutrition-item"
            data-source-no={item.sourceNo}
          >
            <h3 className="catalog-item__name">{item.name}</h3>
            <dl className="catalog-item__fields">
              <Field label="NO." value={display(item.sourceNo)} />
              <Field label="AMOUNT" value={display(item.amount)} />
              <Field label="UNIT" value={display(item.unit)} />
              <Field label="CALORIES (kcal)" value={display(item.calories)} />
              <Field label="PROTEIN (g)" value={display(item.protein)} />
              <Field label="CARBS (g)" value={display(item.carbs)} />
              <Field label="FATS (g)" value={display(item.fats)} />
              <Field label="COOKED/RAW/DRY" value={display(item.state)} />
              <Field label="CAT" value={display(item.category)} />
            </dl>
          </li>
        ))}
      </ol>
      {result.total > result.items.length ? (
        <p className="catalog-limit">
          Showing the first {result.items.length} of {result.total} matches.
          Refine your search to narrow the list.
        </p>
      ) : null}
    </section>
  );
}
