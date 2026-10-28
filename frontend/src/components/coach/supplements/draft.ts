import type {
  SupplementItem,
  SupplementProduct,
  SupplementStatus,
} from "./model";

export type ItemDraft = {
  id: string;
  brand: string;
  productId: string;
  product: SupplementProduct | null;
  quantity: string;
  doseUnit: string;
  timing: string;
  status: SupplementStatus;
  notes: string;
};

export type RowErrors = {
  product?: string;
  quantity?: string;
};

export const draftOf = (item: SupplementItem): ItemDraft => ({
  id: item.id,
  brand: item.product.brand,
  productId: item.product.id,
  product: { ...item.product },
  quantity: String(item.quantity),
  doseUnit: item.doseUnit,
  timing: item.timing,
  status: item.status,
  notes: item.notes,
});

export const blankDraft = (id: string): ItemDraft => ({
  id,
  brand: "",
  productId: "",
  product: null,
  quantity: "",
  doseUnit: "",
  timing: "",
  status: "none",
  notes: "",
});

export const positiveNumber = (text: string) =>
  text.trim() !== "" && Number.isFinite(Number(text)) && Number(text) > 0;

const snapshotFor = (draft: ItemDraft): SupplementProduct | undefined =>
  draft.product &&
  draft.product.id === draft.productId &&
  draft.product.brand === draft.brand
    ? draft.product
    : undefined;

// The draft's stored snapshot is authoritative: saving a row never re-reads
// the live catalogue, so saved composition and links survive catalogue edits.
export const savedItem = (draft: ItemDraft): SupplementItem | null => {
  const product = snapshotFor(draft);
  if (!product || !positiveNumber(draft.quantity)) return null;
  return {
    id: draft.id,
    product: { ...product },
    quantity: Number(draft.quantity),
    // Legacy quantity-basis metadata, never an ingredient unit.
    doseUnit:
      product.quantityUnit ?? (draft.doseUnit.trim() || "reference units"),
    timing: draft.timing.trim(),
    status: draft.status,
    notes: draft.notes.trim(),
  };
};

export function rowErrors(draft: ItemDraft): RowErrors {
  const errors: RowErrors = {};
  const product = snapshotFor(draft);
  if (!draft.productId || !product) errors.product = "Choose a product.";
  if (draft.quantity.trim() === "")
    errors.quantity =
      product && product.referenceQuantity === null
        ? "Enter the prescribed quantity — the catalogue has no reference portion for this product."
        : "Enter the prescribed quantity.";
  else if (!positiveNumber(draft.quantity))
    errors.quantity = "Use a positive number.";
  return errors;
}
