"use client";

import { Popover } from "@base-ui/react/popover";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import "./date-time-fields.css";

type PickerProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
};

function usePortalContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    if (node) setContainer(node.closest(".mp-workspace") ?? node);
  }, []);
  return { container, setRoot };
}

function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="mp-dt-icon"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function DatePicker({
  value,
  onChange,
  ariaLabel,
  className,
}: PickerProps) {
  const { container, setRoot } = usePortalContainer();
  const selected = parseDate(value);
  const initial = selected ?? new Date();
  const [month, setMonth] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const [focusDate, setFocusDate] = useState(
    () => selected ?? new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const [open, setOpen] = useState(false);
  const monthStart = useMemo(
    () => new Date(month.getFullYear(), month.getMonth(), 1),
    [month],
  );
  const startOffset = (monthStart.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const gridDates = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(month.getFullYear(), month.getMonth(), index - startOffset + 1),
  );
  const moveFocus = (date: Date) => {
    setFocusDate(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };
  const changeMonth = (offset: number) => {
    const monthIndex = month.getMonth() + offset;
    const year = month.getFullYear();
    const day = Math.min(
      focusDate.getDate(),
      new Date(year, monthIndex + 1, 0).getDate(),
    );
    moveFocus(new Date(year, monthIndex, day));
  };
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = new Date(focusDate);
    if (event.key === "ArrowLeft") next.setDate(next.getDate() - 1);
    else if (event.key === "ArrowRight") next.setDate(next.getDate() + 1);
    else if (event.key === "ArrowUp") next.setDate(next.getDate() - 7);
    else if (event.key === "ArrowDown") next.setDate(next.getDate() + 7);
    else if (event.key === "Home")
      next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
    else if (event.key === "End")
      next.setDate(next.getDate() + (6 - ((next.getDay() + 6) % 7)));
    else return;
    event.preventDefault();
    moveFocus(next);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          `[data-calendar-date="${isoDate(next)}"]`,
        )
        ?.focus(),
    );
  };

  return (
    <div className={`mp-dt-root ${className ?? ""}`} ref={setRoot}>
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            const date = parseDate(value) ?? new Date();
            setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
            setFocusDate(date);
          }
        }}
      >
        <Popover.Trigger className="mp-dt-trigger" aria-label={ariaLabel}>
          <span>
            {selected
              ? selected.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Choose date"}
          </span>
          <ChevronDown size={15} aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal container={container}>
          <Popover.Positioner
            className="mp-dt-positioner"
            sideOffset={8}
            collisionPadding={12}
          >
            <Popover.Popup
              className="mp-dt-popup mp-dt-calendar"
              aria-label={ariaLabel}
            >
              <div className="mp-dt-monthbar">
                <IconButton
                  label="Previous month"
                  onClick={() => changeMonth(-1)}
                >
                  <ChevronLeft size={17} />
                </IconButton>
                <Popover.Title className="mp-dt-month-title">
                  {month.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </Popover.Title>
                <IconButton label="Next month" onClick={() => changeMonth(1)}>
                  <ChevronRight size={17} />
                </IconButton>
              </div>
              <div className="mp-dt-weekdays" aria-hidden="true">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                  <span
                    key={
                      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][index]
                    }
                  >
                    {day}
                  </span>
                ))}
              </div>
              {/* The roving-focus grid follows the ARIA calendar keyboard model. */}
              {/* biome-ignore lint/a11y/useSemanticElements: the interactive calendar uses grid arrow-key navigation. */}
              <div
                className="mp-dt-days"
                role="grid"
                aria-label={month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
                onKeyDown={onGridKeyDown}
              >
                {gridDates.map((date) => {
                  const currentMonth = date.getMonth() === month.getMonth();
                  const isSelected = selected ? isoDate(date) === value : false;
                  const isToday = isoDate(date) === isoDate(new Date());
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: a calendar gridcell is the button's intended ARIA role.
                    <button
                      key={isoDate(date)}
                      type="button"
                      role="gridcell"
                      data-calendar-date={isoDate(date)}
                      tabIndex={isoDate(date) === isoDate(focusDate) ? 0 : -1}
                      className={`mp-dt-day${currentMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                      aria-label={date.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      aria-selected={isSelected}
                      onFocus={() => setFocusDate(date)}
                      onClick={() => {
                        onChange(isoDate(date));
                        setOpen(false);
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mp-dt-calendar-foot">
                <span>{days} days</span>
                <button
                  className="mp-dt-text-action"
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    moveFocus(today);
                    onChange(isoDate(today));
                    setOpen(false);
                  }}
                >
                  Today
                </button>
                {value && (
                  <button
                    className="mp-dt-text-action"
                    type="button"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    Clear date
                  </button>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

const QUICK_TIMES = ["07:00", "08:00", "12:00", "18:00", "20:00"];

export function TimePicker({
  value,
  onChange,
  ariaLabel,
  className,
}: PickerProps) {
  const { container, setRoot } = usePortalContainer();
  const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [hours, minutes] = /^\d{2}:\d{2}$/.test(draft)
    ? draft.split(":").map(Number)
    : [7, 0];
  const setPart = (part: "hour" | "minute", raw: string) => {
    const n = Number(raw);
    const bounded = Number.isFinite(n)
      ? Math.trunc(Math.min(part === "hour" ? 23 : 59, Math.max(0, n)))
      : 0;
    setDraft(
      `${pad(part === "hour" ? bounded : hours)}:${pad(part === "minute" ? bounded : minutes)}`,
    );
  };
  const commit = (next = draft) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <div className={`mp-dt-root ${className ?? ""}`} ref={setRoot}>
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setDraft(valid ? value : "07:00");
        }}
      >
        <Popover.Trigger className="mp-dt-trigger" aria-label={ariaLabel}>
          <Clock3 size={15} aria-hidden="true" />
          <span>{valid ? value : "Choose time"}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal container={container}>
          <Popover.Positioner
            className="mp-dt-positioner"
            sideOffset={8}
            collisionPadding={12}
          >
            <Popover.Popup
              className="mp-dt-popup mp-dt-time"
              aria-label={ariaLabel}
            >
              <div className="mp-dt-time-head">
                <div>
                  <Popover.Title className="mp-dt-section-title">
                    Time
                  </Popover.Title>
                  <span>24-hour clock</span>
                </div>
                <IconButton
                  label="Close time picker"
                  onClick={() => setOpen(false)}
                >
                  <X size={16} />
                </IconButton>
              </div>
              <div className="mp-dt-time-fields">
                <label>
                  <span>Hour</span>
                  <input
                    aria-label="Hour"
                    type="number"
                    min="0"
                    max="23"
                    inputMode="numeric"
                    value={pad(hours)}
                    onChange={(event) => setPart("hour", event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <span className="mp-dt-time-colon">:</span>
                <label>
                  <span>Minute</span>
                  <input
                    aria-label="Minute"
                    type="number"
                    min="0"
                    max="59"
                    inputMode="numeric"
                    value={pad(minutes)}
                    onChange={(event) => setPart("minute", event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              </div>
              <div className="mp-dt-quick-label">Common times</div>
              <div className="mp-dt-quick-times">
                {QUICK_TIMES.map((time) => (
                  <button
                    type="button"
                    key={time}
                    className={`mp-dt-quick${draft === time ? " is-active" : ""}`}
                    onClick={() => setDraft(time)}
                  >
                    {time}
                  </button>
                ))}
              </div>
              <div className="mp-dt-time-actions">
                <button
                  className="mp-dt-text-action"
                  type="button"
                  onClick={() => commit("")}
                >
                  Clear
                </button>
                <div>
                  <button
                    className="mp-dt-cancel"
                    type="button"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="mp-dt-apply"
                    type="button"
                    onClick={() => commit(draft)}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
