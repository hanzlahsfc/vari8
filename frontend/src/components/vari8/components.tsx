/* biome-ignore-all lint/a11y/noNoninteractiveTabindex: The named table region is a keyboard scroll target for wide tables. */
"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  cloneElement,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  type TableHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isPointerOverlayEvent } from "./overlay-motion.mjs";
import "./components.css";
import "./inputs.css";

function joinClasses(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";
export type ControlSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  /** Skip VARI8 styling hooks when adapting a shared control to a legacy surface. */
  unstyled?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  children,
  className,
  variant = "secondary",
  size = "md",
  loading = false,
  unstyled = false,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={joinClasses(!unstyled && "v8-button", className)}
      data-variant={unstyled ? undefined : variant}
      data-size={unstyled ? undefined : size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="v8-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: ControlSize;
  /** Skip VARI8 styling hooks when adapting a shared control to a legacy surface. */
  unstyled?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function IconButton({
  label,
  children,
  className,
  size = "md",
  unstyled = false,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={joinClasses(!unstyled && "v8-icon-button", className)}
      data-size={unstyled ? undefined : size}
      aria-label={props["aria-label"] ?? label}
      title={props.title ?? label}
    >
      {children}
    </button>
  );
}

export type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: "default" | "subtle" | "raised";
  size?: ControlSize;
  treatment?: "plain" | "spotlight";
} & HTMLAttributes<HTMLDivElement>;

export function Card({
  children,
  className,
  variant = "default",
  size = "md",
  treatment = "plain",
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={joinClasses("v8-card", className)}
      data-variant={variant}
      data-size={size}
      data-treatment={treatment}
    >
      {children}
    </div>
  );
}

type FieldMessages = {
  label: string;
  /** Visually hide the label while keeping it for assistive tech. */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
};

function useFieldIds(id: string | undefined, hint?: string, error?: string) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return { controlId, hintId, errorId };
}

function FieldMessagesView({
  label,
  hideLabel,
  hint,
  error,
  controlId,
  hintId,
  errorId,
}: FieldMessages & {
  controlId: string;
  hintId?: string;
  errorId?: string;
}) {
  return (
    <>
      <label
        className={hideLabel ? "v8-field__label v8-sr-only" : "v8-field__label"}
        htmlFor={controlId}
      >
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
    </>
  );
}

function describedBy(
  existing: string | undefined,
  hintId?: string,
  errorId?: string,
) {
  const ids = [existing, hintId, errorId].filter((id): id is string =>
    Boolean(id),
  );
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

export type InputProps = FieldMessages &
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
    size?: ControlSize;
    nativeSize?: number;
    ref?: Ref<HTMLInputElement>;
  };

export function Input({
  label,
  hideLabel,
  hint,
  error,
  id,
  className,
  "aria-describedby": existingDescription,
  "aria-invalid": ariaInvalid,
  size = "md",
  nativeSize,
  ref,
  ...props
}: InputProps) {
  const ids = useFieldIds(id, hint, error);
  return (
    <div className="v8-field">
      <FieldMessagesView
        label={label}
        hideLabel={hideLabel}
        hint={hint}
        error={error}
        {...ids}
      />
      <input
        {...props}
        ref={ref}
        id={ids.controlId}
        className={joinClasses("v8-input", className)}
        data-size={size}
        size={nativeSize}
        aria-describedby={describedBy(
          existingDescription,
          ids.hintId,
          ids.errorId,
        )}
        aria-invalid={error ? true : ariaInvalid}
      />
    </div>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = FieldMessages & {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  id?: string;
  size?: ControlSize;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export function Select({
  label,
  hideLabel,
  hint,
  error,
  id,
  options,
  className,
  value,
  defaultValue,
  onValueChange,
  onOpenChange,
  disabled,
  readOnly,
  required,
  name,
  "aria-describedby": existingDescription,
  "aria-invalid": ariaInvalid,
  size = "md",
}: SelectProps) {
  const ids = useFieldIds(id, hint, error);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  return (
    <div
      className="v8-field"
      ref={(node) => {
        if (node)
          setPortalContainer(
            node.closest("dialog") ?? node.closest(".v8-theme") ?? node,
          );
      }}
    >
      <FieldMessagesView
        label={label}
        hideLabel={hideLabel}
        hint={hint}
        error={error}
        {...ids}
      />
      <BaseSelect.Root
        name={name}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        value={value}
        defaultValue={defaultValue}
        items={options}
        onOpenChange={onOpenChange}
        onValueChange={(next) =>
          typeof next === "string" && onValueChange?.(next)
        }
      >
        <BaseSelect.Trigger
          id={ids.controlId}
          className={joinClasses("v8-select", className)}
          data-size={size}
          aria-describedby={describedBy(
            existingDescription,
            ids.hintId,
            ids.errorId,
          )}
          aria-invalid={error ? true : ariaInvalid}
        >
          <BaseSelect.Value placeholder="Choose an option" />
          <BaseSelect.Icon className="v8-select__icon">
            <ChevronDown size={15} aria-hidden="true" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal container={portalContainer ?? undefined}>
          <BaseSelect.Positioner
            className="v8-select-positioner"
            positionMethod="fixed"
            alignItemWithTrigger={false}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            collisionAvoidance={{ side: "flip", align: "shift" }}
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

export type TabItem = {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
};
export type TabsProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  className?: string;
};

export function Tabs({
  label,
  value,
  onValueChange,
  items,
  className,
}: TabsProps) {
  const id = useId();
  const selectedIndex = items.findIndex(
    (item) => item.value === value && !item.disabled,
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveTo = (from: number, direction: -1 | 1 | "first" | "last") => {
    const enabled = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.disabled);
    if (enabled.length === 0) return;
    const currentPosition = enabled.findIndex(({ index }) => index === from);
    const target =
      direction === "first"
        ? enabled[0]
        : direction === "last"
          ? enabled.at(-1)
          : enabled[
              (currentPosition + direction + enabled.length) % enabled.length
            ];
    if (!target) return;
    tabRefs.current[target.index]?.focus();
    onValueChange(target.item.value);
  };

  return (
    <div className={joinClasses("v8-tabs", className)}>
      <div className="v8-tabs__list" role="tablist" aria-label={label}>
        {items.map((item, index) => {
          const selected = index === selectedIndex;
          const tabId = `${id}-tab-${index}`;
          const panelId = `${id}-panel-${index}`;
          return (
            <button
              key={item.value}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={tabId}
              type="button"
              className="v8-tabs__tab"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={
                selected ||
                (selectedIndex < 0 &&
                  index === items.findIndex((candidate) => !candidate.disabled))
                  ? 0
                  : -1
              }
              disabled={item.disabled}
              onClick={() => onValueChange(item.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  moveTo(index, 1);
                } else if (
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  moveTo(index, -1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  moveTo(index, "first");
                } else if (event.key === "End") {
                  event.preventDefault();
                  moveTo(index, "last");
                }
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, index) => (
        <section
          key={item.value}
          id={`${id}-panel-${index}`}
          className="v8-tabs__panel"
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== selectedIndex}
        >
          {item.content}
        </section>
      ))}
    </div>
  );
}

export type ChoiceOption = { value: string; label: string; disabled?: boolean };
export type SegmentedControlProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ChoiceOption[];
  className?: string;
};

export function SegmentedControl({
  label,
  value,
  onValueChange,
  options,
  className,
}: SegmentedControlProps) {
  const name = useId();

  return (
    <div
      className={joinClasses("v8-segmented", className)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <label key={option.value} className="v8-segmented__option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onValueChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export type ToggleProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
  className?: string;
};

export function Toggle({
  label,
  checked,
  onCheckedChange,
  disabled = false,
  description,
  className,
}: ToggleProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <label className={joinClasses("v8-toggle", className)}>
      <span className="v8-choice__copy">
        <span className="v8-choice__label">{label}</span>
        {description && (
          <span className="v8-choice__description" id={descriptionId}>
            {description}
          </span>
        )}
      </span>
      <input
        className="v8-toggle__input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        aria-label={label}
        aria-describedby={descriptionId}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span className="v8-toggle__track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

export type CheckboxProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
  className?: string;
  id?: string;
  indeterminate?: boolean;
  ariaLabel?: string;
};

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  disabled = false,
  description,
  className,
  id,
  indeterminate = false,
  ariaLabel,
}: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const controlRef = useRef<HTMLInputElement>(null);
  const descriptionId = description ? `${controlId}-description` : undefined;
  useEffect(() => {
    if (controlRef.current) controlRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={joinClasses("v8-checkbox", className)}>
      <input
        id={controlId}
        ref={controlRef}
        className="v8-checkbox__input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-checked={indeterminate ? "mixed" : checked}
        aria-label={ariaLabel}
        aria-describedby={descriptionId}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span className="v8-checkbox__box" aria-hidden="true">
        <svg
          className="v8-checkbox__check"
          viewBox="0 0 18 18"
          aria-hidden="true"
          focusable="false"
        >
          <polyline points="4 9.5 7.5 13 14 5.5" />
        </svg>
        <span className="v8-checkbox__dash" />
      </span>
      <span className="v8-choice__copy">
        <span className="v8-choice__label">{label}</span>
        {description && (
          <span className="v8-choice__description" id={descriptionId}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  flushBody?: boolean;
  className?: string;
  size?: "compact" | "standard" | "wide" | "full" | "viewport";
  maxWidth?: number;
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  headerAction,
  flushBody = false,
  className,
  size = "standard",
  maxWidth,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pointerIntent = useRef(false);
  const pointerIntentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const hasPointerIntent = pointerIntent.current;
    pointerIntent.current = false;
    if (pointerIntentTimer.current) {
      clearTimeout(pointerIntentTimer.current);
      pointerIntentTimer.current = null;
    }
    setMotionEnabled(hasPointerIntent);
    if (open && !dialog.open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      previousFocus.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    const markPointerIntent = (event: MouseEvent) => {
      if (!isPointerOverlayEvent(event)) {
        pointerIntent.current = false;
        setMotionEnabled(false);
        return;
      }
      pointerIntent.current = true;
      setMotionEnabled(true);
      if (pointerIntentTimer.current) clearTimeout(pointerIntentTimer.current);
      pointerIntentTimer.current = setTimeout(() => {
        pointerIntent.current = false;
        pointerIntentTimer.current = null;
        if (!dialogRef.current?.open) setMotionEnabled(false);
      }, 0);
    };
    const clearPointerIntent = () => {
      pointerIntent.current = false;
      if (pointerIntentTimer.current) {
        clearTimeout(pointerIntentTimer.current);
        pointerIntentTimer.current = null;
      }
      setMotionEnabled(false);
    };
    document.addEventListener("click", markPointerIntent, true);
    document.addEventListener("keydown", clearPointerIntent, true);
    return () => {
      document.removeEventListener("click", markPointerIntent, true);
      document.removeEventListener("keydown", clearPointerIntent, true);
      if (pointerIntentTimer.current) clearTimeout(pointerIntentTimer.current);
    };
  }, []);

  useEffect(
    () => () => {
      const dialog = dialogRef.current;
      if (dialog?.open) dialog.close();
      previousFocus.current?.focus({ preventScroll: true });
    },
    [],
  );

  return (
    <dialog
      ref={dialogRef}
      className={joinClasses("v8-modal", className)}
      data-size={size}
      style={maxWidth ? { maxWidth } : undefined}
      data-motion={motionEnabled ? "pointer" : undefined}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (outside) {
          pointerIntent.current = true;
          setMotionEnabled(true);
          onOpenChange(false);
        }
      }}
    >
      <header className="v8-modal__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <div className="v8-modal__header-actions">
          {headerAction}
          <IconButton label="Close dialog" onClick={() => onOpenChange(false)}>
            <span aria-hidden="true">×</span>
          </IconButton>
        </div>
      </header>
      <div
        className={joinClasses(
          "v8-modal__body",
          flushBody && "v8-modal__body--flush",
        )}
      >
        {children}
      </div>
      {footer && <footer className="v8-modal__footer">{footer}</footer>}
    </dialog>
  );
}

export type TooltipProps = {
  label: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
  className?: string;
};

export function Tooltip({ label, children, className }: TooltipProps) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tooltip = (
    <span className="v8-tooltip__bubble" id={id} role="tooltip">
      {label}
    </span>
  );
  const previousDescription = children.props["aria-describedby"];
  const trigger = cloneElement(children, {
    "aria-describedby": describedBy(previousDescription, id),
  });

  useEffect(() => {
    if (dismissed || (!hovered && !focused)) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDismissed(true);
    };
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => document.removeEventListener("keydown", dismissOnEscape, true);
  }, [dismissed, hovered, focused]);

  return (
    <span
      className={joinClasses("v8-tooltip", className)}
      data-dismissed={dismissed || undefined}
      onPointerEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onPointerLeave={() => {
        setHovered(false);
        if (!focused) setDismissed(false);
      }}
      onFocusCapture={() => {
        setFocused(true);
        setDismissed(false);
      }}
      onBlurCapture={(event) => {
        const focusRemainsInside =
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget);
        if (!focusRemainsInside) {
          setFocused(false);
          if (!hovered) setDismissed(false);
        }
      }}
    >
      <span className="v8-tooltip__trigger">{trigger}</span>
      {tooltip}
    </span>
  );
}

export type NavigationItem = {
  id: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
};
export type NavigationProps = {
  label: string;
  items: NavigationItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  className?: string;
};

export function Navigation({
  label,
  items,
  activeId,
  onNavigate,
  className,
}: NavigationProps) {
  return (
    <nav className={joinClasses("v8-navigation", className)} aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="v8-navigation__item"
          aria-current={item.id === activeId ? "page" : undefined}
          disabled={item.disabled}
          onClick={() => onNavigate(item.id)}
        >
          {item.icon && (
            <span className="v8-navigation__icon" aria-hidden="true">
              {item.icon}
            </span>
          )}
          <span className="v8-navigation__label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  caption: string;
  children: ReactNode;
  regionLabel?: string;
};

export function Table({
  caption,
  children,
  className,
  regionLabel,
  ...props
}: TableProps) {
  return (
    <section
      className="v8-table-scroll"
      aria-label={regionLabel ?? caption}
      tabIndex={0}
    >
      <table {...props} className={joinClasses("v8-table", className)}>
        <caption>{caption}</caption>
        {children}
      </table>
    </section>
  );
}

export type StatusTone = "neutral" | "positive" | "warning" | "danger" | "info";
export function Status({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={joinClasses("v8-status", className)}
      data-tone={tone}
      role="status"
    >
      {children}
    </span>
  );
}

export type DropdownMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect?: () => void;
};
export type DropdownMenuProps = {
  label: string;
  items: DropdownMenuItem[];
  className?: string;
  /** Use an icon-only trigger in compact toolbars. */
  triggerIcon?: ReactNode;
  /** Accessible name and tooltip for the icon-only trigger. */
  triggerLabel?: string;
  /** Marks the current item with a checkmark and radio-menu semantics. */
  selectedId?: string;
  /** Open the menu toward the inline end of the trigger. */
  align?: "start" | "end";
};

export function DropdownMenu({
  label,
  items,
  className,
  triggerIcon,
  triggerLabel,
  selectedId,
  align = "start",
}: DropdownMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last">("first");

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const menuItems = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled), [role='menuitemradio']:not(:disabled)",
      ) ?? []),
    ];
    const target =
      initialFocus.current === "last" ? menuItems.at(-1) : menuItems[0];
    target?.focus();
    initialFocus.current = "first";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      )
        close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const moveFocus = (current: number, direction: -1 | 1 | "first" | "last") => {
    const enabled = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.disabled);
    if (enabled.length === 0) return;
    const position = enabled.findIndex(({ index }) => index === current);
    const target =
      direction === "first"
        ? enabled[0]
        : direction === "last"
          ? enabled.at(-1)
          : enabled[(position + direction + enabled.length) % enabled.length];
    if (target)
      menuRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-v8-menu-index="${target.index}"]`,
        )
        ?.focus();
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
      setOpen(true);
    }
  };
  const triggerProps = {
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": `${id}-menu`,
    onClick: () => setOpen((current) => !current),
    onKeyDown: onTriggerKeyDown,
  };
  return (
    <div ref={rootRef} className={joinClasses("v8-dropdown", className)}>
      {triggerIcon ? (
        <IconButton
          ref={triggerRef}
          className="v8-dropdown__trigger"
          label={triggerLabel ?? label}
          {...triggerProps}
        >
          {triggerIcon}
        </IconButton>
      ) : (
        <Button
          ref={triggerRef}
          className="v8-dropdown__trigger"
          {...triggerProps}
        >
          {label}
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      )}
      <div
        ref={menuRef}
        id={`${id}-menu`}
        className={joinClasses(
          "v8-dropdown__menu",
          align === "end" && "v8-dropdown__menu--end",
        )}
        role="menu"
        aria-label={label}
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            close(false);
            return;
          }
          const target = event.target;
          if (!(target instanceof HTMLButtonElement)) return;
          const current = Number(target.dataset.v8MenuIndex);
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            moveFocus(current, 1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveFocus(current, -1);
          } else if (event.key === "Home") {
            event.preventDefault();
            moveFocus(current, "first");
          } else if (event.key === "End") {
            event.preventDefault();
            moveFocus(current, "last");
          }
        }}
      >
        {items.map((item, index) => {
          const current = selectedId !== undefined && item.id === selectedId;
          return (
            // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is menuitemradio for choice lists (aria-checked valid) and menuitem otherwise.
            <button
              key={item.id}
              type="button"
              role={selectedId === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={selectedId === undefined ? undefined : current}
              data-v8-menu-index={index}
              data-current={current ? "" : undefined}
              className="v8-dropdown__item"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                close();
              }}
            >
              {selectedId !== undefined && (
                <Check
                  size={14}
                  className="v8-dropdown__check"
                  aria-hidden="true"
                />
              )}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
