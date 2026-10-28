"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import "./states.css";

/* Shared empty, loading and error primitives (W2-T2, register rows R12 and
   R13). Every surface uses these instead of inventing its own state screens.

   Input contract they carry:
   - Every interactive control comes from the shared v8 controls, so it keeps
     its accessible name. Pass actions through `action` as a `Button` or
     `IconButton`; both enforce labels already.
   - No primitive sets tabindex; DOM order is the focus order.
   - Motion lives in states.css and collapses under prefers-reduced-motion via
     the shared motion tokens. */

export type EmptyStateProps = HTMLAttributes<HTMLElement> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  children,
  className,
  ...props
}: EmptyStateProps) {
  const titleId = useId();
  return (
    <section
      {...props}
      aria-labelledby={props["aria-labelledby"] ?? titleId}
      className={`v8-empty-state ${className ?? ""}`}
    >
      {icon && (
        <div className="v8-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 id={titleId} className="v8-empty-state__title">
        {title}
      </h3>
      {description && (
        <p className="v8-empty-state__description">{description}</p>
      )}
      {action && <div className="v8-empty-state__action">{action}</div>}
      {children}
    </section>
  );
}

export type LoadingStateProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  description?: ReactNode;
};

export function LoadingState({
  label = "Loading",
  description,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      {...props}
      role="status"
      className={`v8-loading-state ${className ?? ""}`}
    >
      <span className="v8-loading-state__spinner" aria-hidden="true" />
      <span className="v8-loading-state__label">{label}</span>
      {description && (
        <span className="v8-loading-state__description">{description}</span>
      )}
    </div>
  );
}

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  lines?: number;
};

export function Skeleton({ lines = 3, className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={`v8-skeleton ${className ?? ""}`}
    >
      {Array.from({ length: lines }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: count-driven decorative lines are never reordered; index is their stable identity.
        <div key={index} className="v8-skeleton__line" />
      ))}
    </div>
  );
}

export type ErrorStateProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function ErrorState({
  title,
  description,
  action,
  children,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      {...props}
      role="alert"
      className={`v8-error-state ${className ?? ""}`}
    >
      <h3 className="v8-error-state__title">{title}</h3>
      {description && (
        <p className="v8-error-state__description">{description}</p>
      )}
      {action && <div className="v8-error-state__action">{action}</div>}
      {children}
    </div>
  );
}
