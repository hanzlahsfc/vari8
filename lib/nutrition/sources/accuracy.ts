/**
 * CATALOGUE-ACCURACY (#184) — executable accuracy gate over the
 * existing source adapters + independent expected cell values.
 * Reuses parseBlsExport/parseCiqualExport — no second parser.
 * Any divergence, duplicate or coverage gap is a gate failure,
 * never a warning.
 */

import { SourceAdapterError, type SourceCandidate } from "./common";

export interface ExpectedNutrient {
  value: string | null;
  unit: string;
  basis: string;
}

export interface ExpectedRow {
  sourceRow: number;
  sourceId: string;
  name: string;
  nutrients: Record<string, ExpectedNutrient>;
}

export interface AccuracyCheck {
  kind:
    | "value_mismatch"
    | "zero_for_missing"
    | "lost_qualifier"
    | "wrong_qualifier"
    | "wrong_unit"
    | "wrong_basis"
    | "missing_provenance"
    | "missing_hash"
    | "hash_mismatch"
    | "duplicate_candidate"
    | "duplicate_expected"
    | "uncovered_nutrient"
    | "empty_expected"
    | "unexpected_row"
    | "missing_row";
  sourceId: string;
  code?: string;
  expected?: unknown;
  actual?: unknown;
  detail: string;
}

const MISSING = new Set(["", "-", "."]);
const QUAL_NULL: Record<string, string[]> = {
  traces: ["traces", "TR"],
  lod: ["<LOD"],
  loq: ["<LOQ"],
  lod_or_loq: ["<LOD or <LOQ"],
};

function classifyExpected(raw: string | null): {
  value: number | null;
  qualifier?: string;
} {
  const t = (raw ?? "").trim();
  for (const [q, markers] of Object.entries(QUAL_NULL))
    if (markers.includes(t)) return { value: null, qualifier: q };
  if (MISSING.has(t)) return { value: null };
  if (t.startsWith("<"))
    return {
      value: Number(t.slice(1).trim().replace(",", ".")),
      qualifier: "lt",
    };
  if (t.startsWith(">"))
    return {
      value: Number(t.slice(1).trim().replace(",", ".")),
      qualifier: "gt",
    };
  return { value: Number(t.replace(",", ".")) };
}

/** Reject duplicate source-row identities before any indexing —
 * never silently overwrite in a map. Returns the duplicate ids. */
export function findDuplicateIds(candidates: SourceCandidate[]): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const c of candidates)
    if (seen.has(c.sourceId)) dup.push(c.sourceId);
    else seen.add(c.sourceId);
  return dup;
}

export function findDuplicateExpected(
  expected: ExpectedRow[] | Record<string, ExpectedRow>,
): string[] {
  const rows = Array.isArray(expected) ? expected : Object.values(expected);
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const r of rows)
    if (seen.has(r.sourceId)) dup.push(r.sourceId);
    else seen.add(r.sourceId);
  return dup;
}

/** Compare adapter candidates against INDEPENDENT expected source
 * values — identity, unit, basis, value AND qualifier must all match.
 * Coverage: every candidate nutrient needs an expected entry; a
 * missing expected nutrient fails, it does not shrink the denominator. */
export function checkAccuracy(
  candidates: SourceCandidate[],
  expected: Record<string, ExpectedRow>,
): AccuracyCheck[] {
  const failures: AccuracyCheck[] = [];

  for (const id of findDuplicateIds(candidates))
    failures.push({
      kind: "duplicate_candidate",
      sourceId: id,
      detail: `duplicate candidate source id ${id}`,
    });
  for (const id of findDuplicateExpected(expected))
    failures.push({
      kind: "duplicate_expected",
      sourceId: id,
      detail: `duplicate expected source id ${id}`,
    });

  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.sourceId)) continue; // already reported as duplicate
    seen.add(c.sourceId);
    const e = expected[c.sourceId];
    if (!e) {
      failures.push({
        kind: "unexpected_row",
        sourceId: c.sourceId,
        detail: `candidate ${c.sourceId} has no expected row`,
      });
      continue;
    }
    if (Object.keys(e.nutrients).length === 0)
      failures.push({
        kind: "empty_expected",
        sourceId: c.sourceId,
        detail: `expected row ${c.sourceId} declares zero nutrients — a gate must not pass on empty coverage`,
      });

    // every declared nutrient must have an independent expected value
    const expectedCodes = new Set(Object.keys(e.nutrients));
    for (const n of c.nutrients)
      if (!expectedCodes.has(n.code))
        failures.push({
          kind: "uncovered_nutrient",
          sourceId: c.sourceId,
          code: n.code,
          detail: `candidate nutrient ${n.code} has no expected value — coverage gap, not a pass`,
        });

    for (const [code, exp] of Object.entries(e.nutrients)) {
      const expectedVal = classifyExpected(exp.value);
      const actual = c.nutrients.find((n) => n.code === code);
      if (!actual) {
        failures.push({
          kind: "value_mismatch",
          sourceId: c.sourceId,
          code,
          expected: expectedVal,
          actual: "missing nutrient",
          detail: `nutrient ${code} absent from candidate`,
        });
        continue;
      }
      // unit and basis are part of the measurement identity
      if (actual.unit !== exp.unit)
        failures.push({
          kind: "wrong_unit",
          sourceId: c.sourceId,
          code,
          expected: exp.unit,
          actual: actual.unit,
          detail: `nutrient ${code}: unit ${JSON.stringify(exp.unit)} vs ${JSON.stringify(actual.unit)}`,
        });
      if (actual.basis !== exp.basis)
        failures.push({
          kind: "wrong_basis",
          sourceId: c.sourceId,
          code,
          expected: exp.basis,
          actual: actual.basis,
          detail: `nutrient ${code}: basis ${JSON.stringify(exp.basis)} vs ${JSON.stringify(actual.basis)}`,
        });
      // zero written where the source cell is empty — the #184 case
      if (expectedVal.value === null && actual.value === 0) {
        failures.push({
          kind: "zero_for_missing",
          sourceId: c.sourceId,
          code,
          expected: null,
          actual: 0,
          detail: `nutrient ${code}: source cell missing but candidate wrote 0`,
        });
        continue;
      }
      if (
        expectedVal.value !== null &&
        actual.value !== null &&
        Math.abs(expectedVal.value - actual.value) > 1e-12
      ) {
        failures.push({
          kind: "value_mismatch",
          sourceId: c.sourceId,
          code,
          expected: expectedVal.value,
          actual: actual.value,
          detail: `nutrient ${code}: expected ${expectedVal.value}, got ${actual.value}`,
        });
        continue;
      }
      if ((expectedVal.value === null) !== (actual.value === null)) {
        failures.push({
          kind: "value_mismatch",
          sourceId: c.sourceId,
          code,
          expected: expectedVal.value,
          actual: actual.value,
          detail: `nutrient ${code}: expected ${expectedVal.value}, got ${actual.value}`,
        });
        continue;
      }
      if ((expectedVal.qualifier ?? null) !== (actual.qualifier ?? null)) {
        failures.push({
          kind: "wrong_qualifier",
          sourceId: c.sourceId,
          code,
          expected: expectedVal.qualifier ?? null,
          actual: actual.qualifier ?? null,
          detail: `nutrient ${code}: qualifier ${expectedVal.qualifier ?? "exact"} vs ${actual.qualifier ?? "exact"}`,
        });
      }
    }
  }
  for (const sid of Object.keys(expected))
    if (!seen.has(sid))
      failures.push({
        kind: "missing_row",
        sourceId: sid,
        detail: `expected row ${sid} absent from candidates`,
      });
  return failures;
}

/** Every candidate must carry complete provenance including the
 * bound source sha256 — a row missing it does not ship. */
export function checkProvenance(
  candidates: SourceCandidate[],
): AccuracyCheck[] {
  const failures: AccuracyCheck[] = [];
  for (const c of candidates) {
    const p = c.provenance;
    const missing = [
      ["source", p.source],
      ["sourceId", c.sourceId],
      ["sourceUrl", p.sourceUrl],
      ["licence", p.licence],
      ["licenceUrl", p.licenceUrl],
      ["sourceVersion", p.sourceVersion],
      ["sourceSha256", p.sourceSha256],
    ].filter(([, v]) => !v);
    if (missing.length)
      failures.push({
        kind: "missing_provenance",
        sourceId: c.sourceId,
        detail: `candidate ${c.sourceId} missing provenance: ${missing.map(([k]) => k).join(", ")}`,
      });
    else if (!/^[0-9a-f]{64}$/.test(p.sourceSha256))
      failures.push({
        kind: "missing_hash",
        sourceId: c.sourceId,
        detail: `candidate ${c.sourceId} sourceSha256 is not a 64-hex digest: ${JSON.stringify(p.sourceSha256)}`,
      });
  }
  return failures;
}

/** Bind the recorded source hash to the actual input bytes — the
 * provenance hash must be the hash of the file that produced the
 * candidates, not any declared value. */
export function checkSourceHashBinding(
  candidates: SourceCandidate[],
  actualSha256: string,
): AccuracyCheck[] {
  const failures: AccuracyCheck[] = [];
  for (const c of candidates)
    if (c.provenance.sourceSha256 !== actualSha256)
      failures.push({
        kind: "hash_mismatch",
        sourceId: c.sourceId,
        expected: actualSha256,
        actual: c.provenance.sourceSha256,
        detail: `candidate ${c.sourceId} provenance hash ${c.provenance.sourceSha256?.slice(0, 12)}… does not match the input file`,
      });
  return failures;
}

export function assertAccuracy(
  candidates: SourceCandidate[],
  expected: Record<string, ExpectedRow>,
): void {
  const failures = [
    ...checkAccuracy(candidates, expected),
    ...checkProvenance(candidates),
  ];
  if (failures.length) {
    const detail = failures
      .slice(0, 20)
      .map((f) => `  [${f.kind}] ${f.sourceId}: ${f.detail}`)
      .join("\n");
    throw new SourceAdapterError(
      "unexpected_header",
      `accuracy gate: ${failures.length} failure(s)\n${detail}${failures.length > 20 ? `\n  …and ${failures.length - 20} more` : ""}`,
    );
  }
}
