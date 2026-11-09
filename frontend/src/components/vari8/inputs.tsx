"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Popover } from "@base-ui/react/popover";
import { Select as BaseSelect } from "@base-ui/react/select";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import {
  type Ref,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  type ControlSize,
  Select,
} from "@/components/vari8/components";
import {
  type CalendarDate,
  daysInMonth,
  formatCalendarDate,
  isoWeeksInYear,
  normalizeTimePart,
  parseCalendarDate,
  parseTimeValue,
} from "@/components/vari8/date-utils";
import { isPointerOverlayEvent } from "./overlay-motion.mjs";
import "./inputs.css";

type SharedFieldProps = {
  label: string;
  /** Visually hide the label while keeping it for assistive tech. */
  hideLabel?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  id?: string;
  name?: string;
  size?: ControlSize;
};

export type TextAreaProps = {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  size?: ControlSize;
  labelClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  labelClassName,
  size = "md",
  ref,
  ...props
}: TextAreaProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <div className="v8-field">
      <label
        className={["v8-field__label", labelClassName]
          .filter(Boolean)
          .join(" ")}
        htmlFor={controlId}
      >
        {label}
      </label>
      {hint && (
        <span className="v8-field__hint" id={`${controlId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span
          className="v8-field__error"
          id={`${controlId}-error`}
          role="alert"
        >
          {error}
        </span>
      )}
      <textarea
        {...props}
        ref={ref}
        id={controlId}
        className={`v8-textarea ${className ?? ""}`}
        data-size={size}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={
          [
            props["aria-describedby"],
            hint && `${controlId}-hint`,
            error && `${controlId}-error`,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
    </div>
  );
}

export type SearchableSelectProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  hint?: string;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  size?: ControlSize;
};

export function SearchableSelect({
  label,
  value,
  onValueChange,
  options,
  hint,
  error,
  disabled,
  readOnly,
  required,
  name,
  id: providedId,
  size = "md",
}: SearchableSelectProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <div
      className="v8-field"
      ref={(node) => {
        if (node)
          setContainer(
            node.closest("dialog") ?? node.closest(".v8-theme") ?? node,
          );
      }}
    >
      <label className="v8-field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="v8-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
      <Combobox.Root
        items={options.map((option) => option.value)}
        readOnly={readOnly}
        disabled={disabled}
        required={required}
        name={name}
        value={value}
        itemToStringLabel={(item) =>
          options.find((option) => option.value === item)?.label ?? item
        }
        onValueChange={(next) =>
          typeof next === "string" && onValueChange(next)
        }
        autoHighlight
      >
        <Combobox.Input
          id={id}
          className="v8-input v8-searchable-input"
          data-size={size}
          placeholder="Search options"
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <Combobox.Portal container={container ?? undefined}>
          <Combobox.Positioner
            className="v8-select-positioner"
            positionMethod="fixed"
            sideOffset={6}
            collisionPadding={12}
          >
            <Combobox.Popup className="v8-select-popup">
              <Combobox.List>
                {(item: string) => {
                  const option = options.find(
                    (candidate) => candidate.value === item,
                  );
                  if (!option) return null;
                  return (
                    <Combobox.Item
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      className="v8-select-option"
                    >
                      {option.label}
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
              <Combobox.Empty className="v8-combobox-empty">
                No matching options
              </Combobox.Empty>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}

export function MultiSelect({
  label,
  value,
  onValueChange,
  options,
  disabled,
  hint,
  error,
  readOnly,
  required,
  name,
  size = "md",
}: {
  label: string;
  value: string[];
  onValueChange: (value: string[]) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  hint?: string;
  error?: string;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  size?: ControlSize;
}) {
  const id = useId();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const summary = value
    .map(
      (selected) => options.find((option) => option.value === selected)?.label,
    )
    .filter(Boolean)
    .join(", ");
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div
      className="v8-field"
      ref={(node) => {
        if (node)
          setContainer(
            node.closest("dialog") ?? node.closest(".v8-theme") ?? node,
          );
      }}
    >
      <label className="v8-field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="v8-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
      <BaseSelect.Root
        multiple
        name={name}
        required={required}
        value={value}
        onValueChange={(next) => Array.isArray(next) && onValueChange(next)}
        items={options}
        disabled={disabled}
        readOnly={readOnly}
      >
        <BaseSelect.Trigger
          id={id}
          className="v8-select"
          data-size={size}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [hintId, errorId].filter(Boolean).join(" ") || undefined
          }
          aria-label={`${label}${summary ? `, ${summary}` : ""}`}
        >
          <span>{summary || "Choose options"}</span>
          <BaseSelect.Icon className="v8-select__icon">
            <ChevronDown size={15} aria-hidden="true" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal container={container ?? undefined}>
          <BaseSelect.Positioner
            className="v8-select-positioner"
            positionMethod="fixed"
            alignItemWithTrigger={false}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            collisionAvoidance={{
              side: "flip",
              align: "shift",
              fallbackAxisSide: "none",
            }}
          >
            <BaseSelect.Popup className="v8-select-popup">
              <BaseSelect.List>
                {options.map((option) => (
                  <BaseSelect.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="v8-select-option"
                  >
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator aria-hidden="true">
                      ✓
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}

const todayDate = (): CalendarDate => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
};
const addDays = (date: CalendarDate, amount: number): CalendarDate => {
  const next = new Date(date.year, date.month - 1, date.day + amount);
  return {
    year: next.getFullYear(),
    month: next.getMonth() + 1,
    day: next.getDate(),
  };
};
const mondayOffset = (year: number, month: number) =>
  (new Date(year, month - 1, 1).getDay() + 6) % 7;

function usePortalContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    if (node)
      setContainer(node.closest("dialog") ?? node.closest(".v8-theme") ?? node);
  }, []);
  return { container, setRoot };
}

export function DatePicker({
  label,
  hideLabel,
  value,
  onValueChange,
  hint,
  error,
  disabled,
  required,
  readOnly,
  name,
  size = "md",
  id,
}: SharedFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const selected = parseCalendarDate(value);
  const todayIso = formatCalendarDate(todayDate());
  const initial = selected ?? todayDate();
  const [month, setMonth] = useState({
    year: initial.year,
    month: initial.month,
  });
  const [focus, setFocus] = useState(initial);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [pendingFocusDate, setPendingFocusDate] = useState<string | null>(null);
  const { container, setRoot } = usePortalContainer();
  const first = useMemo(
    () => ({ year: month.year, month: month.month, day: 1 }),
    [month],
  );
  const cells = Array.from({ length: 42 }, (_, index) =>
    addDays(first, index - mondayOffset(month.year, month.month)),
  );
  const move = (next: CalendarDate) => {
    setPendingFocusDate(formatCalendarDate(next));
    setFocus(next);
    setMonth({ year: next.year, month: next.month });
  };
  const moveMonth = (delta: number) => {
    const next = new Date(
      month.year,
      month.month - 1 + delta,
      Math.min(
        focus.day,
        new Date(month.year, month.month + delta, 0).getDate(),
      ),
    );
    const nextDate = {
      year: next.getFullYear(),
      month: next.getMonth() + 1,
      day: next.getDate(),
    };
    setPendingFocusDate(null);
    setFocus(nextDate);
    setMonth({ year: nextDate.year, month: nextDate.month });
  };
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = focus;
    if (event.key === "ArrowLeft") next = addDays(focus, -1);
    else if (event.key === "ArrowRight") next = addDays(focus, 1);
    else if (event.key === "ArrowUp") next = addDays(focus, -7);
    else if (event.key === "ArrowDown") next = addDays(focus, 7);
    else if (event.key === "Home")
      next = addDays(
        focus,
        -((new Date(focus.year, focus.month - 1, focus.day).getDay() + 6) % 7),
      );
    else if (event.key === "End")
      next = addDays(
        focus,
        6 -
          ((new Date(focus.year, focus.month - 1, focus.day).getDay() + 6) % 7),
      );
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const delta = event.key === "PageUp" ? -1 : 1;
      const date = new Date(
        focus.year,
        focus.month - 1 + delta,
        Math.min(
          focus.day,
          new Date(focus.year, focus.month + delta, 0).getDate(),
        ),
      );
      next = {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
      };
    } else return;
    event.preventDefault();
    move(next);
  };
  const text = selected
    ? new Date(
        selected.year,
        selected.month - 1,
        selected.day,
      ).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Choose date";
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  const [motionEnabled, setMotionEnabled] = useState(false);
  useLayoutEffect(() => {
    if (!open || !pendingFocusDate) return;
    popupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-v8-date="${pendingFocusDate}"]`)
      ?.focus();
    setPendingFocusDate(null);
  }, [open, pendingFocusDate]);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  };
  return (
    <div className="v8-field v8-picker" ref={setRoot}>
      <label
        className={hideLabel ? "v8-field__label v8-sr-only" : "v8-field__label"}
        id={`${fieldId}-label`}
        htmlFor={fieldId}
      >
        {label}
        {required ? " *" : ""}
      </label>
      {hint && (
        <span className="v8-field__hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={`${fieldId}-error`} role="alert">
          {error}
        </span>
      )}
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen, details) => {
          if (readOnly && nextOpen) return;
          setOpen(nextOpen);
          openRef.current = nextOpen;
          setMotionEnabled(isPointerOverlayEvent(details.event));
          if (nextOpen) {
            const date = parseCalendarDate(value) ?? todayDate();
            setPendingFocusDate(formatCalendarDate(date));
            setMonth({ year: date.year, month: date.month });
            setFocus(date);
          }
        }}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen && !openRef.current) setMotionEnabled(false);
        }}
      >
        <Popover.Trigger
          id={fieldId}
          className="v8-picker-trigger"
          data-size={size}
          disabled={disabled}
          aria-readonly={readOnly || undefined}
          data-readonly={readOnly || undefined}
          aria-labelledby={`${fieldId}-label`}
          aria-describedby={
            [hint && `${fieldId}-hint`, error && `${fieldId}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={Boolean(error)}
          aria-required={required}
          aria-label={`${label}, ${text}`}
        >
          <span>{text}</span>
          <CalendarDays size={16} aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal container={container ?? undefined}>
          <Popover.Positioner
            className="v8-picker-positioner"
            positionMethod="fixed"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            collisionAvoidance={{
              side: "flip",
              align: "shift",
              fallbackAxisSide: "none",
            }}
          >
            <Popover.Popup
              ref={popupRef}
              className="v8-picker-popup v8-date-popup"
              data-motion={motionEnabled ? "pointer" : undefined}
              aria-label={`${label} calendar`}
            >
              <div className="v8-calendar-header">
                <button
                  type="button"
                  aria-label="Previous month"
                  className="v8-calendar-nav"
                  onClick={() => moveMonth(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <Popover.Title className="v8-calendar-title">
                  {new Date(month.year, month.month - 1, 1).toLocaleDateString(
                    "en-GB",
                    { month: "long", year: "numeric" },
                  )}
                </Popover.Title>
                <button
                  type="button"
                  aria-label="Next month"
                  className="v8-calendar-nav"
                  onClick={() => moveMonth(1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="v8-calendar-weekdays" aria-hidden="true">
                {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
                  (key, index) => (
                    <span key={key}>{"MTWTFSS"[index]}</span>
                  ),
                )}
              </div>
              {/* biome-ignore lint/a11y/useSemanticElements: Calendar uses a roving-focus ARIA grid and arrow-key navigation. */}
              <div
                className="v8-calendar-grid"
                role="grid"
                aria-label="Calendar dates"
                onKeyDown={onGridKeyDown}
              >
                {Array.from({ length: 6 }, (_, rowIndex) => (
                  // biome-ignore lint/a11y/useSemanticElements: Calendar week rows group seven keyboard grid cells.
                  <div
                    className="v8-calendar-row"
                    role="row"
                    tabIndex={-1}
                    key={formatCalendarDate(cells[rowIndex * 7] ?? todayDate())}
                  >
                    {cells.slice(rowIndex * 7, rowIndex * 7 + 7).map((date) => {
                      const iso = formatCalendarDate(date);
                      const inMonth = date.month === month.month;
                      const isSelected = iso === value;
                      const isToday = iso === todayIso;
                      return (
                        // biome-ignore lint/a11y/useSemanticElements: A calendar button is the actionable control inside its ARIA gridcell.
                        <button
                          key={iso}
                          data-v8-date={iso}
                          type="button"
                          role="gridcell"
                          tabIndex={iso === formatCalendarDate(focus) ? 0 : -1}
                          aria-selected={isSelected}
                          aria-current={isToday ? "date" : undefined}
                          aria-label={new Date(
                            date.year,
                            date.month - 1,
                            date.day,
                          ).toLocaleDateString("en-GB", { dateStyle: "full" })}
                          className={`v8-calendar-day${inMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                          onFocus={() => setFocus(date)}
                          onClick={(event) => {
                            onValueChange(iso);
                            setMotionEnabled(
                              isPointerOverlayEvent(event.nativeEvent),
                            );
                            openRef.current = false;
                            close();
                          }}
                        >
                          {date.day}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="v8-calendar-footer">
                <span className="v8-calendar-count">
                  {daysInMonth(month.year, month.month)} days
                </span>
                <button
                  type="button"
                  className="v8-picker-action"
                  onClick={(event) => {
                    onValueChange(todayIso);
                    setMotionEnabled(isPointerOverlayEvent(event.nativeEvent));
                    openRef.current = false;
                    close();
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="v8-picker-action"
                  onClick={(event) => {
                    onValueChange("");
                    setMotionEnabled(isPointerOverlayEvent(event.nativeEvent));
                    openRef.current = false;
                    close();
                  }}
                >
                  Clear date
                </button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </div>
  );
}

export function TimePicker({
  label,
  hideLabel,
  value,
  onValueChange,
  hint,
  error,
  disabled,
  required,
  readOnly,
  name,
  size = "md",
  hourFormat = "24",
  id,
  emptyLabel,
}: SharedFieldProps & { hourFormat?: "12" | "24"; emptyLabel?: string }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const { container, setRoot } = usePortalContainer();
  const initialTime = parseTimeValue(value) ?? { hour: "08", minute: "00" };
  const parsedValue = parseTimeValue(value);
  const formatHour = (hour: string) =>
    hourFormat === "12" ? String(Number(hour) % 12 || 12) : hour;
  const formattedValue = parsedValue
    ? hourFormat === "12"
      ? `${formatHour(parsedValue.hour)}:${parsedValue.minute} ${Number(parsedValue.hour) >= 12 ? "PM" : "AM"}`
      : value
    : (emptyLabel ?? "Choose time");
  const [hourValue, setHourValue] = useState(initialTime.hour);
  const [hourDraft, setHourDraft] = useState(
    hourFormat === "12"
      ? formatHour(initialTime.hour).padStart(2, "0")
      : initialTime.hour,
  );
  const [periodValue, setPeriodValue] = useState(
    Number(initialTime.hour) >= 12 ? "PM" : "AM",
  );
  const [minuteValue, setMinuteValue] = useState(initialTime.minute);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [showTimeError, setShowTimeError] = useState(false);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const period =
    hourFormat === "12" ? periodValue : Number(hourValue) >= 12 ? "PM" : "AM";
  const normalizeHour = (draft: string) => {
    const normalized = normalizeTimePart(draft, hourFormat === "12" ? 12 : 23);
    return hourFormat === "12" && normalized === "00" ? null : normalized;
  };
  const validHour = normalizeHour(hourDraft);
  const validMinute = normalizeTimePart(minuteValue, 59);
  const timeError =
    showTimeError && (!validHour || !validMinute)
      ? hourFormat === "12"
        ? "Enter an hour from 1 to 12 and minutes from 00 to 59."
        : "Enter a time from 00:00 to 23:59."
      : undefined;
  const timeErrorId = `${fieldId}-time-error`;
  const updatePart = (part: "hour" | "minute", value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    if (part === "hour") {
      setHourDraft(digits);
      if (hourFormat === "24") setHourValue(digits);
      else {
        const entered = Number(digits);
        if (digits && entered <= 12) {
          setHourValue(
            String((entered % 12) + (periodValue === "PM" ? 12 : 0)).padStart(
              2,
              "0",
            ),
          );
        }
      }
    } else {
      setMinuteValue(digits);
    }
  };
  const close = (event?: Event) => {
    setMotionEnabled(event ? isPointerOverlayEvent(event) : false);
    openRef.current = false;
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  };
  const apply = (event?: Event) => {
    const normalizedHour = normalizeHour(hourDraft);
    const normalizedMinute = normalizeTimePart(minuteValue, 59);
    if (!normalizedHour || !normalizedMinute) {
      setShowTimeError(true);
      if (!normalizedHour) hourRef.current?.focus();
      else minuteRef.current?.focus();
      return;
    }
    const actualHour =
      hourFormat === "12"
        ? (Number(normalizedHour) % 12) + (period === "PM" ? 12 : 0)
        : Number(normalizedHour);
    onValueChange(`${String(actualHour).padStart(2, "0")}:${normalizedMinute}`);
    close(event);
  };
  const setDraftFromValue = (nextValue: string) => {
    const next = parseTimeValue(nextValue) ?? { hour: "08", minute: "00" };
    setHourValue(next.hour);
    setPeriodValue(Number(next.hour) >= 12 ? "PM" : "AM");
    setHourDraft(
      hourFormat === "12" ? formatHour(next.hour).padStart(2, "0") : next.hour,
    );
    setMinuteValue(next.minute);
    setShowTimeError(false);
  };
  return (
    <div className="v8-field v8-picker" ref={setRoot}>
      <label
        className={hideLabel ? "v8-field__label v8-sr-only" : "v8-field__label"}
        id={`${fieldId}-label`}
        htmlFor={fieldId}
      >
        {label}
        {required ? " *" : ""}
      </label>
      {hint && (
        <span className="v8-field__hint" id={`${fieldId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={`${fieldId}-error`} role="alert">
          {error}
        </span>
      )}
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen, details) => {
          if (readOnly && nextOpen) return;
          setOpen(nextOpen);
          openRef.current = nextOpen;
          setMotionEnabled(isPointerOverlayEvent(details.event));
          if (nextOpen) setDraftFromValue(value);
        }}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen && !openRef.current) setMotionEnabled(false);
        }}
      >
        <Popover.Trigger
          id={fieldId}
          className="v8-picker-trigger"
          data-size={size}
          disabled={disabled}
          aria-readonly={readOnly || undefined}
          data-readonly={readOnly || undefined}
          aria-labelledby={`${fieldId}-label`}
          aria-describedby={
            [hint && `${fieldId}-hint`, error && `${fieldId}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-label={`${label}, ${formattedValue}`}
          aria-invalid={Boolean(error)}
          aria-required={required}
        >
          <span>{formattedValue}</span>
          <Clock3 size={16} aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal container={container ?? undefined}>
          <Popover.Positioner
            className="v8-picker-positioner"
            positionMethod="fixed"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            collisionAvoidance={{ side: "flip", align: "shift" }}
          >
            <Popover.Popup
              className="v8-picker-popup v8-time-popup"
              data-motion={motionEnabled ? "pointer" : undefined}
              data-hour-format={hourFormat}
            >
              <div className="v8-time-header">
                <div>
                  <Popover.Title className="v8-time-title">Time</Popover.Title>
                </div>
                <button
                  type="button"
                  className="v8-time-close"
                  aria-label="Close time picker"
                  onClick={(event) => close(event.nativeEvent)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <div className="v8-time-columns">
                <label className="v8-time-field">
                  <span>Hour</span>
                  <input
                    ref={hourRef}
                    aria-label="Hour"
                    aria-invalid={Boolean(timeError && !validHour)}
                    aria-required={required}
                    aria-describedby={timeError ? timeErrorId : undefined}
                    inputMode="numeric"
                    maxLength={2}
                    pattern="[0-9]*"
                    type="text"
                    value={hourDraft}
                    onChange={(event) =>
                      updatePart("hour", event.currentTarget.value)
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={() => {
                      const normalized = normalizeHour(hourDraft);
                      if (normalized) {
                        const actualHour =
                          hourFormat === "12"
                            ? (Number(normalized) % 12) +
                              (period === "PM" ? 12 : 0)
                            : Number(normalized);
                        setHourValue(String(actualHour).padStart(2, "0"));
                        setHourDraft(normalized.padStart(2, "0"));
                      } else {
                        setHourDraft(
                          hourFormat === "12"
                            ? formatHour(hourValue).padStart(2, "0")
                            : hourValue,
                        );
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        apply(event.nativeEvent);
                      }
                    }}
                  />
                </label>
                <span className="v8-time-separator" aria-hidden="true">
                  :
                </span>
                <label className="v8-time-field">
                  <span>Minute</span>
                  <input
                    ref={minuteRef}
                    aria-label="Minute"
                    aria-invalid={Boolean(
                      timeError && !normalizeTimePart(minuteValue, 59),
                    )}
                    aria-required={required}
                    aria-describedby={timeError ? timeErrorId : undefined}
                    inputMode="numeric"
                    maxLength={2}
                    pattern="[0-9]*"
                    type="text"
                    value={minuteValue}
                    onChange={(event) =>
                      updatePart("minute", event.currentTarget.value)
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={(event) => {
                      const normalized = normalizeTimePart(
                        event.currentTarget.value,
                        59,
                      );
                      if (normalized) setMinuteValue(normalized);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        apply(event.nativeEvent);
                      }
                    }}
                  />
                </label>
                {hourFormat === "12" && (
                  <Select
                    label="Period"
                    size="sm"
                    value={period}
                    onValueChange={(nextPeriod) => {
                      const typedHour = normalizeHour(hourDraft);
                      if (!typedHour) return;
                      setPeriodValue(nextPeriod);
                      const hour =
                        (Number(typedHour) % 12) +
                        (nextPeriod === "PM" ? 12 : 0);
                      setHourValue(String(hour).padStart(2, "0"));
                    }}
                    options={[
                      { value: "AM", label: "AM" },
                      { value: "PM", label: "PM" },
                    ]}
                  />
                )}
              </div>
              {timeError && (
                <p id={timeErrorId} className="v8-time-error" role="alert">
                  {timeError}
                </p>
              )}
              <div className="v8-time-presets">
                <span>Common times</span>
                <div>
                  <button
                    type="button"
                    className="v8-time-preset"
                    aria-pressed={!parsedValue}
                    onClick={(event) => {
                      onValueChange("");
                      setShowTimeError(false);
                      close(event.nativeEvent);
                    }}
                  >
                    No specific time
                  </button>
                  {["07:00", "08:00", "12:00", "18:00", "20:00"].map(
                    (preset) => {
                      const presetHour = preset.slice(0, 2);
                      const presetLabel =
                        hourFormat === "12"
                          ? `${formatHour(presetHour)}:${preset.slice(3)} ${Number(presetHour) >= 12 ? "PM" : "AM"}`
                          : preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          className="v8-time-preset"
                          aria-pressed={
                            hourValue === presetHour &&
                            minuteValue === preset.slice(3)
                          }
                          onClick={() => {
                            setHourValue(presetHour);
                            setPeriodValue(
                              Number(presetHour) >= 12 ? "PM" : "AM",
                            );
                            setHourDraft(
                              hourFormat === "12"
                                ? formatHour(presetHour).padStart(2, "0")
                                : presetHour,
                            );
                            setMinuteValue(preset.slice(3));
                            setShowTimeError(false);
                          }}
                        >
                          {presetLabel}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
              <div className="v8-time-footer">
                <Button
                  size="sm"
                  variant="ghost"
                  className="v8-time-cancel"
                  onClick={(event) => close(event.nativeEvent)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={(event) => apply(event.nativeEvent)}
                >
                  Apply
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </div>
  );
}

export function DateRangePicker({
  label = "Date range",
  hint,
  error,
  name,
  start,
  end,
  onStartChange,
  onEndChange,
  disabled,
  readOnly,
  size = "md",
}: {
  label?: string;
  hint?: string;
  error?: string;
  name?: string;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  size?: ControlSize;
}) {
  const id = useId();
  const invalid = Boolean(start && end && start > end);
  return (
    <fieldset
      className="v8-field v8-date-range"
      aria-describedby={
        [hint && `${id}-hint`, error && `${id}-error`]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend className="v8-field__label">{label}</legend>
      {hint && (
        <span className="v8-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
      <DatePicker
        label="Start date"
        value={start}
        onValueChange={onStartChange}
        disabled={disabled}
        readOnly={readOnly}
        size={size}
        name={name ? `${name}.start` : undefined}
        error={
          invalid ? "Start date must be on or before the end date." : undefined
        }
      />
      <DatePicker
        label="End date"
        value={end}
        onValueChange={onEndChange}
        disabled={disabled}
        readOnly={readOnly}
        size={size}
        name={name ? `${name}.end` : undefined}
        error={
          invalid ? "End date must be on or after the start date." : undefined
        }
      />
    </fieldset>
  );
}

export function DateTimePicker({
  label = "Date and time",
  hint,
  error,
  name,
  date,
  time,
  onDateChange,
  onTimeChange,
  disabled,
  readOnly,
  size = "md",
  hourFormat = "24",
}: {
  label?: string;
  hint?: string;
  error?: string;
  name?: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  size?: ControlSize;
  hourFormat?: "12" | "24";
}) {
  const id = useId();
  return (
    <fieldset
      className="v8-field v8-date-time"
      aria-describedby={
        [hint && `${id}-hint`, error && `${id}-error`]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend className="v8-field__label">{label}</legend>
      {hint && (
        <span className="v8-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
      <DatePicker
        label="Date"
        value={date}
        onValueChange={onDateChange}
        disabled={disabled}
        readOnly={readOnly}
        size={size}
        name={name ? `${name}.date` : undefined}
      />
      <TimePicker
        label="Time"
        value={time}
        onValueChange={onTimeChange}
        disabled={disabled}
        readOnly={readOnly}
        size={size}
        name={name ? `${name}.time` : undefined}
        hourFormat={hourFormat}
      />
    </fieldset>
  );
}

export function MonthPicker({
  label,
  value,
  onValueChange,
  disabled,
  readOnly,
  required,
  hint,
  error,
  size = "md",
  name,
}: SharedFieldProps) {
  const id = useId();
  const [year, month] = (value || "2026-01").split("-");
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label: new Date(2026, index, 1).toLocaleDateString("en-GB", {
      month: "long",
    }),
  }));
  return (
    <fieldset
      className="v8-field"
      aria-describedby={
        [hint && `${id}-hint`, error && `${id}-error`]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend className="v8-field__label">{label}</legend>
      {hint && (
        <span className="v8-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
      <div className="v8-month-fields">
        <Select
          label="Month"
          value={month}
          onValueChange={(next) => onValueChange(`${year}-${next}`)}
          options={months}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          id={`${id}-month`}
          size={size}
        />
        <Select
          label="Year"
          value={year}
          onValueChange={(next) => onValueChange(`${next}-${month}`)}
          options={Array.from({ length: 11 }, (_, index) =>
            String(Number(year) - 5 + index),
          ).map((item) => ({ value: item, label: item }))}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          id={`${id}-year`}
          size={size}
        />
      </div>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </fieldset>
  );
}

export function WeekPicker({
  label,
  value,
  onValueChange,
  disabled,
  readOnly,
  required,
  hint,
  error,
  size = "md",
  name,
}: SharedFieldProps) {
  const id = useId();
  const [year, week] = (value || "2026-W01").split("-W");
  const weeks = Array.from(
    { length: isoWeeksInYear(Number(year)) },
    (_, index) => String(index + 1).padStart(2, "0"),
  );
  return (
    <fieldset
      className="v8-field"
      aria-describedby={
        [hint && `${id}-hint`, error && `${id}-error`]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend className="v8-field__label">{label}</legend>
      {hint && (
        <span className="v8-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="v8-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
      <div className="v8-month-fields">
        <Select
          label="Week"
          value={week}
          onValueChange={(next) => onValueChange(`${year}-W${next}`)}
          options={weeks.map((item) => ({
            value: item,
            label: `Week ${Number(item)}`,
          }))}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          id={`${id}-week`}
          size={size}
        />
        <Select
          label="Year"
          value={year}
          onValueChange={(next) => {
            const nextWeek =
              Number(week) > isoWeeksInYear(Number(next)) ? "52" : week;
            onValueChange(`${next}-W${nextWeek}`);
          }}
          options={Array.from({ length: 11 }, (_, index) =>
            String(Number(year) - 5 + index),
          ).map((item) => ({ value: item, label: item }))}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          id={`${id}-year`}
          size={size}
        />
      </div>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </fieldset>
  );
}
