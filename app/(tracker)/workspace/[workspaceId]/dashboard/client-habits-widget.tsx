"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { TodayHabitView } from "@/lib/habits/service";
import { serverTodayUtc } from "@/lib/habits/date";
import { setMyHabitLog } from "./actions";

/**
 * TL21 client adapter (HABITS-I1, decision 110) — today's scheduled
 * habits with explicit-state Mark done / Undo controls only. No skip
 * control exists (SKIPPED is modelled; the writer is deferred). Data
 * authorization is independent of the widget's dashboard placement:
 * the parent loaded this list through the boundary and every
 * transition re-authorizes server-side.
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
export function ClientHabitsWidget({
  workspaceId,
  clientProfileId,
  habits: initial,
}: {
  workspaceId: string;
  clientProfileId: string;
  habits: TodayHabitView[];
}) {
  const router = useRouter();
  const [habits, setHabits] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (habit: TodayHabitView) => {
    const desired = habit.status === "DONE" ? "CLEARED" : "DONE";
    setError(null);
    startTransition(async () => {
      const result = await safeCall(
        setMyHabitLog({
          workspaceId,
          clientProfileId,
          habitId: habit.id,
          date: serverTodayUtc(),
          desired,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The habit couldn’t be saved — try again.");
        if (result && result.code === "conflict") router.refresh();
        return;
      }
      setHabits((current) =>
        current.map((h) =>
          h.id === habit.id ? { ...h, status: result.value.status } : h,
        ),
      );
      // TL22 is server-rendered — refresh so the sibling widget picks up
      // the new done/missing counts.
      router.refresh();
    });
  };

  return (
    <div data-testid="client-habits">
      {habits.length === 0 ? (
        <p className="cc-empty" data-testid="habits-empty">
          No habits scheduled today.
        </p>
      ) : (
        <ul className="task-list">
          {habits.map((habit) => {
            const done = habit.status === "DONE";
            return (
              <li key={habit.id} className="task-list__row">
                <button
                  type="button"
                  className="task-toggle"
                  data-testid={`habit-toggle-${habit.id}`}
                  disabled={pending}
                  aria-pressed={done}
                  aria-label={`${done ? "Undo" : "Mark done"} ${habit.name}`}
                  onClick={() => toggle(habit)}
                >
                  {done ? "Undo" : "Mark done"}
                </button>
                <span className="task-copy">
                  <strong>{habit.name}</strong>
                  <small>{habit.target}</small>
                </span>
                <span
                  className={`task-state${done ? " is-done" : ""}`}
                  data-testid={`habit-state-${habit.id}`}
                >
                  {habit.status === "DONE"
                    ? "Done"
                    : habit.status === "SKIPPED"
                      ? "Skipped"
                      : "Not logged"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="form-error" role="alert" data-testid="habits-error">
          {error}
        </p>
      )}
    </div>
  );
}
