import { describe, expect, it } from "vitest";

import { parseSheetHtml } from "../../lib/extraction/parse";

const HTML = `
<style>
  .s0{color:#ffffff;background-color:#000000;}
  .s1,.s2{color:#b7b7b7;}
</style>
<table class="waffle no-grid" cellspacing="0" cellpadding="0">
  <tr>
    <th class="row-header"></th>
    <th id="C0" class="column-headers-background">A</th>
    <th id="C1" class="column-headers-background">B</th>
    <th id="C2" class="column-headers-background">C</th>
    <th id="C3" class="column-headers-background">D</th>
  </tr>
  <tr style="height: 20px">
    <th id="R1" class="row-headers-background"><div class="row-header-wrapper">1</div></th>
    <td class="s0" dir="ltr">4,5</td>
    <td class="s1"><svg width="16" height="16"><use href="#checked-checkbox-id" fill="#666"/></svg></td>
    <td class="s2" rowspan="2">merged</td>
    <td class="freezebar-cell"></td>
    <td class="s0">a&amp;b<br/>line2</td>
  </tr>
  <tr>
    <th id="R2" class="row-headers-background"><div class="row-header-wrapper">2</div></th>
    <td class="s0">x</td>
    <td class="s0">y</td>
    <td class="s0">d</td>
  </tr>
  <tr>
    <th id="R3" class="row-headers-background"><div class="row-header-wrapper">3</div></th>
    <td class="s0" colspan="2">wide</td>
    <td class="s1"><svg><use href="#some-unknown-id"/></svg></td>
    <td class="s0" rowspan="1" colspan="1">plain</td>
  </tr>
  <tr>
    <th id="R4" class="row-headers-background"><div class="row-header-wrapper">4</div></th>
    <td class="s1"><svg><use href="#unchecked-checkbox-id" fill="#666"/></svg></td>
  </tr>
</table>
`;

const parsed = parseSheetHtml(HTML);

function at(row: number, col: number) {
  return parsed.cells.find((cell) => cell.row === row && cell.col === col);
}

describe("parseSheetHtml", () => {
  it("skips the column-header row and numbers rows like the spreadsheet", () => {
    expect(parsed.cells.every((cell) => cell.row >= 1)).toBe(true);
    expect(Math.max(...parsed.cells.map((cell) => cell.row))).toBe(4);
  });

  it("preserves original text and adds additive normalization", () => {
    const cell = at(1, 1);
    expect(cell?.text).toBe("4,5");
    expect(cell?.normalized).toBe(4.5);
  });

  it("keeps <br> as a newline and decodes entities", () => {
    expect(at(1, 4)?.text).toBe("a&b\nline2");
  });

  it("resolves spans to a stable anchor without fabricating covered cells", () => {
    const merged = at(1, 3);
    expect(merged?.rowSpan).toBe(2);
    expect(at(2, 3)).toBeUndefined(); // covered by the rowspan
    expect(at(1, 3)?.text).toBe("merged");
  });

  it("skips freezebar spacers so columns stay aligned", () => {
    // freezebar-cell sits between C and D in row 1; the last cell is still col 4.
    expect(at(1, 4)?.text).toBe("a&b\nline2");
    // row 2: A, B, (C covered), D
    expect(at(2, 1)?.text).toBe("x");
    expect(at(2, 2)?.text).toBe("y");
    expect(at(2, 3)).toBeUndefined();
    expect(at(2, 4)?.text).toBe("d");
  });

  it("captures colspan coverage", () => {
    expect(at(3, 1)?.colSpan).toBe(2);
    expect(at(3, 2)).toBeUndefined();
    expect(at(3, 3)?.text).not.toBe("wide");
  });

  it("decodes checkbox state and flags unrecognised state as TODO(product)", () => {
    expect(at(1, 2)?.checkbox).toBe("checked");
    expect(at(4, 1)?.checkbox).toBe("unchecked");
    const unknown = at(3, 3);
    expect(unknown?.checkbox).toBeUndefined();
    expect(unknown?.todo).toContain("TODO(product)");
    expect(parsed.todos).toContain(unknown?.todo);
  });

  it("extracts class declarations from the inline style block", () => {
    expect(parsed.classes.s0?.color).toBe("#ffffff");
    expect(parsed.classes.s0?.["background-color"]).toBe("#000000");
    // grouped selector ".s1,.s2" applies to both classes
    expect(parsed.classes.s1?.color).toBe("#b7b7b7");
    expect(parsed.classes.s2?.color).toBe("#b7b7b7");
  });

  it("throws clearly when there is no waffle table", () => {
    expect(() => parseSheetHtml("<html><body>nope</body></html>")).toThrow(
      /waffle/,
    );
  });
});
