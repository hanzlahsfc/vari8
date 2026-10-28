/**
 * BLS 4.0 adapter (#182) — Bundeslebensmittelschlüssel, Max
 * Rubner-Institut, CC BY 4.0. Documented distribution: the zip on
 * https://blsdb.de (DOI 10.25826/Data20251217-134202-0) containing
 * `BLS_4_0_Daten_2025_DE.xlsx`, one sheet `BLS_4_0_Daten_2025_DE`.
 *
 * Layout (header row 1): `BLS Code`, `Lebensmittelbezeichnung`,
 * `Food name`, then per component a triple —
 *   `<CODE> <name> [<unit>/100g]` | `<CODE> Datenherkunft` | `<CODE> Referenz`
 * Values are numeric (decimal point or comma) or empty; a missing cell
 * stays `null`. Any unexpected header/unit fails the whole parse.
 */

import {
  SourceAdapterError,
  SUPPORTED_UNITS,
  candidateFingerprint,
  parseSourceNumeric,
  sha256Hex,
  type ClassifiedSource,
  type NutrientMeasure,
  type SourceCandidate,
  type SourceProvenance,
  type SourceRejectedRow,
} from "./common";
import { readSheet } from "./xlsx";

export const BLS_PROVENANCE: Omit<SourceProvenance, "sourceSha256"> = {
  source: "bls-4.0-2025",
  sourceUrl: "https://blsdb.de/",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceVersion: "4.0 (2025, DOI 10.25826/Data20251217-134202-0)",
};

const SHEET = "BLS_4_0_Daten_2025_DE";
// <CODE> <name> [<unit>/100g] — CODE is uppercase alnum, unit inside [].
const NUTRIENT_HEADER = /^([A-Z][A-Z0-9:]*) +(.+) \[([^\]]+)\/100g\]$/;

type NutrientColumn = {
  code: string;
  name: string;
  unit: string;
  valueCol: number;
  originCol: number;
  referenceCol: number;
};

function parseBlsHeader(cells: string[]): {
  cols: NutrientColumn[];
  noteCols: { name: string; col: number }[];
} {
  if (cells[0] !== "BLS Code" || cells[1] !== "Lebensmittelbezeichnung")
    throw new SourceAdapterError(
      "unexpected_header",
      `BLS header col1/col2: ${JSON.stringify(cells.slice(0, 3))}`,
    );
  const cols: NutrientColumn[] = [];
  const noteCols: { name: string; col: number }[] = [];
  for (let i = 3; i < cells.length; i += 3) {
    const h = cells[i] ?? "";
    const m = NUTRIENT_HEADER.exec(h);
    if (!m) {
      // trailing non-nutrient columns (BLS `Hinweis`) — verbatim notes
      for (let j = i; j < cells.length; j++)
        if (cells[j]) noteCols.push({ name: cells[j]!, col: j });
      break;
    }
    const [, code, name, unit] = m;
    if (!SUPPORTED_UNITS.has(unit))
      throw new SourceAdapterError(
        "unsupported_unit",
        `${code}: unit ${JSON.stringify(unit)}`,
      );
    if (
      cells[i + 1] !== `${code} Datenherkunft` ||
      cells[i + 2] !== `${code} Referenz`
    )
      throw new SourceAdapterError(
        "unexpected_header",
        `cols ${i + 2}-${i + 3} not "${code} Datenherkunft"/"Referenz"`,
      );
    cols.push({
      code,
      name,
      unit,
      valueCol: i,
      originCol: i + 1,
      referenceCol: i + 2,
    });
  }
  return { cols, noteCols };
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim();
}

export async function parseBlsExport(
  bytes: Buffer,
): Promise<{ provenance: SourceProvenance; classified: ClassifiedSource }> {
  const rows = await readSheet(bytes, SHEET);
  if (rows.length < 2)
    throw new SourceAdapterError("unexpected_header", "no data rows");
  const header = rows[0].map((c) => cellText(c) ?? "");
  const { cols: nutrientCols, noteCols } = parseBlsHeader(header);
  const provenance: SourceProvenance = {
    ...BLS_PROVENANCE,
    sourceSha256: sha256Hex(bytes),
  };

  const accepted: SourceCandidate[] = [];
  const rejected: SourceRejectedRow[] = [];
  const duplicates: SourceRejectedRow[] = [];
  const seen = new Set<string>();
  let ignoredEmptyRowCount = 0;
  let scanned = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const sourceRow = r + 1;
    scanned++;
    if (row.every((c) => cellText(c) === null)) {
      ignoredEmptyRowCount++;
      continue;
    }
    const sourceId = cellText(row[0]);
    const name = cellText(row[1]);
    const nameAlt = cellText(row[2]);
    if (!sourceId || !name) {
      rejected.push({
        sourceRow,
        sourceId,
        reasonCode: !sourceId ? "missing_source_id" : "missing_name",
      });
      continue;
    }
    const nutrients: NutrientMeasure[] = [];
    let invalidField: string | undefined;
    for (const nc of nutrientCols) {
      const parsed = parseSourceNumeric(
        cellText(row[nc.valueCol]) ?? undefined,
      );
      if (parsed === undefined) {
        invalidField = nc.code;
        break;
      }
      nutrients.push({
        code: nc.code,
        name: nc.name,
        unit: nc.unit,
        basis: "per 100 g",
        value: parsed.value,
        qualifier: parsed.qualifier,
        origin: cellText(row[nc.originCol]),
        reference: cellText(row[nc.referenceCol]),
      });
    }
    if (invalidField) {
      rejected.push({
        sourceRow,
        sourceId,
        reasonCode: "invalid_numeric",
        reasonField: invalidField,
      });
      continue;
    }
    if (seen.has(sourceId)) {
      duplicates.push({
        sourceRow,
        sourceId,
        reasonCode: "duplicate_source_id",
      });
      continue;
    }
    seen.add(sourceId);
    const sourceNote =
      noteCols
        .map((nc) => cellText(row[nc.col]))
        .filter((v): v is string => v !== null)
        .join(" | ") || null;
    const candidate: Omit<SourceCandidate, "rowFingerprint"> = {
      sourceId,
      sourceRow,
      name,
      nameAlt,
      group: null,
      sourceNote,
      nutrients,
      provenance,
    };
    accepted.push({
      ...candidate,
      rowFingerprint: candidateFingerprint(candidate),
    });
  }

  return {
    provenance,
    classified: {
      sourceName: BLS_PROVENANCE.source,
      sourceFingerprint: provenance.sourceSha256,
      scannedRowCount: scanned,
      ignoredEmptyRowCount,
      sourceRowCount: accepted.length + rejected.length + duplicates.length,
      accepted,
      rejected,
      duplicates,
    },
  };
}
