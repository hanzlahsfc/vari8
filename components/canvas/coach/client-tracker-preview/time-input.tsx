"use client";

import { useEffect, useRef, useState } from "react";
import "./time-input.css";

type TimeInputProps = {
  value: string;
  mode: "12" | "24";
  ariaLabel: string;
  onChange: (value: string) => void;
};

function parts(value: string, mode: "12" | "24") {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = match ? Number(match[1]) : 0;
  return {
    hour:
      mode === "12" ? String(hour % 12 || 12) : String(hour).padStart(2, "0"),
    minute: match?.[2] ?? "00",
    period: hour >= 12 ? "PM" : "AM",
  };
}

export function TimeInput({
  value,
  mode,
  ariaLabel,
  onChange,
}: TimeInputProps) {
  const current = parts(value, mode);
  const commitParts = (hourValue: string, minute: string, period: string) => {
    let hour = Number(hourValue);
    if (mode === "12") {
      hour %= 12;
      if (period === "PM") hour += 12;
    }
    onChange(`${String(hour).padStart(2, "0")}:${minute}`);
  };
  const hours =
    mode === "12"
      ? Array.from({ length: 12 }, (_, index) => String(index + 1))
      : Array.from({ length: 24 }, (_, index) =>
          String(index).padStart(2, "0"),
        );

  return (
    <fieldset className={`tc-time-input${mode === "12" ? " is-12-hour" : ""}`}>
      <legend className="tc-visually-hidden">{ariaLabel}</legend>
      <TimeMenu
        label={`${ariaLabel}, hour`}
        value={current.hour}
        options={hours}
        onChange={(hour) => commitParts(hour, current.minute, current.period)}
      />
      <span className="tc-time-separator" aria-hidden="true">
        :
      </span>
      <TimeMenu
        label={`${ariaLabel}, minute`}
        value={current.minute}
        options={Array.from({ length: 60 }, (_, index) =>
          String(index).padStart(2, "0"),
        )}
        onChange={(minute) => commitParts(current.hour, minute, current.period)}
      />
      {mode === "12" && (
        <TimeMenu
          label={`${ariaLabel}, AM or PM`}
          value={current.period}
          options={["AM", "PM"]}
          onChange={(period) =>
            commitParts(current.hour, current.minute, period)
          }
        />
      )}
    </fieldset>
  );
}

function TimeMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(0, options.indexOf(value)));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(Math.max(0, options.indexOf(value)));
  }, [value, options]);

  useEffect(() => {
    if (open) optionRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !triggerRef.current?.parentElement?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const move = (index: number) => {
    const next = Math.max(0, Math.min(options.length - 1, index));
    setActive(next);
  };

  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <span className="tc-time-menu">
      <button
        ref={triggerRef}
        type="button"
        className="tc-time-menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(0, options.indexOf(value)));
            setOpen(true);
          }
        }}
      >
        {value}
      </button>
      {open && (
        <div className="tc-time-menu-list" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              key={option}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={option === value}
              tabIndex={index === active ? 0 : -1}
              onClick={() => choose(option)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index + 1);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index - 1);
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  move(0);
                }
                if (event.key === "End") {
                  event.preventDefault();
                  move(options.length - 1);
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  choose(option);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
