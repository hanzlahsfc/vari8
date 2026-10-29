// FULL-PACKAGE SLICE of #175
"use client";

/**
 * Card 10 (#175): the client's published macro targets on the Nutrition
 * screen, beside the card 09 actuals. Reads the own iifym-plans route;
 * the server resolves WHICH version applies, the screen resolves WHICH
 * option applies on the selected date via the shared canvas
 * `scheduledOption` (weekly weekday keys "1" to "7", Monday first).
 *
 * One applicable target set renders per date. Macros-style targets show
 * protein/carbohydrate/fat and derive kcal at render (4/4/9 over the
 * present fields, midpoints for ranges) - matching
 * `caloriesFromMacros` in lib/nutrition/math.ts, duplicated because the
 * canvas never imports server modules. Calories-style targets are
 * entered directly; the card labels which mode it is in. There is no
 * calories input anywhere.
 */

import { useEffect, useState } from "react";

import { scheduledOption, targetNumber } from "../coach/plans/domain";
import {
  fetchOwnIifymPlan,
  type IifymPayloadWire,
  type IifymTargetValueWire,
  type IifymTargetsWire,
} from "../data/nutrition";
import { Empty } from "../coach/ui";

const MACRO_FIELDS = [
  { id: "protein", label: "Protein" },
  { id: "carbs", label: "Carbohydrate" },
  { id: "fat", label: "Fat" },
] as const;

const NOT_SET = "Not set";

function formatTarget(value: IifymTargetValueWire | undefined, unit: string) {
  if (!value) return NOT_SET;
  if (value.kind === "range") return `${value.min}\u2013${value.max} ${unit}`;
  if (value.kind === "minimum") return `≥${value.value} ${unit}`;
  return `${value.value} ${unit}`;
}

/** 4/4/9 over the target values present; ranges use their midpoint. */
function derivedTargetKcal(targets: IifymTargetsWire): number {
  return Math.round(
    targetNumber(targets.protein) * 4 +
      targetNumber(targets.carbs) * 4 +
      targetNumber(targets.fat) * 9,
  );
}

function targetKcal(targets: IifymTargetsWire): number | null {
  if (targets.style === "calories") {
    return targets.calories ? Math.round(targetNumber(targets.calories)) : null;
  }
  const hasMacro =
    targets.protein !== undefined ||
    targets.carbs !== undefined ||
    targets.fat !== undefined;
  return hasMacro ? derivedTargetKcal(targets) : null;
}

export function NutritionTargets({
  workspaceId,
  date,
}: {
  workspaceId: string;
  date: string;
}) {
  const [loaded, setLoaded] = useState<{
    workspaceId: string;
    payload: IifymPayloadWire | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnIifymPlan(workspaceId)
      .then((view) => {
        if (!cancelled)
          setLoaded({
            workspaceId,
            payload: view.current?.payload ?? null,
            error: false,
          });
      })
      .catch(() => {
        if (!cancelled)
          setLoaded({ workspaceId, payload: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Only a response for the current workspaceId counts, a stale load
  // from a previous binding reads as loading, never as content.
  const current =
    loaded !== null && loaded.workspaceId === workspaceId ? loaded : null;

  if (current === null)
    return (
      <section className="cd-preview-section" aria-label="Macro targets">
        <h2>Your targets</h2>
        <div className="client-app-loading" role="status">
          Loading your targets…
        </div>
      </section>
    );

  if (current.error)
    return (
      <section className="cd-preview-section" aria-label="Macro targets">
        <h2>Your targets</h2>
        <Empty title="Your targets could not be loaded">
          Check your connection and reload the page.
        </Empty>
      </section>
    );

  const payload = current.payload;
  if (payload === null || payload.options.length === 0)
    return (
      <section className="cd-preview-section" aria-label="Macro targets">
        <h2>Your targets</h2>
        <p className="cd-muted ca-nutrition-empty" role="status">
          No targets published yet.
        </p>
      </section>
    );

  const schedule = payload.schedule;
  const ids = payload.options.map((option) => option.id);
  const optionId = schedule
    ? scheduledOption(schedule, ids, date)
    : ids[0];
  const option = payload.options.find((entry) => entry.id === optionId);

  if (!option)
    return (
      <section className="cd-preview-section" aria-label="Macro targets">
        <h2>Your targets</h2>
        <p className="cd-muted ca-nutrition-empty" role="status">
          No targets apply on {date}.
        </p>
      </section>
    );

  const targets = option.targets;
  const kcal = targetKcal(targets);

  return (
    <section
      className="cd-preview-section"
      aria-label="Macro targets"
      data-testid="nutrition-targets"
    >
      <h2>Your targets</h2>
      <p className="cd-muted">
        {option.label} ·{" "}
        {targets.style === "calories" ? "Calorie targets" : "Macro targets"} for{" "}
        {date}
      </p>
      <dl className="ca-nutrition-summary" aria-label="Target values">
        {targets.style === "macros" ? (
          MACRO_FIELDS.map((field) => (
            <div key={field.id}>
              <dt>{field.label}</dt>
              <dd data-missing={targets[field.id] === undefined ? true : undefined}>
                {formatTarget(targets[field.id], "g")}
              </dd>
            </div>
          ))
        ) : (
          <div>
            <dt>Calories</dt>
            <dd data-missing={targets.calories === undefined ? true : undefined}>
              {formatTarget(targets.calories, "kcal")}
            </dd>
          </div>
        )}
        {targets.style === "macros" ? (
          <div>
            <dt>Calories</dt>
            <dd>{kcal === null ? NOT_SET : `${kcal} kcal`}</dd>
          </div>
        ) : null}
      </dl>
      <p className="cd-caption" data-testid="nutrition-targets-mode">
        {targets.style === "calories"
          ? "Calorie-only target - entered directly."
          : "Macro targets - calories derive at 4 kcal per gram of protein or carbohydrate and 9 kcal per gram of fat."}
      </p>
    </section>
  );
}
