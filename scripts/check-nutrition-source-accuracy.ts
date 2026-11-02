/**
 * CATALOGUE-ACCURACY (#184) — CI-usable accuracy gate.
 * Exits 1 when any approved source-processing requirement fails;
 * writes an actionable report. Never writes to a database.
 *
 *   npx tsx scripts/check-nutrition-source-accuracy.ts \
 *     --input bls=tests/fixtures/nutrition/bls-4.0-sample.xlsx \
 *     --expected bls=tests/fixtures/nutrition/expected-bls.json \
 *     [--input ciqual=... --expected ciqual=...] [--out <dir>]
 *     [--manifest tests/fixtures/nutrition/MANIFEST.json]
 *
 * --manifest binds every input and expected file's sha256 to the
 * committed manifest hashes: identity, not only adapter-internal
 * consistency. An unrecognised argument or an --expected without a
 * matching --input fails the gate rather than being dropped.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

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
let OUT: string | undefined;
let MANIFEST: string | undefined;
const pair = (flag: string, kv: string): [string, string] => {
  const eq = kv.indexOf("=");
  if (eq < 1) throw new Error(`bad ${flag} ${JSON.stringify(kv)}`);
  return [kv.slice(0, eq), kv.slice(eq + 1)];
};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  const val = () => {
    const v = process.argv[++i];
    if (v === undefined) throw new Error(`${arg} requires a value`);
    return v;
  };
  if (arg === "--input") {
    const [name, file] = pair(arg, val());
    inputs[name] = file;
  } else if (arg === "--expected") {
    const [name, file] = pair(arg, val());
    expecteds[name] = file;
  } else if (arg === "--out") OUT = val();
  else if (arg === "--manifest") MANIFEST = val();
  else throw new Error(`unrecognised argument ${JSON.stringify(arg)}`);
}
type Manifest = {
  fixtures?: { path: string; sha256: string }[];
  accuracyGate?: {
    expected?: Record<string, unknown>;
    hashes?: Record<string, string>;
  };
};
const manifest = (() => {
  if (!MANIFEST) return undefined;
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  } catch (e) {
    throw new Error(
      `cannot read manifest ${MANIFEST}: ${(e as Error).message}`,
    );
  }
})();

// --manifest alone derives the source set from the manifest itself:
// accuracyGate.expected.<src>.file names the expected JSON (resolved
// next to the manifest) and fixtures[] supplies the source workbook
// whose basename carries the <src>- prefix. Any --input switches back
// to the explicit path and the manifest only binds hashes.
if (manifest && MANIFEST && !Object.keys(inputs).length) {
  const manifestDir = dirname(MANIFEST);
  for (const [name, spec] of Object.entries(
    manifest.accuracyGate?.expected ?? {},
  )) {
    if (typeof spec !== "object" || spec === null) continue;
    const file = (spec as { file?: unknown }).file;
    if (typeof file !== "string") continue;
    const matches = (manifest.fixtures ?? []).filter((f) =>
      basename(f.path).startsWith(`${name}-`),
    );
    if (matches.length !== 1)
      throw new Error(
        `manifest mode: expected exactly one fixture for source ${name}, found ${matches.length}`,
      );
    inputs[name] = matches[0].path;
    if (!expecteds[name]) expecteds[name] = join(manifestDir, file);
  }
}
if (!Object.keys(inputs).length)
  throw new Error(
    manifest
      ? `manifest ${MANIFEST} declares no usable accuracyGate sources`
      : "required --input <src>=<file> --expected <src>=<json>",
  );
for (const name of Object.keys(expecteds))
  if (!inputs[name])
    throw new Error(`--expected ${name} has no matching --input`);

// fixture paths + accuracyGate.hashes both name files by basename
const manifestHashes = (() => {
  if (!manifest) return undefined;
  const map: Record<string, string> = {};
  for (const f of manifest.fixtures ?? []) map[basename(f.path)] = f.sha256;
  return { ...map, ...(manifest.accuracyGate?.hashes ?? {}) };
})();

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
    const expectedBytes = readFileSync(expecteds[name]);
    const expected = JSON.parse(expectedBytes.toString("utf8")) as Record<
      string,
      ExpectedRow
    >;
    const bytes = readFileSync(path);
    const { classified } = await parse(bytes);
    const fileSha = sha256Hex(bytes);
    const manifestFailures: AccuracyCheck[] = [];
    if (manifestHashes)
      for (const [label, filePath, b] of [
        ["input", path, bytes],
        ["expected", expecteds[name], expectedBytes],
      ] as const) {
        const want = manifestHashes[basename(filePath)];
        const got = sha256Hex(b);
        if (!want)
          manifestFailures.push({
            kind: "hash_mismatch",
            sourceId: name,
            detail: `${label} file ${basename(filePath)} has no manifest hash entry`,
          });
        else if (want !== got)
          manifestFailures.push({
            kind: "hash_mismatch",
            sourceId: name,
            expected: want,
            actual: got,
            detail: `${label} file ${basename(filePath)} sha256 does not match the manifest`,
          });
      }
    const failures = [
      ...manifestFailures,
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
