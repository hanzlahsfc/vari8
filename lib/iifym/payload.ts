/**
 * Card 10 (#175) - strict structural validation + normalization of the
 * IIFYM (macro target) draft / version payload, cloned from the reviewed
 * meal-plan payload module and shaped to the canvas `IifymPlan`
 * (`frontend/src/components/coach/plans/types.ts`): options carry
 * `{ id, label, targets }` instead of meals, the `schedule` is the same
 * `VariantSchedule` (manual / weekly / cycle) shared with meal plans.
 *
 * Contract (unchanged discipline):
 * - Declared keys ONLY at every nesting level. Any extra key rejects -
 *   nothing is smuggled into the immutable snapshot.
 * - Numeric bounds: finite numbers 0 ≤ v ≤ 99,999.9 with at most one
 *   decimal, enforced by decimal-string comparison (never float math).
 * - Target style is exclusive: a calories-style option carries only
 *   `calories` (entered directly - the calorie-only mode), a
 *   macros-style option carries only `protein`/`carbs`/`fat` (calories
 *   derive at 4/4/9 at read time - D29 - and are never stored).
 * - No cross-field derivation - this module never sums, converts,
 *   scores, or aggregates nutrition values.
 * - Draft save permits an INCOMPLETE plan (empty options, missing
 *   schedule) but never a MALFORMED one (unknown keys, dangling
 *   references, out-of-range numbers). `forPublish` adds the activation
 *   floor: plan name, valid start date, ≥1 option, complete schedule.
 */

import { IIFYM_LIMITS } from "./limits";
import type { MealTargets, TargetValue } from "../db-types/meal-targets";
import type { VariantSchedule } from "../db-types/iifym";

export type { MealTargets, TargetValue, VariantSchedule };

export type IifymErrorCode =
  | "invalid_input"
  | "plan_not_accessible"
  | "stale_revision"
  | "timezone_required"
  | "unrepresentable_date"
  | "publish_incomplete"
  | "consent_missing"
  | "policy_not_configured"
  | "serialization_conflict";

export class IifymError extends Error {
  constructor(readonly code: IifymErrorCode) {
    super(code);
    this.name = "IifymError";
  }
}

export type IifymOption = {
  id: string;
  label: string;
  targets: MealTargets;
};

export type IifymDraft = {
  options: IifymOption[];
  name?: string;
  startDate?: string;
  schedule?: VariantSchedule;
};

const ROOT_KEYS = new Set(["options", "name", "startDate", "schedule"]);
const OPTION_KEYS = new Set(["id", "label", "targets"]);
const TARGET_KEYS = new Set(["style", "calories", "protein", "carbs", "fat"]);
const TARGET_VALUE_KEYS = {
  fixed: new Set(["kind", "value"]),
  range: new Set(["kind", "min", "max"]),
  minimum: new Set(["kind", "value"]),
} as const;
const SCHEDULE_KEYS = {
  manual: new Set(["mode", "selectedVariantId"]),
  weekly: new Set(["mode", "days"]),
  cycle: new Set(["mode", "anchorDate", "steps"]),
  flexible: new Set(["mode"]),
} as const;
const STEP_KEYS = new Set(["variantId", "days"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null)
  );
}

function rejectUnknownKeys(obj: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) throw new IifymError("invalid_input");
  }
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") throw new IifymError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new IifymError("invalid_input");
  return trimmed;
}

function optionalText(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new IifymError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) throw new IifymError("invalid_input");
  return trimmed;
}

const VALUE_RE = /^\d+(\.\d)?$/;

/** Finite entered value: 0 ≤ v ≤ 99,999.9, at most one decimal - the
 * decimal-string check rejects `30.05` and exponent/float artifacts
 * without float arithmetic. */
function cleanValue(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new IifymError("invalid_input");
  if (v < 0 || v > IIFYM_LIMITS.valueMax) throw new IifymError("invalid_input");
  if (!VALUE_RE.test(String(v))) throw new IifymError("invalid_input");
  return v;
}

const CALENDAR_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict calendar date - real YYYY-MM-DD (no Feb 30). */
function isCalendarDate(v: string): boolean {
  if (!CALENDAR_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isEntityId(v: unknown, max: number): v is string {
  return (
    typeof v === "string" && /^[a-z0-9_-]{1,64}$/i.test(v) && v.length <= max
  );
}

const mintId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** Per-field target kind (canvas `TargetValue`): fixed/minimum carry
 * `value`, range carries `min` < `max`. Strict keys per kind. */
function cleanTargetValue(v: unknown): TargetValue {
  if (!isPlainObject(v)) throw new IifymError("invalid_input");
  const kind = v.kind;
  if (kind === "fixed" || kind === "minimum") {
    rejectUnknownKeys(v, TARGET_VALUE_KEYS[kind]);
    const value = cleanValue(v.value);
    if (value === undefined) throw new IifymError("invalid_input");
    return { kind, value };
  }
  if (kind === "range") {
    rejectUnknownKeys(v, TARGET_VALUE_KEYS.range);
    const min = cleanValue(v.min);
    const max = cleanValue(v.max);
    if (min === undefined || max === undefined || min >= max)
      throw new IifymError("invalid_input");
    return { kind: "range", min, max };
  }
  throw new IifymError("invalid_input");
}

const MACRO_FIELDS = ["protein", "carbs", "fat"] as const;
const TARGET_FIELDS = ["calories", ...MACRO_FIELDS] as const;

/** Canvas `MealTargets`: the style is exclusive - a calories-style block
 * may only carry `calories` (calorie-only mode, entered directly), a
 * macros-style block only the macro fields. A present block needs at
 * least one goal. */
function cleanMealTargets(v: unknown): MealTargets {
  if (!isPlainObject(v)) throw new IifymError("invalid_input");
  rejectUnknownKeys(v, TARGET_KEYS);
  const style = v.style;
  if (style !== "calories" && style !== "macros")
    throw new IifymError("invalid_input");
  const allowed = style === "calories" ? ["calories"] : [...MACRO_FIELDS];
  for (const field of TARGET_FIELDS) {
    const present = v[field] !== undefined && v[field] !== null;
    if (present && !allowed.includes(field))
      throw new IifymError("invalid_input");
  }
  const out: Record<string, TargetValue> = {};
  let count = 0;
  for (const field of allowed) {
    const raw = v[field];
    if (raw === undefined || raw === null) continue;
    out[field] = cleanTargetValue(raw);
    count += 1;
  }
  if (count === 0) throw new IifymError("invalid_input");
  return { style, ...out } as MealTargets;
}

function cleanOption(
  v: unknown,
  seenIds: Set<string>,
  seenLabels: Set<string>,
): IifymOption {
  if (!isPlainObject(v)) throw new IifymError("invalid_input");
  rejectUnknownKeys(v, OPTION_KEYS);
  let id: string;
  if (v.id === undefined || v.id === null) {
    id = mintId("opt");
  } else {
    if (!isEntityId(v.id, IIFYM_LIMITS.optionIdMax))
      throw new IifymError("invalid_input");
    id = v.id;
  }
  if (seenIds.has(id)) throw new IifymError("invalid_input");
  seenIds.add(id);
  const label = cleanText(v.label, IIFYM_LIMITS.optionLabelMax);
  if (seenLabels.has(label)) throw new IifymError("invalid_input");
  seenLabels.add(label);
  return { id, label, targets: cleanMealTargets(v.targets) };
}

/** Canvas `VariantSchedule` - references must resolve to declared option
 * ids at every save (a dangling reference is malformed, not incomplete).
 * Completeness (all 7 weekly days, ≥1 cycle step) is a publish-floor
 * rule. */
function cleanSchedule(
  v: unknown,
  optionIds: Set<string>,
  forPublish: boolean,
): VariantSchedule {
  if (!isPlainObject(v)) throw new IifymError("invalid_input");
  const mode = v.mode;
  if (mode === "manual") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.manual);
    const selectedVariantId = v.selectedVariantId;
    if (
      !isEntityId(selectedVariantId, IIFYM_LIMITS.optionIdMax) ||
      !optionIds.has(selectedVariantId)
    )
      throw new IifymError("invalid_input");
    return { mode: "manual", selectedVariantId };
  }
  if (mode === "weekly") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.weekly);
    if (!isPlainObject(v.days)) throw new IifymError("invalid_input");
    const days: Record<string, string> = {};
    for (const [key, value] of Object.entries(v.days)) {
      if (!/^[1-7]$/.test(key) || typeof value !== "string")
        throw new IifymError("invalid_input");
      if (!optionIds.has(value)) throw new IifymError("invalid_input");
      days[key] = value;
    }
    if (forPublish && Object.keys(days).length !== 7)
      throw new IifymError("publish_incomplete");
    return { mode: "weekly", days } as VariantSchedule;
  }
  if (mode === "cycle") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.cycle);
    if (typeof v.anchorDate !== "string" || !isCalendarDate(v.anchorDate))
      throw new IifymError("invalid_input");
    if (!Array.isArray(v.steps)) throw new IifymError("invalid_input");
    if (forPublish && v.steps.length === 0)
      throw new IifymError("publish_incomplete");
    let total = 0;
    const steps = v.steps.map((raw) => {
      if (!isPlainObject(raw)) throw new IifymError("invalid_input");
      rejectUnknownKeys(raw, STEP_KEYS);
      if (
        !isEntityId(raw.variantId, IIFYM_LIMITS.optionIdMax) ||
        !optionIds.has(raw.variantId)
      )
        throw new IifymError("invalid_input");
      if (
        typeof raw.days !== "number" ||
        !Number.isInteger(raw.days) ||
        raw.days < IIFYM_LIMITS.cycleStepDaysMin ||
        raw.days > IIFYM_LIMITS.cycleStepDaysMax
      )
        throw new IifymError("invalid_input");
      total += raw.days;
      return { variantId: raw.variantId, days: raw.days };
    });
    if (total > IIFYM_LIMITS.cycleDaysMax)
      throw new IifymError("invalid_input");
    return { mode: "cycle", anchorDate: v.anchorDate, steps };
  }
  if (mode === "flexible") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.flexible);
    return { mode: "flexible" };
  }
  throw new IifymError("invalid_input");
}

/**
 * Validate + normalize a draft/version payload. `forPublish` enforces
 * the activation floor (plan name, valid startDate, ≥1 option, complete
 * schedule) and reports `publish_incomplete` rather than `invalid_input`
 * for completeness violations.
 */
export function normalizeIifymPayload(
  input: unknown,
  opts: { forPublish: boolean },
): IifymDraft {
  if (!isPlainObject(input)) throw new IifymError("invalid_input");
  rejectUnknownKeys(input, ROOT_KEYS);
  const rawOptions = input.options;
  if (!Array.isArray(rawOptions)) throw new IifymError("invalid_input");
  const countError = () =>
    new IifymError(opts.forPublish ? "publish_incomplete" : "invalid_input");
  if (rawOptions.length > IIFYM_LIMITS.maxOptions) throw countError();
  if (opts.forPublish && rawOptions.length < IIFYM_LIMITS.minPublishOptions)
    throw countError();

  const draft: IifymDraft = { options: [] };

  const name = optionalText(input.name, IIFYM_LIMITS.planNameMax);
  if (name !== undefined) draft.name = name;
  if (input.startDate !== undefined && input.startDate !== null) {
    if (typeof input.startDate !== "string" || !isCalendarDate(input.startDate))
      throw new IifymError("invalid_input");
    draft.startDate = input.startDate;
  }

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  draft.options = rawOptions.map((raw) =>
    cleanOption(raw, seenIds, seenLabels),
  );

  const optionIds = new Set(draft.options.map((o) => o.id));
  if (input.schedule !== undefined && input.schedule !== null)
    draft.schedule = cleanSchedule(input.schedule, optionIds, opts.forPublish);

  if (opts.forPublish) {
    if (draft.name === undefined || draft.startDate === undefined)
      throw new IifymError("publish_incomplete");
    if (draft.schedule === undefined)
      throw new IifymError("publish_incomplete");
  }

  if (
    Buffer.byteLength(JSON.stringify(draft), "utf8") >
    IIFYM_LIMITS.payloadMaxBytes
  )
    throw new IifymError("invalid_input");
  return draft;
}
