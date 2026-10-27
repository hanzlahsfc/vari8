"use client";

// Card w2-c5: the client tasks surface. Presentational only - callers
// pass normalized rows and receive toggle intents back. The canvas twin
// feeds the own-scope /api/v1 task list and PATCHes completion; the
// standalone demo feeds fixture records from the client model.

import { Empty } from "../coach/ui";
import { dateLabel } from "../ethereal/builder/model";

export type ClientTaskRow = {
  id: string;
  title: string;
  /** ISO date part (`YYYY-MM-DD`), formatted with dateLabel. */
  dueDate: string;
  complete: boolean;
  dueState?: "overdue" | "due-today" | "upcoming";
};

function stateLabel(row: ClientTaskRow): string {
  if (row.complete) return "Done";
  if (row.dueState === "overdue") return "Overdue";
  if (row.dueState === "due-today") return "Due today";
  return "Open";
}

export function ClientTasks({
  rows,
  busyIds,
  onToggle,
}: {
  rows: ClientTaskRow[];
  /** Ids with a completion write in flight; their toggles stay disabled. */
  busyIds?: ReadonlySet<string>;
  onToggle?: (id: string, complete: boolean) => void;
}) {
  return (
    <section className="cd-preview-section" aria-label="Tasks">
      <h2>Tasks</h2>
      {rows.length === 0 ? (
        <Empty title="No tasks assigned">
          Tasks your coach assigns appear here.
        </Empty>
      ) : (
        <ul className="ca-tasks">
          {rows.map((row) => {
            const busy = busyIds?.has(row.id) === true;
            const state = row.complete ? "done" : (row.dueState ?? "open");
            return (
              <li className="ca-task" data-state={state} key={row.id}>
                <button
                  aria-label={`${row.complete ? "Undo" : "Complete"} ${row.title}`}
                  aria-pressed={row.complete}
                  className="ca-task-toggle"
                  disabled={busy || !onToggle}
                  onClick={() => onToggle?.(row.id, !row.complete)}
                  type="button"
                >
                  <span aria-hidden="true" className="ca-task-check" />
                </button>
                <span className="ca-task-body">
                  <span className="ca-task-title">{row.title}</span>
                  <span className="ca-task-meta">
                    {dateLabel(row.dueDate, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {" · "}
                    {busy ? "Saving…" : stateLabel(row)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
