"use client";

import type { HTMLAttributes, ReactNode } from "react";
import "./layouts.css";

export type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  width?: "standard" | "wide";
};

export function PageHeader({
  title,
  description,
  actions,
  children,
  width = "standard",
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      {...props}
      className={`v8-page-header v8-page-header--${width} ${className ?? ""}`}
    >
      <div className="v8-page-header__top">
        <div className="v8-page-header__copy">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="v8-page-header__actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function Toolbar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      role={props.role ?? "group"}
      className={`v8-toolbar ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function FormGrid({
  children,
  columns = 2,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { columns?: 1 | 2 | 3 }) {
  return (
    <div className="v8-form-grid-container">
      <div
        {...props}
        className={`v8-form-grid ${className ?? ""}`}
        data-columns={columns}
      >
        {children}
      </div>
    </div>
  );
}

export type SectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function Section({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: SectionProps) {
  return (
    <section {...props} className={`v8-section ${className ?? ""}`}>
      {(title || description || actions) && (
        <header className="v8-section__header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="v8-section__actions">{actions}</div>}
        </header>
      )}
      <div className="v8-section__body">{children}</div>
    </section>
  );
}

export type EditorHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  context?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

export function EditorHeader({
  backHref,
  onBack,
  backLabel = "Back",
  context,
  title,
  status,
  actions,
  className,
  ...props
}: EditorHeaderProps) {
  const back = backHref ? (
    <a className="v8-editor-header__back" href={backHref}>
      {backLabel}
    </a>
  ) : onBack ? (
    <button className="v8-editor-header__back" type="button" onClick={onBack}>
      {backLabel}
    </button>
  ) : null;
  return (
    <header {...props} className={`v8-editor-header ${className ?? ""}`}>
      {back}
      <div className="v8-editor-header__main">
        {context && <p className="v8-editor-header__context">{context}</p>}
        <h1>{title}</h1>
      </div>
      {status && <div className="v8-editor-header__status">{status}</div>}
      {actions && <div className="v8-editor-header__actions">{actions}</div>}
    </header>
  );
}
