import raw from "@/data/supplement-database.json";
import type { SupplementProduct } from "./model";

// Frozen catalogue snapshot fields only; provenance columns stay in the JSON.
const products: SupplementProduct[] = raw.products.map((row) => ({
  id: row.id,
  brand: row.brand,
  name: row.name,
  referenceQuantity: row.referenceQuantity,
  quantityUnit: row.quantityUnit,
  declaredAmount: row.declaredAmount,
  declaredUnit: row.declaredUnit,
  url: row.url,
}));

export const supplementBrands: string[] = [
  ...new Set(products.map((p) => p.brand)),
].sort((a, b) => a.localeCompare(b));

export const productsForBrand = (brand: string): SupplementProduct[] =>
  products.filter((p) => p.brand === brand);

export const productById = (id: string): SupplementProduct | undefined =>
  products.find((p) => p.id === id);

const referenceText = (p: SupplementProduct): string => {
  const parts: string[] = [];
  if (p.declaredAmount !== null && p.declaredUnit)
    parts.push(`${p.declaredAmount} ${p.declaredUnit}`);
  if (p.referenceQuantity !== null)
    parts.push(
      `per ${p.referenceQuantity}${p.quantityUnit ? ` ${p.quantityUnit}` : ""}`,
    );
  return parts.join(" · ");
};

// Same-brand/same-name variants stay distinct: append the declared amount and
// reference portion so the coach can tell them apart without renaming products.
export function productOptionLabel(product: SupplementProduct): string {
  const sameName = products.some(
    (p) =>
      p.id !== product.id &&
      p.brand === product.brand &&
      p.name === product.name,
  );
  if (!sameName) return product.name;
  const detail = referenceText(product);
  return detail ? `${product.name} · ${detail}` : product.name;
}
