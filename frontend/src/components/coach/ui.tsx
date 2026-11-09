"use client";
import { Check, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import {
  type ButtonVariant,
  type ControlSize,
  type StatusTone,
  Button as Vari8Button,
  Card as Vari8Card,
  IconButton as Vari8IconButton,
  Input as Vari8Input,
  Modal as Vari8Modal,
  Select as Vari8Select,
  Status as Vari8Status,
  Toggle as Vari8Toggle,
} from "../vari8/components";
import { DatePicker, TimePicker } from "../vari8/inputs";
import { PageHeader } from "../vari8/layouts";
import { CoachDashboardPreview } from "./builder/coach-dashboard";
import {
  allParameters,
  type CoachClient,
  type FieldConfig,
  sampleValue,
  type Template,
  TODAY,
  type Variant,
} from "./model";
import { planTargets } from "./plans/domain";
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
export function IconButton({
  label,
  children,
  className,
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: ControlSize;
}) {
  return (
    <Vari8IconButton
      label={label}
      size={size}
      type="button"
      className={["cd-icon-button", className].filter(Boolean).join(" ")}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </Vari8IconButton>
  );
}
export function Avatar({
  client,
  small = false,
}: {
  client: Pick<CoachClient, "name" | "initials">;
  small?: boolean;
}) {
  return (
    <span
      className={`cd-avatar ${small ? "cd-avatar-small" : ""}`}
      aria-hidden="true"
    >
      {client.initials ||
        client.name
          .split(" ")
          .map((s) => s[0])
          .slice(0, 2)
          .join("")}
    </span>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="cd-search">
      <Search size={17} aria-hidden="true" />
      <Vari8Input
        label={label ?? placeholder}
        type="search"
        className="cd-search-input"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
};

export function DateField({ label, value, onChange, min }: DateFieldProps) {
  return (
    <DatePicker
      label={label}
      value={value}
      onValueChange={(next) => {
        if (!min || !next || next >= min) onChange(next);
      }}
    />
  );
}

export function DateTimeField({ label, value, onChange, min }: DateFieldProps) {
  const [date, setDate] = useState(value.slice(0, 10));
  const [time, setTime] = useState(
    value.length >= 16 ? value.slice(11, 16) : "",
  );

  useEffect(() => {
    setDate(value.slice(0, 10));
    setTime(value.length >= 16 ? value.slice(11, 16) : "");
  }, [value]);

  const update = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : "");
  };

  return (
    <div className="cd-date-time-fields">
      <DatePicker
        label={`${label} date`}
        value={date}
        onValueChange={(nextDate) => {
          if (!min || !nextDate || nextDate >= min) update(nextDate, time);
        }}
      />
      <TimePicker
        label={`${label} time`}
        value={time}
        onValueChange={(nextTime) => update(date, nextTime)}
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  disabled?: boolean;
}) {
  return (
    <Vari8Select
      label={label}
      value={value}
      disabled={disabled}
      onValueChange={onChange}
      options={options.map((option) =>
        typeof option === "string" ? { value: option, label: option } : option,
      )}
    />
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  detail,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  detail?: string;
  disabled?: boolean;
}) {
  return (
    <Vari8Toggle
      className="cd-toggle-row"
      label={label}
      description={detail}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cd-empty">
      <span className="cd-empty-glyph">◇</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  full = false,
  viewport = false,
  flushBody = false,
  headerAction,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  full?: boolean;
  viewport?: boolean;
  flushBody?: boolean;
  headerAction?: ReactNode;
  className?: string;
}) {
  return (
    <Vari8Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      headerAction={headerAction}
      flushBody={flushBody}
      className={className}
      size={viewport ? "viewport" : full ? "full" : wide ? "wide" : "standard"}
    >
      {children}
    </Vari8Modal>
  );
}
export function PageTitle({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: () => void;
}) {
  return (
    <>
      {back && (
        <button
          type="button"
          className="v8-editor-header__back cd-page-back"
          onClick={back}
        >
          Back
        </button>
      )}
      <PageHeader
        className="cd-page-heading"
        title={title}
        description={description}
        actions={actions}
      />
    </>
  );
}
export function Surface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Vari8Card className={`cd-core ${className}`} size="md">
      {children}
    </Vari8Card>
  );
}
export function Transition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    // Each workspace destination starts at its heading, independently of the previous page.
    window.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById("coach-main")?.focus({ preventScroll: true });
  }, []);
  return (
    <motion.div
      className="cd-transition"
      initial={reduced ? false : { opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
    >
      {children}
    </motion.div>
  );
}
const STATUS_TONES: Record<string, StatusTone> = {
  "Awaiting feedback": "warning",
  Overdue: "danger",
  "Feedback sent": "positive",
  Active: "positive",
  Done: "positive",
  Complete: "positive",
  "Active with draft changes": "warning",
  "Draft changes": "warning",
  Draft: "info",
};

export function Status({ text }: { text: string }) {
  return (
    <Vari8Status tone={STATUS_TONES[text] ?? "neutral"}>
      {text === "Feedback sent" && <Check size={12} />}
      {text}
    </Vari8Status>
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
      <span>{allParameters().find((p) => p.id === field.id)?.name}</span>
      <strong>{sampleValue(field, client)}</strong>
    </div>
  );
}
export function WidgetPreview({
  variant,
  client,
}: {
  variant: Variant;
  client?: CoachClient;
}) {
  return (
    <CoachDashboardPreview
      key={
        JSON.stringify(variant.dashboard) +
        JSON.stringify(variant.fields) +
        (client?.id ?? "sample")
      }
      variant={variant}
      client={client}
    />
  );
}
export function TemplatePreview({
  template,
  variant,
  client,
}: {
  template: Template;
  variant: Variant;
  client?: CoachClient;
}) {
  const [id] = [variant.id];
  return (
    <div className="cd-client-preview" key={id}>
      <div className="cd-preview-header">
        <Avatar client={client ?? { name: "Emma Anders", initials: "EA" }} />
        <div>
          <strong>{client?.name ?? "Emma Anders"}</strong>
          <small>
            {template.name} · {variant.name}
          </small>
        </div>
      </div>
      <div className="cd-preview-views">
        {variant.views.map((v) => (
          <span key={v}>{v}</span>
        ))}
        {variant.habits && <span>Habits</span>}
      </div>
      {variant.views.includes("Dashboard") && (
        <WidgetPreview variant={variant} client={client} />
      )}
      <h3>
        {variant.nutrition === "IIFYM"
          ? "Daily macro targets"
          : "Your meal plan"}
      </h3>
      {variant.nutrition === "IIFYM" ? (
        <div className="cd-macro-line">
          <span>
            <strong>
              {client
                ? (planTargets(client, TODAY)?.calories ?? "Not set")
                : 2200}
            </strong>{" "}
            kcal
          </span>
          <span>
            <strong>
              {client
                ? (planTargets(client, TODAY)?.protein ?? "Not set")
                : 140}
            </strong>{" "}
            g protein
          </span>
        </div>
      ) : client ? (
        <p className="cd-muted">
          Open Nutrition in the assigned preview to view the active
          prescription.
        </p>
      ) : (
        <div className="cd-meal-preview">
          {["Breakfast · 07:30", "Lunch · 12:30", "Dinner · 19:00"].map(
            (x, i) => (
              <div key={x}>
                <span>{x}</span>
                <strong>
                  {
                    [
                      "Oats, yogurt & berries",
                      "Chicken, rice & vegetables",
                      "Salmon & roasted potatoes",
                    ][i]
                  }
                </strong>
              </div>
            ),
          )}
        </div>
      )}
      <small className="cd-caption">
        {client
          ? `${client.entries.length} retained entries · assigned client nutrition`
          : "Sample athlete · Training day nutrition option"}
      </small>
    </div>
  );
}
