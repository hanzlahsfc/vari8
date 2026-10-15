"use client";
import { ArrowLeft, Check, ChevronDown, Search, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { CoachDashboardPreview } from "./builder/coach-dashboard";
import {
  ALL_PARAMETERS,
  type CoachClient,
  type FieldConfig,
  sampleValue,
  type Template,
  type Variant,
} from "./model";
export function Button({
  children,
  className = "",
  primary = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={`cd-button ${primary ? "cd-primary" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className="cd-icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
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
    <label className="cd-search">
      <Search size={17} />
      <input
        type="search"
        aria-label={label ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
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
    <label className="cd-field">
      <span>{label}</span>
      <span className="cd-select-wrap">
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option
              key={typeof o === "string" ? o : o.value}
              value={typeof o === "string" ? o : o.value}
            >
              {typeof o === "string" ? o : o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} />
      </span>
    </label>
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
    <label className="cd-toggle-row">
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="cd-switch" aria-hidden="true" />
    </label>
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
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  full?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  const reduced = useReducedMotion();
  close.current = onClose;
  useEffect(() => {
    const d = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => {
      d?.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <motion.dialog
      className={`cd-dialog ${wide ? "cd-dialog-wide" : ""} ${full ? "cd-dialog-full" : ""}`}
      ref={ref}
      aria-labelledby={titleId}
      initial={
        reduced ? { opacity: 0 } : { opacity: 0, transform: "scale(.97)" }
      }
      animate={
        reduced
          ? { opacity: 1 }
          : {
              opacity: 1,
              transform: "scale(1)",
              transitionEnd: { transform: "none" },
            }
      }
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </header>
      <div className="cd-dialog-content">{children}</div>
    </motion.dialog>
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
    <div className="cd-page-heading">
      <div>
        {back && (
          <Button className="cd-back" onClick={back}>
            <ArrowLeft size={15} />
            Back
          </Button>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="cd-actions">{actions}</div>
    </div>
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
    <div className={`cd-shell ${className}`}>
      <div className="cd-core">{children}</div>
    </div>
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
export function Status({ text }: { text: string }) {
  return (
    <span className="cd-status" data-status={text}>
      {text === "Feedback sent" && <Check size={12} />}
      {text}
    </span>
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
            <strong>{client?.plan.calories ?? 2200}</strong> kcal
          </span>
          <span>
            <strong>{client?.plan.protein ?? 140}</strong> g protein
          </span>
        </div>
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
          ? `${client.entries.length} retained entries · ${client.plan.nutritionVariant} nutrition option`
          : "Sample athlete · Training day nutrition option"}
      </small>
    </div>
  );
}
