"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import {
  Card,
  Checkbox,
  SegmentedControl,
  Select,
  Status,
  Toggle,
} from "@/components/vari8/components";
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
  const sharedTone = tone === "success" ? "positive" : tone;
  return (
    <Status tone={sharedTone}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Status>
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
    <SegmentedControl
      label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      options={options.map(({ value: optionValue, label: optionLabel }) => ({
        value: optionValue,
        label: optionLabel,
      }))}
    />
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
    <Select
      id={id}
      label={label}
      value={value}
      onValueChange={onChange}
      options={options}
      disabled={disabled}
    />
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn("v8-input", className)} data-size="md" {...props} />
  );
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
    <Checkbox
      checked={checked}
      onCheckedChange={onChange}
      label={label}
      disabled={disabled}
    />
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
    <Toggle
      checked={checked}
      onCheckedChange={onChange}
      label={label}
      disabled={disabled}
    />
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
    <SegmentedControl
      label={label}
      value={value}
      onValueChange={onChange}
      options={options}
    />
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
    <Card className={cn("widget", className)}>
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
    </Card>
  );
}
