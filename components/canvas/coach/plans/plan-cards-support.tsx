"use client";

// Shared helpers for the Plans-tab card grid: scheduled nutrition option
// blocks, "other targets" labels, and the Add-target dialog.

import { useState } from "react";
import {
  calculateVariantNutrients,
  type MealPlan,
  type VariantSchedule,
} from "../../ethereal/mealplan/model";
import { Input, Select } from "../../vari8/components";
import { ALL_PARAMETERS, type CoachClient, uid } from "../model";
import { useCoach } from "../store";
import { templateSetup } from "../template-setup";
import { Button, Dialog } from "../ui";
import { planFoodMap, targetNumber } from "./domain";
import {
  type ClientOtherTarget,
  emptyClientPlans,
  type IifymPlan,
} from "./types";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const compressDays = (days: string[]): string => {
  if (!days.length) return "Unscheduled";
  const index = days.map((d) => WEEKDAY_SHORT.indexOf(d));
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= days.length; i += 1) {
    if (i === days.length || index[i] !== index[i - 1] + 1) {
      runs.push(
        start === i - 1 ? days[start] : `${days[start]}–${days[i - 1]}`,
      );
      start = i;
    }
  }
  return runs.join(" · ");
};

export function optionDaysLabel(
  schedule: VariantSchedule,
  optionId: string,
): string {
  if (schedule.mode === "manual")
    return schedule.selectedVariantId === optionId
      ? "Coach-selected"
      : "Not scheduled";
  if (schedule.mode === "cycle") {
    const spans: string[] = [];
    let day = 1;
    for (const step of schedule.steps) {
      if (step.variantId === optionId)
        spans.push(
          step.days === 1 ? `Day ${day}` : `Days ${day}–${day + step.days - 1}`,
        );
      day += step.days;
    }
    return spans.join(", ") || "Not scheduled";
  }
  if (schedule.mode === "flexible") return "";
  return (
    compressDays(
      ([1, 2, 3, 4, 5, 6, 7] as const)
        .filter((d) => schedule.days[d] === optionId)
        .map((d) => WEEKDAY_SHORT[d - 1]),
    ) || "Not scheduled"
  );
}

export type NutritionOptionBlock = {
  id: string;
  label: string;
  days: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

/** Compact per-option blocks for the Nutrition card. */
export function nutritionOptions(
  plan: MealPlan | IifymPlan | undefined,
  source: "mealPlan" | "iifym",
): NutritionOptionBlock[] {
  if (!plan) return [];
  if (source === "iifym") {
    const iifym = plan as IifymPlan;
    return iifym.options.map((o) => {
      const p = targetNumber(o.targets.protein);
      const c = targetNumber(o.targets.carbs);
      const f = targetNumber(o.targets.fat);
      return {
        id: o.id,
        label: o.label,
        days: optionDaysLabel(iifym.schedule, o.id),
        calories: targetNumber(o.targets.calories) || p * 4 + c * 4 + f * 9,
        protein: p,
        carbs: c,
        fat: f,
      };
    });
  }
  const mealPlan = plan as MealPlan;
  return mealPlan.variants.map((v) => ({
    id: v.id,
    label: v.label,
    days: optionDaysLabel(mealPlan.schedule, v.id),
    ...calculateVariantNutrients(v, planFoodMap),
  }));
}

// ─── Other targets ──────────────────────────────────────────────────

/** Fields that already live in their own plan surfaces. */
const OTHER_TARGET_EXCLUDED = new Set([
  "weight",
  "steps",
  "cardio-duration",
  "cardio-sessions",
]);

function otherTargetFields(
  client: CoachClient,
): { id: string; name: string; unit: string }[] {
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  return (setup?.fields ?? []).flatMap((field) => {
    const parameter = ALL_PARAMETERS.find((p) => p.id === field.id);
    if (
      !parameter ||
      typeof parameter.sample !== "number" ||
      parameter.group === "Nutrition" ||
      OTHER_TARGET_EXCLUDED.has(field.id)
    )
      return [];
    return [
      {
        id: field.id,
        name: parameter.name,
        unit: field.unit?.trim() || parameter.units[0] || "",
      },
    ];
  });
}

const fieldUnit = (client: CoachClient, fieldId: string): string => {
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const configured = setup?.fields.find((f) => f.id === fieldId)?.unit?.trim();
  return (
    configured || ALL_PARAMETERS.find((p) => p.id === fieldId)?.units[0] || ""
  );
};

const KIND_NAME = {
  minimum: "Minimum",
  maximum: "Maximum",
  range: "Range",
  exact: "Exact",
} as const;

export function otherTargetLabel(
  client: CoachClient,
  target: ClientOtherTarget,
): string {
  const name =
    ALL_PARAMETERS.find((p) => p.id === target.fieldId)?.name ?? target.fieldId;
  const unit = fieldUnit(client, target.fieldId);
  const suffix = unit ? ` ${unit}` : "";
  switch (target.kind) {
    case "minimum":
      return `${name} ≥ ${target.value}${suffix}`;
    case "maximum":
      return `${name} ≤ ${target.value}${suffix}`;
    case "range":
      return `${name} ${target.min}–${target.max}${suffix}`;
    case "exact":
      return `${name} = ${target.value}${suffix}`;
  }
}

export function OtherTargetDialog({
  client,
  onClose,
}: {
  client: CoachClient;
  onClose: () => void;
}) {
  const { setState, toast } = useCoach();
  const fields = otherTargetFields(client);
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const [kind, setKind] = useState<ClientOtherTarget["kind"]>("minimum");
  const [value, setValue] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const field = fields.find((f) => f.id === fieldId);
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const minValue = num(min);
  const maxValue = num(max);
  const valid =
    !!field &&
    (kind === "range"
      ? minValue !== undefined && maxValue !== undefined && minValue <= maxValue
      : num(value) !== undefined);
  return (
    <Dialog title="Add target" onClose={onClose}>
      <div className="cp-target-form">
        <Select
          label="Tracker field"
          value={fieldId}
          onValueChange={setFieldId}
          options={[
            ...(fields.length
              ? []
              : [{ value: "", label: "No eligible fields", disabled: true }]),
            ...fields.map((f) => ({
              value: f.id,
              label: f.unit ? `${f.name} (${f.unit})` : f.name,
            })),
          ]}
        />
        <Select
          label="Kind"
          value={kind}
          onValueChange={(v) => setKind(v as ClientOtherTarget["kind"])}
          options={(["minimum", "maximum", "range", "exact"] as const).map(
            (k) => ({ value: k, label: KIND_NAME[k] }),
          )}
        />
        {kind === "range" ? (
          <div className="cp-target-range">
            <Input
              label={`Min${field?.unit ? ` (${field.unit})` : ""}`}
              type="number"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
            <Input
              label={`Max${field?.unit ? ` (${field.unit})` : ""}`}
              type="number"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
        ) : (
          <Input
            label={`Target${field?.unit ? ` (${field.unit})` : ""}`}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="cp-temp-actions-row">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            primary
            disabled={!valid}
            onClick={() => {
              const target: ClientOtherTarget = {
                id: uid("target"),
                fieldId,
                kind,
                ...(kind === "range"
                  ? { min: num(min), max: num(max) }
                  : { value: num(value) }),
              };
              setState((s) => ({
                ...s,
                clients: s.clients.map((c) =>
                  c.id === client.id
                    ? {
                        ...c,
                        plans: {
                          ...(c.plans ?? emptyClientPlans()),
                          otherTargets: [
                            ...(c.plans?.otherTargets ?? []),
                            target,
                          ],
                        },
                      }
                    : c,
                ),
              }));
              toast("Target added");
              onClose();
            }}
          >
            Add target
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
