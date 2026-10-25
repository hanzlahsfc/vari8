"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { SheetCells } from "./imported";
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
    const merge = mergeCovering(tab, row, col);
    if (!onInput) wantsFocus.current = true;
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
      const merge = mergeCovering(tab, r, c);
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
      const display =
        cell?.kind === "checkbox"
          ? cell.value === "TRUE"
            ? "\u2713"
            : ""
          : (cell?.value ?? "");
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

  return (
    <div className="ls-scroll">
      {/* biome-ignore lint/a11y/useSemanticElements: the sheet grid emulates a spreadsheet; a table cannot express merge spans or frozen panes. */}
      <div
        role="grid"
        aria-label={`${tab.name}, read only emulation`}
        aria-rowcount={rows.length}
        aria-colcount={cols.length}
        className={`ls-grid${tab.gridlines ? " ls-grid--lines" : ""}`}
        style={gridStyle}
        onKeyDown={onKeyDown}
      >
        {emitted}
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
