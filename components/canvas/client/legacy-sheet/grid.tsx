"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SheetCells } from "./imported";
import {
  sheetFill,
  sheetGeom,
  sheetMerges,
  sheetPage,
  sheetSurface,
  sheetTypo,
} from "./styles";
import { sheetValue } from "./workbook-values";
import {
  cellAddress,
  colLabel,
  colWidthPx,
  FORMULA_SHAPE_BADGE,
  freezeSplit,
  mergeCovering,
  moveSelection,
  NOT_CALCULATED_BADGE,
  provenanceBadge,
  type RangeRef,
  rowHeightPx,
  type SheetTab,
  UDF_SHAPE_BADGE,
  visibleCols,
  visibleRows,
} from "./model";

const keyOf = (row: number, col: number) => `${row}:${col}`;

type GridProps = {
  tab: SheetTab;
  cells: SheetCells;
  selection: RangeRef;
  onSelectionChange: (next: RangeRef) => void;
  /** Commits an edited bound cell (raw text); only called for editable cells. */
  onCommit?: (row: number, col: number, raw: string) => void;
};

// Track index (1-based inside the CSS grid) for a sheet row/column.
function trackIndex(ordered: number[], value: number): number {
  return ordered.indexOf(value) + 1;
}

export function SheetGrid({
  tab,
  cells,
  selection,
  onSelectionChange,
  onCommit,
}: GridProps) {
  const rows = useMemo(() => visibleRows(tab), [tab]);
  const cols = useMemo(() => visibleCols(tab), [tab]);
  const freeze = useMemo(() => freezeSplit(tab), [tab]);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const wantsFocus = useRef(false);
  // The active-cell ring appears after the user actually selects a cell;
  // the initial render matches the workbook's printed state (no ring).
  const [touched, setTouched] = useState(false);
  // The freeze split hairlines exist only once the sheet is scrolled; the
  // un-scrolled render matches the workbook's printed state exactly.
  const [scrolled, setScrolled] = useState(false);

  // Workbook merge truth when the sheet carries a merge list (even an
  // empty one); otherwise the model's curated ranges apply. Indexed once
  // per tab because some sheets declare tens of thousands of merges.
  const mergeIndex = useMemo(() => {
    const list = sheetMerges(tab.slug);
    if (list === undefined) return undefined;
    const anchors = new Map<string, RangeRef>();
    const covered = new Map<string, RangeRef>();
    for (const [r1, c1, r2, c2] of list) {
      const m = { r1, c1, r2, c2 };
      anchors.set(`${r1}:${c1}`, m);
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) covered.set(`${r}:${c}`, m);
    }
    return { anchors, covered };
  }, [tab.slug]);
  const coverMerge = (row: number, col: number): RangeRef | null =>
    mergeIndex
      ? (mergeIndex.covered.get(keyOf(row, col)) ?? null)
      : mergeCovering(tab, row, col);

  // Cells outside the LO page window are never painted; the renderer still
  // draws their box so the sheet surface stays continuous, but no content.
  const page = sheetPage(tab.slug);

  // Sticky offsets for the frozen bands: cumulative px of the visible
  // tracks inside the frozen region.
  const sticky = useMemo(() => {
    const rowTop = new Map<number, number>();
    let acc = 0;
    for (const r of rows) {
      if (r > freeze.rows) break;
      rowTop.set(r, acc);
      acc += rowHeightPx(tab, r);
    }
    const colLeft = new Map<number, number>();
    acc = 0;
    for (const c of cols) {
      if (c > freeze.cols) break;
      colLeft.set(c, acc);
      acc += colWidthPx(tab, c);
    }
    return { rowTop, colLeft };
  }, [rows, cols, freeze, tab]);

  // Focus follows the active cell whenever the selection moved through
  // grid interactions, so arrow keys keep working after each step.
  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    cellRefs.current.get(keyOf(selection.r1, selection.c1))?.focus();
  }, [selection]);

  const select = (next: RangeRef) => {
    wantsFocus.current = true;
    setTouched(true);
    onSelectionChange(next);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const dirs: Record<string, "up" | "down" | "left" | "right"> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const dir = dirs[event.key];
    if (!dir) return;
    event.preventDefault();
    select(moveSelection(tab, selection, dir));
  };

  const onCellPointer = (
    event: ReactMouseEvent<HTMLDivElement>,
    row: number,
    col: number,
  ) => {
    const onInput =
      event.target instanceof HTMLElement && event.target.tagName === "INPUT";
    if (!onInput) event.preventDefault();
    const merge = coverMerge(row, col);
    if (!onInput) wantsFocus.current = true;
    setTouched(true);
    onSelectionChange(
      merge ? { ...merge } : { r1: row, c1: col, r2: row, c2: col },
    );
  };

  const inSelection = (row: number, col: number) =>
    row >= selection.r1 &&
    row <= selection.r2 &&
    col >= selection.c1 &&
    col <= selection.c2;

  const gridStyle = {
    gridTemplateColumns: `var(--ls-gutter) ${cols
      .map((c) => `${colWidthPx(tab, c)}px`)
      .join(" ")}`,
    gridTemplateRows: `var(--ls-head) ${rows
      .map((r) => `${rowHeightPx(tab, r)}px`)
      .join(" ")}`,
  };

  const emitted: React.ReactNode[] = [];

  // Corner box above the row headers and left of the column headers.
  const cornerStyle = { gridRow: "1", gridColumn: "1" };
  emitted.push(
    <div key="corner" className="ls-head ls-corner" style={cornerStyle} />,
  );

  // Column header strip.
  cols.forEach((c, i) => {
    const frozen = c <= freeze.cols;
    const style: Record<string, string> = {
      gridRow: "1",
      gridColumn: String(i + 2),
    };
    if (frozen)
      style["--ls-l"] =
        `calc(var(--ls-gutter) + ${sticky.colLeft.get(c) ?? 0}px)`;
    emitted.push(
      // biome-ignore lint/a11y/useSemanticElements: the sheet grid emulates a spreadsheet header strip; th elements cannot express the frozen-pane layout.
      <div
        key={`h${c}`}
        role="columnheader"
        tabIndex={-1}
        className={`ls-head ls-colhead${frozen ? " ls-frozen" : ""}${c === freeze.cols ? " ls-split-col" : ""}`}
        style={style}
      >
        {colLabel(c)}
      </div>,
    );
  });

  // Row header gutter.
  rows.forEach((r, i) => {
    const frozen = r <= freeze.rows;
    const style: Record<string, string> = {
      gridRow: String(i + 2),
      gridColumn: "1",
    };
    if (frozen)
      style["--ls-t"] = `calc(var(--ls-head) + ${sticky.rowTop.get(r) ?? 0}px)`;
    emitted.push(
      // biome-ignore lint/a11y/useSemanticElements: the sheet grid emulates a spreadsheet row gutter; th elements cannot express the frozen-pane layout.
      <div
        key={`g${r}`}
        role="rowheader"
        tabIndex={-1}
        className={`ls-head ls-rowhead${frozen ? " ls-frozen" : ""}${r === freeze.rows ? " ls-split-row" : ""}`}
        style={style}
      >
        {r}
      </div>,
    );
  });

  // Body cells. Merge interiors are skipped; anchors span the merge.
  rows.forEach((r, ri) => {
    for (const c of cols) {
      const merge = coverMerge(r, c);
      if (merge && (merge.r1 !== r || merge.c1 !== c)) continue;
      const spanRows = merge
        ? rows.filter((x) => x >= merge.r1 && x <= merge.r2).length
        : 1;
      const spanCols = merge
        ? cols.filter((x) => x >= merge.c1 && x <= merge.c2).length
        : 1;
      const cell = cells[keyOf(r, c)];
      const frozenRow = r <= freeze.rows;
      const frozenCol = c <= freeze.cols;
      const style: Record<string, string | number> = {
        gridRow: `${ri + 2} / span ${spanRows}`,
        gridColumn: `${trackIndex(cols, c) + 1} / span ${spanCols}`,
      };
      const fill = sheetFill(tab.slug, r, trackIndex(cols, c) - 1);
      if (fill) style["--ls-fill"] = fill;
      const typo = sheetTypo(tab.slug, r, trackIndex(cols, c) - 1);
      if (frozenRow)
        style["--ls-t"] =
          `calc(var(--ls-head) + ${sticky.rowTop.get(r) ?? 0}px)`;
      if (frozenCol)
        style["--ls-l"] =
          `calc(var(--ls-gutter) + ${sticky.colLeft.get(c) ?? 0}px)`;
      const classes = ["ls-cell"];
      if (frozenRow || frozenCol) classes.push("ls-frozen");
      if (r === freeze.rows) classes.push("ls-split-row");
      if (c === freeze.cols) classes.push("ls-split-col");
      if (cell?.vertical) classes.push("ls-cell--v");
      if (cell?.kind === "number") classes.push("ls-cell--num");
      if (typo?.h) classes.push(`ls-cell--h-${typo.h}`);
      if (typo?.v) classes.push(`ls-cell--va-${typo.v}`);
      if (typo?.b) classes.push("ls-cell--bold");
      if (typo?.c) style.color = typo.c;
      if (typo?.sz) style.fontSize = `${((typo.sz * 4) / 3).toFixed(2)}px`;
      if (cell?.kind === "formula") classes.push("ls-cell--fx");
      if (cell?.editable) classes.push("ls-cell--edit");
      if (cell?.valueSource === "imported") classes.push("ls-cell--imported");
      if (cell?.notCalculated) classes.push("ls-cell--stale");
      if (inSelection(r, c)) classes.push("ls-cell--sel");
      const active = selection.r1 === r && selection.c1 === c;
      if (active) classes.push("ls-cell--active");
      const tips: string[] = [];
      if (cell?.kind === "formula")
        tips.push(
          cell.formulaWrap === "udf" ? UDF_SHAPE_BADGE : FORMULA_SHAPE_BADGE,
        );
      if (cell?.notCalculated) tips.push(NOT_CALCULATED_BADGE);
      if (cell?.value !== undefined && cell.value !== "")
        tips.push(provenanceBadge(cell));
      const painted =
        page === undefined ||
        (ri < page.rows && trackIndex(cols, c) - 1 < page.cols);
      const wv =
        !painted || cell?.editable ? undefined : sheetValue(tab.slug, r, c);
      const display =
        cell?.kind === "checkbox"
          ? wv === "TRUE" || (wv === undefined && cell?.value === "TRUE")
            ? "\u2713"
            : ""
          : (wv ?? "");
      emitted.push(
        // biome-ignore lint/a11y/useSemanticElements: a td cell cannot express merge spans or frozen panes; the div grid uses roving focus and arrow keys like the calendar grid.
        <div
          key={keyOf(r, c)}
          role="gridcell"
          aria-selected={inSelection(r, c) || undefined}
          tabIndex={active ? 0 : -1}
          ref={(node) => {
            if (node) cellRefs.current.set(keyOf(r, c), node);
            else cellRefs.current.delete(keyOf(r, c));
          }}
          className={classes.join(" ")}
          style={style}
          title={tips.length ? tips.join(". ") : undefined}
          data-r={r}
          data-c={c}
          data-kind={cell?.kind ?? "blank"}
          data-source={cell?.valueSource ?? "blank"}
          onMouseDown={(event) => onCellPointer(event, r, c)}
        >
          {cell?.editable ? (
            <input
              key={cell.value ?? ""}
              className="ls-cell-input"
              aria-label={`${cellAddress({ row: r, col: c })} editable store cell`}
              defaultValue={cell.value ?? ""}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommit?.(r, c, event.currentTarget.value);
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.currentTarget.value = cell.value ?? "";
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) => {
                if (event.currentTarget.value !== (cell.value ?? ""))
                  onCommit?.(r, c, event.currentTarget.value);
              }}
            />
          ) : (
            <span className="ls-cell-text">{display}</span>
          )}
        </div>,
      );
    }
  });

  const surface = sheetSurface(tab.slug);
  const scrollStyle: Record<string, string> = {};
  if (surface) scrollStyle["--ls-surface"] = surface;
  return (
    <div
      className={`ls-scroll${scrolled ? " ls-scroll--scrolled" : ""}`}
      style={scrollStyle}
      onScroll={(event) => {
        const el = event.currentTarget;
        const next = el.scrollTop > 2 || el.scrollLeft > 2;
        if (next !== scrolled) setScrolled(next);
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: the sheet grid emulates a spreadsheet; a table cannot express merge spans or frozen panes. */}
      <div
        role="grid"
        aria-label={`${tab.name}, read only emulation`}
        aria-rowcount={rows.length}
        aria-colcount={cols.length}
        className={`ls-grid${tab.gridlines ? " ls-grid--lines" : ""}${touched ? " ls-grid--touched" : ""}`}
        style={gridStyle}
        onKeyDown={onKeyDown}
      >
        {emitted}
        {(() => {
          const g = sheetGeom(tab.slug);
          const lines = g?.lines;
          const edges = g?.edges;
          if (!lines?.length && !edges?.length) return null;
          const w = cols.reduce((s, c) => s + colWidthPx(tab, c), 0);
          const h = rows.reduce((s, r) => s + rowHeightPx(tab, r), 0);
          return (
            <div
              aria-hidden
              className="ls-lines"
              style={{
                gridRow: `2 / span ${rows.length}`,
                gridColumn: `2 / span ${cols.length}`,
              }}
            >
              <svg width={w} height={h}>
                {edges?.map((e, ei) => {
                  const [x1, y1, x2, y2, ew, ec, dash] = e;
                  const horiz = Math.abs(y1 - y2) < 0.05;
                  const vert = Math.abs(x1 - x2) < 0.05;
                  if (!dash && (horiz || vert))
                    return (
                      <rect
                        key={`e${ei}`}
                        x={horiz ? Math.min(x1, x2) : x1 - ew / 2}
                        y={vert ? Math.min(y1, y2) : y1 - ew / 2}
                        width={horiz ? Math.abs(x2 - x1) : ew}
                        height={vert ? Math.abs(y2 - y1) : ew}
                        fill={ec}
                        shapeRendering="crispEdges"
                      />
                    );
                  return (
                    <line
                      key={`e${ei}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={ec}
                      strokeWidth={ew}
                      strokeDasharray={dash ? "1 2" : undefined}
                    />
                  );
                })}
                {lines?.map((line, li) => {
                  const [lw, lc, pts] = line;
                  const [a, b] = [pts[0], pts[pts.length - 1]];
                  const horizontal = Math.abs(a[1] - b[1]) < 0.05;
                  const vertical = Math.abs(a[0] - b[0]) < 0.05;
                  // measured spans are integer-pixel: a filled rect paints
                  // exactly those rows/cols, matching the LO rasterization.
                  if (horizontal || vertical)
                    return (
                      <rect
                        key={li}
                        x={horizontal ? Math.min(a[0], b[0]) : a[0] - lw / 2}
                        y={vertical ? Math.min(a[1], b[1]) : a[1] - lw / 2}
                        width={horizontal ? Math.abs(b[0] - a[0]) : lw}
                        height={vertical ? Math.abs(b[1] - a[1]) : lw}
                        fill={lc}
                        shapeRendering="crispEdges"
                      />
                    );
                  return (
                    <polyline
                      key={li}
                      points={pts.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke={lc}
                      strokeWidth={lw}
                    />
                  );
                })}
              </svg>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export function selectionStart(tab: SheetTab): RangeRef {
  const r = visibleRows(tab)[0] ?? 1;
  const c = visibleCols(tab)[0] ?? 1;
  return { r1: r, c1: c, r2: r, c2: c };
}

export function selectedAddress(selection: RangeRef): string {
  return cellAddress({ row: selection.r1, col: selection.c1 });
}
