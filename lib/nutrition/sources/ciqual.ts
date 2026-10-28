/**
 * CIQUAL 2025 adapter (#182) — ANSES-CIQUAL Table Ciqual 2025, Etalab
 * Licence Ouverte 2.0, DOI 10.57745/RDMHWY. Documented distribution:
 * `Table Ciqual 2025_FR_2025_11_03.xlsx` via
 * entrepot.recherche.data.gouv.fr, sheet `composition nutritionnelle`.
 *
 * Layout (header row 1): `alim_grp_code`, `alim_ssgrp_code`,
 * `alim_ssssgrp_code`, `alim_grp_nom_fr`, `alim_ssgrp_nom_fr`,
 * `alim_ssssgrp_nom_fr`, `alim_code`, `alim_nom_fr`, `alim_nom_sci`,
 * then nutrient columns `<name> (<unit>\r\n100 g)`. Missing is the
 * literal `-`; numbers carry a decimal comma. Below-quantification
 * markers (`< …`) are rejected as non-exact, never converted.
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

export const CIQUAL_PROVENANCE: Omit<SourceProvenance, "sourceSha256"> = {
  source: "ciqual-2025",
  sourceUrl: "https://doi.org/10.57745/RDMHWY",
  licence: "Licence Ouverte / Open Licence 2.0",
  licenceUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
  sourceVersion: "2025-11-03 (Table Ciqual 2025, ANSES)",
};

const SHEET = "composition nutritionnelle";
const META_HEADER = [
  "alim_grp_code",
  "alim_ssgrp_code",
  "alim_ssssgrp_code",
  "alim_grp_nom_fr",
  "alim_ssgrp_nom_fr",
  "alim_ssssgrp_nom_fr",
  "alim_code",
  "alim_nom_fr",
  "alim_nom_sci",
];
// <name> (<unit>\n100 g) — headers fold lines with \r\n.
const NUTRIENT_HEADER = /^(.+) \(([^()\r\n]+)[\r\n/ ]*100[\r\n ]*g\)\s*$/;

type NutrientColumn = { code: string; name: string; unit: string; col: number };

/** Slug the French name into a stable component code (letters/digits
 * only, upper-cased, dashes) — CIQUAL has no per-component code column. */
function slug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function parseCiqualHeader(cells: string[]): {
  cols: NutrientColumn[];
  noteCols: { name: string; col: number }[];
} {
  for (let i = 0; i < META_HEADER.length; i++)
    if (cells[i] !== META_HEADER[i])
      throw new SourceAdapterError(
        "unexpected_header",
        `col ${i + 1}: expected ${META_HEADER[i]}, got ${JSON.stringify(cells[i])}`,
      );
  const cols: NutrientColumn[] = [];
  const noteCols: { name: string; col: number }[] = [];
  for (let i = META_HEADER.length; i < cells.length; i++) {
    const h = (cells[i] ?? "")
      .replace(/\r\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const m = NUTRIENT_HEADER.exec(h);
    if (!m) {
      // trailing non-nutrient columns (CIQUAL `Facteur de Jones`) — verbatim
      for (let j = i; j < cells.length; j++)
        if (cells[j])
          noteCols.push({ name: cells[j]!.replace(/\r\n/g, " "), col: j });
      break;
    }
    const [, name, rawUnit] = m;
    const unit = rawUnit.trim();
    if (!SUPPORTED_UNITS.has(unit))
      throw new SourceAdapterError(
        "unsupported_unit",
        `col ${i + 1}: unit ${JSON.stringify(unit)}`,
      );
    cols.push({
      code: `${slug(name)}-${unit.toUpperCase()}`,
      name,
      unit,
      col: i,
    });
  }
  return { cols, noteCols };
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim();
}

export async function parseCiqualExport(
  bytes: Buffer,
): Promise<{ provenance: SourceProvenance; classified: ClassifiedSource }> {
  const rows = await readSheet(bytes, SHEET);
  if (rows.length < 2)
    throw new SourceAdapterError("unexpected_header", "no data rows");
  const header = rows[0].map((c) => cellText(c) ?? "");
  const { cols: nutrientCols, noteCols } = parseCiqualHeader(header);
  const provenance: SourceProvenance = {
    ...CIQUAL_PROVENANCE,
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
    const sourceId = cellText(row[6]);
    const name = cellText(row[7]);
    const nameAlt = cellText(row[8]);
    const group = cellText(row[5]);
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
      const parsed = parseSourceNumeric(cellText(row[nc.col]) ?? undefined);
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
      group,
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
      sourceName: CIQUAL_PROVENANCE.source,
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
