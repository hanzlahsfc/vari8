"use client";

import { useEffect, useState, useTransition } from "react";

import type { HabitView } from "@/lib/habits/service";
import { serverTodayUtc } from "@/lib/habits/date";
import {
  readClientHabits,
  createClientHabit,
  editClientHabit,
  archiveClientHabit,
  readClientHabitConsistency,
} from "./actions";

/**
 * HABITS-I1 staff surface (decision 110) — owners/assigned coaches
 * manage habit metadata + schedules; assistants see the same list
 * read-only. `canEdit` mirrors the page's dashboard write scope; every
 * action re-authorizes server-side. Staff never see a client log
 * control — completion belongs to the client only.
 *
 * Schedule edits and archive take effect at server-UTC tomorrow; the
 * boundary date is computed server-side, never supplied here.
 */
const WEEKDAYS: { bit: number; label: string }[] = [
  { bit: 1, label: "Mon" },
  { bit: 2, label: "Tue" },
  { bit: 4, label: "Wed" },
  { bit: 8, label: "Thu" },
  { bit: 16, label: "Fri" },
  { bit: 32, label: "Sat" },
  { bit: 64, label: "Sun" },
];

function maskFrom(set: ReadonlySet<number>): number {
  let m = 0;
  for (const b of set) m |= b;
  return m;
}

function maskToSet(mask: number): Set<number> {
  const s = new Set<number>();
  for (const { bit } of WEEKDAYS) if (mask & bit) s.add(bit);
  return s;
}

function WeekdayPicker({
  value,
  onChange,
  prefix,
}: {
  value: Set<number>;
  onChange: (next: Set<number>) => void;
  prefix: string;
}) {
  return (
    <div data-testid={`${prefix}-weekdays`}>
      {WEEKDAYS.map(({ bit, label }) => (
        <label key={bit}>
          <input
            type="checkbox"
            checked={value.has(bit)}
            aria-label={`${prefix} ${label}`}
            onChange={(e) => {
              const next = new Set(value);
              if (e.target.checked) next.add(bit);
              else next.delete(bit);
              onChange(next);
            }}
          />{" "}
          {label}
        </label>
      ))}
    </div>
  );
}

async function safeCall<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export function ClientHabitsPanel({
  workspaceId,
  clientProfileId,
  canEdit,
}: {
  workspaceId: string;
  clientProfileId: string;
  canEdit: boolean;
}) {
  const [habits, setHabits] = useState<HabitView[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [startDate, setStartDate] = useState(serverTodayUtc());
  const [days, setDays] = useState<Set<number>>(new Set());
  const [endDate, setEndDate] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editDays, setEditDays] = useState<Set<number>>(new Set());
  const [editEnd, setEditEnd] = useState("");

  const [consistency, setConsistency] = useState<string | null>(null);

  const load = () =>
    startTransition(async () => {
      const result = await safeCall(
        readClientHabits({ workspaceId, clientProfileId }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "Habits couldn’t be loaded — retry.");
        setHabits([]);
        return;
      }
      setHabits(result.value.habits);
      setHasMore(result.value.hasMore);
      const c = await safeCall(
        readClientHabitConsistency({
          workspaceId,
          clientProfileId,
          period: "7d",
        }),
      );
      setConsistency(
        c && c.ok
          ? `${c.value.totals.done} of ${c.value.totals.scheduled} done this week`
          : null,
      );
    });

  useEffect(() => {
    load();
    // `load` is recreated per render; the effect keys off the inputs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, clientProfileId]);

  const create = () =>
    startTransition(async () => {
      setError(null);
      const result = await safeCall(
        createClientHabit({
          workspaceId,
          clientProfileId,
          name,
          target,
          startDate,
          weekdays: maskFrom(days),
          endDate: endDate || null,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The habit couldn’t be saved.");
        return;
      }
      setName("");
      setTarget("");
      setDays(new Set());
      setEndDate("");
      load();
    });

  const saveEdit = (habit: HabitView) =>
    startTransition(async () => {
      setError(null);
      const result = await safeCall(
        editClientHabit({
          workspaceId,
          clientProfileId,
          habitId: habit.id,
          name: editName,
          target: editTarget,
          schedule: {
            weekdays: maskFrom(editDays),
            endDate: editEnd || null,
          },
          expectedRevision: habit.revision,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The habit couldn’t be saved.");
        if (result && result.code === "conflict") load();
        return;
      }
      setEditingId(null);
      load();
    });

  const archive = (habit: HabitView) =>
    startTransition(async () => {
      setError(null);
      const result = await safeCall(
        archiveClientHabit({
          workspaceId,
          clientProfileId,
          habitId: habit.id,
          expectedRevision: habit.revision,
        }),
      );
      if (!result || !result.ok) {
        setError(result?.message ?? "The habit couldn’t be archived.");
        if (result && result.code === "conflict") load();
        return;
      }
      load();
    });

  return (
    <section className="catalog-card" data-testid="staff-habits">
      <h2 className="catalog-card__title">Client habits</h2>
      {consistency && (
        <p className="cc-hint" data-testid="staff-consistency">
          {consistency}
        </p>
      )}
      {canEdit && (
        <form
          className="task-assign"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            data-testid="habit-name-input"
            aria-label="Habit name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Habit"
            required
          />
          <input
            data-testid="habit-target-input"
            aria-label="Habit target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            maxLength={120}
            placeholder="Target"
            required
          />
          <input
            data-testid="habit-start-input"
            aria-label="Start date"
            type="date"
            value={startDate}
            min={serverTodayUtc()}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <WeekdayPicker
            value={days}
            onChange={setDays}
            prefix="habit-create"
          />
          <input
            data-testid="habit-end-input"
            aria-label="End date (optional)"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button
            type="submit"
            className="button-secondary"
            data-testid="habit-create-btn"
            disabled={pending || days.size === 0}
          >
            Add habit
          </button>
        </form>
      )}
      {habits === null ? (
        <p data-testid="habits-loading">Loading…</p>
      ) : habits.length === 0 ? (
        <p className="cc-empty" data-testid="staff-habits-empty">
          No habits yet.
        </p>
      ) : (
        <ul className="task-list">
          {habits.map((habit) =>
            editingId === habit.id ? (
              <li key={habit.id} className="task-list__row">
                <input
                  aria-label="Edit habit name"
                  data-testid={`habit-edit-name-${habit.id}`}
                  maxLength={120}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <input
                  aria-label="Edit habit target"
                  data-testid={`habit-edit-target-${habit.id}`}
                  maxLength={120}
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                />
                <WeekdayPicker
                  value={editDays}
                  onChange={setEditDays}
                  prefix={`habit-edit-${habit.id}`}
                />
                <input
                  aria-label="Edit end date"
                  type="date"
                  data-testid={`habit-edit-end-${habit.id}`}
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
                <button
                  type="button"
                  data-testid={`habit-edit-save-${habit.id}`}
                  onClick={() => saveEdit(habit)}
                  disabled={pending || editDays.size === 0}
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </li>
            ) : (
              <li key={habit.id} className="task-list__row">
                <span className="task-copy">
                  <strong>{habit.name}</strong>
                  <small>
                    {habit.target}
                    {habit.archived ? " — archived" : ""}
                  </small>
                </span>
                <span
                  className={`task-state${habit.archived ? "" : " is-done"}`}
                  data-testid={`staff-habit-state-${habit.id}`}
                >
                  {habit.archived ? "Archived" : "Active"}
                </span>
                {canEdit && !habit.archived && (
                  <>
                    <button
                      type="button"
                      data-testid={`habit-edit-btn-${habit.id}`}
                      onClick={() => {
                        setEditingId(habit.id);
                        setEditName(habit.name);
                        setEditTarget(habit.target);
                        setEditDays(maskToSet(habit.schedule?.weekdays ?? 0));
                        setEditEnd(habit.schedule?.endDate ?? "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      data-testid={`habit-archive-btn-${habit.id}`}
                      onClick={() => archive(habit)}
                    >
                      Archive
                    </button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {hasMore && (
        <p className="cc-hint">More habits exist beyond this view.</p>
      )}
      {error && (
        <p className="form-error" role="alert" data-testid="staff-habits-error">
          {error}
        </p>
      )}
    </section>
  );
}
