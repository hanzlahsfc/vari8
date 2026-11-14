"use client";
import { useState } from "react";
import { TimePicker } from "../../vari8/inputs";
import {
  athleteAvailabilityNote,
  DAYS,
  getDisplayConfig,
  resolvedWorkingHours,
  uid,
  validateWorkingHours,
  type WorkingHours,
} from "../model";
import { useCoach } from "../store";
import { Button, IconButton, Toggle } from "../ui";
import {
  CommittedInput,
  SettingRow,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

type RangeDraft = { key: string; start: string; end: string };
type DayDraft = { enabled: boolean; ranges: RangeDraft[] };

/** Expand the stored weekday list to all seven days for editing. */
const toDraft = (hours: WorkingHours): DayDraft[] =>
  DAYS.map((_, weekday) => {
    const day = hours.find((d) => d.weekday === weekday);
    return {
      enabled: (day?.ranges.length ?? 0) > 0,
      ranges: day?.ranges.map((r) => ({ ...r, key: uid("range") })) ?? [
        { key: uid("range"), start: "09:00", end: "18:00" },
      ],
    };
  });
const toStored = (days: DayDraft[]): WorkingHours =>
  days
    .map((day, weekday) => ({
      weekday: weekday as WorkingHours[number]["weekday"],
      ranges: day.enabled
        ? day.ranges.map(({ start, end }) => ({ start, end }))
        : [],
    }))
    .filter((d) => d.ranges.length > 0);

/** First empty hour after the day's last range, so a new range never
 * overlaps. Falls back to the hour before the first range. */
const nextRange = (day: DayDraft): RangeDraft => {
  const end = day.ranges.at(-1)?.end ?? "09:00";
  const hour = Math.min(Number(end.slice(0, 2)) + 1, 22);
  const hh = String(hour).padStart(2, "0");
  const hh2 = String(Math.min(hour + 1, 23)).padStart(2, "0");
  return { key: uid("range"), start: `${hh}:00`, end: `${hh2}:00` };
};

export function AvailabilitySettings() {
  const { state } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  const hourFormat = getDisplayConfig().hourCycle;
  const [draft, setDraft] = useState<DayDraft[] | null>(null);
  const days = draft ?? toDraft(resolvedWorkingHours(state.preferences));
  const errors = validateWorkingHours(toStored(days));

  const update = (next: DayDraft[]) => {
    const stored = toStored(next);
    const errs = validateWorkingHours(stored);
    if (errs.week || Object.keys(errs.days).length > 0) {
      setDraft(next);
      return;
    }
    setDraft(null);
    patch({ workingHours: stored });
    mark();
  };
  const setDay = (weekday: number, day: Partial<DayDraft>) =>
    update(days.map((d, i) => (i === weekday ? { ...d, ...day } : d)));
  const setRange = (
    weekday: number,
    index: number,
    range: Partial<{ start: string; end: string }>,
  ) =>
    setDay(weekday, {
      ranges: days[weekday].ranges.map((r, i) =>
        i === index ? { ...r, ...range } : r,
      ),
    });

  return (
    <SettingsCard
      id="settings-availability"
      title="Availability"
      description="Working hours athletes see in Messages and the hours feedback targets count."
      saved={saved}
    >
      {DAYS.map((name, weekday) => {
        const day = days[weekday];
        const dayError = errors.days[weekday];
        return (
          <div className="cd-settings-day" key={name}>
            <div className="cd-settings-day-head">
              <SettingRow label={name}>
                <Toggle
                  label={`${name} is a working day`}
                  checked={day.enabled}
                  onChange={(enabled) => setDay(weekday, { enabled })}
                />
              </SettingRow>
              {day.enabled && (
                <Button
                  onClick={() =>
                    update(
                      days.map((d, i) =>
                        i < 5
                          ? {
                              enabled: true,
                              ranges: day.ranges.map((r) => ({
                                ...r,
                                key: uid("range"),
                              })),
                            }
                          : d,
                      ),
                    )
                  }
                >
                  Copy to all weekdays
                </Button>
              )}
            </div>
            {day.enabled && (
              <div className="cd-settings-ranges">
                {day.ranges.map((range, index) => (
                  <div className="cd-settings-range" key={range.key}>
                    <TimePicker
                      label={`${name} range ${index + 1} start`}
                      value={range.start}
                      hourFormat={hourFormat}
                      onValueChange={(start) =>
                        setRange(weekday, index, { start })
                      }
                    />
                    <span aria-hidden="true">to</span>
                    <TimePicker
                      label={`${name} range ${index + 1} end`}
                      value={range.end}
                      hourFormat={hourFormat}
                      onValueChange={(end) => setRange(weekday, index, { end })}
                    />
                    <IconButton
                      label={`Remove ${name} range ${index + 1}`}
                      onClick={() =>
                        setDay(weekday, {
                          ranges: day.ranges.filter((_, i) => i !== index),
                        })
                      }
                    >
                      ×
                    </IconButton>
                  </div>
                ))}
                {dayError && (
                  <p className="cd-settings-error" role="alert">
                    {dayError}
                  </p>
                )}
                <Button
                  onClick={() =>
                    setDay(weekday, {
                      ranges: [...day.ranges, nextRange(day)],
                    })
                  }
                >
                  Add range
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {errors.week && (
        <p className="cd-settings-error" role="alert">
          {errors.week}
        </p>
      )}
      <CommittedInput
        label="Note for athletes"
        hint="Shown under your working hours in the athlete app."
        value={athleteAvailabilityNote(state.preferences)}
        normalize={(v) => v.trim()}
        maxLength={120}
        onCommit={(availabilityNote) => {
          patch({ availabilityNote });
          mark();
        }}
      />
    </SettingsCard>
  );
}
