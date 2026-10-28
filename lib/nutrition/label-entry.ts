/**
 * CATALOGUE-LABEL-ENTRY (#186) — hand-captured label validation
 * boundary. A human reads one label/one page; this path validates and
 * normalizes what they entered. Reusable by 18.3 without a second
 * implementation. Writes nothing — persistence needs #181's schema.
 *
 * Provenance is user-entered: the record carries what the human
 * supplied (licence, label photo hash, source) and never fabricates
 * verification status or source attribution.
 */

import { isValidBarcode } from "./off";

export class LabelEntryError extends Error {
  constructor(
    readonly code:
      | "invalid_input"
      | "invalid_measurement"
      | "invalid_unit"
      | "invalid_basis"
      | "missing_serving_quantity"
      | "invalid_photo_hash",
    detail: string,
  ) {
    super(`label entry ${code}: ${detail}`);
    this.name = "LabelEntryError";
  }
}

export type LabelBasis = "per 100 g" | "per serving";

export const LABEL_ENTRY_UNITS = new Set(["g", "mg", "µg", "ug", "kJ", "kcal"]);

/** Nutrient-code → allowed units. A globally supported unit is not
 * valid for every nutrient — protein in kcal must refuse. Unknown
 * codes fail safe: an unmapped nutrient code is refused, never
 * guessed or silently relabelled. */
export const NUTRIENT_UNITS: Record<string, readonly string[]> = {
  // canonical vocabulary — lib/nutrition/source.ts fields
  calories: ["kcal"],
  protein: ["g"],
  carbs: ["g"],
  fats: ["g"],
  // extended label nutrients
  saturated_fat: ["g"],
  "saturated-fat": ["g"],
  sugars: ["g"],
  sugar: ["g"],
  fibre: ["g"],
  fiber: ["g"],
  salt: ["g"],
  sodium: ["g"],
  // energy aliases — kJ stays kJ, never relabelled calories
  "energy-kj": ["kJ"],
  energy: ["kJ", "kcal"], // unit-resolved to calories/energy-kj
  kj: ["kJ"],
  // vitamins / minerals (mass units only)
  vitamin_a: ["µg", "ug"],
  vitamin_c: ["mg"],
  vitamin_d: ["µg", "ug"],
  calcium: ["mg"],
  iron: ["mg"],
  potassium: ["mg"],
  magnesium: ["mg"],
  zinc: ["mg"],
};

/** Aliases explicitly normalize to the canonical source.ts names —
 * `fat`→`fats`, `carbohydrate`→`carbs`. `energy`+kJ is NOT an alias of
 * calories: kJ never relabels as kcal (that would silently convert). */
const NUTRIENT_ALIASES: Record<string, string> = {
  fat: "fats",
  "total-fat": "fats",
  carbohydrate: "carbs",
  carbohydrates: "carbs",
};

export function canonicalNutrientCode(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/\s+/g, "-");
  return NUTRIENT_ALIASES[normalized] ?? normalized;
}

/** Resolve a nutrient code to its allowed units, or null when unknown —
 * unknown codes refuse, never a guessed unit contract. */
export function nutrientUnits(code: string): readonly string[] | null {
  return NUTRIENT_UNITS[canonicalNutrientCode(code)] ?? null;
}

export interface LabelNutrient {
  code: string;
  /** `null` = the label does not list it — never a fabricated 0 */
  value: number | null;
  unit: string;
  basis: LabelBasis;
}

export interface LabelEntryInput {
  barcode?: string;
  name: string;
  brand?: string;
  variant?: { kind: "flavour"; label: string };
  /** declared serving quantity — required when any nutrient uses
   * `per serving` basis; never silently assumed */
  servingSizeG?: number;
  nutrients: {
    code: string;
    value: number | null;
    unit: string;
    basis: LabelBasis;
  }[];
  provenance: {
    /** sha256 of the label photo the human captured — required */
    labelPhotoSha256: string;
    /** the licence the human recorded for the label/page — required */
    licence: string;
    /** what the human read (e.g. "manufacturer page", "package label") */
    capturedFrom: string;
  };
}

export interface LabelEntryRecord {
  barcode: string | null;
  name: string;
  brand: string | null;
  variant: { kind: "flavour"; label: string } | null;
  servingSizeG: number | null;
  nutrients: LabelNutrient[];
  provenance: {
    labelPhotoSha256: string;
    licence: string;
    capturedFrom: string;
    /** human-captured by definition — this is NOT a verification claim */
    capturedBy: "manual-label-entry";
  };
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validate a hand-entered label record. Untrusted user input is
 * validated field-by-field; anything invalid refuses with a typed
 * error rather than being normalized into a wrong record. */
export function parseLabelEntry(input: unknown): LabelEntryRecord {
  const o =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : null;
  if (!o)
    throw new LabelEntryError("invalid_input", "label entry must be an object");
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) throw new LabelEntryError("invalid_input", "name is required");

  // reuse the shared GTIN/EAN/UPC validator — check digits for the
  // supported 8/12/13/14 formats, leading zeros preserved; the field
  // stays optional and never infers uniqueness
  const barcode =
    o.barcode === undefined || o.barcode === null
      ? null
      : typeof o.barcode === "string" && isValidBarcode(o.barcode)
        ? o.barcode
        : (() => {
            throw new LabelEntryError(
              "invalid_input",
              `barcode must be a valid GTIN/EAN/UPC (8/12/13/14 digits with check digit), got ${JSON.stringify(o.barcode)}`,
            );
          })();

  const servingSizeG =
    o.servingSizeG === undefined || o.servingSizeG === null
      ? null
      : finite(o.servingSizeG) && o.servingSizeG > 0
        ? o.servingSizeG
        : (() => {
            throw new LabelEntryError(
              "invalid_input",
              `servingSizeG must be a positive number, got ${JSON.stringify(o.servingSizeG)}`,
            );
          })();

  const raw = Array.isArray(o.nutrients) ? o.nutrients : [];
  if (!raw.length)
    throw new LabelEntryError(
      "invalid_input",
      "at least one nutrient is required",
    );
  const nutrients: LabelNutrient[] = raw.map((n, i) => {
    const nr =
      typeof n === "object" && n !== null ? (n as Record<string, unknown>) : {};
    const code = typeof nr.code === "string" ? nr.code.trim() : "";
    if (!code)
      throw new LabelEntryError(
        "invalid_measurement",
        `nutrient ${i}: code required`,
      );
    const unit = typeof nr.unit === "string" ? nr.unit.trim() : "";
    if (!unit || !LABEL_ENTRY_UNITS.has(unit))
      throw new LabelEntryError(
        "invalid_unit",
        `nutrient ${code}: unsupported unit ${JSON.stringify(nr.unit)}`,
      );
    let canonicalCode = canonicalNutrientCode(code);
    // `energy` is unit-dependent: kcal → calories, kJ → energy-kj —
    // explicit resolution, never a field rename of units
    if (canonicalCode === "energy")
      canonicalCode = unit === "kcal" ? "calories" : "energy-kj";
    const allowed = NUTRIENT_UNITS[canonicalCode] ?? null;
    if (allowed === null)
      throw new LabelEntryError(
        "invalid_measurement",
        `nutrient ${code}: unknown nutrient code — no unit contract`,
      );
    if (!allowed.includes(unit))
      throw new LabelEntryError(
        "invalid_unit",
        `nutrient ${code}: unit ${JSON.stringify(unit)} incompatible — allowed ${allowed.join("/")}`,
      );
    const basis = nr.basis;
    if (basis !== "per 100 g" && basis !== "per serving")
      throw new LabelEntryError(
        "invalid_basis",
        `nutrient ${code}: basis must be "per 100 g" or "per serving", got ${JSON.stringify(basis)}`,
      );
    const v = nr.value;
    if (v !== null && (!finite(v) || v < 0))
      throw new LabelEntryError(
        "invalid_measurement",
        `nutrient ${code}: value must be a non-negative finite number or null, got ${JSON.stringify(v)}`,
      );
    if (basis === "per serving" && servingSizeG === null)
      throw new LabelEntryError(
        "missing_serving_quantity",
        `nutrient ${code}: per-serving basis needs a declared servingSizeG — never silently assumed`,
      );
    return { code: canonicalCode, value: v, unit, basis };
  });
  // canonical collision: alias + canonical both supplied for the same
  // nutrient must refuse — never silently overwrite conflicting values
  const seenCodes = new Set<string>();
  for (const n of nutrients) {
    if (seenCodes.has(n.code))
      throw new LabelEntryError(
        "invalid_input",
        `duplicate canonical nutrient ${n.code} (alias/canonical collision)`,
      );
    seenCodes.add(n.code);
  }

  const prov =
    typeof o.provenance === "object" && o.provenance !== null
      ? (o.provenance as Record<string, unknown>)
      : {};
  const photo =
    typeof prov.labelPhotoSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(prov.labelPhotoSha256)
      ? prov.labelPhotoSha256
      : (() => {
          throw new LabelEntryError(
            "invalid_photo_hash",
            "labelPhotoSha256 must be a 64-hex digest of the captured label photo",
          );
        })();
  const licence = typeof prov.licence === "string" ? prov.licence.trim() : "";
  if (!licence)
    throw new LabelEntryError("invalid_input", "licence is required per row");
  const capturedFrom =
    typeof prov.capturedFrom === "string" ? prov.capturedFrom.trim() : "";
  if (!capturedFrom)
    throw new LabelEntryError(
      "invalid_input",
      "capturedFrom must record what the human read",
    );

  const variant =
    o.variant === undefined || o.variant === null
      ? null
      : (() => {
          const vr = o.variant as Record<string, unknown>;
          if (
            vr?.kind !== "flavour" ||
            typeof vr.label !== "string" ||
            !vr.label.trim()
          )
            throw new LabelEntryError(
              "invalid_input",
              "variant must be {kind:'flavour', label}",
            );
          return { kind: "flavour" as const, label: vr.label.trim() };
        })();

  return {
    barcode,
    name,
    brand:
      typeof o.brand === "string" && o.brand.trim() ? o.brand.trim() : null,
    variant,
    servingSizeG,
    nutrients,
    provenance: {
      labelPhotoSha256: photo,
      licence,
      capturedFrom,
      capturedBy: "manual-label-entry",
    },
  };
}
