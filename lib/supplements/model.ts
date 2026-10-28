/**
 * PR-SUPP — supplement-plan wire validation. Semantics are ported from
 * the approved FRONTEND supplements model (origin/FRONTEND 51fa6a2,
 * `frontend/src/components/coach/supplements/model.ts`): positive
 * quantity, catalogue-compatible dose unit, the closed status set, safe
 * product URLs, and missing composition preserved as null — never
 * zero-filled and never substituted. The derived dosage arithmetic
 * (`declaredTotal`/`dosageForQuantity`) stays client-side display math;
 * the backend stores inputs only.
 */

export type SupplementItemStatusWire = "must-have" | "optional" | "none";

export const SUPPLEMENT_ITEM_STATUSES: readonly SupplementItemStatusWire[] = [
  "must-have",
  "optional",
  "none",
] as const;

export const MAX_SUPPLEMENT_ITEMS = 50;
export const MAX_PLAN_NAME_LENGTH = 120;
export const MAX_TIMING_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_ID_LENGTH = 128;
export const MAX_TEXT_FIELD = 300;
export const MAX_UNIT_LENGTH = 64;

export class SupplementValidationError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`Invalid supplement plan field: ${field}`);
    this.name = "SupplementValidationError";
    this.field = field;
  }
}

export type SupplementProductSnapshot = {
  refId: string;
  brand: string;
  name: string;
  referenceQuantity: number | null;
  quantityUnit: string | null;
  declaredAmount: number | null;
  declaredUnit: string | null;
  url: string | null;
};

export type ValidatedSupplementItem = {
  itemRefId: string | null;
  product: SupplementProductSnapshot;
  quantity: number;
  doseUnit: string;
  timing: string;
  status: SupplementItemStatusWire;
  notes: string;
};

// HTTP(S) product links only: needs a hostname and must not carry
// credentials — identical rule to the FRONTEND `safeProductUrl`.
export function safeProductUrl(value: string | null): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return undefined;
  if (!parsed.hostname || parsed.username || parsed.password) return undefined;
  return value;
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const ITEM_KEYS = new Set([
  "id",
  "product",
  "quantity",
  "doseUnit",
  "timing",
  "status",
  "notes",
]);
const PRODUCT_KEYS = new Set([
  "id",
  "brand",
  "name",
  "referenceQuantity",
  "quantityUnit",
  "declaredAmount",
  "declaredUnit",
  "url",
]);

function boundedString(
  value: unknown,
  field: string,
  max: number,
  { required }: { required: boolean },
): string | null {
  if (value === null || value === undefined) {
    if (required) throw new SupplementValidationError(field);
    return null;
  }
  if (typeof value !== "string" || value.length > max)
    throw new SupplementValidationError(field);
  if (required && value.trim().length === 0)
    throw new SupplementValidationError(field);
  return value;
}

function nullableAmount(
  value: unknown,
  field: string,
  { allowZero }: { allowZero: boolean },
): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new SupplementValidationError(field);
  if (allowZero ? value < 0 : value <= 0)
    throw new SupplementValidationError(field);
  return value;
}

export function parseSupplementPlanName(name: unknown): string {
  const out = boundedString(name, "name", MAX_PLAN_NAME_LENGTH, {
    required: true,
  }) as string;
  return out.trim();
}

function parseProduct(value: unknown): SupplementProductSnapshot {
  if (!record(value)) throw new SupplementValidationError("product");
  for (const key of Object.keys(value))
    if (!PRODUCT_KEYS.has(key)) throw new SupplementValidationError("product");
  const url = boundedString(value.url, "product.url", MAX_TEXT_FIELD, {
    required: false,
  });
  if (url !== null && safeProductUrl(url) === undefined)
    throw new SupplementValidationError("product.url");
  return {
    refId: boundedString(value.id, "product.id", MAX_ID_LENGTH, {
      required: true,
    }) as string,
    brand: boundedString(value.brand, "product.brand", MAX_TEXT_FIELD, {
      required: true,
    }) as string,
    name: boundedString(value.name, "product.name", MAX_TEXT_FIELD, {
      required: true,
    }) as string,
    referenceQuantity: nullableAmount(
      value.referenceQuantity,
      "product.referenceQuantity",
      { allowZero: false },
    ),
    quantityUnit: boundedString(
      value.quantityUnit,
      "product.quantityUnit",
      MAX_UNIT_LENGTH,
      { required: false },
    ),
    declaredAmount: nullableAmount(
      value.declaredAmount,
      "product.declaredAmount",
      {
        allowZero: true,
      },
    ),
    declaredUnit: boundedString(
      value.declaredUnit,
      "product.declaredUnit",
      MAX_UNIT_LENGTH,
      { required: false },
    ),
    url,
  };
}

export function parseSupplementItems(
  input: unknown,
): ValidatedSupplementItem[] {
  if (!Array.isArray(input) || input.length > MAX_SUPPLEMENT_ITEMS)
    throw new SupplementValidationError("items");
  return input.map((raw): ValidatedSupplementItem => {
    if (!record(raw)) throw new SupplementValidationError("item");
    for (const key of Object.keys(raw))
      if (!ITEM_KEYS.has(key)) throw new SupplementValidationError("item");
    const product = parseProduct(raw.product);
    if (
      typeof raw.quantity !== "number" ||
      !Number.isFinite(raw.quantity) ||
      raw.quantity <= 0
    )
      throw new SupplementValidationError("quantity");
    const doseUnit = boundedString(raw.doseUnit, "doseUnit", MAX_UNIT_LENGTH, {
      required: true,
    }) as string;
    // A catalogue-known administration unit must match the saved dose
    // unit; unknown units are whatever the coach confirmed. No
    // conversions.
    if (product.quantityUnit !== null && product.quantityUnit !== doseUnit)
      throw new SupplementValidationError("doseUnit");
    if (!SUPPLEMENT_ITEM_STATUSES.includes(raw.status as never))
      throw new SupplementValidationError("status");
    return {
      itemRefId: boundedString(raw.id, "id", MAX_ID_LENGTH, {
        required: false,
      }),
      product,
      quantity: raw.quantity,
      doseUnit,
      timing:
        boundedString(raw.timing, "timing", MAX_TIMING_LENGTH, {
          required: false,
        }) ?? "",
      status: raw.status as SupplementItemStatusWire,
      notes:
        boundedString(raw.notes, "notes", MAX_NOTES_LENGTH, {
          required: false,
        }) ?? "",
    };
  });
}
