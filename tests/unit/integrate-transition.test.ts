import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateTransitionManifest } from "../../icm/05-build/tools/transition-manifest.mjs";

const ROOT = process.cwd();
const H = (n: number) => n.toString(16).padStart(40, "0");
const base = () =>
  JSON.parse(
    readFileSync(
      path.join(ROOT, "icm/05-build/tools/transition/p203-p207.json"),
      "utf8",
    ),
  );

describe("transition manifest", () => {
  it("the recorded #203/#206/#207 manifest validates", () => {
    const m = validateTransitionManifest(base());
    expect(m.items.map((i: { pr: number }) => i.pr)).toEqual([203, 206, 207]);
    expect(m.baselineActivation).toBe("prohibited");
  });

  it("rejects a malformed head", () => {
    for (const head of ["dead", "g".repeat(40), H(0xbeef).toUpperCase(), 12]) {
      const m = base();
      m.items[0].head = head;
      expect(() => validateTransitionManifest(m)).toThrow(/head/);
    }
  });

  it("pins exactly the three authorized heads", () => {
    expect(base().items.map((i: { head: string }) => i.head)).toEqual([
      "90c16bee63e2609ebc4f09e91459332390562464",
      "43b63ed0f41e6e92e93ecf72065c0190c9ef3dea",
      "04902f1dc3d317e0959ae533f2f4c479a8fc55f9",
    ]);
  });

  it("rejects duplicate PRs", () => {
    const dup = base();
    dup.items[1].pr = 203;
    expect(() => validateTransitionManifest(dup)).toThrow(/duplicate/);
  });

  it("rejects missing owner decisions and executor", () => {
    for (const patch of [
      (x: Record<string, unknown>) => (x.ownerDecisions = []),
      (x: Record<string, unknown>) => delete x.executor,
    ]) {
      const m = base();
      patch(m);
      expect(() => validateTransitionManifest(m)).toThrow();
    }
  });

  it("rejects an altered activation boundary", () => {
    for (const v of ["allowed", "pending", true, undefined]) {
      const m = base();
      m.baselineActivation = v;
      expect(() => validateTransitionManifest(m)).toThrow(/prohibited/);
    }
  });

  it("rejects generic bypass flags and wrong kind", () => {
    const m = base();
    (m as Record<string, unknown>).skipVerdict = true;
    expect(() => validateTransitionManifest(m)).toThrow(/bypass/);
    const k = base();
    k.kind = "ship";
    expect(() => validateTransitionManifest(k)).toThrow(/kind/);
  });

  it("rejects missing mandatory gates", () => {
    for (const patch of [
      (x: { gates: Record<string, unknown> }) => (x.gates.fast = false),
      (x: { gates: { combined: Record<string, unknown> } }) =>
        (x.gates.combined.required = false),
      (x: { gates: { combined: Record<string, unknown> } }) =>
        (x.gates.combined.evidence = "elsewhere/x"),
    ]) {
      const m = base();
      patch(m);
      expect(() => validateTransitionManifest(m)).toThrow();
    }
  });

  it("requires an explicit ordered sequence", () => {
    const m = base();
    m.items[1].order = 5;
    expect(() => validateTransitionManifest(m)).toThrow(/order/);
  });
});
