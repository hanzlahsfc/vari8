import { describe, expect, it } from "vitest";

import { matchingSearch } from "../../components/canvas/ethereal/clients/roster-search";

/**
 * T3 roster free-text search - the exact predicate the roster filter calls
 * per row. Behaviour pins: name/label/phase/template matching,
 * case-insensitive, trimmed; a blank query never filters a row out.
 */

type RosterClient = Parameters<typeof matchingSearch>[0];

const row = (over: Partial<RosterClient>): RosterClient =>
  ({
    name: "Amara Osei",
    label: "Fat loss",
    phase: "Foundation",
    template: "Base Block",
    ...over,
  }) as RosterClient;

describe("matchingSearch", () => {
  it("matches the client name case-insensitively", () => {
    expect(matchingSearch(row({}), "amara")).toBe(true);
    expect(matchingSearch(row({}), "OSEI")).toBe(true);
    expect(matchingSearch(row({ name: "Jon Bell" }), "osei")).toBe(false);
  });

  it("matches label, phase, and template", () => {
    expect(matchingSearch(row({}), "fat")).toBe(true);
    expect(matchingSearch(row({}), "found")).toBe(true);
    expect(matchingSearch(row({}), "base block")).toBe(true);
  });

  it("rejects rows matching none of the fields", () => {
    expect(matchingSearch(row({}), "strength")).toBe(false);
  });

  it("treats a blank or whitespace query as no filter", () => {
    for (const q of ["", "   ", "\t"]) {
      expect(matchingSearch(row({}), q)).toBe(true);
    }
  });

  it("trims the query before matching", () => {
    expect(matchingSearch(row({}), "  amara  ")).toBe(true);
  });
});
