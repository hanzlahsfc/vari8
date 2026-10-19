"use client";

import { Check, ChevronDown } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  initials,
  size = "md",
}: {
  initials: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span aria-hidden="true" className={cn("avatar", `avatar-${size}`)}>
      {initials}
    </span>
  );
}

export function StatusLabel({ status }: { status: string }) {
  const tone = /overdue|error/i.test(status)
    ? "danger"
    : /awaiting|open|pending/i.test(status)
      ? "warning"
      : /track|complete|sent|success/i.test(status)
        ? "success"
        : "neutral";
  return (
    <span className={cn("status-label", `status-${tone}`)}>
      <span className="status-dot" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function LabelTag({ children }: { children: ReactNode }) {
  return <span className="label-tag">{children}</span>;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
}) {
  return (
    <fieldset className="segmented" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("segment", value === option.value && "segment-active")}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

export function SelectControl({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="select-control" htmlFor={id}>
      <span className="control-label">{label}</span>
      <span className="select-wrap">
        <select
          id={id}
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="form-select"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </span>
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("form-input", className)} {...props} />;
}

export function CheckboxControl({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("checkbox-control", disabled && "control-disabled")}>
      <span className="checkbox-box">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function SwitchControl({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("switch-label", disabled && "control-disabled")}>
      <button
        type="button"
        className="switch-control"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
      <span>{label}</span>
    </label>
  );
}

export function Tabs({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          disabled={option.disabled}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const available = options.filter((item) => !item.disabled);
            const index = available.findIndex((item) => item.value === value);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? available.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      available.length) %
                    available.length;
            onChange(available[next].value);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              );
            buttons?.[next].focus();
          }}
          className="tab"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Widget({
  title,
  detail,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  detail?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("widget", className)}>
      <div className="widget-heading">
        <div className="widget-title-wrap">
          <h2 className="widget-title">
            {icon}
            {title}
          </h2>
          {detail && <p className="widget-detail">{detail}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
