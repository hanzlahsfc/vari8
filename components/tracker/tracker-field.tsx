import { TODO_PRODUCT_MARKER, type TrackerField } from "@/lib/daily-tracker";

/**
 * Phase 1.1 reusable field primitive. Renders a single field of the Daily
 * Tracker contract as a labelled read-only slot. The value area is deliberately
 * inert until Phase 4 persistence can bind a record to `field.key`; computed
 * fields render the source `TODO(product)` marker and never a fabricated value.
 */
export function TrackerFieldCard({ field }: { field: TrackerField }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;
  const isComputed = field.kind === "computed";
  const value = isComputed ? TODO_PRODUCT_MARKER : "Not yet recorded";

  return (
    <div className="tracker-field" data-field-key={field.key}>
      <dt className="tracker-field__label">{label}</dt>
      <dd className="tracker-field__value">
        <span
          className={
            isComputed
              ? "tracker-field__computed"
              : "tracker-field__placeholder"
          }
        >
          {value}
        </span>
        {field.hint && !isComputed ? (
          <span className="tracker-field__hint">{field.hint}</span>
        ) : null}
      </dd>
    </div>
  );
}
