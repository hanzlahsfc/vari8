"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  DailyEntrySurface,
  DailyEntrySurfaceItem,
} from "@/lib/daily-entry/service";

import { saveDailyEntryAction } from "./entry-actions";

/**
 * P-021 — snapshot-driven persistent DailyEntry form + read-only history
 * (decisions #64–#78). Additive alongside the structural DailyTrackerShell;
 * arbitrary snapshot parameters are NOT forced into the nine source
 * sections — they render under their snapshot sections.
 *
 * Browser-side values are positional ordinals + canonical strings only.
 * No internal identifiers appear in the DOM.
 */

const UNAVAILABLE = "Daily tracking is currently unavailable.";

const RATING_MAX: Record<string, number> = {
  SCALE_1_10: 10,
  SCALE_1_5: 5,
};

function ItemField({
  item,
  value,
  onChange,
  disabled,
}: {
  item: DailyEntrySurfaceItem;
  value: string;
  onChange: (raw: string) => void;
  disabled: boolean;
}) {
  const id = `de-v-${item.ordinal}`;
  const label = `${item.label}${item.required ? " *" : ""}`;
  const unit = item.unit ? ` (${item.unit})` : "";

  switch (item.kind) {
    case "MEASUREMENT":
      return (
        <label className="daily-field" htmlFor={id}>
          <span>
            {label}
            {unit}
          </span>
          <input
            id={id}
            className="catalog-search__input"
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {item.helpText ? (
            <span className="daily-todo">{item.helpText}</span>
          ) : null}
        </label>
      );
    case "RATING": {
      const max = item.ratingScheme ? RATING_MAX[item.ratingScheme] : undefined;
      return (
        <label className="daily-field" htmlFor={id}>
          <span>{label}</span>
          <select
            id={id}
            className="catalog-search__input"
            disabled={disabled || max === undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {max !== undefined &&
              Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
          </select>
          {item.helpText ? (
            <span className="daily-todo">{item.helpText}</span>
          ) : null}
        </label>
      );
    }
    case "OPTION":
      return (
        <label className="daily-field" htmlFor={id}>
          <span>{label}</span>
          <select
            id={id}
            className="catalog-search__input"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {item.options.map((o) => (
              <option key={o.ordinal} value={String(o.ordinal)}>
                {o.label}
              </option>
            ))}
          </select>
          {item.helpText ? (
            <span className="daily-todo">{item.helpText}</span>
          ) : null}
        </label>
      );
    case "TEXT":
      return (
        <label className="daily-field" htmlFor={id}>
          <span>{label}</span>
          <textarea
            id={id}
            className="catalog-search__input"
            rows={3}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {item.helpText ? (
            <span className="daily-todo">{item.helpText}</span>
          ) : null}
        </label>
      );
    default:
      return null;
  }
}

export function DailyEntryPanel({
  workspaceId,
  surface,
}: {
  workspaceId: string;
  surface: DailyEntrySurface;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (surface.state === "not_applicable") return null;
  if (surface.state !== "ready") {
    return (
      <section className="daily-entry" aria-label="Persistent daily tracking">
        <p className="app-lede" role="status">
          {UNAVAILABLE}
        </p>
      </section>
    );
  }

  const initial: Record<number, string> = {};
  for (const section of surface.sections)
    for (const item of section.items) initial[item.ordinal] = item.current;

  return (
    <ReadyPanel
      // Remount on token change so a post-save refresh repopulates from the
      // fresh server payload rather than holding stale client state.
      key={surface.formToken}
      workspaceId={workspaceId}
      surface={surface}
      initial={initial}
      pending={pending}
      startTransition={startTransition}
      message={message}
      setMessage={setMessage}
      saved={saved}
      setSaved={setSaved}
      router={router}
    />
  );
}

function ReadyPanel({
  workspaceId,
  surface,
  initial,
  pending,
  startTransition,
  message,
  setMessage,
  saved,
  setSaved,
  router,
}: {
  workspaceId: string;
  surface: Extract<DailyEntrySurface, { state: "ready" }>;
  initial: Record<number, string>;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  message: string | null;
  setMessage: (m: string | null) => void;
  saved: boolean;
  setSaved: (b: boolean) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [values, setValues] = useState<Record<number, string>>(initial);

  const submit = () => {
    setMessage(null);
    setSaved(false);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("workspaceId", workspaceId);
      fd.append("entryDate", surface.entryDate);
      fd.append("formToken", surface.formToken);
      for (const section of surface.sections)
        for (const item of section.items)
          fd.append(`v${item.ordinal}`, values[item.ordinal] ?? "");
      const result = await saveDailyEntryAction(fd);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <section className="daily-entry" aria-label="Daily entry">
      <h2 className="assignment-manager__subtitle">
        Daily entry — {surface.entryDate}
      </h2>
      <form
        className="daily-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {surface.sections.map((section) => (
          <fieldset key={section.sectionKey} className="daily-group">
            <legend>{section.label}</legend>
            <div className="daily-grid">
              {section.items.map((item) => (
                <ItemField
                  key={item.ordinal}
                  item={item}
                  disabled={pending}
                  value={values[item.ordinal] ?? ""}
                  onChange={(raw) =>
                    setValues((v) => ({ ...v, [item.ordinal]: raw }))
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
        {message ? (
          <p className="daily-errors" role="alert">
            {message}
          </p>
        ) : null}
        {saved ? (
          <p className="app-lede" role="status">
            Saved.
          </p>
        ) : null}
        <div className="daily-actions">
          <button
            type="submit"
            className="catalog-search__submit"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save daily entry"}
          </button>
        </div>
      </form>

      {surface.history.length > 0 ? (
        <div className="daily-entry__history">
          <h3 className="assignment-manager__subtitle">History</h3>
          {surface.history.map((entry) => (
            <section key={entry.entryDate} className="daily-group">
              <h4 className="assignment-manager__subtitle">
                {entry.entryDate}
                {entry.revisionCount > 1
                  ? ` — ${entry.revisionCount} revisions`
                  : ""}
              </h4>
              <ul>
                {entry.values.map((v) => (
                  <li key={v.parameterKey}>
                    <strong>{v.label}</strong>
                    {v.unit ? ` (${v.unit})` : ""}: {v.display}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
