import { describe, expect, it } from "vitest";

import {
  HISTORY_START,
  parseRosterQuery,
} from "../../lib/workspace/roster-query";

/**
 * P-010 client roster — pure query/cursor seam.
 *
 * The roster page must strictly validate and length-bound the `?c=` cursor and
 * the `?p=` history stack before anything reaches the service, and must build
 * next/prev links carrying only `c`/`p` on the canonical route path. These
 * pins are written before the module exists (RED → import failure).
 */

const C1 = "ck0000000000000000000001"; // cursor-shaped fixture (alnum, ≤64)

describe("parseRosterQuery — cursor `c`", () => {
  it("absent cursor resolves to the first page", () => {
    expect(parseRosterQuery({})).toEqual({
      cursor: undefined,
      history: [],
    });
  });

  it("accepts a single well-formed cursor", () => {
    expect(parseRosterQuery({ c: C1 })).toEqual({
      cursor: C1,
      history: [],
    });
  });

  it("rejects a duplicated cursor parameter", () => {
    expect(parseRosterQuery({ c: [C1, "other"] })).toBeNull();
  });

  it("rejects an empty cursor", () => {
    expect(parseRosterQuery({ c: "" })).toBeNull();
  });

  it("rejects an oversized cursor", () => {
    expect(parseRosterQuery({ c: "a".repeat(65) })).toBeNull();
    expect(parseRosterQuery({ c: "a".repeat(64) })).not.toBeNull();
  });

  it("rejects a cursor with non-id characters", () => {
    for (const bad of ["bad cursor", "../etc", "a;b", "x y", "<script>", "é_1"])
      expect(parseRosterQuery({ c: bad })).toBeNull();
  });
});

describe("parseRosterQuery — history `p`", () => {
  it("accepts a start sentinel plus cursors", () => {
    expect(parseRosterQuery({ c: "c2", p: `${HISTORY_START},c1` })).toEqual({
      cursor: "c2",
      history: [HISTORY_START, "c1"],
    });
  });

  it("rejects `p` without `c` as incoherent", () => {
    expect(parseRosterQuery({ p: HISTORY_START })).toBeNull();
    expect(parseRosterQuery({ p: `${HISTORY_START},c1` })).toBeNull();
  });

  it("rejects a duplicated `p` parameter", () => {
    expect(parseRosterQuery({ c: "c2", p: [HISTORY_START, "c1"] })).toBeNull();
  });

  it("rejects a history stack deeper than the bound", () => {
    const deep = Array.from({ length: 65 }, (_, i) => `c${i}`).join(",");
    expect(parseRosterQuery({ c: "cX", p: deep })).toBeNull();
  });

  it("rejects an oversized raw history parameter", () => {
    const big = `-${",a".repeat(2048)}`;
    expect(parseRosterQuery({ c: "cX", p: big })).toBeNull();
  });

  it("rejects malformed history entries", () => {
    expect(
      parseRosterQuery({ c: "cX", p: `${HISTORY_START},bad id` }),
    ).toBeNull();
    expect(parseRosterQuery({ c: "cX", p: `${HISTORY_START},` })).toBeNull();
  });

  it("rejects the start sentinel anywhere but index 0", () => {
    expect(parseRosterQuery({ c: "cX", p: `c1,${HISTORY_START}` })).toBeNull();
  });
});
