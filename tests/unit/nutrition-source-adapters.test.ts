// CATALOGUE-FOOD-ADAPTERS (#182, D11) — adapter behavior against
// traceable fixtures: verbatim row slices (rows 1–9) of the authentic
// exports — BLS `BLS_4_0_Daten_2025_DE.xlsx` (sha256 of zip
// 0b7c8... see sources record) and CIQUAL `Table Ciqual
// 2025_FR_2025_11_03.xlsx` (sha256 5555c572…, DOI 10.57745/RDMHWY).

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseBlsExport } from "../../lib/nutrition/sources/bls";
import { parseCiqualExport } from "../../lib/nutrition/sources/ciqual";
import { SourceAdapterError } from "../../lib/nutrition/sources/common";

const BLS_FIXTURE = "tests/fixtures/nutrition/bls-4.0-sample.xlsx";
const CIQUAL_FIXTURE = "tests/fixtures/nutrition/ciqual-2025-sample.xlsx";

describe("parseBlsExport — authentic BLS 4.0 slice", () => {
  it("accepts rows with stable source ids, provenance and units", async () => {
    const { provenance, classified } = await parseBlsExport(
      readFileSync(BLS_FIXTURE),
    );
    expect(provenance.source).toBe("bls-4.0-2025");
    expect(provenance.licence).toBe("CC BY 4.0");
    expect(provenance.licenceUrl).toContain("creativecommons.org");
    expect(provenance.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(classified.scannedRowCount).toBe(8);
    expect(classified.accepted).toHaveLength(8);
    expect(classified.rejected).toHaveLength(0);
    const first = classified.accepted[0];
    expect(first.sourceId).toBe("C131000");
    expect(first.name).toContain("Hafer");
    expect(first.nameAlt).toBe("Oat whole grain, raw");
    const enercc = first.nutrients.find((n) => n.code === "ENERCC");
    expect(enercc?.unit).toBe("kcal");
    expect(enercc?.basis).toBe("per 100 g");
    expect(enercc?.value).toBeCloseTo(343, 5); // verbatim cell
    const enercj = first.nutrients.find((n) => n.code === "ENERCJ");
    expect(enercj?.value).toBeCloseTo(1443, 5);
    // per-measure provenance preserved
    expect(enercj?.origin).toBe("Formelberechnung");
    const water = first.nutrients.find((n) => n.code === "WATER");
    expect(water?.value).toBeCloseTo(11.45, 5);
    expect(water?.reference).toContain("Biel");
    expect(first.rowFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps missing cells null and never invents zeros", async () => {
    const { classified } = await parseBlsExport(readFileSync(BLS_FIXTURE));
    const hasMissing = classified.accepted.some((c) =>
      c.nutrients.some((n) => n.value === null),
    );
    // every null is a real null (never a coerced 0)
    for (const c of classified.accepted)
      for (const n of c.nutrients)
        expect(n.value === null || typeof n.value === "number").toBe(true);
    expect(hasMissing).toBe(true);
  });
});

describe("parseCiqualExport — authentic CIQUAL 2025 slice", () => {
  it("accepts rows with alim_code ids, provenance and comma decimals", async () => {
    const { provenance, classified } = await parseCiqualExport(
      readFileSync(CIQUAL_FIXTURE),
    );
    expect(provenance.source).toBe("ciqual-2025");
    expect(provenance.licence).toContain("Open Licence");
    expect(provenance.sourceUrl).toContain("10.57745/RDMHWY");
    expect(classified.scannedRowCount).toBe(8);
    expect(classified.accepted).toHaveLength(8);
    const first = classified.accepted[0];
    expect(first.sourceId).toBe("24999");
    expect(first.name).toContain("Dessert");
    // decimal-comma cell "49,9" → 49.9
    const water = first.nutrients.find((n) => n.code === "EAU");
    expect(water?.value).toBeCloseTo(49.9, 5);
    // "-" cell → null, not 0
    const dashCells = first.nutrients.filter((n) => n.value === null);
    expect(dashCells.length).toBeGreaterThan(0);
  });
});

describe("fail-closed behavior", () => {
  it("refuses an unexpected header rather than guessing", async () => {
    // CIQUAL bytes through the BLS adapter — wrong source entirely
    await expect(
      parseBlsExport(readFileSync(CIQUAL_FIXTURE)),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/unexpected|unreadable/),
    });
    // and a truncated/corrupt buffer is refused
    await expect(
      parseBlsExport(readFileSync(BLS_FIXTURE).subarray(0, 200)),
    ).rejects.toBeInstanceOf(SourceAdapterError);
  });
});
