"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  DailyEntrySurface,
  DailyEntrySurfaceItem,
} from "@/lib/daily-entry/service";
import { groupDailyHistoryByWeek } from "@/lib/daily-entry/week-groups";

import { saveDailyEntryAction } from "./entry-actions";

/**
 * FRONTEND-INTEGRATION-I1 — Lily-styled persistent DailyEntry form +
 * bounded week-grouped history (owner-approved choices: date picker with
 * prev/next day within backend bounds; panel+history restyle only;
 * existing fonts; Monday-start presentation grouping).
 *
 * The server contract is unchanged: fields come from the assigned pinned
 * template via `DailyEntrySurface`, the save is an explicit POST of
 * `formToken` + `v{ordinal}` raw inputs through `saveDailyEntryAction`.
 * No autosave, no localStorage, no mode toggle, no aggregates.
 */

const RATING_MAX: Record<string, number> = {
  SCALE_1_5: 5,
  SCALE_1_10: 10,
};

const UNAVAILABLE = "Daily tracking is currently unavailable.";

const UNSAVED = "You have unsaved changes. Leave this date?";

/** Declared-date arithmetic — plain UTC-naive date math, never a
 *  timezone conversion (the declared date is a day, not an instant). */
function shiftDeclaredDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

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
        <label className="de-cell" htmlFor={id}>
          <span className="de-cell__label">
            {label}
            {unit}
          </span>
          <input
            id={id}
            className="de-cell__input"
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {item.helpText ? (
            <span className="de-cell__hint">{item.helpText}</span>
          ) : null}
        </label>
      );
    case "RATING": {
      const max = item.ratingScheme ? RATING_MAX[item.ratingScheme] : undefined;
      return (
        <label className="de-cell" htmlFor={id}>
          <span className="de-cell__label">{label}</span>
          <select
            id={id}
            className="de-cell__input"
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
            <span className="de-cell__hint">{item.helpText}</span>
          ) : null}
        </label>
      );
    }
    case "OPTION":
      return (
        <label className="de-cell" htmlFor={id}>
          <span className="de-cell__label">{label}</span>
          <select
            id={id}
            className="de-cell__input"
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
            <span className="de-cell__hint">{item.helpText}</span>
          ) : null}
        </label>
      );
    case "TEXT":
      return (
        <label className="de-cell" htmlFor={id}>
          <span className="de-cell__label">{label}</span>
          <textarea
            id={id}
            className="de-cell__input"
            rows={3}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {item.helpText ? (
            <span className="de-cell__hint">{item.helpText}</span>
          ) : null}
        </label>
      );
    default:
      return null;
  }
}

/** Declared-date controls — links drive a plain GET navigation so the
 *  date stays in the URL and survives refresh; dirty edits trigger a
 *  confirmation before leaving the date (no silent loss). */
function DailyDateNav({
  workspaceId,
  entryDate,
  dirty,
}: {
  workspaceId: string;
  entryDate: string;
  dirty: boolean;
}) {
  const router = useRouter();
  const guard = (e: { preventDefault(): void }) => {
    if (dirty && !window.confirm(UNSAVED)) e.preventDefault();
  };
  const choose = (raw: string) => {
    if (!raw || raw === entryDate) return;
    if (dirty && !window.confirm(UNSAVED)) return;
    router.push(`/workspace/${workspaceId}/daily?date=${raw}`);
  };

  return (
    <div className="de-datenav" data-testid="daily-date-picker">
      <Link
        className="de-datenav__link"
        href={`/workspace/${workspaceId}/daily?date=${shiftDeclaredDate(entryDate, -1)}`}
        aria-label="Previous day"
        onClick={guard}
      >
        ‹ Prev day
      </Link>
      <span className="de-datenav__date" data-testid="daily-date-value">
        {entryDate}
      </span>
      <input
        type="date"
        className="de-datenav__input"
        aria-label="Choose date"
        value={entryDate}
        max={shiftDeclaredDate(new Date().toISOString().slice(0, 10), 1)}
        onChange={(e) => choose(e.target.value)}
      />
      <Link
        className="de-datenav__link"
        href={`/workspace/${workspaceId}/daily?date=${shiftDeclaredDate(entryDate, 1)}`}
        aria-label="Next day"
        onClick={guard}
      >
        Next day ›
      </Link>
    </div>
  );
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
  const dirty = Object.keys(initial).some(
    (o) => (values[Number(o)] ?? "") !== initial[Number(o)],
  );

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

  const weeks = groupDailyHistoryByWeek(surface.history);

  return (
    <section className="daily-entry de-surface" aria-label="Daily entry">
      <h2 className="assignment-manager__subtitle">
        Daily entry — {surface.entryDate}
      </h2>

      <DailyDateNav
        workspaceId={workspaceId}
        entryDate={surface.entryDate}
        dirty={dirty}
      />

      <form
        className="daily-form de-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {surface.sections.map((section) => (
          <fieldset key={section.sectionKey} className="daily-group de-card">
            <legend className="de-card__legend">{section.label}</legend>
            <div className="daily-grid de-grid">
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
          <p className="daily-actions" role="status">
            Saved.
          </p>
        ) : null}
        <div className="daily-actions">
          <button
            type="submit"
            className="catalog-search__submit de-save"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save daily entry"}
          </button>
        </div>
      </form>

      {surface.history.length > 0 ? (
        <div className="daily-entry__history de-history">
          <h3 className="assignment-manager__subtitle">History</h3>
          {weeks.map((week) => (
            <section
              key={week.weekStart}
              className="de-week"
              data-testid="de-week"
            >
              <h4 className="de-week__title">{week.label}</h4>
              <ul className="de-week__entries">
                {week.entries.map((entry) => (
                  <li key={entry.entryDate} className="de-week__entry">
                    <span className="de-week__date">
                      {entry.entryDate}
                      {entry.revisionCount > 1
                        ? ` — ${entry.revisionCount} revisions`
                        : ""}
                    </span>
                    <ul className="de-week__values">
                      {entry.values.map((v) => (
                        <li key={v.parameterKey}>
                          <strong>{v.label}</strong>
                          {v.unit ? ` (${v.unit})` : ""}: {v.display}
                        </li>
                      ))}
                    </ul>
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
