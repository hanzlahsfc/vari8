/**
 * CATALOGUE-OFF (#185) — Open Food Facts lookup boundary.
 *
 * OFF data is ODbL-share-alike: it must NEVER be written into
 * catalogue_item — this module only returns a separate lookup result
 * joined by barcode at query time. No OFF field maps to a catalogue
 * column; the grep test asserts that boundary.
 *
 * Upstream fields are untrusted: every value is validated before use.
 * Missing nutrition values stay null — never coerced to 0.
 */

export const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
export const OFF_ATTRIBUTION =
  "Contains data from Open Food Facts, available under the Open Database License (ODbL)";
export const OFF_LICENCE = "ODbL-1.0";
export const OFF_LICENCE_URL = "https://opendatacommons.org/licenses/odbl/1.0/";

export class OffLookupError extends Error {
  constructor(
    readonly code:
      | "invalid_barcode"
      | "not_found"
      | "upstream_error"
      | "timeout"
      | "malformed_response"
      | "rate_limited",
    detail: string,
  ) {
    super(`off lookup ${code}: ${detail}`);
    this.name = "OffLookupError";
  }
}

export interface OffProvenance {
  source: "openfoodfacts";
  sourceUrl: string;
  licence: typeof OFF_LICENCE;
  licenceUrl: typeof OFF_LICENCE_URL;
  attribution: typeof OFF_ATTRIBUTION;
  productUrl: string;
}

export interface OffNutrient {
  code: string;
  value: number;
  unit: string;
  basis: "per 100 g";
}

export interface OffProduct {
  barcode: string;
  name: string | null;
  brands: string[];
  quantity: string | null;
  /** only nutrients present upstream appear; missing values are absent,
   * never a synthesized 0 */
  nutrients: OffNutrient[];
  provenance: OffProvenance;
}

export type OffLookupResult =
  | { status: "found"; product: OffProduct }
  | { status: "not_found"; barcode: string };

/** EAN/UPC digits only — 8, 12, 13 or 14 digits per OFF's barcode
 * conventions. Anything else is a caller error, not an upstream miss. */
export function isValidBarcode(barcode: string): boolean {
  return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(barcode);
}

export type OffFetch = (
  url: string,
  init: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const DEFAULT_TIMEOUT_MS = 10_000;

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

const ALLOWED_UNITS = new Set(["g", "mg", "µg", "ug", "kJ", "kcal", "%", "ml"]);

/** Normalize the untrusted OFF v2 product payload into a bounded
 * OffProduct. Anything that fails validation is dropped, not guessed. */
function normalizeProduct(barcode: string, body: unknown): OffProduct {
  const root =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const product =
    typeof root.product === "object" && root.product !== null
      ? (root.product as Record<string, unknown>)
      : {};
  const nutriments =
    typeof product.nutriments === "object" && product.nutriments !== null
      ? (product.nutriments as Record<string, unknown>)
      : {};

  const nutrients: OffNutrient[] = [];
  for (const [key, v] of Object.entries(nutriments)) {
    if (!key.endsWith("_100g")) continue;
    const code = key.slice(0, -5);
    if (!code || /_unit$|_serving$|_value$|_prepared$/.test(code)) continue;
    const value = asNumber(v);
    if (value === null) continue; // missing upstream → absent, never 0
    const unit = asString(nutriments[`${code}_unit`]) ?? "g";
    if (!ALLOWED_UNITS.has(unit)) continue; // unsupported unit → drop, don't guess
    nutrients.push({ code, value, unit, basis: "per 100 g" });
  }

  const brands = asString(product.brands);
  return {
    barcode,
    name: asString(product.product_name) ?? asString(product.product_name_en),
    brands: brands ? brands.split(",").map((b) => b.trim()) : [],
    quantity: asString(product.quantity),
    nutrients,
    provenance: {
      source: "openfoodfacts",
      sourceUrl: "https://world.openfoodfacts.org",
      licence: OFF_LICENCE,
      licenceUrl: OFF_LICENCE_URL,
      attribution: OFF_ATTRIBUTION,
      productUrl: `https://world.openfoodfacts.org/product/${barcode}`,
    },
  };
}

/** Look up a barcode on OFF. Injected fetch keeps the unit suite
 * deterministic — production callers pass `fetch`. */
export async function lookupOffProduct(
  barcode: string,
  options: {
    fetchImpl: OffFetch;
    timeoutMs?: number;
    baseUrl?: string;
  },
): Promise<OffLookupResult> {
  if (!isValidBarcode(barcode))
    throw new OffLookupError(
      "invalid_barcode",
      `barcode must be 8/12/13/14 digits, got ${JSON.stringify(barcode)}`,
    );

  const base = options.baseUrl ?? OFF_PRODUCT_URL;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await options.fetchImpl(`${base}/${barcode}.json`, {
      signal: ctrl.signal,
    });
    if (res.status === 429)
      throw new OffLookupError("rate_limited", `HTTP 429 for ${barcode}`);
    if (!res.ok)
      throw new OffLookupError(
        "upstream_error",
        `HTTP ${res.status} for ${barcode}`,
      );
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new OffLookupError(
        "malformed_response",
        `non-JSON body for ${barcode}`,
      );
    }
    const root =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : null;
    if (!root || typeof root.status !== "number")
      throw new OffLookupError(
        "malformed_response",
        `unexpected payload shape for ${barcode}`,
      );
    if (root.status === 0) return { status: "not_found", barcode };
    return { status: "found", product: normalizeProduct(barcode, body) };
  } catch (e) {
    if (e instanceof OffLookupError) throw e;
    if ((e as Error).name === "AbortError")
      throw new OffLookupError(
        "timeout",
        `lookup timed out after ${timeout}ms`,
      );
    throw new OffLookupError(
      "upstream_error",
      `fetch failed: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
