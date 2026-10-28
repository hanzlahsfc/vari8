// #182 — decision binding must refuse anything that is not the exact
// approved pair set. Exercises the production applyDedupeDecision path.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SourceAdapterError } from "../../lib/nutrition/sources/common";
import { applyDedupeDecision } from "../../lib/nutrition/sources/dedupe";

const CANDIDATES = [
  {
    name: "Gin",
    rows: [
      { name: "Gin", sourceId: "P722000", source: "bls-4.0-2025" },
      { name: "Gin", sourceId: "1002", source: "ciqual-2025" },
    ],
  },
  {
    name: "Salami",
    rows: [
      { name: "Salami", sourceId: "W140000", source: "bls-4.0-2025" },
      { name: "Salami", sourceId: "30350", source: "ciqual-2025" },
    ],
  },
];

const DECISION = {
  verdict: "retain separate source records",
  decisionMaker: "Hanzlah",
  decidedAt: "2026-10-28",
  commentUrl:
    "https://github.com/hanzlahsfc/vari8/pull/222#issuecomment-6475240775",
  pairs: [
    {
      name: "Gin",
      rows: [
        { source: "bls-4.0-2025", sourceId: "P722000" },
        { source: "ciqual-2025", sourceId: "1002" },
      ],
    },
    {
      name: "Salami",
      rows: [
        { source: "bls-4.0-2025", sourceId: "W140000" },
        { source: "ciqual-2025", sourceId: "30350" },
      ],
    },
  ],
};

const tmp = mkdtempSync(join(tmpdir(), "dedupe-"));
const file = (o: unknown) => {
  const p = join(tmp, `d${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, typeof o === "string" ? o : JSON.stringify(o));
  return p;
};

describe("applyDedupeDecision", () => {
  it("exact Gin/Salami decision succeeds", () => {
    const out = applyDedupeDecision(CANDIDATES, file(DECISION));
    expect(out.status).toBe("decided");
    expect(out.decision.decisionMaker).toBe("Hanzlah");
  });

  it("reordered equivalent pairs succeed", () => {
    const d = structuredClone(DECISION);
    d.pairs.reverse();
    d.pairs[1].rows.reverse();
    expect(applyDedupeDecision(CANDIDATES, file(d)).status).toBe("decided");
  });

  it.each([
    ["empty object", {}],
    ["arbitrary JSON", { verdict: "x", pairs: [] }],
    ["empty pairs", { ...DECISION, pairs: [] }],
    ["wrong verdict", { ...DECISION, verdict: "merge" }],
    ["non-JSON", "not json{"],
    ["missing file", null],
  ])("refuses malformed/empty input: %s", (_label, input) => {
    const path = input === null ? join(tmp, "absent.json") : file(input);
    expect(() => applyDedupeDecision(CANDIDATES, path)).toThrow(
      SourceAdapterError,
    );
  });

  it("refuses a changed source ID", () => {
    const d = structuredClone(DECISION);
    d.pairs[0].rows[0].sourceId = "P722001";
    expect(() => applyDedupeDecision(CANDIDATES, file(d))).toThrow(
      SourceAdapterError,
    );
  });

  it("refuses when a newly detected pair is not covered", () => {
    const extra = [
      ...CANDIDATES,
      {
        name: "Rum",
        rows: [
          { name: "Rum", sourceId: "P900000", source: "bls-4.0-2025" },
          { name: "Rum", sourceId: "9999", source: "ciqual-2025" },
        ],
      },
    ];
    expect(() => applyDedupeDecision(extra, file(DECISION))).toThrow(
      /exact pair set/,
    );
  });

  it("refuses duplicate decision pairs", () => {
    const d = structuredClone(DECISION);
    d.pairs.push(structuredClone(DECISION.pairs[0]));
    expect(() => applyDedupeDecision(CANDIDATES, file(d))).toThrow(
      /duplicate pair/,
    );
  });

  it("refuses a decision supplied to a run without its covered pairs", () => {
    // single-source / zero-candidate run
    expect(() => applyDedupeDecision([], file(DECISION))).toThrow(
      SourceAdapterError,
    );
    const oneSource = [
      {
        name: "Gin",
        rows: [
          { name: "Gin", sourceId: "P722000", source: "bls-4.0-2025" },
          { name: "Gin", sourceId: "P723000", source: "bls-4.0-2025" },
        ],
      },
    ];
    expect(() => applyDedupeDecision(oneSource, file(DECISION))).toThrow(
      SourceAdapterError,
    );
  });
});
