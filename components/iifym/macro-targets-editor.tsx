// FULL-PACKAGE SLICE of #175
"use client";

/**
 * Card 10 (#175): coach macro-target editor, adapted from Lilly's
 * nutrition-targets surface. Options carry a target style:
 *
 * - "Macro targets" (default): protein / carbohydrate / fat grams;
 *   calories derive at 4/4/9 and are displayed, never stored.
 * - "Calorie targets": a single kcal value entered directly; the card
 *   and the client screen label the mode.
 *
 * The weekday assignment is the shared `VariantSchedule` weekly grid
 * (ISO weekday keys "1" to "7", Monday first) or manual selection. Save
 * writes the shared draft under `draftRevision` CAS (PUT); publish
 * mints an immutable effective-dated version (POST publish), a
 * replayed publish returns the stored version unchanged.
 *
 * Every read/write goes through the /api/v1 iifym-plans routes, which
 * re-authorize `mealPlans/*` inside serializable transactions; nothing
 * here is an authorization boundary.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, ApiClientError } from "@/components/canvas/data/http";
import type {
  IifymPayloadWire,
  IifymScheduleWire,
  IifymTargetValueWire,
  IifymTargetsWire,
} from "@/components/canvas/data/nutrition";

import "./macro-targets.css";

type VersionHeader = {
  id: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  publishedAt: string;
};

type StaffView = {
  plan: {
    id: string;
    title: string;
    timezone: string | null;
    draftRevision: number;
    draft: IifymPayloadWire;
  } | null;
  versions: VersionHeader[];
  currentVersionId: string | null;
  upcoming: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
  } | null;
  canWrite: boolean;
};

type DraftOption = {
  id: string;
  label: string;
  style: "macros" | "calories";
  protein: string;
  carbs: string;
  fat: string;
  calories: string;
};

const WEEKDAYS = [
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
  { key: "7", label: "Sunday" },
] as const;

const mintOption = (): DraftOption => ({
  id: `opt_${crypto.randomUUID()}`,
  label: "",
  style: "macros",
  protein: "",
  carbs: "",
  fat: "",
  calories: "",
});

/** 4/4/9 over the macro fields present: display only, never stored. */
function derivedKcal(option: DraftOption): number {
  const g = (raw: string) => {
    const value = Number(raw);
    return Number.isFinite(value) && raw.trim() !== "" ? value : 0;
  };
  return g(option.protein) * 4 + g(option.carbs) * 4 + g(option.fat) * 9;
}

function optionFromWire(wire: {
  id: string;
  label: string;
  targets: IifymTargetsWire;
}): DraftOption {
  const num = (v: IifymTargetValueWire | undefined): string => {
    if (!v) return "";
    if (v.kind === "range") return String(v.min);
    return String(v.value);
  };
  return {
    id: wire.id,
    label: wire.label,
    style: wire.targets.style === "calories" ? "calories" : "macros",
    protein: num(wire.targets.protein),
    carbs: num(wire.targets.carbs),
    fat: num(wire.targets.fat),
    calories: num(wire.targets.calories),
  };
}

function targetValue(raw: string): IifymTargetValueWire | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return { kind: "fixed", value };
}

function optionToWire(option: DraftOption) {
  const targets: IifymTargetsWire =
    option.style === "calories"
      ? {
          style: "calories",
          ...(targetValue(option.calories)
            ? { calories: targetValue(option.calories) }
            : {}),
        }
      : {
          style: "macros",
          ...(targetValue(option.protein)
            ? { protein: targetValue(option.protein) }
            : {}),
          ...(targetValue(option.carbs)
            ? { carbs: targetValue(option.carbs) }
            : {}),
          ...(targetValue(option.fat) ? { fat: targetValue(option.fat) } : {}),
        };
  return { id: option.id, label: option.label, targets };
}

export function MacroTargetsEditor({
  workspaceId,
  clientProfileId,
}: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const base = `/workspaces/${workspaceId}/clients/${clientProfileId}/iifym-plans`;
  const [view, setView] = useState<StaffView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [title, setTitle] = useState("Nutrition targets");
  const [name, setName] = useState("Individual nutrition targets");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [timezone, setTimezone] = useState("");
  const [timezoneSet, setTimezoneSet] = useState(false);
  const [options, setOptions] = useState<DraftOption[]>([mintOption()]);
  const [scheduleMode, setScheduleMode] = useState<"manual" | "weekly">(
    "weekly",
  );
  const [manualOption, setManualOption] = useState("");
  const [days, setDays] = useState<Record<string, string>>({});
  const [foreignSchedule, setForeignSchedule] =
    useState<IifymScheduleWire | null>(null);
  const [revision, setRevision] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState<"save" | "publish" | "timezone" | null>(
    null,
  );

  const load = useCallback(() => {
    return apiFetch<StaffView>(base)
      .then((result) => {
        setView(result);
        setError(null);
        if (result.plan) {
          const draft = result.plan.draft;
          setTitle(result.plan.title);
          setName(draft.name ?? result.plan.title);
          if (draft.startDate) setStartDate(draft.startDate);
          setTimezone(result.plan.timezone ?? "");
          setTimezoneSet(result.plan.timezone !== null);
          const draftOptions = (draft.options ?? []).map(optionFromWire);
          setOptions(draftOptions.length > 0 ? draftOptions : [mintOption()]);
          setRevision(result.plan.draftRevision);
          const schedule = draft.schedule;
          if (schedule?.mode === "weekly") {
            setForeignSchedule(null);
            setScheduleMode("weekly");
            setDays(schedule.days as Record<string, string>);
          } else if (schedule?.mode === "manual") {
            setForeignSchedule(null);
            setScheduleMode("manual");
            setManualOption(schedule.selectedVariantId);
          } else if (schedule) {
            setForeignSchedule(schedule);
          }
        } else {
          setRevision(0);
        }
      })
      .catch((err) => {
        setError(
          err instanceof ApiClientError
            ? `Could not load macro targets (${err.code}).`
            : "Could not load macro targets.",
        );
      });
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  const schedule = useMemo<IifymScheduleWire | undefined>(() => {
    if (foreignSchedule) return foreignSchedule;
    const valid = new Set(options.map((option) => option.id));
    if (scheduleMode === "manual") {
      const selected = manualOption || options[0]?.id;
      return selected && valid.has(selected)
        ? { mode: "manual", selectedVariantId: selected }
        : options[0]
          ? { mode: "manual", selectedVariantId: options[0].id }
          : undefined;
    }
    const mapped: Record<string, string> = {};
    for (const day of WEEKDAYS) {
      const value = days[day.key];
      if (value && valid.has(value)) mapped[day.key] = value;
    }
    return { mode: "weekly", days: mapped };
  }, [foreignSchedule, scheduleMode, manualOption, days, options]);

  const missingDays = useMemo(
    () =>
      !foreignSchedule && scheduleMode === "weekly"
        ? WEEKDAYS.filter(
            (day) => !(schedule?.mode === "weekly" && schedule.days[day.key]),
          ).map((day) => day.label)
        : [],
    [foreignSchedule, scheduleMode, schedule],
  );

  const confirmTimezone = async () => {
    const tz = timezone.trim();
    if (tz === "") {
      setNotice("Enter an IANA timezone.");
      return;
    }
    if (view?.plan === null) {
      setTimezoneSet(true);
      setNotice(`Timezone confirmed: ${tz}. Saved with the plan.`);
      return;
    }
    setBusy("timezone");
    setNotice(null);
    try {
      await apiFetch<{ planId: string }>(`${base}/timezone`, {
        method: "POST",
        body: { timezone: tz },
      });
      setTimezoneSet(true);
      setNotice(`Timezone confirmed: ${tz}`);
      await load();
    } catch (err) {
      setNotice(
        err instanceof ApiClientError
          ? `Could not confirm timezone (${err.code}).`
          : "Could not confirm timezone. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setNotice(null);
    try {
      const result = await apiFetch<{ planId: string; revision: number }>(
        base,
        {
          method: "PUT",
          body: {
            expectedRevision: revision,
            title: title.trim() || "Nutrition targets",
            ...(timezoneSet && timezone.trim() !== (view?.plan?.timezone ?? "")
              ? { timezone: timezone.trim() }
              : {}),
            draft: {
              name: name.trim() || title.trim() || "Nutrition targets",
              startDate,
              options: options.map(optionToWire),
              ...(schedule ? { schedule } : {}),
            },
          },
        },
      );
      setRevision(result.revision);
      setNotice(`Draft saved (revision ${result.revision}).`);
      await load();
    } catch (err) {
      setNotice(
        err instanceof ApiClientError
          ? `Could not save (${err.code}).`
          : "Could not save. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy("publish");
    setNotice(null);
    try {
      const result = await apiFetch<{ versionId: string; versionSeq: number }>(
        `${base}/publish`,
        {
          method: "POST",
          body: { expectedRevision: revision, effectiveDate },
        },
      );
      setNotice(`Published version ${result.versionSeq}.`);
      await load();
    } catch (err) {
      setNotice(
        err instanceof ApiClientError
          ? `Could not publish (${err.code}).`
          : "Could not publish. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (error)
    return (
      <p className="daily-errors" role="alert" data-testid="mt-error">
        {error}
      </p>
    );
  if (view === null)
    return (
      <div className="client-app-loading" role="status">
        Loading macro targets…
      </div>
    );

  const canWrite = view.canWrite;
  const firstPublish = view.plan === null;

  return (
    <div className="mt-editor">
      <section className="cd-preview-section" aria-label="Plan">
        <h2>Target plan</h2>
        <div className="mt-grid">
          <label className="auth-field">
            Plan title
            <input
              className="auth-input"
              data-testid="mt-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!canWrite}
            />
          </label>
          <label className="auth-field">
            Plan name (client-visible)
            <input
              className="auth-input"
              data-testid="mt-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canWrite}
            />
          </label>
          <label className="auth-field">
            Start date
            <input
              className="auth-input"
              data-testid="mt-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={!canWrite}
            />
          </label>
          <label className="auth-field">
            Client timezone (IANA)
            <input
              className="auth-input"
              data-testid="mt-timezone"
              value={timezone}
              placeholder="e.g. Europe/Vienna"
              onChange={(event) => {
                setTimezone(event.target.value);
                setTimezoneSet(false);
              }}
              disabled={!canWrite}
            />
          </label>
          <div className="mt-timezone-confirm">
            <button
              className="auth-button"
              type="button"
              data-testid="mt-timezone-confirm"
              disabled={!canWrite || busy !== null || timezoneSet}
              onClick={confirmTimezone}
            >
              {busy === "timezone" ? "Confirming…" : "Confirm timezone"}
            </button>
            {view.plan !== null && view.plan.timezone !== null ? (
              <p className="cd-muted" data-testid="mt-timezone-confirmed">
                Confirmed: {view.plan.timezone}
              </p>
            ) : null}
          </div>
        </div>
        {view.plan?.timezone === null || firstPublish ? (
          <p className="cd-muted" data-testid="mt-timezone-hint">
            Confirm the client&apos;s timezone before the first publish.
          </p>
        ) : null}
      </section>

      <section className="cd-preview-section" aria-label="Target options">
        <h2>Target options</h2>
        <p className="cd-muted">
          Each option carries one target set. In macro mode calories derive from
          protein, carbohydrate and fat at 4, 4 and 9 kcal per gram.
        </p>
        {options.map((option, index) => (
          <article
            className="mt-option"
            key={option.id}
            data-testid="mt-option"
          >
            <div className="mt-option__head">
              <label className="auth-field">
                Option label
                <input
                  className="auth-input"
                  data-testid={`mt-option-label-${index}`}
                  value={option.label}
                  placeholder={`Option ${index + 1}`}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((candidate, at) =>
                        at === index
                          ? { ...candidate, label: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                  disabled={!canWrite}
                />
              </label>
              <label className="auth-field">
                Target mode
                <select
                  className="auth-input"
                  data-testid={`mt-option-style-${index}`}
                  value={option.style}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((candidate, at) =>
                        at === index
                          ? {
                              ...candidate,
                              style: event.target.value as DraftOption["style"],
                            }
                          : candidate,
                      ),
                    )
                  }
                  disabled={!canWrite}
                >
                  <option value="macros">Macro targets</option>
                  <option value="calories">Calorie targets</option>
                </select>
              </label>
              {options.length > 1 ? (
                <button
                  className="auth-button"
                  type="button"
                  data-testid={`mt-option-remove-${index}`}
                  disabled={!canWrite}
                  onClick={() =>
                    setOptions((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
            {option.style === "macros" ? (
              <div className="mt-grid" data-testid={`mt-macros-${index}`}>
                <label className="auth-field">
                  Protein · g
                  <input
                    className="auth-input"
                    data-testid={`mt-protein-${index}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={option.protein}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((candidate, at) =>
                          at === index
                            ? { ...candidate, protein: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    disabled={!canWrite}
                  />
                </label>
                <label className="auth-field">
                  Carbohydrate · g
                  <input
                    className="auth-input"
                    data-testid={`mt-carbs-${index}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={option.carbs}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((candidate, at) =>
                          at === index
                            ? { ...candidate, carbs: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    disabled={!canWrite}
                  />
                </label>
                <label className="auth-field">
                  Fat · g
                  <input
                    className="auth-input"
                    data-testid={`mt-fat-${index}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={option.fat}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((candidate, at) =>
                          at === index
                            ? { ...candidate, fat: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    disabled={!canWrite}
                  />
                </label>
                <div
                  className="mt-kcal"
                  role="status"
                  data-testid={`mt-kcal-${index}`}
                >
                  <span>Calories (derived)</span>
                  <strong>{derivedKcal(option)} kcal</strong>
                </div>
              </div>
            ) : (
              <div className="mt-grid" data-testid={`mt-calories-${index}`}>
                <label className="auth-field">
                  Calories · kcal
                  <input
                    className="auth-input"
                    data-testid={`mt-calories-input-${index}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={option.calories}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((candidate, at) =>
                          at === index
                            ? { ...candidate, calories: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    disabled={!canWrite}
                  />
                </label>
                <p className="mt-mode-note" data-testid={`mt-mode-${index}`}>
                  Calorie-only target mode. Entered directly.
                </p>
              </div>
            )}
          </article>
        ))}
        <button
          className="auth-button"
          type="button"
          data-testid="mt-add-option"
          disabled={!canWrite || options.length >= 8}
          onClick={() => setOptions((current) => [...current, mintOption()])}
        >
          Add option
        </button>
      </section>

      <section className="cd-preview-section" aria-label="Weekday schedule">
        <h2>Weekday assignment</h2>
        {foreignSchedule ? (
          <p className="cd-muted" data-testid="mt-foreign-schedule">
            This plan uses a &quot;{foreignSchedule.mode}&quot; schedule created
            elsewhere. It is preserved unchanged on save; assign options per
            weekday by switching the mode below.
          </p>
        ) : null}
        <label className="auth-field">
          Schedule mode
          <select
            className="auth-input"
            data-testid="mt-schedule-mode"
            value={foreignSchedule ? "__foreign" : scheduleMode}
            onChange={(event) => {
              setForeignSchedule(null);
              setScheduleMode(event.target.value as "manual" | "weekly");
            }}
            disabled={!canWrite}
          >
            {foreignSchedule ? (
              <option value="__foreign">
                {foreignSchedule.mode} (preserved)
              </option>
            ) : null}
            <option value="weekly">Weekly (per weekday)</option>
            <option value="manual">Manual (one option)</option>
          </select>
        </label>
        {foreignSchedule ? null : scheduleMode === "manual" ? (
          <label className="auth-field">
            Applied option
            <select
              className="auth-input"
              data-testid="mt-manual-option"
              value={manualOption || options[0]?.id || ""}
              onChange={(event) => setManualOption(event.target.value)}
              disabled={!canWrite}
            >
              {options.map((option, index) => (
                <option key={option.id} value={option.id}>
                  {option.label.trim() || `Option ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <table
            className="catalog-table mt-weekdays"
            data-testid="mt-weekdays"
          >
            <thead>
              <tr>
                <th scope="col">Weekday</th>
                <th scope="col">Target option</th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((day) => (
                <tr key={day.key}>
                  <td>{day.label}</td>
                  <td>
                    <select
                      className="auth-input"
                      data-testid={`mt-day-${day.key}`}
                      value={days[day.key] ?? ""}
                      onChange={(event) =>
                        setDays((current) => ({
                          ...current,
                          [day.key]: event.target.value,
                        }))
                      }
                      disabled={!canWrite}
                    >
                      <option value="">{"\u2014"}</option>
                      {options.map((option, index) => (
                        <option key={option.id} value={option.id}>
                          {option.label.trim() || `Option ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!foreignSchedule &&
        scheduleMode === "weekly" &&
        missingDays.length > 0 ? (
          <p className="cd-muted" data-testid="mt-missing-days">
            Unassigned weekdays: {missingDays.join(", ")}. Publishing a weekly
            schedule requires all seven.
          </p>
        ) : null}
      </section>

      <section className="cd-preview-section" aria-label="Publish">
        <h2>Save and publish</h2>
        <div className="mt-actions">
          <button
            className="auth-button"
            type="button"
            data-testid="mt-save"
            disabled={!canWrite || busy !== null}
            onClick={save}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <label className="auth-field mt-effective">
            Effective date
            <input
              className="auth-input"
              data-testid="mt-effective-date"
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              disabled={!canWrite}
            />
          </label>
          <button
            className="auth-button"
            type="button"
            data-testid="mt-publish"
            disabled={!canWrite || busy !== null || firstPublish}
            onClick={publish}
          >
            {busy === "publish" ? "Publishing…" : "Publish version"}
          </button>
        </div>
        {firstPublish ? (
          <p className="cd-muted">Save the draft before publishing.</p>
        ) : null}
        {notice ? (
          <p className="daily-errors" role="status" data-testid="mt-notice">
            {notice}
          </p>
        ) : null}
      </section>

      <section className="cd-preview-section" aria-label="Version history">
        <h2>Published versions</h2>
        {view.versions.length === 0 ? (
          <p className="cd-muted" data-testid="mt-versions-empty">
            No published versions yet.
          </p>
        ) : (
          <table className="catalog-table" data-testid="mt-versions">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Effective</th>
                <th scope="col">Timezone</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {view.versions.map((version) => (
                <tr key={version.id} data-testid="mt-version-row">
                  <td>v{version.versionSeq}</td>
                  <td>{version.effectiveDate}</td>
                  <td>{version.effectiveTimezone}</td>
                  <td>
                    {version.id === view.currentVersionId
                      ? "Current"
                      : view.upcoming &&
                          version.versionSeq === view.upcoming.versionSeq
                        ? `Starts ${view.upcoming.effectiveDate}`
                        : "Published"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
