"use client";

// Temporary nutrition plan flow: step 1 picks kind/label/dates, step 2 opens
// the regular nutrition editor on a deep copy of the active plan. The result
// is stored on ClientPlans.nutrition.temporary via the pure helpers.

import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
  calculateVariantNutrients,
  type MealPlan,
} from "../../ethereal/mealplan/model";
import { Input, SegmentedControl } from "../../vari8/components";
import { DatePicker } from "../../vari8/inputs";
import { addDays, type CoachClient, TODAY } from "../model";
import { useCoach, useDisplay } from "../store";
import { localToday } from "../targets/model";
import { templateSetup } from "../template-setup";
import { Button, Dialog } from "../ui";
import { applicablePlan, planFoodMap, targetNumber } from "./domain";
import { IifymEditor, NutritionEditor } from "./nutrition/editor";
import {
  createTemporaryNutrition,
  dayCountInclusive,
  removeTemporaryNutrition,
  upsertTemporaryNutrition,
  validateTemporaryNutrition,
} from "./temporary-nutrition";
import {
  type ClientPlans,
  emptyClientPlans,
  type IifymPlan,
  type PlanLifecycle,
  type TemporaryNutrition,
} from "./types";

/** Total kcal of a temporary plan's first scheduled option, for list rows. */
export function temporaryKcal(temp: TemporaryNutrition): number | undefined {
  const plan = temp.plan;
  if (temp.source === "iifym") {
    const option = (plan as IifymPlan).options[0];
    if (!option) return undefined;
    const direct = targetNumber(option.targets.calories);
    return (
      direct ||
      targetNumber(option.targets.protein) * 4 +
        targetNumber(option.targets.carbs) * 4 +
        targetNumber(option.targets.fat) * 9 ||
      undefined
    );
  }
  const variant = (plan as MealPlan).variants[0];
  return variant
    ? calculateVariantNutrients(variant, planFoodMap).calories
    : undefined;
}

const KIND_LABELS: Record<TemporaryNutrition["kind"], string> = {
  refeed: "Refeed",
  "diet-break": "Diet break",
  custom: "Custom",
};

export function TemporaryPlanDialog({
  client,
  existingId,
  initialStartDate,
  onClose,
}: {
  client: CoachClient;
  existingId?: string;
  /** Start date prefilled for a new temporary plan (e.g. a week's Monday). */
  initialStartDate?: string;
  onClose: () => void;
}) {
  const { formatDate } = useDisplay();
  const { setState, toast } = useCoach();
  const today = localToday();
  const plans = client.plans ?? emptyClientPlans();
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const source: TemporaryNutrition["source"] =
    setup?.nutrition === "IIFYM" ? "iifym" : "mealPlan";
  const existing = (plans.nutrition.temporary ?? []).find(
    (t) => t.id === existingId,
  );
  const [step, setStep] = useState<1 | 2>(existing ? 2 : 1);
  const [kind, setKind] = useState<TemporaryNutrition["kind"]>(
    existing?.kind ?? "refeed",
  );
  const [label, setLabel] = useState(existing?.label ?? KIND_LABELS.refeed);
  const [startDate, setStartDate] = useState(
    existing?.startDate ?? initialStartDate ?? today ?? TODAY,
  );
  const [days, setDays] = useState(
    existing ? dayCountInclusive(existing.startDate, existing.endDate) : 2,
  );
  const [draft, setDraft] = useState<TemporaryNutrition | null>(
    existing ?? null,
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const endDate = addDays(startDate, Math.max(0, days - 1));
  const activePlan =
    source === "mealPlan" ? plans.nutrition.mealPlan : plans.nutrition.iifym;
  const active = (applicablePlan(
    activePlan as PlanLifecycle<MealPlan>,
    startDate,
  ) ?? activePlan.active?.content) as MealPlan | IifymPlan | undefined;

  const writeTemporary = (
    temporary: TemporaryNutrition | null,
    removeId?: string,
  ) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) => {
        if (c.id !== client.id) return c;
        let next: ClientPlans = c.plans ?? emptyClientPlans();
        if (removeId) next = removeTemporaryNutrition(next, removeId);
        if (temporary) next = upsertTemporaryNutrition(next, temporary);
        return { ...c, plans: next };
      }),
    }));

  const save = () => {
    if (!draft) return;
    const error = validateTemporaryNutrition(draft);
    if (error) {
      toast(error);
      return;
    }
    writeTemporary(draft);
    toast(`${draft.label} saved`);
    onClose();
  };

  if (step === 1)
    return (
      <Dialog title="Temporary plan" onClose={onClose}>
        <div className="cp-temp-form">
          <SegmentedControl
            label="Kind"
            value={kind}
            onValueChange={(next) => {
              const k = next as TemporaryNutrition["kind"];
              setKind(k);
              if (!label || Object.values(KIND_LABELS).includes(label))
                setLabel(KIND_LABELS[k]);
            }}
            options={(["refeed", "diet-break", "custom"] as const).map((k) => ({
              value: k,
              label: KIND_LABELS[k],
            }))}
          />
          <Input
            label="Name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <div className="cp-temp-dates">
            <DatePicker
              label="Start date"
              value={startDate}
              onValueChange={setStartDate}
            />
            <Input
              label="Days"
              type="number"
              min={1}
              max={28}
              value={days}
              onChange={(event) =>
                setDays(
                  Math.min(28, Math.max(1, Number(event.target.value) || 1)),
                )
              }
              hint={`Ends ${formatDate(endDate, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}`}
            />
          </div>
          {!active && (
            <p className="cp-sub">
              No active nutrition plan to copy — activate a plan first.
            </p>
          )}
          <div className="cp-temp-actions-row">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              primary
              disabled={!active || !label.trim() || !startDate}
              onClick={() => {
                if (!active) return;
                setDraft(
                  createTemporaryNutrition(
                    active,
                    source,
                    { kind, label, startDate, endDate },
                    new Date().toISOString(),
                  ),
                );
                setStep(2);
              }}
            >
              Continue to plan
            </Button>
          </div>
        </div>
      </Dialog>
    );

  return (
    <Dialog
      title={`${draft?.label ?? "Temporary plan"} · ${draft?.startDate} – ${draft?.endDate}`}
      onClose={onClose}
      wide
    >
      <div className="cp-temp-editor">
        {draft && draft.source === "mealPlan" ? (
          <NutritionEditor
            value={draft.plan as MealPlan}
            onChange={(plan) => setDraft({ ...draft, plan })}
          />
        ) : draft ? (
          <IifymEditor
            value={draft.plan as IifymPlan}
            onChange={(plan) => setDraft({ ...draft, plan })}
          />
        ) : null}
        <div className="cp-temp-actions-row">
          {existingId && (
            <Button
              variant="ghost"
              onClick={() => {
                if (confirmRemove) {
                  writeTemporary(null, existingId);
                  toast("Temporary plan removed");
                  onClose();
                } else setConfirmRemove(true);
              }}
            >
              <Trash2 size={14} aria-hidden="true" />{" "}
              {confirmRemove ? "Confirm remove" : "Remove"}
            </Button>
          )}
          <span className="cp-temp-actions-spacer" />
          <Button
            variant="ghost"
            onClick={existingId ? onClose : () => setStep(1)}
          >
            Back
          </Button>
          <Button primary onClick={save}>
            Save temporary plan
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
