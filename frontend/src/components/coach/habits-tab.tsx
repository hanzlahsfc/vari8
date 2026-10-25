"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { Section } from "@/components/vari8/layouts";
import { type CoachClient, formatDate, TODAY } from "./model";
import { habitFrequencyLabel, parseHabitFrequency } from "./plans/habits";
import { Empty } from "./ui";
import "./habits-tab.css";

type HabitFilter = "all" | "todo" | "done";

const FILTERS: { id: HabitFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "todo", label: "To do" },
  { id: "done", label: "Done" },
];

function weekDates(today: string) {
  const anchor = new Date(`${today}T12:00:00Z`);
  const monday = new Date(anchor);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) =>
    new Date(monday.getTime() + index * 86_400_000).toISOString().slice(0, 10),
  );
}

export function HabitsTab({
  client,
  done,
  onToggle,
}: {
  client: CoachClient;
  done: Record<string, boolean>;
  onToggle: (habitId: string) => void;
}) {
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<HabitFilter>("all");
  const week = useMemo(() => weekDates(TODAY), []);
  const doneCount = client.habits.filter((habit) => done[habit.id]).length;
  const visible = client.habits.filter((habit) =>
    filter === "all"
      ? true
      : filter === "done"
        ? done[habit.id]
        : !done[habit.id],
  );

  if (!client.habits.length)
    return (
      <Empty title="No habits set up">
        Habits are defined in client setup.
      </Empty>
    );

  return (
    <Section
      className="cd-preview-section cd-habits"
      title="Habits"
      description={
        <>
          <time dateTime={TODAY}>
            {formatDate(TODAY, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </time>
          {" · "}
          {doneCount} of {client.habits.length} checked today
        </>
      }
      actions={
        <ol className="cd-habits-week" aria-label="This week">
          {week.map((date) => (
            <li
              key={date}
              className={date === TODAY ? "is-today" : undefined}
              aria-current={date === TODAY ? "date" : undefined}
            >
              <span>
                {new Intl.DateTimeFormat("en-GB", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(`${date}T12:00:00Z`))}
              </span>
              <strong>
                {String(new Date(`${date}T12:00:00Z`).getUTCDate())}
              </strong>
            </li>
          ))}
        </ol>
      }
    >
      <div className="cd-habits-filters">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={filter === option.id ? "active" : ""}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="cd-habits-layout">
        <div className="cd-habits-list" aria-live="polite">
          {visible.length === 0 ? (
            <div className="cd-habits-empty">
              <strong>
                {filter === "done"
                  ? "Nothing checked off yet today"
                  : "Everything is done for today"}
              </strong>
              <p className="cd-muted">
                {filter === "done"
                  ? "Checked habits will appear here."
                  : "All of today’s habits are checked."}
              </p>
              <button
                type="button"
                className="cd-habits-reset"
                onClick={() => setFilter("all")}
              >
                Show all habits
              </button>
            </div>
          ) : (
            visible.map((habit) => {
              const isDone = Boolean(done[habit.id]);
              return (
                <article className="cd-habit-row" key={habit.id}>
                  <button
                    type="button"
                    className={`cd-habit-toggle${isDone ? " is-done" : ""}`}
                    aria-pressed={isDone}
                    aria-label={`${habit.name}, ${isDone ? "done today" : "not checked today"}. Toggle.`}
                    onClick={() => onToggle(habit.id)}
                  >
                    {isDone && (
                      <motion.span
                        className="cd-habit-check"
                        initial={
                          reduced
                            ? { opacity: 0 }
                            : { opacity: 0, transform: "scale(.9)" }
                        }
                        animate={
                          reduced
                            ? { opacity: 1 }
                            : { opacity: 1, transform: "scale(1)" }
                        }
                        transition={{
                          type: "spring",
                          bounce: 0,
                          duration: 0.3,
                        }}
                      >
                        <Check size={18} aria-hidden="true" />
                      </motion.span>
                    )}
                  </button>
                  <div className="cd-habit-info">
                    <strong>{habit.name}</strong>
                    <small>
                      {habitFrequencyLabel(
                        parseHabitFrequency(habit.frequency),
                      )}{" "}
                      · {habit.goal}
                    </small>
                    <p>{habit.reason}</p>
                  </div>
                  <span className={`cd-habit-state${isDone ? " is-done" : ""}`}>
                    {isDone ? "Done today" : "Not checked today"}
                  </span>
                </article>
              );
            })
          )}
        </div>

        <aside className="cd-habits-summary" aria-label="Recorded completions">
          <h3>Recorded completions</h3>
          <ul>
            {client.habits.map((habit) => (
              <li key={habit.id}>
                <strong>{habit.name}</strong>
                <span>
                  {habit.completed}{" "}
                  {habit.completed === 1 ? "completion" : "completions"} ·{" "}
                  {habitFrequencyLabel(parseHabitFrequency(habit.frequency))} ·{" "}
                  {habit.goal}
                </span>
              </li>
            ))}
          </ul>
          <p className="cd-habits-note">
            Recorded totals are shown here; dated habit history is not
            available.
          </p>
        </aside>
      </div>
    </Section>
  );
}
