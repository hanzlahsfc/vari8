"use client";

import { useEffect, useState, useTransition } from "react";

import type { TaskView } from "@/lib/tasks/service";
import { formatTaskDueDate } from "@/lib/tasks/date";
import {
  readClientTasks,
  assignClientTask,
  editClientTask,
  cancelClientTask,
} from "./actions";

/**
 * CLIENT-TASKS-I1 staff surface — owners/assigned coaches manage;
 * assistants see the same list read-only. `canEdit` mirrors the page's
 * dashboard write scope; every action re-authorizes server-side.
 *
 * Action calls are wrapped: a network-faulted POST (transient failure,
 * killed request) rejects the promise — surfacing that as an unhandled
 * rejection inside a transition would take the whole route down, so it
 * degrades to the same non-disclosing error path instead.
 */
async function safeCall<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
export function ClientTasksPanel({
  workspaceId,
  clientProfileId,
  canEdit,
}: {
  workspaceId: string;
  clientProfileId: string;
  canEdit: boolean;
}) {
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [pending, startTransition] = useTransition();

  const load = () =>
    startTransition(async () => {
      const result = await safeCall(
        readClientTasks({ workspaceId, clientProfileId }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "Tasks couldn’t be loaded — retry.");
        setTasks([]);
        return;
      }
      setTasks(result.value.tasks);
      setHasMore(result.value.hasMore);
    });

  useEffect(() => {
    load();
    // `load` is recreated per render; the effect keys off the inputs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, clientProfileId]);

  const assign = () =>
    startTransition(async () => {
      setError(null);
      const result = await safeCall(
        assignClientTask({
          workspaceId,
          clientProfileId,
          title,
          dueDate,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The task couldn’t be saved.");
        return;
      }
      setTitle("");
      setDueDate("");
      load();
    });

  const saveEdit = (task: TaskView) =>
    startTransition(async () => {
      setError(null);
      const result = await safeCall(
        editClientTask({
          workspaceId,
          clientProfileId,
          taskId: task.id,
          title: editTitle,
          dueDate: editDue,
          expectedRevision: task.revision,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The task couldn’t be saved.");
        if (result && result.code === "conflict") load();
        return;
      }
      setEditingId(null);
      load();
    });

  const cancel = (task: TaskView) =>
    startTransition(async () => {
      setError(null);
      const result = await safeCall(
        cancelClientTask({
          workspaceId,
          clientProfileId,
          taskId: task.id,
          expectedRevision: task.revision,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The task couldn’t be saved.");
        if (result && result.code === "conflict") load();
        return;
      }
      load();
    });

  return (
    <section className="catalog-card" data-testid="staff-tasks">
      <h2 className="catalog-card__title">Client tasks</h2>
      {canEdit && (
        <form
          className="task-assign"
          onSubmit={(e) => {
            e.preventDefault();
            assign();
          }}
        >
          <input
            data-testid="task-title-input"
            aria-label="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Task for the client"
            required
          />
          <input
            data-testid="task-due-input"
            aria-label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
          <button
            type="submit"
            className="button-secondary"
            data-testid="task-assign-btn"
            disabled={pending}
          >
            Assign task
          </button>
        </form>
      )}
      {tasks === null ? (
        <p data-testid="tasks-loading">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="cc-empty" data-testid="staff-tasks-empty">
          No tasks yet.
        </p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) =>
            editingId === task.id ? (
              <li key={task.id} className="task-list__row">
                <input
                  aria-label="Edit title"
                  data-testid={`task-edit-title-${task.id}`}
                  maxLength={120}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <input
                  aria-label="Edit due date"
                  type="date"
                  data-testid={`task-edit-due-${task.id}`}
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                />
                <button
                  type="button"
                  data-testid={`task-edit-save-${task.id}`}
                  onClick={() => saveEdit(task)}
                  disabled={pending}
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </li>
            ) : (
              <li key={task.id} className="task-list__row">
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
                  className={`task-state${task.status === "COMPLETED" ? " is-done" : ""}`}
                  data-testid={`staff-task-state-${task.id}`}
                >
                  {task.status === "CANCELLED"
                    ? "Cancelled"
                    : task.status === "COMPLETED"
                      ? "Done"
                      : "Open"}
                </span>
                {canEdit && task.status === "OPEN" && (
                  <>
                    <button
                      type="button"
                      data-testid={`task-edit-btn-${task.id}`}
                      onClick={() => {
                        setEditingId(task.id);
                        setEditTitle(task.title);
                        setEditDue(task.dueDate);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      data-testid={`task-cancel-btn-${task.id}`}
                      onClick={() => cancel(task)}
                    >
                      Cancel task
                    </button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {hasMore && <p className="cc-hint">More tasks exist beyond this view.</p>}
      {error && (
        <p className="form-error" role="alert" data-testid="staff-tasks-error">
          {error}
        </p>
      )}
    </section>
  );
}
