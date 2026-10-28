/**
 * CATALOGUE-FOOD-ADAPTERS dry run (#182) — reads authentic source
 * exports and emits validated import candidates plus an INDEPENDENT
 * audit report (raw cells re-read and compared field-by-field, not the
 * adapter's own claims) plus a cross-source dedupe REVIEW list for a
 * human. Writes NOTHING to the database.
 *
 *   npx tsx scripts/dry-run-nutrition-source.ts \
 *     --input bls=sources/BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx \
 *     --input ciqual="sources/Table Ciqual 2025_FR_2025_11_03.xlsx" \
 *     --out /tmp/dryrun [--audit 50]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

import { parseBlsExport } from "../lib/nutrition/sources/bls";
import { parseCiqualExport } from "../lib/nutrition/sources/ciqual";
import {
  sha256Hex,
  toNutritionSource,
  type ClassifiedSource,
  type SourceCandidate,
  type SourceProvenance,
} from "../lib/nutrition/sources/common";
import { readSheet } from "../lib/nutrition/sources/xlsx";

const inputs: [string, string][] = [];
for (let i = 2; i < process.argv.length - 1; i++)
  if (process.argv[i] === "--input") {
    const [name, ...rest] = process.argv[i + 1].split("=");
    inputs.push([name, rest.join("=")]);
  }
const outI = process.argv.indexOf("--out");
const OUT = outI > -1 ? process.argv[outI + 1] : undefined;
const auditI = process.argv.indexOf("--audit");
const AUDIT_N = auditI > -1 ? Number(process.argv[auditI + 1]) : 50;
if (inputs.length === 0) throw new Error("required --input <source>=<path>");

const PARSERS: Record<
  string,
  {
    parse: typeof parseBlsExport;
    sheet: string | number;
    firstNutrientCol: number;
    cellStride: number;
    nutritionCodes: {
      calories?: string;
      protein?: string;
      carbs?: string;
      fats?: string;
    };
  }
> = {
  bls: {
    parse: parseBlsExport,
    sheet: "BLS_4_0_Daten_2025_DE",
    firstNutrientCol: 3,
    cellStride: 3,
    nutritionCodes: {
      calories: "ENERCC",
      protein: "PROT625",
      carbs: "CHO",
      fats: "FAT",
    },
  },
  ciqual: {
    parse: parseCiqualExport,
    sheet: "composition nutritionnelle",
    firstNutrientCol: 9,
    cellStride: 1,
    nutritionCodes: {
      calories: "ENERGIE-REGLEMENT-UE-N-1169-2011-KCAL",
      protein: "PROTEINES-N-X-6-25-G",
      carbs: "GLUCIDES-G",
      fats: "LIPIDES-G",
    },
  },
};

const MISSING = new Set(["", "-", ".", "TR", "traces"]);

/** Independent audit: re-read the RAW workbook cells for the sampled
 * rows and compare each cell verbatim against the candidate's value.
 * This intentionally does NOT trust the adapter's own classification. */
function auditSample(
  rawRows: (string | number | boolean | Date | null)[][],
  candidates: SourceCandidate[],
  n: number,
  firstNutrientCol: number,
  stride: number,
) {
  const sample = candidates.slice(0, n);
  let fields = 0,
    exact = 0,
    missingNull = 0,
    qualifiedNull = 0,
    qualifiedBound = 0;
  const bad: unknown[] = [];
  for (const c of sample) {
    const row = rawRows[c.sourceRow - 1];
    c.nutrients.forEach((nut, i) => {
      fields++;
      const raw = row[firstNutrientCol + i * stride];
      const rawT =
        raw === null || raw === undefined || raw === ""
          ? ""
          : String(raw).trim();
      // separate buckets: missing-null vs qualified-null vs qualified
      // bound vs exact — never conflated
      // exact qualifier verification — the marker AND (for bounds) the
      // numeric bound must match verbatim; a mismatched marker is bad
      const QUAL_NULL_MARKERS: Record<string, string[]> = {
        traces: ["traces", "TR"],
        lod: ["<LOD"],
        loq: ["<LOQ"],
        lod_or_loq: ["<LOD or <LOQ"],
      };
      if (nut.qualifier && QUAL_NULL_MARKERS[nut.qualifier]) {
        if (
          nut.value === null &&
          QUAL_NULL_MARKERS[nut.qualifier].includes(rawT)
        ) {
          qualifiedNull++;
        } else
          bad.push([
            c.sourceId,
            nut.code,
            rawT,
            `qualified-null ${nut.qualifier}?`,
          ]);
      } else if (nut.qualifier === "lt" || nut.qualifier === "gt") {
        const sign = nut.qualifier === "lt" ? "<" : ">";
        const norm = rawT.slice(1).replace(",", ".");
        if (
          rawT.startsWith(sign) &&
          Math.abs(Number(norm) - (nut.value ?? NaN)) < 1e-12
        )
          qualifiedBound++;
        else
          bad.push([c.sourceId, nut.code, rawT, `qualified ${nut.qualifier}`]);
      } else if (nut.value === null) {
        if (MISSING.has(rawT)) missingNull++;
        else bad.push([c.sourceId, nut.code, rawT, "expected null"]);
      } else {
        const norm = rawT.replace(",", ".");
        if (Math.abs(Number(norm) - nut.value) < 1e-12) exact++;
        else bad.push([c.sourceId, nut.code, rawT, nut.value]);
      }
    });
  }
  return {
    sampled: sample.length,
    fields,
    exact,
    missingNull,
    qualifiedNull,
    qualifiedBound,
    mismatches: bad,
    // 98% of fields exact per the acceptance rule: exact + verified
    // representations (missing nulls and verbatim qualifiers) all pass
    fieldExactPct: fields
      ? (exact + missingNull + qualifiedNull + qualifiedBound) / fields
      : 0,
  };
}

async function main() {
  const perSource: Record<
    string,
    {
      provenance: SourceProvenance;
      classified: ClassifiedSource;
      audit: ReturnType<typeof auditSample>;
      importerRecords: number;
    }
  > = {};
  for (const [name, path] of inputs) {
    const spec = PARSERS[name];
    if (!spec) throw new Error(`unknown source ${name}`);
    const bytes = readFileSync(path);
    const { provenance, classified } = await spec.parse(bytes);
    // independent re-read — fresh workbook parse, not adapter output
    const rawRows = await readSheet(bytes, spec.sheet);
    const audit = auditSample(
      rawRows,
      classified.accepted,
      AUDIT_N,
      spec.firstNutrientCol,
      spec.cellStride,
    );
    const importer = toNutritionSource(classified, spec.nutritionCodes);
    perSource[name] = {
      provenance,
      classified,
      audit,
      importerRecords: importer.accepted.length,
    };
  }

  // Cross-source dedupe — REVIEW LIST for a human; no merge, no delete.
  const all = Object.values(perSource).flatMap((s) =>
    s.classified.accepted.map((c) => ({
      name: c.name,
      sourceId: c.sourceId,
      source: c.provenance.source,
    })),
  );
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const crossDedupe: { name: string; rows: typeof all }[] = [];
  const seen = new Map<string, typeof all>();
  for (const row of all) {
    const k = norm(row.name);
    const list = seen.get(k) ?? [];
    list.push(row);
    seen.set(k, list);
  }
  for (const [k, rows] of seen)
    if (new Set(rows.map((r) => r.source)).size > 1 && rows.length > 1)
      crossDedupe.push({ name: k, rows });

  const report = {
    kind: "nutrition-source-dry-run-v2",
    sources: Object.fromEntries(
      Object.entries(perSource).map(([k, v]) => [
        k,
        {
          provenance: v.provenance,
          counts: {
            scanned: v.classified.scannedRowCount,
            ignoredEmpty: v.classified.ignoredEmptyRowCount,
            accepted: v.classified.accepted.length,
            rejected: v.classified.rejected.length,
            duplicates: v.classified.duplicates.length,
          },
          rejected: v.classified.rejected.slice(0, 200),
          duplicates: v.classified.duplicates,
          importerProjection: { acceptedRecords: v.importerRecords },
          audit: v.audit,
        },
      ]),
    ),
    crossSourceDedupeReview: {
      note: "review candidates for a human — never merged or deleted",
      count: crossDedupe.length,
      candidates: crossDedupe.slice(0, 200),
      reviewOutcome: {
        status: "pending_human_review",
        requiredBy:
          "#182 C3 — the cross-source dedupe report is reviewed by a human, not the importer",
        fields: ["verdict", "reviewer", "reviewedAt", "notes"],
      },
    },
  };

  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2) + "\n");
    for (const [name, v] of Object.entries(perSource))
      writeFileSync(
        `${OUT}/candidates-${name}.json`,
        JSON.stringify(
          { provenance: v.provenance, accepted: v.classified.accepted },
          null,
          2,
        ) + "\n",
      );
    const allAccepted = Object.values(perSource).flatMap((v) =>
      v.classified.accepted.map((c) => c.sourceId),
    );
    console.log(
      `DRY-RUN: ${Object.entries(perSource)
        .map(
          ([k, v]) =>
            `${k}=${v.classified.accepted.length}ok/${v.classified.rejected.length}rej`,
        )
        .join(
          " ",
        )} crossDedupe=${crossDedupe.length} total=${allAccepted.length} sha=${sha256Hex(JSON.stringify(report.sources)).slice(0, 12)} → ${OUT}/`,
    );
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((err) => {
  console.error(`DRY-RUN FAILED: ${err.message}`);
  process.exit(1);
});
