/**
 * CATALOGUE-FOOD-ADAPTERS (#180 §C2/C3/C4, #182) — shared contract for
 * generic-food source adapters feeding the existing importer
 * (`lib/nutrition/import.ts`). Every row carries its own provenance
 * (source / source_id / source_url / licence / licence_url per the 18.1
 * column list); the nutrient payload keeps the source's declared units
 * and basis — nothing is re-derived and a missing value stays `null`.
 *
 * Adapters fail closed: an unexpected header, an unsupported unit or an
 * unrecognised representation throws `SourceAdapterError` — never a
 * guessed mapping.
 */

import { createHash } from "node:crypto";

export class SourceAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SourceAdapterError";
  }
}

export type SourceProvenance = {
  /** Machine-stable source key, e.g. `bls-4.0-2025`. */
  source: string;
  sourceUrl: string;
  licence: string;
  licenceUrl: string;
  /** Human-readable version of the export, e.g. `4.0` / `2025-11-03`. */
  sourceVersion: string;
  /** SHA-256 of the exact export bytes parsed. */
  sourceSha256: string;
};

export type NutrientMeasure = {
  /** Source's own component code (BLS `ENERCC`; CIQUAL header slug). */
  code: string;
  name: string;
  /** Declared unit string from the header (`kcal`, `g`, `mg`, `µg`, `kJ`). */
  unit: string;
  /** Declared reference basis (`per 100 g` for both sources here). */
  basis: string;
  /** `null` = not recorded in the source — never coerced to 0. */
  value: number | null;
  /** Source qualifier on the bound: `lt` = below quantification (`< x`
   * is preserved verbatim — it is a qualified measurement, not an
   * invented exact value). */
  qualifier?: "lt" | "gt" | "traces" | "lod" | "loq" | "lod_or_loq";
  /** Per-measure provenance where the source declares it (BLS only). */
  origin?: string | null;
  reference?: string | null;
};

export type SourceCandidate = {
  /** Stable source identifier (`BLS Code` / `alim_code`). */
  sourceId: string;
  sourceRow: number;
  name: string;
  nameAlt: string | null;
  group: string | null;
  /** Verbatim trailing note columns the source declares (BLS `Hinweis`). */
  sourceNote?: string | null;
  nutrients: NutrientMeasure[];
  provenance: SourceProvenance;
  rowFingerprint: string;
};

export type SourceRejectedReason =
  | "empty_row"
  | "missing_source_id"
  | "missing_name"
  | "invalid_numeric"
  | "unsupported_unit"
  | "duplicate_source_id";

export type SourceRejectedRow = {
  sourceRow: number;
  sourceId: string | null;
  reasonCode: SourceRejectedReason;
  reasonField?: string;
  reasonDetail?: string;
};

/** Mirrors `NutritionSource`'s classification shape so the existing
 * importer can consume `accepted` once 18.1 lands — the dry-run path
 * writes nothing. */
export type ClassifiedSource = {
  sourceName: string;
  sourceFingerprint: string;
  scannedRowCount: number;
  ignoredEmptyRowCount: number;
  sourceRowCount: number;
  accepted: SourceCandidate[];
  rejected: SourceRejectedRow[];
  /** Review candidates only — the importer never merges measured rows. */
  duplicates: SourceRejectedRow[];
};

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Fingerprint the mapped fields — the source.ts convention applied to
 * the richer candidate shape: byte-change detection, not identity. */
export function candidateFingerprint(
  candidate: Omit<SourceCandidate, "rowFingerprint">,
): string {
  return sha256Hex(
    JSON.stringify({
      sourceId: candidate.sourceId,
      name: candidate.name,
      nameAlt: candidate.nameAlt,
      group: candidate.group,
      sourceNote: candidate.sourceNote ?? null,
      nutrients: candidate.nutrients.map((n) => [
        n.code,
        n.unit,
        n.basis,
        n.value,
        n.origin ?? null,
        n.reference ?? null,
      ]),
      source: candidate.provenance.source,
      sourceVersion: candidate.provenance.sourceVersion,
    }),
  );
}

/** Parse a source numeric: decimal comma or point, optional leading `<`
 * (below-quantification markers are rejected as unsupported — they are
 * not exact measurements and must not become invented values). Empty /
 * `-` / `.` → `null`. Anything else → `undefined` (reject). */
export function parseSourceNumeric(raw: string | null | undefined):
  | {
      value: number | null;
      qualifier?: "lt" | "gt" | "traces" | "lod" | "loq" | "lod_or_loq";
    }
  | undefined {
  const t = (raw ?? "").trim();
  if (t === "" || t === "-" || t === ".") return { value: null };
  // CIQUAL `traces`: present but not quantified — a qualified reading,
  // not a missing value and never an invented number.
  if (t === "traces" || t === "TR") return { value: null, qualifier: "traces" };
  // BLS below-limit markers: present but not measured exactly.
  if (t === "<LOD or <LOQ") return { value: null, qualifier: "lod_or_loq" };
  if (t === "<LOD") return { value: null, qualifier: "lod" };
  if (t === "<LOQ") return { value: null, qualifier: "loq" };
  let qualifier: "lt" | "gt" | undefined;
  let body = t;
  if (t.startsWith("<")) {
    qualifier = "lt";
    body = t.slice(1).trim();
  } else if (t.startsWith(">")) {
    qualifier = "gt";
    body = t.slice(1).trim();
  }
  const normalized = body.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized)) return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) ? { value: n, qualifier } : undefined;
}

/** Declared units accepted from these two sources. Anything else fails
 * closed — B1 forbids guessing conversions. */
export const SUPPORTED_UNITS = new Set(["kJ", "kcal", "g", "mg", "µg", "IU"]);
