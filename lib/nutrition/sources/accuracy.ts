/**
 * CATALOGUE-ACCURACY (#184) — executable accuracy gate over the
 * existing source adapters + independent expected cell values.
 * Reuses parseBlsExport/parseCiqualExport — no second parser.
 * Exits nonzero upstream: any mismatch, missing provenance or
 * unexpected outcome is a gate failure, not a warning.
 */

import { SourceAdapterError, type SourceCandidate } from "./common";

export interface ExpectedRow {
  sourceRow: number;
  sourceId: string;
  name: string;
  nutrients: Record<string, string | null>;
}

export interface AccuracyCheck {
  kind:
    | "value_mismatch"
    | "zero_for_missing"
    | "lost_qualifier"
    | "wrong_qualifier"
    | "missing_provenance"
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

/** Compare adapter candidates against INDEPENDENT expected source
 * values. Any divergence is a gate failure — the gate measures the
 * adapter, it never trusts it. */
export function checkAccuracy(
  candidates: SourceCandidate[],
  expected: Record<string, ExpectedRow>,
): AccuracyCheck[] {
  const failures: AccuracyCheck[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
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
    for (const [code, rawExpected] of Object.entries(e.nutrients)) {
      const exp = classifyExpected(rawExpected);
      const actual = c.nutrients.find((n) => n.code === code);
      if (!actual) {
        failures.push({
          kind: "value_mismatch",
          sourceId: c.sourceId,
          code,
          expected: exp,
          actual: "missing nutrient",
          detail: `nutrient ${code} absent from candidate`,
        });
        continue;
      }
      // zero written where the source cell is empty — the #184 acceptance case
      if (exp.value === null && actual.value === 0) {
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
        exp.value !== null &&
        actual.value !== null &&
        Math.abs(exp.value - actual.value) > 1e-12
      ) {
        failures.push({
          kind: "value_mismatch",
          sourceId: c.sourceId,
          code,
          expected: exp.value,
          actual: actual.value,
          detail: `nutrient ${code}: expected ${exp.value}, got ${actual.value}`,
        });
        continue;
      }
      if ((exp.value === null) !== (actual.value === null)) {
        failures.push({
          kind: "value_mismatch",
          sourceId: c.sourceId,
          code,
          expected: exp.value,
          actual: actual.value,
          detail: `nutrient ${code}: expected ${exp.value}, got ${actual.value}`,
        });
        continue;
      }
      if ((exp.qualifier ?? null) !== (actual.qualifier ?? null)) {
        failures.push({
          kind: "wrong_qualifier",
          sourceId: c.sourceId,
          code,
          expected: exp.qualifier ?? null,
          actual: actual.qualifier ?? null,
          detail: `nutrient ${code}: qualifier ${exp.qualifier ?? "exact"} vs ${actual.qualifier ?? "exact"}`,
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

/** Every candidate must carry complete provenance — a row missing it
 * does not ship. */
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
    ].filter(([, v]) => !v);
    if (missing.length)
      failures.push({
        kind: "missing_provenance",
        sourceId: c.sourceId,
        detail: `candidate ${c.sourceId} missing provenance: ${missing.map(([k]) => k).join(", ")}`,
      });
  }
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
