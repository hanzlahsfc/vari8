// Accuracy gate fail-closed probes: non-finite values, unmatched
// expected records, unrecognised arguments and manifest hash binding.
// Each case must produce a failure, never a silent pass.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const FIX = "tests/fixtures/nutrition";
const clean = [
  "--input",
  `ciqual=${FIX}/ciqual-2025-sample.xlsx`,
  "--expected",
  `ciqual=${FIX}/expected-ciqual.json`,
];

describe("accuracy gate fail-closed probes", () => {
  it("a non-numeric expected value fails instead of passing as NaN", async () => {
    const { checkAccuracy } =
      await import("../../lib/nutrition/sources/accuracy");
    const expected = {
      X1: {
        sourceRow: 2,
        sourceId: "X1",
        name: "n",
        nutrients: {
          "EAU-G": { value: "banana", unit: "g", basis: "per 100 g" },
        },
      },
    };
    const candidate = {
      sourceId: "X1",
      name: "n",
      nutrients: [{ code: "EAU-G", value: 41, unit: "g", basis: "per 100 g" }],
      provenance: {},
    };
    const failures = checkAccuracy([candidate as never], expected as never);
    expect(failures.length).toBeGreaterThan(0);
  });

  it("a non-finite candidate value fails", async () => {
    const { checkAccuracy } =
      await import("../../lib/nutrition/sources/accuracy");
    const expected = {
      X1: {
        sourceRow: 2,
        sourceId: "X1",
        name: "n",
        nutrients: {
          "EAU-G": { value: "42", unit: "g", basis: "per 100 g" },
        },
      },
    };
    const candidate = {
      sourceId: "X1",
      name: "n",
      nutrients: [
        { code: "EAU-G", value: Number.NaN, unit: "g", basis: "per 100 g" },
      ],
      provenance: {},
    };
    const failures = checkAccuracy([candidate as never], expected as never);
    expect(failures.length).toBeGreaterThan(0);
  });

  it("--expected without a matching --input exits 1", () => {
    const r = run([
      ...BASE,
      ...clean,
      "--expected",
      `bls=${FIX}/expected-bls.json`,
    ]);
    expect(r.exit).toBe(1);
  });

  it("an unrecognised argument exits 1", () => {
    const r = run([
      ...BASE,
      ...clean,
      "--expectd",
      `ciqual=${FIX}/expected-ciqual.json`,
    ]);
    expect(r.exit).toBe(1);
  });

  it("manifest binding fails on a wrong hash and on a missing entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "accgate-"));
    const man = JSON.parse(readFileSync(`${FIX}/MANIFEST.json`, "utf8"));
    man.accuracyGate.hashes["expected-ciqual.json"] = "0".repeat(64);
    const badPath = join(dir, "MANIFEST-bad.json");
    writeFileSync(badPath, JSON.stringify(man));
    const bad = run([...BASE, ...clean, "--manifest", badPath]);
    expect(bad.exit).toBe(1);
    delete man.accuracyGate.hashes["expected-ciqual.json"];
    const missPath = join(dir, "MANIFEST-miss.json");
    writeFileSync(missPath, JSON.stringify(man));
    const miss = run([...BASE, ...clean, "--manifest", missPath]);
    expect(miss.exit).toBe(1);
  });

  it("manifest binding passes on the committed manifest", () => {
    const r = run([...BASE, ...clean, "--manifest", `${FIX}/MANIFEST.json`]);
    expect(r.exit).toBe(0);
  });
});

describe("accuracy gate manifest-only mode", () => {
  const manOnly = ["--manifest", `${FIX}/MANIFEST.json`];

  it("runs the declared sources and passes on honest fixtures", () => {
    const r = run([...BASE, ...manOnly]);
    expect(r.exit).toBe(0);
    expect(r.out).toContain("ACCURACY GATE PASSED");
    expect(r.out).toContain("bls");
    expect(r.out).toContain("ciqual");
  });

  it("a tampered recorded hash fails as hash_mismatch", () => {
    const dir = mkdtempSync(join(tmpdir(), "accgate-man-"));
    const man = JSON.parse(readFileSync(`${FIX}/MANIFEST.json`, "utf8"));
    man.accuracyGate.hashes["expected-bls.json"] = "0".repeat(64);
    writeFileSync(join(dir, "MANIFEST.json"), JSON.stringify(man));
    writeFileSync(
      join(dir, "expected-bls.json"),
      readFileSync(`${FIX}/expected-bls.json`),
    );
    writeFileSync(
      join(dir, "expected-ciqual.json"),
      readFileSync(`${FIX}/expected-ciqual.json`),
    );
    const r = run([...BASE, "--manifest", join(dir, "MANIFEST.json")]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("hash_mismatch");
  });

  it("a declared source with no fixture fails closed", () => {
    const dir = mkdtempSync(join(tmpdir(), "accgate-man-"));
    const man = JSON.parse(readFileSync(`${FIX}/MANIFEST.json`, "utf8"));
    man.accuracyGate.expected.bogus = { file: "expected-bls.json" };
    writeFileSync(join(dir, "MANIFEST.json"), JSON.stringify(man));
    const r = run([...BASE, "--manifest", join(dir, "MANIFEST.json")]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("bogus");
  });

  it("a manifest file that cannot be read fails closed", () => {
    const r = run([...BASE, "--manifest", `${FIX}/NO-SUCH-MANIFEST.json`]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("manifest");
  });

  it("an expected file absent next to the manifest fails closed", () => {
    const dir = mkdtempSync(join(tmpdir(), "accgate-man-"));
    const man = JSON.parse(readFileSync(`${FIX}/MANIFEST.json`, "utf8"));
    writeFileSync(join(dir, "MANIFEST.json"), JSON.stringify(man));
    const r = run([...BASE, "--manifest", join(dir, "MANIFEST.json")]);
    expect(r.exit).toBe(1);
  });
});
