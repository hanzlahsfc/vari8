export type SupplementProduct = {
  id: string;
  brand: string;
  name: string;
  referenceQuantity: number | null;
  quantityUnit: string | null;
  declaredAmount: number | null;
  declaredUnit: string | null;
  url: string | null;
};

export type SupplementStatus = "must-have" | "optional" | "none";

export type SupplementItem = {
  id: string;
  product: SupplementProduct;
  quantity: number;
  doseUnit: string;
  timing: string;
  status: SupplementStatus;
  notes: string;
};

export type SupplementPlan = {
  id: string;
  clientId: string;
  name: string;
  items: SupplementItem[];
  savedAt: string;
};

export const SUPPLEMENT_STATUSES: { value: SupplementStatus; label: string }[] =
  [
    { value: "must-have", label: "Must have" },
    { value: "optional", label: "Optional" },
    { value: "none", label: "No status" },
  ];

export const supplementStatusLabel = (status: SupplementStatus): string =>
  SUPPLEMENT_STATUSES.find((s) => s.value === status)?.label ?? "No status";

// HTTP(S) product links only: needs a hostname and must not carry credentials.
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

// Declared ingredient total from the original reference ratio. Returns null
// when the catalogue cannot supply a basis; zero is never substituted.
export function declaredTotal(
  product: SupplementProduct,
  quantity: number,
): { amount: number; unit: string } | null {
  const { declaredAmount, declaredUnit, referenceQuantity } = product;
  if (
    typeof declaredAmount !== "number" ||
    !Number.isFinite(declaredAmount) ||
    declaredAmount < 0 ||
    typeof declaredUnit !== "string" ||
    !declaredUnit.trim() ||
    typeof referenceQuantity !== "number" ||
    !Number.isFinite(referenceQuantity) ||
    referenceQuantity <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  )
    return null;
  return {
    amount: (declaredAmount * quantity) / referenceQuantity,
    unit: declaredUnit,
  };
}

// Read-only dosage output for a chosen quantity: the declared ingredient
// total when the catalogue provides a composition basis (a known zero
// declaration counts), otherwise the quantity counted in product units when
// the catalogue unit is known. Returns null rather than inventing a strength.
export function dosageForQuantity(
  product: SupplementProduct,
  quantity: number,
): { amount: number; unit: string } | null {
  const declared = declaredTotal(product, quantity);
  if (declared) return declared;
  if (
    typeof product.quantityUnit === "string" &&
    product.quantityUnit.trim() &&
    Number.isFinite(quantity) &&
    quantity > 0
  )
    return { amount: quantity, unit: product.quantityUnit };
  return null;
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const nonempty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const nullableString = (v: unknown) => v === null || typeof v === "string";
const positiveFinite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const nullableAmount = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

export function isSupplementProduct(
  value: unknown,
): value is SupplementProduct {
  if (!record(value)) return false;
  return (
    nonempty(value.id) &&
    nonempty(value.brand) &&
    nonempty(value.name) &&
    (value.referenceQuantity === null ||
      positiveFinite(value.referenceQuantity)) &&
    nullableString(value.quantityUnit) &&
    nullableAmount(value.declaredAmount) &&
    nullableString(value.declaredUnit) &&
    (value.url === null ||
      (typeof value.url === "string" &&
        safeProductUrl(value.url) !== undefined))
  );
}

function isSupplementItem(value: unknown): value is SupplementItem {
  if (!record(value)) return false;
  if (!nonempty(value.id) || !isSupplementProduct(value.product)) return false;
  if (!positiveFinite(value.quantity)) return false;
  if (!nonempty(value.doseUnit)) return false;
  // A catalogue-known administration unit must match the saved dose unit;
  // unknown units are whatever the coach confirmed. No conversions.
  if (
    value.product.quantityUnit !== null &&
    value.product.quantityUnit !== value.doseUnit
  )
    return false;
  if (typeof value.timing !== "string" || typeof value.notes !== "string")
    return false;
  return (
    value.status === "must-have" ||
    value.status === "optional" ||
    value.status === "none"
  );
}

export function isSupplementPlan(value: unknown): value is SupplementPlan {
  if (!record(value)) return false;
  return (
    nonempty(value.id) &&
    nonempty(value.clientId) &&
    nonempty(value.name) &&
    nonempty(value.savedAt) &&
    Array.isArray(value.items) &&
    value.items.every(isSupplementItem)
  );
}
