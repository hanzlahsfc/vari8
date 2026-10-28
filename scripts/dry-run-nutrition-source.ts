/**
 * CATALOGUE-FOOD-ADAPTERS dry run (#182) — read an authentic source
 * export and emit validated import candidates plus the audit/rejection
 * report. Writes NOTHING to the database; the classified `accepted`
 * shape feeds `importNutritionCatalog` once #181 lands.
 *
 *   node tools dry-run:
 *     npx tsx scripts/dry-run-nutrition-source.ts \
 *       --source bls --input sources/BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx \
 *       --out /tmp/bls-dry-run [--audit 50]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

import { parseBlsExport } from "../lib/nutrition/sources/bls";
import { parseCiqualExport } from "../lib/nutrition/sources/ciqual";

const arg = (name: string, required = true): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > -1 ? process.argv[i + 1] : undefined;
  if (required && !v) throw new Error(`required --${name}`);
  return v;
};

const SOURCE = arg("source")!;
const INPUT = arg("input")!;
const OUT = arg("out");
const AUDIT_N = Number(arg("audit", false) ?? 50);

const PARSERS = {
  bls: parseBlsExport,
  ciqual: parseCiqualExport,
} as const;

const parse = (PARSERS as Record<string, typeof parseBlsExport>)[SOURCE];
if (!parse) throw new Error(`unknown --source ${SOURCE}`);

async function main() {
  const bytes = readFileSync(INPUT);
  const { provenance, classified } = await parse(bytes);

  // Cross-source dedupe is a REPORT, not a merge: name collisions across
  // accepted rows surface as review candidates only.
  const nameCount = new Map<string, number>();
  for (const c of classified.accepted)
    nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);
  const dedupeReview = classified.accepted
    .filter((c) => (nameCount.get(c.name) ?? 0) > 1)
    .map((c) => ({ sourceId: c.sourceId, name: c.name }));

  // Field-level audit sample: every nutrient value must equal the source
  // cell verbatim (or be null) — the adapter already guarantees this by
  // construction; the audit REPORTS it so a reviewer can spot-check.
  const audit = classified.accepted.slice(0, AUDIT_N).map((c) => ({
    sourceId: c.sourceId,
    name: c.name,
    measured: c.nutrients.filter((n) => n.value !== null).length,
    missing: c.nutrients.filter((n) => n.value === null).length,
    inventedZeros: c.nutrients.filter((n) => n.value === 0).length, // real zeros only
  }));

  const report = {
    kind: "nutrition-source-dry-run-v1",
    provenance,
    counts: {
      scannedRowCount: classified.scannedRowCount,
      sourceRowCount: classified.sourceRowCount,
      ignoredEmptyRowCount: classified.ignoredEmptyRowCount,
      accepted: classified.accepted.length,
      rejected: classified.rejected.length,
      duplicates: classified.duplicates.length,
      dedupeReviewCandidates: dedupeReview.length,
    },
    rejected: classified.rejected,
    duplicates: classified.duplicates,
    dedupeReview,
    auditSample: audit,
  };

  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(
      `${OUT}/candidates.json`,
      JSON.stringify(
        {
          kind: "nutrition-source-candidates-v1",
          provenance,
          accepted: classified.accepted,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `DRY-RUN ${SOURCE}: ${JSON.stringify(report.counts)} → ${OUT}/`,
    );
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((err) => {
  console.error(`DRY-RUN FAILED: ${err.message}`);
  process.exit(1);
});
