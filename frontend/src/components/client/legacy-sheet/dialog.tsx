"use client";

import { useState } from "react";
import { Input, Modal, Status, Tabs } from "@/components/vari8/components";
import { SHEET_FIXTURE } from "./fixture";
import { SheetGrid, selectionStart } from "./grid";
import "./legacy-sheet.css";
import {
  cellAddress,
  FORMULA_SHAPE_BADGE,
  LEGACY_SHEET_BANNER,
  nameBoxJump,
  type RangeRef,
  rangeAddress,
  SYNTHETIC_VALUE_BADGE,
  tabBySlug,
  UDF_SHAPE_BADGE,
  WORKBOOK,
} from "./model";

const MENU = [
  "File",
  "Edit",
  "View",
  "Insert",
  "Format",
  "Data",
  "Tools",
  "Help",
];

const keyOf = (row: number, col: number) => `${row}:${col}`;

export type LegacySheetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
};

export function LegacySheetDialog({
  open,
  onOpenChange,
  clientName,
}: LegacySheetDialogProps) {
  const [activeSlug, setActiveSlug] = useState(WORKBOOK[0].slug);
  const [selections, setSelections] = useState<Record<string, RangeRef>>({});
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const tab = tabBySlug(activeSlug) ?? WORKBOOK[0];
  const selection = selections[tab.slug] ?? selectionStart(tab);
  const tabCells = SHEET_FIXTURE[tab.slug] ?? {};

  const setSelection = (next: RangeRef) => {
    setSelections((prev) => ({ ...prev, [tab.slug]: next }));
    setNameEdit(null);
  };

  const activeCell = tabCells[keyOf(selection.r1, selection.c1)];
  const badges: string[] = [];
  if (activeCell?.kind === "formula") {
    badges.push(
      activeCell.formulaWrap === "udf" ? UDF_SHAPE_BADGE : FORMULA_SHAPE_BADGE,
    );
  }
  if (activeCell?.value !== undefined && activeCell.value !== "") {
    badges.push(SYNTHETIC_VALUE_BADGE);
  }
  const readout =
    activeCell?.kind === "formula" ? activeCell.formulaText : activeCell?.value;

  const tabItems = WORKBOOK.map((item) => ({
    value: item.slug,
    label: item.name,
    content:
      item.slug === tab.slug ? (
        <SheetGrid
          tab={item}
          cells={tabCells}
          selection={selection}
          onSelectionChange={setSelection}
        />
      ) : null,
  }));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`PRGRSS 2.0 for ${clientName}`}
      description="Legacy workbook emulation. Read only, synthetic values."
      size="full"
      className="ls-modal"
    >
      <div className="ls-frame">
        <div className="ls-menu" aria-hidden="true">
          {MENU.map((item) => (
            <span key={item} className="ls-menu-item">
              {item}
            </span>
          ))}
        </div>
        <p className="ls-banner" role="note">
          {LEGACY_SHEET_BANNER} Merged regions shown on this tab:{" "}
          {tab.merges.length} of {tab.mergeTotal}.
        </p>
        <div className="ls-toolbar">
          <span className="ls-namebox">
            <Input
              label="Name box"
              labelHidden
              value={nameEdit ?? rangeAddress(selection)}
              onChange={(event) => setNameEdit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const next = nameBoxJump(tab, event.currentTarget.value);
                if (next) setSelection(next);
              }}
              onBlur={() => setNameEdit(null)}
              size="sm"
            />
          </span>
          <span className="ls-fx-mark" aria-hidden="true">
            fx
          </span>
          <span className="ls-fx-readout" title={readout}>
            {readout ?? ""}
          </span>
          <span className="ls-badges">
            {badges.map((badge) => (
              <Status key={badge} tone="info">
                {badge}
              </Status>
            ))}
          </span>
        </div>
        <Tabs
          label="Workbook tabs"
          value={tab.slug}
          onValueChange={(slug) => {
            setActiveSlug(slug);
            setNameEdit(null);
          }}
          items={tabItems}
          className="ls-tabs"
        />
        <div className="ls-status">
          <span>{`${tab.name} · ${cellAddress({ row: selection.r1, col: selection.c1 })}`}</span>
          <span className="ls-status-synth">{SYNTHETIC_VALUE_BADGE}</span>
        </div>
      </div>
    </Modal>
  );
}
