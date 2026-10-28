// CATALOGUE-ACCURACY (#184) — the gate exercises the real
// source → adapter → audit → exit-code path on the committed fixtures.
// Assertions use process exit codes and the report — never mirror
// production parsing logic.

import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const TSX = "node_modules/.bin/tsx";
const run = (args: string[]) => {
  try {
    const out = execFileSync(TSX, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: process.env.PATH },
    });
    return { exit: 0, out };
  } catch (e) {
    return {
      exit: (e as { status: number }).status,
      out: String((e as { stderr: string }).stderr),
    };
  }
};

const BASE = ["scripts/check-nutrition-source-accuracy.ts"];
const CIQ = "tests/fixtures/nutrition";

describe("accuracy gate — real exit codes", () => {
  it("valid traceable fixtures pass (exit 0)", () => {
    const r = run([
      ...BASE,
      "--input",
      `ciqual=${CIQ}/ciqual-2025-sample.xlsx`,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual.json`,
      "--input",
      `bls=${CIQ}/bls-4.0-sample.xlsx`,
      "--expected",
      `bls=${CIQ}/expected-bls.json`,
    ]);
    expect(r.exit).toBe(0);
    expect(r.out).toContain("ACCURACY GATE PASSED");
  });

  it("a missing source value corrupted to numeric zero fails", () => {
    const r = run([
      ...BASE,
      "--input",
      `ciqual=${CIQ}/ciqual-2025-sample-corrupt0.xlsx`,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual.json`,
    ]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("zero_for_missing");
  });

  it("an incorrect numeric measurement fails", () => {
    const r = run([
      ...BASE,
      "--input",
      `ciqual=${CIQ}/ciqual-2025-sample-corruptnum.xlsx`,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual.json`,
    ]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("value_mismatch");
    expect(r.out).toContain("EAU-G");
  });

  it("a lost qualifier bound fails", () => {
    const r = run([
      ...BASE,
      "--input",
      `ciqual=${CIQ}/ciqual-2025-sample-corruptqual.xlsx`,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual.json`,
    ]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("wrong_qualifier");
  });

  it("missing provenance is reported and fails", async () => {
    const { checkProvenance } =
      await import("../../lib/nutrition/sources/accuracy");
    const bad = {
      sourceId: "X1",
      provenance: {
        source: "",
        sourceUrl: "",
        licence: "",
        licenceUrl: "",
        sourceVersion: "",
        sourceSha256: "",
      },
      nutrients: [],
    };
    const failures = checkProvenance([bad as never]);
    expect(failures[0].kind).toBe("missing_provenance");
  });
});

describe("accuracy gate — false-pass paths closed (#508)", () => {
  const CIQ = "tests/fixtures/nutrition";
  const clean = ["--input", `ciqual=${CIQ}/ciqual-2025-sample.xlsx`];

  it("a duplicate expected identity fails", () => {
    const r = run([
      ...BASE,
      ...clean,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual-dup.json`,
    ]);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/duplicate_expected|missing_row/);
  });

  it("a removed expected nutrient fails as uncovered", () => {
    const r = run([
      ...BASE,
      ...clean,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual-omit.json`,
    ]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("uncovered_nutrient");
    expect(r.out).toContain("EAU-G");
  });

  it("a numerically-equal value with wrong unit fails", () => {
    const r = run([
      ...BASE,
      ...clean,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual-wrongunit.json`,
    ]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("wrong_unit");
  });

  it("a wrong reference basis fails", () => {
    const r = run([
      ...BASE,
      ...clean,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual-wrongbasis.json`,
    ]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("wrong_basis");
  });

  it("sourceSha256 is required and bound to the input bytes", async () => {
    const { checkProvenance, checkSourceHashBinding } =
      await import("../../lib/nutrition/sources/accuracy");
    const good = {
      sourceId: "X1",
      provenance: {
        source: "s",
        sourceUrl: "u",
        licence: "l",
        licenceUrl: "lu",
        sourceVersion: "v",
        sourceSha256: "a".repeat(64),
      },
      nutrients: [],
    };
    expect(checkProvenance([good as never])).toHaveLength(0);
    const noHash = {
      ...good,
      provenance: { ...good.provenance, sourceSha256: "" },
    };
    expect(checkProvenance([noHash as never])[0].kind).toBe(
      "missing_provenance",
    );
    const badHash = {
      ...good,
      provenance: { ...good.provenance, sourceSha256: "xyz" },
    };
    expect(checkProvenance([badHash as never])[0].kind).toBe("missing_hash");
    const mismatched = checkSourceHashBinding([good as never], "b".repeat(64));
    expect(mismatched[0].kind).toBe("hash_mismatch");
    // and the real fixture path binds the actual file hash
    const r = run([
      ...BASE,
      ...clean,
      "--expected",
      `ciqual=${CIQ}/expected-ciqual.json`,
    ]);
    expect(r.exit).toBe(0); // provenance hash == fixture file hash
  });

  it("duplicate candidate identity fails at the gate entry", async () => {
    const { checkAccuracy } =
      await import("../../lib/nutrition/sources/accuracy");
    const c = {
      sourceId: "X1",
      name: "n",
      nutrients: [],
      provenance: { source: "s" },
    };
    const failures = checkAccuracy([c as never, c as never], {});
    expect(failures.some((f) => f.kind === "duplicate_candidate")).toBe(true);
  });
});
