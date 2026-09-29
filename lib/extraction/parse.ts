import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import type { ExtractionCell } from "./contracts";
import {
  parseCssDeclarations,
  pickClasses,
  type ClassDeclarations,
} from "./css";
import { normalizeNumeric } from "./normalize";

export type ParsedSheet = {
  cells: ExtractionCell[];
  classes: Record<string, ClassDeclarations>;
  todos: string[];
};

/**
 * Generic parser for Google Sheets HTML exports.
 *
 * - 1-based `row`/`col`; row numbers exclude the leading column-header row, so
 *   `row` equals the spreadsheet row number.
 * - Merged cells are emitted once at their top-left anchor with `rowSpan`/
 *   `colSpan`; covered grid positions are tracked but never fabricated.
 * - `<th>` chrome rows/cells and `freezebar-cell` spacers are skipped so data
 *   columns align with the export's A/B/C… headers.
 * - Original text is preserved; `normalized` is additive and unambiguous only.
 * - Checkbox state comes from `<use href="#checked-checkbox-id|#unchecked-checkbox-id">`;
 *   unrecognised/conflicting SVG state becomes a `TODO(product)` note.
 */

const SKIP_CLASS_MARKERS = [
  "freezebar",
  "row-header",
  "column-headers-background",
];
const CHECKED_HREF = "#checked-checkbox-id";
const UNCHECKED_HREF = "#unchecked-checkbox-id";
const TODO_CONFLICT = "TODO(product): conflicting checkbox states in one cell";
const TODO_UNRECOGNISED = "TODO(product): unrecognised checkbox state";

function shouldSkip(tag: string, className: string): boolean {
  if (tag === "th") return true;
  return SKIP_CLASS_MARKERS.some((marker) => className.includes(marker));
}

function spanFromAttr(value: string | undefined): number {
  if (value === undefined) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

function cellText($: cheerio.CheerioAPI, node: AnyNode): string {
  const wrapper = $(node);
  wrapper.find("br").replaceWith("\n");
  return wrapper.text();
}

export function parseSheetHtml(
  html: string,
  options: { baseClasses?: Record<string, ClassDeclarations> } = {},
): ParsedSheet {
  const $ = cheerio.load(html);
  const table = $("table.waffle").first();
  if (table.length === 0) {
    throw new Error('parseSheetHtml: no <table class="waffle"> found');
  }

  const tbody = table.children("tbody");
  const rowElements = (tbody.length > 0 ? tbody : table)
    .children("tr")
    .toArray();

  const occupied = new Set<string>();
  const cells: ExtractionCell[] = [];
  const usedClasses = new Set<string>();
  const todos = new Set<string>();
  let dataRow = 0;

  for (const rowElement of rowElements) {
    const cellElements = $(rowElement).children("td, th").toArray();
    const hasDataCell = cellElements.some(
      (el) => (el as { tagName?: string }).tagName?.toLowerCase() === "td",
    );
    if (!hasDataCell) continue; // column-header / chrome row

    dataRow += 1;
    let col = 1;

    for (const el of cellElements) {
      const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "";
      const rawClass = ($(el).attr("class") ?? "").trim();
      if (shouldSkip(tag, rawClass)) continue;

      while (occupied.has(`${dataRow},${col}`)) col += 1;

      const rowSpan = spanFromAttr($(el).attr("rowspan"));
      const colSpan = spanFromAttr($(el).attr("colspan"));

      for (let dr = 0; dr < rowSpan; dr += 1) {
        for (let dc = 0; dc < colSpan; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          occupied.add(`${dataRow + dr},${col + dc}`);
        }
      }

      const text = cellText($, el);
      const checked = $(el).find(`use[href="${CHECKED_HREF}"]`).length;
      const unchecked = $(el).find(`use[href="${UNCHECKED_HREF}"]`).length;

      const cell: ExtractionCell = {
        row: dataRow,
        col,
        rowSpan,
        colSpan,
        class: rawClass.length > 0 ? rawClass : null,
        text,
      };

      if (checked > 0 && unchecked > 0) {
        cell.todo = TODO_CONFLICT;
        todos.add(TODO_CONFLICT);
      } else if (checked > 0) {
        cell.checkbox = "checked";
      } else if (unchecked > 0) {
        cell.checkbox = "unchecked";
      } else if ($(el).find("svg use").length > 0) {
        cell.todo = TODO_UNRECOGNISED;
        todos.add(TODO_UNRECOGNISED);
      }

      const normalized = normalizeNumeric(text);
      if (normalized !== undefined) cell.normalized = normalized;

      cells.push(cell);
      if (rawClass.length > 0) {
        for (const cls of rawClass.split(/\s+/)) usedClasses.add(cls);
      }
      col += colSpan;
    }
  }

  const inlineCss = $("style")
    .toArray()
    .map((el) => $(el).text())
    .join("\n");
  const inlineClasses = parseCssDeclarations(inlineCss, usedClasses);
  const base = options.baseClasses
    ? pickClasses(options.baseClasses, usedClasses)
    : {};

  return {
    cells,
    classes: { ...base, ...inlineClasses },
    todos: [...todos].sort(),
  };
}
