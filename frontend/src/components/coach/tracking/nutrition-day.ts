import type { TargetValue } from "../../ethereal/mealplan/model";
import { calculateVariantNutrients } from "../../ethereal/mealplan/model";
import { nutritionForDate } from "../athlete/timeline";
import type { CoachClient } from "../model";
import { applicablePlan, planFoodMap } from "../plans/domain";
import { withTrackingText, withTrackingValue } from "./data";

const DAY_TYPE = "day-type";
const FOLLOWED = "plan-followed";
const R0 = (v: number) => Math.round(v);
const targetNum = (t: TargetValue | undefined): number => {
  if (!t) return 0;
  if (t.kind === "range") return R0((t.min + t.max) / 2);
  return R0(t.value);
};

/** Day-type options for a date: meal-plan variants (or IIFYM options) plus
 *  the temporary plan active on that date. */
export function dayTypeOptions(
  client: CoachClient,
  date: string,
): { label: string; temporary?: boolean }[] {
  const resolved = nutritionForDate(client, date);
  const plans = client.plans;
  const out: { label: string; temporary?: boolean }[] = [];
  const temp = resolved.temporary;
  const base = plans
    ? resolved.source === "iifym"
      ? applicablePlan(plans.nutrition.iifym, date)
      : applicablePlan(plans.nutrition.mealPlan, date)
    : undefined;
  const items =
    base && "variants" in base ? base.variants : (base?.options ?? []);
  for (const v of items) out.push({ label: v.label });
  if (temp) {
    const plan = temp.plan;
    const label =
      plan && "variants" in plan
        ? (plan.variants[0]?.label ?? temp.label ?? "Temporary")
        : (temp.label ?? "Temporary");
    out.push({ label, temporary: true });
  }
  return out;
}

/** The prescribed label — what the plan applies for this date. */
export function prescribedDayType(client: CoachClient, date: string) {
  return nutritionForDate(client, date).label;
}

/** What the client actually logged for the day (falls back to prescribed). */
export function loggedDayType(client: CoachClient, date: string) {
  return (
    client.tracking?.text?.[`${date}:${DAY_TYPE}`] ??
    prescribedDayType(client, date)
  );
}

/** Nutrients for a day-type label — variant macros or IIFYM option targets. */
export function dayTypeNutrients(
  client: CoachClient,
  date: string,
  label: string,
): { kcal: number; protein: number; carbs: number; fat: number } | undefined {
  const resolved = nutritionForDate(client, date);
  const temp = resolved.temporary;
  const plans = client.plans;
  if (
    temp &&
    label ===
      (temp.plan && "variants" in temp.plan
        ? temp.plan.variants[0]?.label
        : temp.label)
  ) {
    const v =
      temp.plan && "variants" in temp.plan ? temp.plan.variants[0] : undefined;
    if (!v) return undefined;
    const n = calculateVariantNutrients(v, planFoodMap);
    return n
      ? {
          kcal: R0(n.calories),
          protein: R0(n.protein),
          carbs: R0(n.carbs),
          fat: R0(n.fat),
        }
      : undefined;
  }
  if (resolved.source === "mealPlan" && plans) {
    const plan = applicablePlan(plans.nutrition.mealPlan, date);
    const variant =
      plan?.variants.find((v) => v.label === label) ??
      plan?.variants.find((v) => v.id === resolved.optionId);
    if (!variant) return undefined;
    const n = calculateVariantNutrients(variant, planFoodMap);
    return n
      ? {
          kcal: R0(n.calories),
          protein: R0(n.protein),
          carbs: R0(n.carbs),
          fat: R0(n.fat),
        }
      : undefined;
  }
  if (resolved.source === "iifym" && plans) {
    const plan = applicablePlan(plans.nutrition.iifym, date);
    const opt =
      plan?.options.find((o) => o.label === label) ??
      plan?.options.find((o) => o.id === resolved.optionId);
    if (!opt) return undefined;
    return {
      kcal: targetNum(opt.targets.calories),
      protein: targetNum(opt.targets.protein),
      carbs: targetNum(opt.targets.carbs),
      fat: targetNum(opt.targets.fat),
    };
  }
  return undefined;
}

/** True when the client ticked "Followed my plan" for the date. */
export function planFollowed(client: CoachClient, date: string) {
  return client.tracking?.text?.[`${date}:${FOLLOWED}`] === "yes";
}

/** Write the logged day type; clears the override when it equals the
 *  prescribed label. If "followed" is already ticked, re-fills the macros
 *  for the new label. */
export function withDayType(client: CoachClient, date: string, label: string) {
  const prescribed = prescribedDayType(client, date);
  const next = withTrackingText(
    client,
    date,
    DAY_TYPE,
    label === prescribed ? "" : label,
  );
  if (!planFollowed(next, date)) return next;
  const n = dayTypeNutrients(next, date, label);
  if (!n) return next;
  let out = next;
  out = withTrackingValue(out, date, "calories", n.kcal);
  out = withTrackingValue(out, date, "protein", n.protein);
  out = withTrackingValue(out, date, "carbs", n.carbs);
  out = withTrackingValue(out, date, "fat", n.fat);
  return out;
}

/** "Followed my plan" — yes fills kcal/P/C/F from the logged day type;
 *  no deletes the flag and leaves the values editable. */
export function withPlanFollowed(
  client: CoachClient,
  date: string,
  yes: boolean,
) {
  if (!yes) return withTrackingText(client, date, FOLLOWED, "");
  let out = withTrackingText(client, date, FOLLOWED, "yes");
  const n = dayTypeNutrients(out, date, loggedDayType(out, date) ?? "");
  if (!n) return out;
  out = withTrackingValue(out, date, "calories", n.kcal);
  out = withTrackingValue(out, date, "protein", n.protein);
  out = withTrackingValue(out, date, "carbs", n.carbs);
  out = withTrackingValue(out, date, "fat", n.fat);
  return out;
}
