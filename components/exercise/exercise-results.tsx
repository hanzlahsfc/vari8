import {
  EXERCISE_SEARCH_MIN_QUERY_LENGTH,
  type ExerciseSearchResult,
} from "@/lib/exercise/search";

/**
 * Phase 2.2 Exercise catalog results. Server-rendered and source-backed: each
 * item shows the verbatim source fields for one imported exercise row.
 * `VIDEO LINK` is rendered as text — the source stores a URL string and the
 * catalog does not invent link behavior.
 */

const dash = "—";

function display(value: string | null): string {
  if (value === null) return dash;
  return value;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="catalog-field">
      <dt className="catalog-field__label">{label}</dt>
      <dd className="catalog-field__value">{value}</dd>
    </div>
  );
}

export function ExerciseResults({ result }: { result: ExerciseSearchResult }) {
  if (!result.queryApplied) {
    return (
      <p className="catalog-empty" data-testid="exercise-empty" role="status">
        Enter at least {EXERCISE_SEARCH_MIN_QUERY_LENGTH} characters to search
        the Exercise Database.
      </p>
    );
  }

  if (result.total === 0) {
    const facets = [
      result.muscleGroup ? `Muscle Group ${result.muscleGroup}` : "",
      result.equipment ? `Equipment ${result.equipment}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <p className="catalog-empty" data-testid="exercise-empty" role="status">
        No exercises match “{result.query}”{facets ? ` (${facets})` : ""}.
      </p>
    );
  }

  const activeFacets = [
    result.muscleGroup ? `MUSCLE GROUP ${result.muscleGroup}` : "",
    result.equipment ? `EQUIPMENT ${result.equipment}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className="catalog-results"
      data-testid="exercise-results"
      aria-labelledby="exercise-results-heading"
    >
      <h2 id="exercise-results-heading" className="catalog-results__count">
        {result.total} {result.total === 1 ? "match" : "matches"} — showing{" "}
        {result.items.length}
        {activeFacets ? ` · ${activeFacets}` : ""}
      </h2>
      <ol className="catalog-list">
        {result.items.map((item) => (
          <li
            className="catalog-item"
            key={item.id}
            data-testid="exercise-item"
            data-source-id={item.sourceId}
          >
            <h3 className="catalog-item__name">{item.name}</h3>
            <dl className="catalog-item__fields">
              <Field label="ID" value={display(String(item.sourceId))} />
              <Field label="MUSCLE GROUP" value={display(item.muscleGroup)} />
              <Field
                label="PRIMARY TARGET"
                value={display(item.primaryTarget)}
              />
              <Field
                label="ADDITIONAL TARGET(S)"
                value={display(item.additionalTargets)}
              />
              <Field label="EQUIPMENT" value={display(item.equipment)} />
              <Field
                label="MOVEMENT PATTERN"
                value={display(item.movementPattern)}
              />
              <Field
                label="POSITION / SETUP"
                value={display(item.positionSetup)}
              />
              <Field label="COACHING NOTES / CUES" value={display(item.cues)} />
              <Field label="VIDEO LINK" value={display(item.videoLink)} />
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
