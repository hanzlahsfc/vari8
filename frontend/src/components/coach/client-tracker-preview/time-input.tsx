"use client";

import { TimePicker } from "@/components/vari8/inputs";

type TimeInputProps = {
  value: string;
  mode: "12" | "24";
  ariaLabel: string;
  onChange: (value: string) => void;
};

export function TimeInput({
  value,
  mode,
  ariaLabel,
  onChange,
}: TimeInputProps) {
  return (
    <TimePicker
      label={ariaLabel}
      value={value}
      onValueChange={onChange}
      hourFormat={mode}
      size="md"
    />
  );
}
