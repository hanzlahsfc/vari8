"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { Food } from "@/lib/nutrition/math";
import type {
  MealPlanDraft,
  MealTargets,
  TargetValue,
  VariantSchedule,
} from "@/lib/mealplan/service";
import { MealPlanVersionView } from "@/components/mealplan/plan-version-view";

import {
  confirmMealPlanTimezoneAction,
  publishMealPlanVersionAction,
  saveMealPlanDraftAction,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/actions";

/**
 * MEAL-PLAN-I1 + PR-M5 — staff meal-plan draft editor (decision #115,
 * canvas-shaped payload). Edits the canvas `MealPlan` draft shape:
 * plan name/start date, variants with optional daily targets, meals of
 * catalog-food portions with approved swaps, a per-meal target, an
 * active variant and a manual/weekly/cycle schedule. Blank numeric
 * fields stay absent (#36); the server re-validates everything.
 * Published versions are immutable (O11) — corrections publish a new
 * version, never an edit.
 */

const TARGET_FIELDS = ["calories", "protein", "carbs", "fat"] as const;
type TargetField = (typeof TARGET_FIELDS)[number];

type TargetValueFields = {
  kind: "" | "fixed" | "range" | "minimum";
  value: string;
  min: string;
  max: string;
};
type TargetsFields = {
  enabled: boolean;
  style: "calories" | "macros";
  fields: Record<TargetField, TargetValueFields>;
};
type SwapFields = { foodId: string; quantity: string; note: string };
type PortionFields = { foodId: string; quantity: string; swaps: SwapFields[] };
type MealFields = {
  id: string;
  label: string;
  time: string;
  frequency: string;
  target: TargetsFields;
  portions: PortionFields[];
};
type VariantFields = {
  id: string;
  label: string;
  dailyTarget: TargetsFields;
  meals: MealFields[];
};
type ScheduleFields =
  | { mode: "manual"; selectedVariantId: string }
  | { mode: "weekly"; days: Record<string, string> }
  | {
      mode: "cycle";
      anchorDate: string;
      steps: { variantId: string; days: string }[];
    };

const emptyTargetValue = (): TargetValueFields => ({
  kind: "",
  value: "",
  min: "",
  max: "",
});
const emptyTargets = (): TargetsFields => ({
  enabled: false,
  style: "macros",
  fields: {
    calories: emptyTargetValue(),
    protein: emptyTargetValue(),
    carbs: emptyTargetValue(),
    fat: emptyTargetValue(),
  },
});
const emptyMeal = (): MealFields => ({
  id: "",
  label: "",
  time: "12:00",
  frequency: "",
  target: emptyTargets(),
  portions: [],
});
const emptyVariant = (): VariantFields => ({
  id: "",
  label: "",
  dailyTarget: emptyTargets(),
  meals: [emptyMeal()],
});

function targetsToFields(targets: MealTargets | undefined): TargetsFields {
  const f = emptyTargets();
  if (!targets) return f;
  f.enabled = true;
  f.style = targets.style;
  for (const field of TARGET_FIELDS) {
    const t = targets[field];
    if (!t) continue;
    const out = f.fields[field];
    if (t.kind === "range") {
      out.kind = "range";
      out.min = String(t.min);
      out.max = String(t.max);
    } else {
      out.kind = t.kind;
      out.value = String(t.value);
    }
  }
  return f;
}

function toFields(draft: MealPlanDraft | null): {
  name: string;
  startDate: string;
  activeVariantId: string;
  schedule: ScheduleFields;
  variants: VariantFields[];
} {
  const variants: VariantFields[] = (draft?.variants ?? []).map((v) => ({
    id: v.id,
    label: v.label,
    dailyTarget: targetsToFields(v.dailyTarget),
    meals: v.meals.length
      ? v.meals.map((m) => ({
          id: m.id,
          label: m.label,
          time: m.time,
          frequency: m.frequency ?? "",
          target: targetsToFields(m.target),
          portions: m.portions.map((p) => ({
            foodId: p.foodId,
            quantity: String(p.quantity),
            swaps: (p.swaps ?? []).map((s) => ({
              foodId: s.foodId,
              quantity: String(s.quantity),
              note: s.note ?? "",
            })),
          })),
        }))
      : [emptyMeal()],
  }));
  const schedule: ScheduleFields =
    draft?.schedule?.mode === "weekly"
      ? { mode: "weekly", days: { ...draft.schedule.days } }
      : draft?.schedule?.mode === "cycle"
        ? {
            mode: "cycle",
            anchorDate: draft.schedule.anchorDate,
            steps: draft.schedule.steps.map((s) => ({
              variantId: s.variantId,
              days: String(s.days),
            })),
          }
        : {
            mode: "manual",
            selectedVariantId:
              draft?.schedule?.mode === "manual"
                ? draft.schedule.selectedVariantId
                : (draft?.activeVariantId ?? ""),
          };
  return {
    name: draft?.name ?? "",
    startDate: draft?.startDate ?? "",
    activeVariantId: draft?.activeVariantId ?? "",
    schedule,
    variants: variants.length ? variants : [emptyVariant()],
  };
}

const num = (s: string): number | undefined =>
  s.trim() === "" ? undefined : Number(s);

function serializeTargetValue(f: TargetValueFields): TargetValue | null {
  if (f.kind === "") return null;
  if (f.kind === "range") {
    if (f.min.trim() === "" || f.max.trim() === "") return null;
    return { kind: "range", min: num(f.min)!, max: num(f.max)! };
  }
  if (f.value.trim() === "") return null;
  return { kind: f.kind, value: num(f.value)! };
}

function serializeTargets(f: TargetsFields): MealTargets | null {
  if (!f.enabled) return null;
  const fields =
    f.style === "calories"
      ? (["calories"] as const)
      : (["protein", "carbs", "fat"] as const);
  const out: Record<string, TargetValue> = {};
  for (const field of fields) {
    const t = serializeTargetValue(f.fields[field]);
    if (t) out[field] = t;
  }
  return { style: f.style, ...out } as MealTargets;
}

function serializeSchedule(s: ScheduleFields): VariantSchedule | null {
  if (s.mode === "manual") {
    if (s.selectedVariantId.trim() === "") return null;
    return { mode: "manual", selectedVariantId: s.selectedVariantId.trim() };
  }
  if (s.mode === "weekly") {
    const days: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.days))
      if (v.trim() !== "") days[k] = v;
    return { mode: "weekly", days } as VariantSchedule;
  }
  return {
    mode: "cycle",
    anchorDate: s.anchorDate.trim(),
    steps: s.steps
      .filter((st) => st.variantId.trim() !== "" && st.days.trim() !== "")
      .map((st) => ({ variantId: st.variantId.trim(), days: num(st.days)! })),
  };
}

function serializeDraft(input: {
  name: string;
  startDate: string;
  activeVariantId: string;
  schedule: ScheduleFields;
  variants: VariantFields[];
}): unknown {
  const draft: Record<string, unknown> = {
    variants: input.variants.map((v) => ({
      ...(v.id.trim() !== "" ? { id: v.id.trim() } : {}),
      label: v.label,
      meals: v.meals.map((m) => ({
        ...(m.id.trim() !== "" ? { id: m.id.trim() } : {}),
        label: m.label,
        time: m.time,
        ...(m.frequency.trim() !== "" ? { frequency: m.frequency.trim() } : {}),
        portions: m.portions.map((p) => ({
          foodId: p.foodId.trim(),
          quantity: num(p.quantity),
          ...(p.swaps.length
            ? {
                swaps: p.swaps.map((s) => ({
                  foodId: s.foodId.trim(),
                  quantity: num(s.quantity),
                  ...(s.note.trim() !== "" ? { note: s.note.trim() } : {}),
                })),
              }
            : {}),
        })),
        ...(serializeTargets(m.target)
          ? { target: serializeTargets(m.target) }
          : {}),
      })),
      ...(serializeTargets(v.dailyTarget)
        ? { dailyTarget: serializeTargets(v.dailyTarget) }
        : {}),
    })),
  };
  if (input.name.trim() !== "") draft.name = input.name.trim();
  if (input.startDate.trim() !== "") draft.startDate = input.startDate.trim();
  if (input.activeVariantId.trim() !== "")
    draft.activeVariantId = input.activeVariantId.trim();
  const schedule = serializeSchedule(input.schedule);
  if (schedule) draft.schedule = schedule;
  return draft;
}

function TargetsEditor({
  value,
  onChange,
  disabled,
  testidPrefix,
  legend,
}: {
  value: TargetsFields;
  onChange: (next: TargetsFields) => void;
  disabled: boolean;
  testidPrefix: string;
  legend: string;
}) {
  const fields =
    value.style === "calories"
      ? (["calories"] as const)
      : (["protein", "carbs", "fat"] as const);
  return (
    <fieldset data-testid={testidPrefix}>
      <legend>{legend}</legend>
      <label>
        <input
          type="checkbox"
          data-testid={`${testidPrefix}-enabled`}
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          disabled={disabled}
        />{" "}
        Set targets
      </label>
      {value.enabled ? (
        <>
          <select
            aria-label={`${legend} style`}
            data-testid={`${testidPrefix}-style`}
            value={value.style}
            onChange={(e) =>
              onChange({
                ...value,
                style: e.target.value as TargetsFields["style"],
              })
            }
            disabled={disabled}
          >
            <option value="calories">Calories only</option>
            <option value="macros">Macros</option>
          </select>
          {fields.map((field) => {
            const tv = value.fields[field];
            const patch = (p: Partial<TargetValueFields>) =>
              onChange({
                ...value,
                fields: { ...value.fields, [field]: { ...tv, ...p } },
              });
            return (
              <span key={field} data-testid={`${testidPrefix}-${field}`}>
                <label>{field}</label>
                <select
                  aria-label={`${field} kind`}
                  data-testid={`${testidPrefix}-${field}-kind`}
                  value={tv.kind}
                  onChange={(e) =>
                    patch({
                      kind: e.target.value as TargetValueFields["kind"],
                    })
                  }
                  disabled={disabled}
                >
                  <option value="">unset</option>
                  <option value="fixed">fixed</option>
                  <option value="range">range</option>
                  <option value="minimum">minimum</option>
                </select>
                {tv.kind === "range" ? (
                  <>
                    <input
                      aria-label={`${field} min`}
                      data-testid={`${testidPrefix}-${field}-min`}
                      inputMode="decimal"
                      value={tv.min}
                      onChange={(e) => patch({ min: e.target.value })}
                      disabled={disabled}
                    />
                    <input
                      aria-label={`${field} max`}
                      data-testid={`${testidPrefix}-${field}-max`}
                      inputMode="decimal"
                      value={tv.max}
                      onChange={(e) => patch({ max: e.target.value })}
                      disabled={disabled}
                    />
                  </>
                ) : tv.kind !== "" ? (
                  <input
                    aria-label={`${field} value`}
                    data-testid={`${testidPrefix}-${field}-value`}
                    inputMode="decimal"
                    value={tv.value}
                    onChange={(e) => patch({ value: e.target.value })}
                    disabled={disabled}
                  />
                ) : null}
              </span>
            );
          })}
        </>
      ) : null}
    </fieldset>
  );
}

export function MealPlanEditor({
  workspaceId,
  clientProfileId,
  plan,
  canWrite,
  foods,
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
  foods?: ReadonlyMap<string, Food>;
}) {
  const initial = toFields(plan?.draft ?? null);
  const [title, setTitle] = useState(plan?.title ?? "");
  const [timezone, setTimezone] = useState(plan?.timezone ?? "");
  const [timezoneSet, setTimezoneSet] = useState(plan?.timezone !== null);
  const [revision, setRevision] = useState(plan?.draftRevision ?? 0);
  const [name, setName] = useState(initial.name);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [activeVariantId, setActiveVariantId] = useState(
    initial.activeVariantId,
  );
  const [schedule, setSchedule] = useState<ScheduleFields>(initial.schedule);
  const [variants, setVariants] = useState<VariantFields[]>(initial.variants);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [status, setStatus] = useState<
    | { tone: "ok" | "error"; message: string }
    | { tone: "idle"; message: string }
  >({ tone: "idle", message: "" });
  const [pending, startTransition] = useTransition();

  const variantOptions = variants.filter((v) => v.id.trim() !== "");

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

  const confirmTimezone = () =>
    startTransition(async () => {
      const tz = timezone.trim();
      if (tz === "") {
        setStatus({ tone: "error", message: "Enter an IANA timezone." });
        return;
      }
      if (plan === null) {
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
        draft: serializeDraft({
          name,
          startDate,
          activeVariantId,
          schedule,
          variants,
        }),
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
            foods={foods}
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

        <label htmlFor="mealplan-name">Plan name</label>
        <input
          id="mealplan-name"
          data-testid="mealplan-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          disabled={pending}
        />
        <label htmlFor="mealplan-start-date">Start date (YYYY-MM-DD)</label>
        <input
          id="mealplan-start-date"
          data-testid="mealplan-start-date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="YYYY-MM-DD"
          disabled={pending}
        />

        {variants.map((v, i) => (
          <fieldset key={i} data-testid={`variant-${i}`}>
            <legend>Variant {i + 1}</legend>
            <label htmlFor={`variant-id-${i}`}>Id (blank = new)</label>
            <input
              id={`variant-id-${i}`}
              data-testid={`variant-id-${i}`}
              value={v.id}
              onChange={(e) => patchVariant(i, { id: e.target.value })}
              maxLength={64}
              disabled={pending}
            />
            <label htmlFor={`variant-label-${i}`}>Label</label>
            <input
              id={`variant-label-${i}`}
              data-testid={`variant-label-${i}`}
              value={v.label}
              onChange={(e) => patchVariant(i, { label: e.target.value })}
              maxLength={80}
              disabled={pending}
            />

            <TargetsEditor
              value={v.dailyTarget}
              onChange={(t) => patchVariant(i, { dailyTarget: t })}
              disabled={pending}
              testidPrefix={`variant-${i}-daily-target`}
              legend="Daily target"
            />

            {v.meals.map((m, j) => (
              <fieldset key={j} data-testid={`meal-${i}-${j}`}>
                <legend>Meal {j + 1}</legend>
                <label htmlFor={`meal-label-${i}-${j}`}>Label</label>
                <input
                  id={`meal-label-${i}-${j}`}
                  data-testid={`meal-label-${i}-${j}`}
                  value={m.label}
                  onChange={(e) => patchMeal(i, j, { label: e.target.value })}
                  maxLength={80}
                  disabled={pending}
                />
                <label htmlFor={`meal-time-${i}-${j}`}>Time (HH:MM)</label>
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

                {m.portions.map((p, pi) => (
                  <fieldset key={pi} data-testid={`portion-${i}-${j}-${pi}`}>
                    <legend>Portion {pi + 1}</legend>
                    <label>Food id</label>
                    <input
                      aria-label={`portion ${pi + 1} food id`}
                      data-testid={`portion-food-${i}-${j}-${pi}`}
                      value={p.foodId}
                      onChange={(e) =>
                        patchMeal(i, j, {
                          portions: m.portions.map((x, xi) =>
                            xi === pi ? { ...x, foodId: e.target.value } : x,
                          ),
                        })
                      }
                      maxLength={64}
                      disabled={pending}
                    />
                    <label>Quantity</label>
                    <input
                      aria-label={`portion ${pi + 1} quantity`}
                      data-testid={`portion-qty-${i}-${j}-${pi}`}
                      inputMode="decimal"
                      value={p.quantity}
                      onChange={(e) =>
                        patchMeal(i, j, {
                          portions: m.portions.map((x, xi) =>
                            xi === pi ? { ...x, quantity: e.target.value } : x,
                          ),
                        })
                      }
                      disabled={pending}
                    />
                    {p.swaps.map((s, si) => (
                      <span key={si} data-testid={`swap-${i}-${j}-${pi}-${si}`}>
                        <label>Swap food id</label>
                        <input
                          aria-label={`swap ${si + 1} food id`}
                          data-testid={`swap-food-${i}-${j}-${pi}-${si}`}
                          value={s.foodId}
                          onChange={(e) =>
                            patchMeal(i, j, {
                              portions: m.portions.map((x, xi) =>
                                xi === pi
                                  ? {
                                      ...x,
                                      swaps: x.swaps.map((y, yi) =>
                                        yi === si
                                          ? { ...y, foodId: e.target.value }
                                          : y,
                                      ),
                                    }
                                  : x,
                              ),
                            })
                          }
                          maxLength={64}
                          disabled={pending}
                        />
                        <label>Swap qty</label>
                        <input
                          aria-label={`swap ${si + 1} quantity`}
                          data-testid={`swap-qty-${i}-${j}-${pi}-${si}`}
                          inputMode="decimal"
                          value={s.quantity}
                          onChange={(e) =>
                            patchMeal(i, j, {
                              portions: m.portions.map((x, xi) =>
                                xi === pi
                                  ? {
                                      ...x,
                                      swaps: x.swaps.map((y, yi) =>
                                        yi === si
                                          ? {
                                              ...y,
                                              quantity: e.target.value,
                                            }
                                          : y,
                                      ),
                                    }
                                  : x,
                              ),
                            })
                          }
                          disabled={pending}
                        />
                        <label>Note</label>
                        <input
                          aria-label={`swap ${si + 1} note`}
                          data-testid={`swap-note-${i}-${j}-${pi}-${si}`}
                          value={s.note}
                          onChange={(e) =>
                            patchMeal(i, j, {
                              portions: m.portions.map((x, xi) =>
                                xi === pi
                                  ? {
                                      ...x,
                                      swaps: x.swaps.map((y, yi) =>
                                        yi === si
                                          ? { ...y, note: e.target.value }
                                          : y,
                                      ),
                                    }
                                  : x,
                              ),
                            })
                          }
                          maxLength={500}
                          disabled={pending}
                        />
                        <button
                          type="button"
                          data-testid={`swap-remove-${i}-${j}-${pi}-${si}`}
                          onClick={() =>
                            patchMeal(i, j, {
                              portions: m.portions.map((x, xi) =>
                                xi === pi
                                  ? {
                                      ...x,
                                      swaps: x.swaps.filter(
                                        (_, yi) => yi !== si,
                                      ),
                                    }
                                  : x,
                              ),
                            })
                          }
                          disabled={pending}
                        >
                          Remove swap
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      data-testid={`swap-add-${i}-${j}-${pi}`}
                      onClick={() =>
                        patchMeal(i, j, {
                          portions: m.portions.map((x, xi) =>
                            xi === pi
                              ? {
                                  ...x,
                                  swaps: [
                                    ...x.swaps,
                                    { foodId: "", quantity: "", note: "" },
                                  ],
                                }
                              : x,
                          ),
                        })
                      }
                      disabled={pending}
                    >
                      Add swap
                    </button>
                    <button
                      type="button"
                      data-testid={`portion-remove-${i}-${j}-${pi}`}
                      onClick={() =>
                        patchMeal(i, j, {
                          portions: m.portions.filter((_, xi) => xi !== pi),
                        })
                      }
                      disabled={pending}
                    >
                      Remove portion
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  data-testid={`portion-add-${i}-${j}`}
                  onClick={() =>
                    patchMeal(i, j, {
                      portions: [
                        ...m.portions,
                        { foodId: "", quantity: "", swaps: [] },
                      ],
                    })
                  }
                  disabled={pending}
                >
                  Add portion
                </button>

                <TargetsEditor
                  value={m.target}
                  onChange={(t) => patchMeal(i, j, { target: t })}
                  disabled={pending}
                  testidPrefix={`meal-${i}-${j}-target`}
                  legend="Meal target"
                />

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
      </section>

      <section className="tracker-section">
        <h2 className="tracker-section__title">Schedule</h2>
        <label htmlFor="mealplan-active-variant">Active variant</label>
        <select
          id="mealplan-active-variant"
          data-testid="mealplan-active-variant"
          value={activeVariantId}
          onChange={(e) => setActiveVariantId(e.target.value)}
          disabled={pending}
        >
          <option value="">(none)</option>
          {variantOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label || v.id}
            </option>
          ))}
        </select>
        <label htmlFor="mealplan-schedule-mode">Schedule mode</label>
        <select
          id="mealplan-schedule-mode"
          data-testid="mealplan-schedule-mode"
          value={schedule.mode}
          onChange={(e) => {
            const mode = e.target.value;
            if (mode === "manual")
              setSchedule({
                mode: "manual",
                selectedVariantId: activeVariantId,
              });
            else if (mode === "weekly")
              setSchedule({ mode: "weekly", days: {} });
            else
              setSchedule({
                mode: "cycle",
                anchorDate: startDate,
                steps: [],
              });
          }}
          disabled={pending}
        >
          <option value="manual">Manual</option>
          <option value="weekly">Weekly</option>
          <option value="cycle">Cycle</option>
        </select>
        {schedule.mode === "manual" ? (
          <>
            <label htmlFor="mealplan-schedule-selected">Selected variant</label>
            <select
              id="mealplan-schedule-selected"
              data-testid="mealplan-schedule-selected"
              value={schedule.selectedVariantId}
              onChange={(e) =>
                setSchedule({
                  mode: "manual",
                  selectedVariantId: e.target.value,
                })
              }
              disabled={pending}
            >
              <option value="">(none)</option>
              {variantOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label || v.id}
                </option>
              ))}
            </select>
          </>
        ) : schedule.mode === "weekly" ? (
          (["1", "2", "3", "4", "5", "6", "7"] as const).map((day, di) => (
            <span key={day}>
              <label>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][di]}
              </label>
              <select
                aria-label={`weekly day ${day}`}
                data-testid={`schedule-day-${day}`}
                value={schedule.days[day] ?? ""}
                onChange={(e) =>
                  setSchedule({
                    mode: "weekly",
                    days: { ...schedule.days, [day]: e.target.value },
                  })
                }
                disabled={pending}
              >
                <option value="">(none)</option>
                {variantOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label || v.id}
                  </option>
                ))}
              </select>
            </span>
          ))
        ) : (
          <>
            <label htmlFor="schedule-anchor">Anchor date (YYYY-MM-DD)</label>
            <input
              id="schedule-anchor"
              data-testid="schedule-anchor"
              value={schedule.anchorDate}
              onChange={(e) =>
                setSchedule({ ...schedule, anchorDate: e.target.value })
              }
              placeholder="YYYY-MM-DD"
              disabled={pending}
            />
            {schedule.steps.map((step, si) => (
              <span key={si} data-testid={`schedule-step-${si}`}>
                <select
                  aria-label={`step ${si + 1} variant`}
                  data-testid={`schedule-step-variant-${si}`}
                  value={step.variantId}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      steps: schedule.steps.map((x, xi) =>
                        xi === si ? { ...x, variantId: e.target.value } : x,
                      ),
                    })
                  }
                  disabled={pending}
                >
                  <option value="">(variant)</option>
                  {variantOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label || v.id}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`step ${si + 1} days`}
                  data-testid={`schedule-step-days-${si}`}
                  inputMode="numeric"
                  value={step.days}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      steps: schedule.steps.map((x, xi) =>
                        xi === si ? { ...x, days: e.target.value } : x,
                      ),
                    })
                  }
                  disabled={pending}
                />
                <button
                  type="button"
                  data-testid={`schedule-step-remove-${si}`}
                  onClick={() =>
                    setSchedule({
                      ...schedule,
                      steps: schedule.steps.filter((_, xi) => xi !== si),
                    })
                  }
                  disabled={pending}
                >
                  Remove step
                </button>
              </span>
            ))}
            <button
              type="button"
              data-testid="schedule-step-add"
              onClick={() =>
                setSchedule({
                  ...schedule,
                  steps: [...schedule.steps, { variantId: "", days: "" }],
                })
              }
              disabled={pending}
            >
              Add step
            </button>
          </>
        )}

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
          timezone). Versions cannot be edited — corrections publish a new
          version.
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
