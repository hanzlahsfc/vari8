import type { TrackerSection as TrackerSectionContract } from "@/lib/daily-tracker";

import { TrackerFieldCard } from "./tracker-field";

/**
 * Phase 1.1 reusable section primitive: a labelled landmark that groups the
 * verified fields of one PRGRSS Daily Tracker section. It is intentionally
 * data-free — Phase 4 binds a persisted record to `section.id`/`field.key`.
 */
export function TrackerSection({
  section,
}: {
  section: TrackerSectionContract;
}) {
  const headingId = `${section.id}-heading`;

  return (
    <section
      className="tracker-section"
      id={section.id}
      data-testid="tracker-section"
      data-section-id={section.id}
      aria-labelledby={headingId}
    >
      <header className="tracker-section__header">
        <h2 className="tracker-section__title" id={headingId}>
          {section.name}
        </h2>
        {section.requires?.includes("cycleConsent") ? (
          <span className="tracker-section__badge">
            Requires cycle-data consent
          </span>
        ) : null}
      </header>
      {section.note ? (
        <p className="tracker-section__note">{section.note}</p>
      ) : null}
      <dl className="tracker-fields">
        {section.fields.map((field) => (
          <TrackerFieldCard key={field.key} field={field} />
        ))}
      </dl>
    </section>
  );
}
