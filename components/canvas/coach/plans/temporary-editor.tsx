// Full-page editor for a temporary nutrition plan: a single day plan applied
// to every day of the range. The coach names it freely (kind is always
// "custom" for compatibility) and edits one variant — no schedule controls.
import { useMemo, useState } from "react";
import type { MealPlan, MealPlanVariant } from "../../ethereal/mealplan/model";
import { Input } from "../../vari8/components";
import { DatePicker } from "../../vari8/inputs";
import { addDays, type CoachClient, formatDate, TODAY, uid } from "../model";
import { useCoach } from "../store";
import { localToday } from "../targets/model";
import { templateSetup } from "../template-setup";
import { Button, PageTitle, Select } from "../ui";
import {
  applicablePlan,
  emptyIifymPlan,
  emptyMealPlan,
  scheduledOption,
} from "./domain";
import { IifymEditor, NutritionEditor } from "./nutrition/editor";
import {
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

const NAME_SUGGESTIONS = ["Refeed", "Diet break", "High day", "Travel day"];

export function TemporaryPlanEditor({
  client,
  existingId,
  initialStartDate,
}: {
  client: CoachClient;
  existingId?: string;
  initialStartDate?: string;
}) {
  const { route, setState, navigate, toast } = useCoach();
  const today = localToday() ?? TODAY;
  const plans = client.plans;
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const source: TemporaryNutrition["source"] =
    setup?.nutrition === "IIFYM" ? "iifym" : "mealPlan";
  const existing = (plans?.nutrition.temporary ?? []).find(
    (t) => t.id === existingId,
  );
  const [label, setLabel] = useState(existing?.label ?? "");
  const [startDate, setStartDate] = useState(
    existing?.startDate ?? initialStartDate ?? today,
  );
  const [endDate, setEndDate] = useState(
    existing?.endDate ?? addDays(startDate, 1),
  );
  const basePlan =
    source === "mealPlan" ? plans?.nutrition.mealPlan : plans?.nutrition.iifym;
  const active = (applicablePlan(
    basePlan as PlanLifecycle<MealPlan>,
    startDate,
  ) ?? basePlan?.active?.content) as MealPlan | IifymPlan | undefined;
  const baseVariants = useMemo(
    () =>
      source === "mealPlan"
        ? (((active as MealPlan)?.variants ?? []) as MealPlanVariant[])
        : [],
    [active, source],
  );
  const [startFrom, setStartFrom] = useState<"empty" | "copy">(
    baseVariants[0] ? "copy" : "empty",
  );
  const scheduledVariantId =
    active && "schedule" in active && active.schedule
      ? scheduledOption(
          active.schedule,
          baseVariants.map((v) => v.id),
          startDate,
        )
      : undefined;
  const [copyVariant, setCopyVariant] = useState<string>(
    scheduledVariantId ?? baseVariants[0]?.id ?? "",
  );
  const [plan, setPlan] = useState<MealPlan | IifymPlan | undefined>(
    existing?.plan,
  );
  const [edited, setEdited] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const back = () =>
    navigate({
      ...route,
      plan: undefined,
      section: "clients",
      client: client.id,
      tab: "Plans",
      module: "nutrition",
    });

  const singleVariantPlan = (
    base: MealPlan | IifymPlan | undefined,
    variantId: string,
  ): MealPlan | IifymPlan => {
    if (!base || variantId === "empty")
      return source === "mealPlan"
        ? emptyMealPlan(client.id, startDate)
        : emptyIifymPlan(client.id, startDate);
    if (source === "iifym") {
      const b = base as IifymPlan;
      const opt = b.options.find((o) => o.id === variantId) ?? b.options[0];
      return structuredClone({
        ...b,
        options: opt ? [opt] : [],
        schedule: { mode: "manual", selectedVariantId: opt?.id ?? "" },
      });
    }
    const b = base as MealPlan;
    const v = b.variants.find((x) => x.id === variantId) ?? b.variants[0];
    return structuredClone({
      ...b,
      variants: v ? [v] : [],
      activeVariantId: v?.id ?? "",
      schedule: { mode: "manual", selectedVariantId: v?.id ?? "" },
    });
  };

  const error = validateTemporaryNutrition({
    label: label.trim() || "x",
    startDate,
    endDate,
  });
  const overlap = (plans?.nutrition.temporary ?? []).find(
    (t) =>
      t.id !== existingId &&
      t.source === source &&
      t.startDate <= endDate &&
      t.endDate >= startDate,
  );

  const write = (next: ClientPlans) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) =>
        c.id === client.id ? { ...c, plans: next } : c,
      ),
    }));

  const save = () => {
    if (!plan || error) return;
    const temporary: TemporaryNutrition = {
      id: existing?.id ?? uid("temp-nutrition"),
      kind: "custom",
      label: label.trim(),
      startDate,
      endDate,
      source,
      plan: { ...plan, startDate },
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    write(upsertTemporaryNutrition(plans ?? emptyClientPlans(), temporary));
    toast(`${temporary.label} saved`);
    back();
  };

  const remove = () => {
    if (!existingId) return;
    write(removeTemporaryNutrition(plans ?? emptyClientPlans(), existingId));
    toast("Temporary plan removed");
    back();
  };

  if (!plans) {
    return (
      <>
        <PageTitle title={`${client.name} · Temporary plan`} back={back} />
        <p className="cp-sub">Set up a nutrition plan first.</p>
      </>
    );
  }

  return (
    <>
      <PageTitle
        title={`${client.name} · Temporary plan`}
        back={back}
        actions={
          <div className="cd-actions">
            {existing && (
              <Button
                variant="ghost"
                onClick={() =>
                  confirmDelete ? remove() : setConfirmDelete(true)
                }
              >
                {confirmDelete ? "Confirm delete" : "Delete"}
              </Button>
            )}
            <Button variant="ghost" onClick={back}>
              Cancel
            </Button>
            <Button
              primary
              disabled={!label.trim() || !!error || !plan}
              onClick={save}
            >
              Save
            </Button>
          </div>
        }
      />
      <div className="cp-temp-form" style={{ maxWidth: 860 }}>
        {!existing && (
          <div style={{ marginBottom: 12 }}>
            <div className="cm-mut" style={{ fontSize: 12, marginBottom: 6 }}>
              Start from
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 280px))",
                gap: 8,
              }}
            >
              {[
                {
                  v: "empty" as const,
                  title: "Blank plan",
                  sub: "Empty day plan, one meal",
                },
                {
                  v: "copy" as const,
                  title: "Copy of current plan",
                  sub: "Copies a day type of the active plan",
                },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  className={`cm-card${startFrom === o.v ? " cm-sel" : ""}`}
                  style={{
                    margin: 0,
                    textAlign: "left",
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (plan && edited && startFrom !== o.v) {
                      if (
                        !window.confirm(
                          "Replace the current day plan? Your edits will be lost.",
                        )
                      )
                        return;
                    }
                    setStartFrom(o.v);
                    setPlan(
                      singleVariantPlan(
                        active,
                        o.v === "copy" ? copyVariant : "empty",
                      ),
                    );
                    setEdited(false);
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{o.title}</div>
                  <div className="cm-mut" style={{ fontSize: 12 }}>
                    {o.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <Input
              label="Name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              list="temporary-plan-names"
            />
            <datalist id="temporary-plan-names">
              {NAME_SUGGESTIONS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <DatePicker
            label="Start date"
            value={startDate}
            onValueChange={(v) => {
              setStartDate(v);
              if (v > endDate) setEndDate(v);
            }}
          />
          <DatePicker
            label="End date"
            value={endDate}
            onValueChange={(v) => {
              setEndDate(v);
              if (v < startDate) setStartDate(v);
            }}
          />
          {!existing && startFrom === "copy" && baseVariants.length > 0 && (
            <Select
              label="Day type to copy"
              value={copyVariant}
              onChange={(v) => {
                if (plan && edited && v !== copyVariant) {
                  if (
                    !window.confirm(
                      "Replace the current day plan? Your edits will be lost.",
                    )
                  )
                    return;
                }
                setCopyVariant(v);
                setPlan(singleVariantPlan(active, v));
                setEdited(false);
              }}
              options={baseVariants.map((v) => ({
                value: v.id,
                label: v.label || "Untitled",
              }))}
            />
          )}
        </div>
        <p className="cp-sub">
          {formatDate(startDate, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          –{" "}
          {formatDate(endDate, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          · {dayCountInclusive(startDate, endDate)} days · the same plan applies
          to every day of the range.
        </p>
        {error && <p className="cp-sub">{error}</p>}
        {overlap && (
          <p className="cp-sub" role="alert">
            This overlaps &quot;{overlap.label}&quot; (
            {formatDate(overlap.startDate)} - {formatDate(overlap.endDate)}) -
            the newest save wins on shared
            days.
          </p>
        )}
        {!plan && !existing && (
          <Button
            primary
            disabled={!active && startFrom !== "empty"}
            onClick={() =>
              setPlan(
                singleVariantPlan(
                  active,
                  startFrom === "copy" ? copyVariant : "empty",
                ),
              )
            }
          >
            Create the day plan
          </Button>
        )}
        {plan && source === "mealPlan" ? (
          <NutritionEditor
            value={plan as MealPlan}
            singleVariant
            onChange={(p) => {
              setEdited(true);
              setPlan(p);
            }}
          />
        ) : plan ? (
          <IifymEditor
            value={plan as IifymPlan}
            singleVariant
            onChange={(p) => {
              setEdited(true);
              setPlan(p);
            }}
          />
        ) : null}
      </div>
    </>
  );
}
