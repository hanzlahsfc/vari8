/**
 * CATALOGUE-ACCURACY (#184) — CI-usable accuracy gate.
 * Exits 1 when any approved source-processing requirement fails;
 * writes an actionable report. Never writes to a database.
 *
 *   npx tsx scripts/check-nutrition-source-accuracy.ts \
 *     --input bls=tests/fixtures/nutrition/bls-4.0-sample.xlsx \
 *     --expected bls=tests/fixtures/nutrition/expected-bls.json \
 *     [--input ciqual=... --expected ciqual=...] [--out <dir>]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

import {
  checkAccuracy,
  checkProvenance,
  checkSourceHashBinding,
  type AccuracyCheck,
  type ExpectedRow,
} from "../lib/nutrition/sources/accuracy";
import { sha256Hex } from "../lib/nutrition/sources/common";
import { parseBlsExport } from "../lib/nutrition/sources/bls";
import { parseCiqualExport } from "../lib/nutrition/sources/ciqual";

const PARSERS = {
  bls: parseBlsExport,
  ciqual: parseCiqualExport,
} as const;

const inputs: Record<string, string> = {};
const expecteds: Record<string, string> = {};
for (let i = 2; i < process.argv.length - 1; i++) {
  const [name, ...rest] = process.argv[i + 1].split("=");
  if (process.argv[i] === "--input") inputs[name] = rest.join("=");
  if (process.argv[i] === "--expected") expecteds[name] = rest.join("=");
}
const outI = process.argv.indexOf("--out");
const OUT = outI > -1 ? process.argv[outI + 1] : undefined;
if (!Object.keys(inputs).length)
  throw new Error("required --input <src>=<file> --expected <src>=<json>");

async function main() {
  const report: Record<
    string,
    {
      failures: AccuracyCheck[];
      accepted: number;
      checkedFields: number;
      untestedFields: number;
      fixtureNote: string;
    }
  > = {};
  let total = 0;
  for (const [name, path] of Object.entries(inputs)) {
    const parse = PARSERS[name as keyof typeof PARSERS];
    if (!parse) throw new Error(`unknown source ${name}`);
    if (!expecteds[name]) throw new Error(`missing --expected for ${name}`);
    const expected = JSON.parse(
      readFileSync(expecteds[name], "utf8"),
    ) as Record<string, ExpectedRow>;
    const bytes = readFileSync(path);
    const { classified } = await parse(bytes);
    const fileSha = sha256Hex(bytes);
    const failures = [
      ...checkAccuracy(classified.accepted, expected),
      ...checkProvenance(classified.accepted),
      ...checkSourceHashBinding(classified.accepted, fileSha),
      // adapter-detected duplicates are gate failures, not ignored rows
      ...classified.duplicates.map((r): AccuracyCheck => ({
        kind: "duplicate_candidate",
        sourceId: r.sourceId ?? "?",
        detail: `duplicate source id ${r.sourceId} at row ${r.sourceRow}`,
      })),
      // rejected rows are acceptable only when the source genuinely
      // carries malformed data — the fixtures carry none
      ...classified.rejected.map((r): AccuracyCheck => ({
        kind: "value_mismatch",
        sourceId: r.sourceId ?? "?",
        detail: `row ${r.sourceRow} rejected: ${r.reasonCode}`,
      })),
    ];
    // checked fields = nutrients the expected record actually covers;
    // uncovered nutrients are reported separately, not hidden in a total
    const checkedFields = classified.accepted.reduce(
      (n, c) =>
        n +
        c.nutrients.filter((nut) => expected[c.sourceId]?.nutrients?.[nut.code])
          .length,
      0,
    );
    const untestedFields = classified.accepted.reduce(
      (n, c) =>
        n +
        c.nutrients.filter(
          (nut) => !expected[c.sourceId]?.nutrients?.[nut.code],
        ).length,
      0,
    );
    report[name] = {
      failures,
      accepted: classified.accepted.length,
      checkedFields,
      untestedFields,
      fixtureNote:
        "expected covers the committed fixture rows — a sample, not the full export",
    };
    total += failures.length;
  }
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      `${OUT}/accuracy-report.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  if (total) {
    console.error(`ACCURACY GATE FAILED: ${total} failure(s)`);
    for (const [name, r] of Object.entries(report))
      for (const f of r.failures.slice(0, 10))
        console.error(`  ${name}: [${f.kind}] ${f.sourceId} ${f.detail}`);
    process.exit(1);
  }
  console.log(
    `ACCURACY GATE PASSED: ${Object.entries(report)
      .map(([k, v]) => `${k} ${v.accepted} rows/${v.checkedFields} fields`)
      .join("; ")} — zero mismatches, provenance complete`,
  );
}

main().catch((e) => {
  console.error(`ACCURACY GATE ERROR: ${e.message}`);
  process.exit(1);
});
