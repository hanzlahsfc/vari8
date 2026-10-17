import type {
  MaterializedExercise,
  MaterializedSession,
} from "@/lib/trainingprogram/payload";

/**
 * TRAINING-I1A (PROMPT 244) — shared read-only renderer for a
 * materialized program week (staff version detail AND client current
 * view). Values render VERBATIM exactly as stored — nothing is
 * calculated: no volume, no totals, no progression. Hidden fields are
 * already absent from the projection — this component renders whatever
 * keys are present.
 */

const FIELD_ROWS: readonly {
  key: keyof MaterializedExercise;
  label: string;
}[] = [
  { key: "sets", label: "Sets" },
  { key: "reps", label: "Reps" },
  { key: "tempo", label: "Tempo" },
  { key: "setType", label: "Set type" },
  { key: "rest", label: "Rest / pause" },
  { key: "instructions", label: "Instructions" },
  { key: "progressionNotes", label: "Progression notes" },
  { key: "note", label: "Note" },
];

function ExerciseBlock({
  exercise,
  testidPrefix,
}: {
  exercise: MaterializedExercise;
  testidPrefix: string;
}) {
  const filled = FIELD_ROWS.filter(({ key }) => exercise[key] !== undefined);
  return (
    <div className="tracker-list__row" data-testid={`${testidPrefix}-exercise`}>
      <span className="tracker-list__title">{exercise.name}</span>
      {filled.length === 0 ? (
        <span className="tracker-list__sub">No prescription entered.</span>
      ) : (
        <dl className="tracker-list__sub">
          {filled.map(({ key, label }) => (
            <span key={key} data-testid={`${testidPrefix}-${key}`}>
              {label}: {String(exercise[key])}
              {"  "}
            </span>
          ))}
        </dl>
      )}
    </div>
  );
}

export function SessionBlock({
  session,
  testidPrefix,
}: {
  session: MaterializedSession;
  testidPrefix: string;
}) {
  return (
    <section
      className="tracker-section"
      data-testid={`${testidPrefix}-session`}
      aria-label={session.name}
    >
      <h3 className="tracker-section__title">{session.name}</h3>
      {session.exercises.length === 0 ? (
        <p className="app-lede">No exercises in this session.</p>
      ) : (
        <ol className="tracker-list" data-testid={`${testidPrefix}-exercises`}>
          {session.exercises.map((exercise, i) => (
            <li key={exercise.id || i}>
              <ExerciseBlock
                exercise={exercise}
                testidPrefix={`${testidPrefix}-e${i}`}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ProgramWeekView({
  week,
  weekIndex,
  sessions,
  testidPrefix,
}: {
  week: number;
  weekIndex?: number;
  sessions: MaterializedSession[];
  testidPrefix: string;
}) {
  return (
    <div data-testid={`${testidPrefix}-week`}>
      <p className="app-lede" data-testid={`${testidPrefix}-week-label`}>
        Week {week}
        {weekIndex !== undefined ? ` of ${weekIndex}` : ""}
      </p>
      {sessions.length === 0 ? (
        <p className="app-lede">No sessions prescribed this week.</p>
      ) : (
        sessions.map((session, i) => (
          <SessionBlock
            key={session.id || i}
            session={session}
            testidPrefix={`${testidPrefix}-s${i}`}
          />
        ))
      )}
    </div>
  );
}
