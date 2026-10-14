"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { TaskView } from "@/lib/tasks/service";
import { formatTaskDueDate } from "@/lib/tasks/date";
import { setMyTaskCompletion } from "./actions";

/**
 * CU03 client adapter — real projected tasks with explicit-state
 * Mark done / Undo controls. Data authorization is independent of the
 * widget's dashboard placement: the parent loaded this list through the
 * boundary and every transition re-authorizes server-side.
 *
 * Action calls are wrapped: a network-faulted POST rejects the promise —
 * surfacing that inside a transition would take the route down, so it
 * degrades to the same truthful error path instead.
 */
async function safeCall<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
export function ClientTasksWidget({
  workspaceId,
  clientProfileId,
  tasks: initial,
}: {
  workspaceId: string;
  clientProfileId: string;
  tasks: TaskView[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (task: TaskView) => {
    const desired = task.status === "COMPLETED" ? "OPEN" : "COMPLETED";
    setError(null);
    startTransition(async () => {
      const result = await safeCall(
        setMyTaskCompletion({
          workspaceId,
          clientProfileId,
          taskId: task.id,
          desired,
          expectedRevision: task.revision,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The task couldn’t be saved — try again.");
        if (result && result.code === "conflict") router.refresh();
        return;
      }
      setTasks((current) =>
        current.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: result.value.status,
                revision: result.value.revision,
                completedAt:
                  result.value.status === "COMPLETED"
                    ? new Date().toISOString()
                    : null,
              }
            : t,
        ),
      );
    });
  };

  return (
    <div data-testid="client-tasks">
      {tasks.length === 0 ? (
        <p className="cc-empty" data-testid="tasks-empty">
          No tasks right now.
        </p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => {
            const done = task.status === "COMPLETED";
            return (
              <li key={task.id} className="task-list__row">
                <button
                  type="button"
                  className="task-toggle"
                  data-testid={`task-toggle-${task.id}`}
                  disabled={pending}
                  aria-pressed={done}
                  aria-label={`${done ? "Undo" : "Mark done"} ${task.title}`}
                  onClick={() => toggle(task)}
                >
                  {done ? "Undo" : "Mark done"}
                </button>
                <span className="task-copy">
                  <strong>{task.title}</strong>
                  <small>
                    Due {formatTaskDueDate(task.dueDate)}
                    {task.status === "OPEN" && task.dueState === "overdue" ? (
                      <em className="task-overdue"> — overdue</em>
                    ) : null}
                  </small>
                </span>
                <span
                  className={`task-state${done ? " is-done" : ""}`}
                  data-testid={`task-state-${task.id}`}
                >
                  {done ? "Done" : "Open"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="form-error" role="alert" data-testid="tasks-error">
          {error}
        </p>
      )}
    </div>
  );
}
