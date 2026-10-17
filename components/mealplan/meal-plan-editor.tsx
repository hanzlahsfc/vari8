"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { MealPlanDraft, MealPlanTargetMode } from "@/lib/mealplan/service";
import { MealPlanVersionView } from "@/components/mealplan/plan-version-view";

import {
  confirmMealPlanTimezoneAction,
  publishMealPlanVersionAction,
  saveMealPlanDraftAction,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/actions";

/**
 * MEAL-PLAN-I1 — staff meal-plan draft editor (decision #115).
 *
 * Client-side editing model only: every value is entered manually,
 * serialized to the strict payload contract, and re-validated
 * server-side. Nothing is computed — no totals, percentages,
 * conversions, or variant selection. Blank numeric fields stay absent;
 * an entered "0" stays 0.
 *
 * The timezone control is an explicit confirmation: on an existing plan
 * it calls the timezone action; before the container exists it records
 * the confirmation locally and sends it with the first save.
 */

const MODES: readonly MealPlanTargetMode[] = ["FIXED", "RANGE", "MINIMUM"];
const MACROS = ["kcal", "proteinG", "carbsG", "fatG"] as const;
type Macro = (typeof MACROS)[number];

type TargetFields = { value: string; min: string; max: string };
type MealFields = {
  name: string;
  time: string;
  frequency: string;
  foodText: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
};
type VariantFields = {
  id: string;
  label: string;
  targetMode: MealPlanTargetMode;
  targets: Record<Macro, TargetFields>;
  meals: MealFields[];
};

const emptyTarget = (): TargetFields => ({ value: "", min: "", max: "" });
const emptyTargets = (): Record<Macro, TargetFields> => ({
  kcal: emptyTarget(),
  proteinG: emptyTarget(),
  carbsG: emptyTarget(),
  fatG: emptyTarget(),
});
const emptyMeal = (): MealFields => ({
  name: "",
  time: "",
  frequency: "",
  foodText: "",
  kcal: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
});
const emptyVariant = (): VariantFields => ({
  id: "",
  label: "",
  targetMode: "FIXED",
  targets: emptyTargets(),
  meals: [emptyMeal()],
});

function toFields(draft: MealPlanDraft | null): VariantFields[] {
  if (!draft || draft.variants.length === 0) return [emptyVariant()];
  return draft.variants.map((v) => ({
    id: v.id,
    label: v.label,
    targetMode: v.targetMode,
    targets: Object.fromEntries(
      MACROS.map((m) => {
        const t = v.targets[m];
        const f = emptyTarget();
        if (t !== null) {
          if ("value" in t) f.value = String(t.value);
          else {
            f.min = String(t.min);
            if ("max" in t) f.max = String(t.max);
          }
        }
        return [m, f];
      }),
    ) as Record<Macro, TargetFields>,
    meals: v.meals.length
      ? v.meals.map((m) => ({
          name: m.name,
          time: m.time ?? "",
          frequency: m.frequency ?? "",
          foodText: m.foodText,
          kcal: m.kcal === undefined ? "" : String(m.kcal),
          proteinG: m.proteinG === undefined ? "" : String(m.proteinG),
          carbsG: m.carbsG === undefined ? "" : String(m.carbsG),
          fatG: m.fatG === undefined ? "" : String(m.fatG),
        }))
      : [emptyMeal()],
  }));
}

const num = (s: string): number | undefined =>
  s.trim() === "" ? undefined : Number(s);

function serializeVariants(variants: VariantFields[]): unknown {
  return {
    variants: variants.map((v) => ({
      ...(v.id.trim() !== "" ? { id: v.id.trim() } : {}),
      label: v.label,
      targetMode: v.targetMode,
      targets: Object.fromEntries(
        MACROS.map((m) => {
          const f = v.targets[m];
          if (
            f.value.trim() === "" &&
            f.min.trim() === "" &&
            f.max.trim() === ""
          )
            return [m, null];
          if (v.targetMode === "FIXED")
            return [m, f.value.trim() === "" ? null : { value: num(f.value) }];
          if (v.targetMode === "MINIMUM")
            return [m, f.min.trim() === "" ? null : { min: num(f.min) }];
          return [
            m,
            {
              ...(f.min.trim() !== "" ? { min: num(f.min) } : {}),
              ...(f.max.trim() !== "" ? { max: num(f.max) } : {}),
            },
          ];
        }),
      ),
      meals: v.meals.map((m, j) => ({
        order: j + 1,
        name: m.name,
        ...(m.time.trim() !== "" ? { time: m.time.trim() } : {}),
        ...(m.frequency.trim() !== "" ? { frequency: m.frequency.trim() } : {}),
        foodText: m.foodText,
        ...(num(m.kcal) !== undefined ? { kcal: num(m.kcal) } : {}),
        ...(num(m.proteinG) !== undefined ? { proteinG: num(m.proteinG) } : {}),
        ...(num(m.carbsG) !== undefined ? { carbsG: num(m.carbsG) } : {}),
        ...(num(m.fatG) !== undefined ? { fatG: num(m.fatG) } : {}),
      })),
    })),
  };
}

export function MealPlanEditor({
  workspaceId,
  clientProfileId,
  plan,
  canWrite,
}: {
  workspaceId: string;
  clientProfileId: string;
  plan: {
    id: string;
    title: string;
    timezone: string | null;
    draftRevision: number;
    draft: MealPlanDraft;
  } | null;
  canWrite: boolean;
}) {
  const [title, setTitle] = useState(plan?.title ?? "");
  const [timezone, setTimezone] = useState(plan?.timezone ?? "");
  const [timezoneSet, setTimezoneSet] = useState(plan?.timezone !== null);
  const [revision, setRevision] = useState(plan?.draftRevision ?? 0);
  const [variants, setVariants] = useState<VariantFields[]>(() =>
    toFields(plan?.draft ?? null),
  );
  const [effectiveDate, setEffectiveDate] = useState("");
  const [status, setStatus] = useState<
    | { tone: "ok" | "error"; message: string }
    | { tone: "idle"; message: string }
  >({ tone: "idle", message: "" });
  const [pending, startTransition] = useTransition();

  const patchVariant = (i: number, patch: Partial<VariantFields>) =>
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const patchMeal = (i: number, j: number, patch: Partial<MealFields>) =>
    setVariants((vs) =>
      vs.map((v, vi) =>
        vi === i
          ? {
              ...v,
              meals: v.meals.map((m, mj) =>
                mj === j ? { ...m, ...patch } : m,
              ),
            }
          : v,
      ),
    );
  const patchTarget = (i: number, m: Macro, patch: Partial<TargetFields>) =>
    setVariants((vs) =>
      vs.map((v, vi) =>
        vi === i
          ? {
              ...v,
              targets: {
                ...v.targets,
                [m]: { ...v.targets[m], ...patch },
              },
            }
          : v,
      ),
    );

  const confirmTimezone = () =>
    startTransition(async () => {
      const tz = timezone.trim();
      if (tz === "") {
        setStatus({ tone: "error", message: "Enter an IANA timezone." });
        return;
      }
      if (plan === null) {
        // No container yet — record the explicit confirmation locally;
        // the first draft save carries it and stamps provenance.
        setTimezoneSet(true);
        setStatus({
          tone: "ok",
          message: `Timezone confirmed: ${tz} — saved with the plan.`,
        });
        return;
      }
      const r = await confirmMealPlanTimezoneAction({
        workspaceId,
        clientProfileId,
        timezone: tz,
      });
      if (r.status === "error") {
        setStatus({ tone: "error", message: r.message });
        return;
      }
      setTimezoneSet(true);
      setStatus({ tone: "ok", message: `Timezone confirmed: ${tz}` });
    });

  const saveDraft = () =>
    startTransition(async () => {
      const r = await saveMealPlanDraftAction({
        workspaceId,
        clientProfileId,
        expectedRevision: revision,
        ...(plan === null ? { title } : {}),
        ...(timezoneSet && timezone.trim() !== plan?.timezone
          ? { timezone: timezone.trim() }
          : {}),
        draft: serializeVariants(variants),
      });
      if (r.status !== "ok") {
        setStatus({
          tone: "error",
          message: r.status === "error" ? r.message : "Save failed.",
        });
        return;
      }
      if (typeof r.revision === "number") setRevision(r.revision);
      setStatus({ tone: "ok", message: "Draft saved." });
    });

  const publish = () =>
    startTransition(async () => {
      const r = await publishMealPlanVersionAction({
        workspaceId,
        clientProfileId,
        expectedRevision: revision,
        effectiveDate,
      });
      setStatus(
        r.status === "ok"
          ? { tone: "ok", message: r.message }
          : {
              tone: "error",
              message: r.status === "error" ? r.message : "Publish failed.",
            },
      );
    });

  const statusNode: ReactNode =
    status.message === "" ? null : (
      <p
        className={status.tone === "error" ? "daily-errors" : "app-lede"}
        role={status.tone === "error" ? "alert" : "status"}
        data-testid="mealplan-status"
      >
        {status.message}
      </p>
    );

  if (!canWrite) {
    return (
      <div data-testid="mealplan-readonly">
        {statusNode}
        {plan === null || plan.draft.variants.length === 0 ? (
          <p className="app-lede">No draft meal plan yet.</p>
        ) : (
          <MealPlanVersionView
            payload={plan.draft}
            testidPrefix="mealplan-draft-view"
          />
        )}
      </div>
    );
  }

  return (
    <div data-testid="mealplan-editor">
      {statusNode}

      <section className="tracker-section">
        <h2 className="tracker-section__title">Client timezone</h2>
        <p className="app-lede">
          Confirm the client&apos;s scheduling timezone. It applies to the
          plan&apos;s effective dates — published versions keep their original
          timezone.
        </p>
        <label htmlFor="mealplan-timezone">IANA timezone</label>
        <input
          id="mealplan-timezone"
          data-testid="mealplan-timezone"
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
            setTimezoneSet(false);
          }}
          placeholder="e.g. Europe/London"
          disabled={pending}
        />
        <button
          type="button"
          data-testid="mealplan-tz-confirm"
          onClick={confirmTimezone}
          disabled={pending}
        >
          Confirm timezone
        </button>
        {plan !== null && plan.timezone !== null ? (
          <p className="app-lede">Confirmed: {plan.timezone}</p>
        ) : null}
      </section>

      <section className="tracker-section">
        <h2 className="tracker-section__title">Draft</h2>
        {plan === null ? (
          <>
            <label htmlFor="mealplan-title">Plan title</label>
            <input
              id="mealplan-title"
              data-testid="mealplan-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              disabled={pending}
            />
          </>
        ) : (
          <p className="app-lede">
            {plan.title} — draft revision {revision}
          </p>
        )}

        {variants.map((v, i) => (
          <fieldset key={i} data-testid={`variant-${i}`}>
            <legend>Variant {i + 1}</legend>
            <label htmlFor={`variant-label-${i}`}>Label</label>
            <input
              id={`variant-label-${i}`}
              data-testid={`variant-label-${i}`}
              value={v.label}
              onChange={(e) => patchVariant(i, { label: e.target.value })}
              maxLength={80}
              disabled={pending}
            />
            <label htmlFor={`variant-mode-${i}`}>Target mode</label>
            <select
              id={`variant-mode-${i}`}
              data-testid={`variant-mode-${i}`}
              value={v.targetMode}
              onChange={(e) =>
                patchVariant(i, {
                  targetMode: e.target.value as MealPlanTargetMode,
                })
              }
              disabled={pending}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {MACROS.map((m) => (
              <fieldset key={m} data-testid={`target-${m}-${i}`}>
                <legend>
                  {m} target ({v.targetMode})
                </legend>
                {v.targetMode === "FIXED" ? (
                  <input
                    aria-label={`${m} value`}
                    data-testid={`target-${m}-${i}-value`}
                    inputMode="decimal"
                    value={v.targets[m].value}
                    onChange={(e) =>
                      patchTarget(i, m, { value: e.target.value })
                    }
                    disabled={pending}
                  />
                ) : (
                  <>
                    <input
                      aria-label={`${m} min`}
                      data-testid={`target-${m}-${i}-min`}
                      inputMode="decimal"
                      value={v.targets[m].min}
                      onChange={(e) =>
                        patchTarget(i, m, { min: e.target.value })
                      }
                      disabled={pending}
                    />
                    {v.targetMode === "RANGE" ? (
                      <input
                        aria-label={`${m} max`}
                        data-testid={`target-${m}-${i}-max`}
                        inputMode="decimal"
                        value={v.targets[m].max}
                        onChange={(e) =>
                          patchTarget(i, m, { max: e.target.value })
                        }
                        disabled={pending}
                      />
                    ) : null}
                  </>
                )}
              </fieldset>
            ))}

            {v.meals.map((m, j) => (
              <fieldset key={j} data-testid={`meal-${i}-${j}`}>
                <legend>Meal {j + 1}</legend>
                <label htmlFor={`meal-name-${i}-${j}`}>Name</label>
                <input
                  id={`meal-name-${i}-${j}`}
                  data-testid={`meal-name-${i}-${j}`}
                  value={m.name}
                  onChange={(e) => patchMeal(i, j, { name: e.target.value })}
                  maxLength={80}
                  disabled={pending}
                />
                <label htmlFor={`meal-time-${i}-${j}`}>Time (optional)</label>
                <input
                  id={`meal-time-${i}-${j}`}
                  data-testid={`meal-time-${i}-${j}`}
                  value={m.time}
                  onChange={(e) => patchMeal(i, j, { time: e.target.value })}
                  maxLength={40}
                  disabled={pending}
                />
                <label htmlFor={`meal-frequency-${i}-${j}`}>
                  Frequency (optional)
                </label>
                <input
                  id={`meal-frequency-${i}-${j}`}
                  data-testid={`meal-frequency-${i}-${j}`}
                  value={m.frequency}
                  onChange={(e) =>
                    patchMeal(i, j, { frequency: e.target.value })
                  }
                  maxLength={80}
                  disabled={pending}
                />
                <label htmlFor={`meal-food-${i}-${j}`}>Food</label>
                <textarea
                  id={`meal-food-${i}-${j}`}
                  data-testid={`meal-food-${i}-${j}`}
                  value={m.foodText}
                  onChange={(e) =>
                    patchMeal(i, j, { foodText: e.target.value })
                  }
                  maxLength={2000}
                  rows={3}
                  disabled={pending}
                />
                {MACROS.map((macro) => (
                  <span key={macro}>
                    <label htmlFor={`meal-${macro}-${i}-${j}`}>
                      {macro} (optional)
                    </label>
                    <input
                      id={`meal-${macro}-${i}-${j}`}
                      data-testid={`meal-${macro}-${i}-${j}`}
                      inputMode="decimal"
                      value={m[macro]}
                      onChange={(e) =>
                        patchMeal(i, j, { [macro]: e.target.value })
                      }
                      disabled={pending}
                    />
                  </span>
                ))}
                {v.meals.length > 1 ? (
                  <button
                    type="button"
                    data-testid={`meal-remove-${i}-${j}`}
                    onClick={() =>
                      patchVariant(i, {
                        meals: v.meals.filter((_, mj) => mj !== j),
                      })
                    }
                    disabled={pending}
                  >
                    Remove meal
                  </button>
                ) : null}
              </fieldset>
            ))}
            {v.meals.length < 24 ? (
              <button
                type="button"
                data-testid={`meal-add-${i}`}
                onClick={() =>
                  patchVariant(i, { meals: [...v.meals, emptyMeal()] })
                }
                disabled={pending}
              >
                Add meal
              </button>
            ) : null}
            {variants.length > 1 ? (
              <button
                type="button"
                data-testid={`variant-remove-${i}`}
                onClick={() =>
                  setVariants((vs) => vs.filter((_, vi) => vi !== i))
                }
                disabled={pending}
              >
                Remove variant
              </button>
            ) : null}
          </fieldset>
        ))}
        {variants.length < 8 ? (
          <button
            type="button"
            data-testid="variant-add"
            onClick={() => setVariants((vs) => [...vs, emptyVariant()])}
            disabled={pending}
          >
            Add variant
          </button>
        ) : null}

        <button
          type="button"
          data-testid="mealplan-save-draft"
          onClick={saveDraft}
          disabled={pending}
        >
          Save draft
        </button>
      </section>

      <section className="tracker-section">
        <h2 className="tracker-section__title">Publish</h2>
        <p className="app-lede">
          Publishing assigns this draft to the client as a new immutable version
          effective on the date below (start of that day in the confirmed
          timezone).
        </p>
        <label htmlFor="mealplan-effective-date">
          Effective date (YYYY-MM-DD)
        </label>
        <input
          id="mealplan-effective-date"
          data-testid="mealplan-effective-date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          placeholder="YYYY-MM-DD"
          disabled={pending}
        />
        <button
          type="button"
          data-testid="mealplan-publish"
          onClick={publish}
          disabled={pending}
        >
          Publish version
        </button>
      </section>
    </div>
  );
}
