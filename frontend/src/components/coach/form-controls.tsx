"use client";
import type { ButtonHTMLAttributes } from "react";
import {
  type ButtonVariant,
  type ControlSize,
  Button as Vari8Button,
} from "../vari8/components";
import {
  ALL_PARAMETERS,
  type CoachClient,
  type FieldConfig,
  sampleValue,
} from "./model";

export function Button({
  children,
  className = "",
  primary = false,
  variant,
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  variant?: ButtonVariant;
  size?: ControlSize;
}) {
  return (
    <Vari8Button
      variant={variant ?? (primary ? "primary" : "secondary")}
      size={size}
      className={`cd-button ${primary ? "cd-primary" : ""} ${className}`}
      {...props}
    >
      {children}
    </Vari8Button>
  );
}

export function ParameterValue({
  field,
  client,
}: {
  field: FieldConfig;
  client?: CoachClient;
}) {
  return (
    <div className="cd-stat-row">
      <span>{ALL_PARAMETERS.find((p) => p.id === field.id)?.name}</span>
      <strong>{sampleValue(field, client)}</strong>
    </div>
  );
}
