"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Status, Tabs } from "@/components/canvas/vari8/components";
import { fetchStaffNutritionLogs } from "../../data/nutrition";
import {
  loadSheetStore,
  readSheetMacros,
  readWeekTargets,
  type SheetMacroValues,
  writeSheetMacro,
  writeWeekTargets,
} from "../../data/legacy-sheet";
import type { CoachClient } from "../../coach/model";
import { applicablePlan, targetNumber } from "../../coach/plans/domain";
import { useCoach } from "../../coach/store";
import { localToday } from "../../coach/targets/model";
import { bindTab, boundEditFor, type SheetContext } from "./bind";
import {
  applyWeekTargets,
  parseSheetDate,
  projectWeekWindows,
  type IsoDate,
} from "./compute";
import { SheetGrid, selectionStart } from "./grid";
import { IMPORTED_CELLS } from "./imported";
import "./legacy-sheet.css";
import {
  cellAddress,
  FORMULA_SHAPE_BADGE,
  LEGACY_SHEET_BANNER,
  nameBoxJump,
  provenanceBadge,
  type RangeRef,
  rangeAddress,
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
  "Coach Tools",
  "Help",
];

const keyOf = (row: number, col: number) => `${row}:${col}`;

/** Published macro-target calories for DASHBOARD U11:U13, read only. */
function calorieTargetsFor(
  client: CoachClient,
  today: IsoDate,
): [number | null, number | null, number | null] {
  const plan = client.plans
    ? applicablePlan(client.plans.nutrition.iifym, today)
    : undefined;
  const options = plan?.options ?? [];
  return [0, 1, 2].map((i) => {
    const targets = options[i]?.targets;
    if (!targets) return null;
    if (targets.style === "calories") return targetNumber(targets.calories);
    // macros-style targets derive kcal at the app's 4/4/9 constants.
    const kcal =
      targetNumber(targets.protein) * 4 +
      targetNumber(targets.carbs) * 4 +
      targetNumber(targets.fat) * 9;
    return kcal > 0 ? kcal : null;
  }) as [number | null, number | null, number | null];
}

export type LegacySheetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: CoachClient;
};

export function LegacySheetDialog({
  open,
  onOpenChange,
  client,
}: LegacySheetDialogProps) {
  const { setState, workspaceId, clientProfileIdFor, toast } = useCoach();
  const [activeSlug, setActiveSlug] = useState(WORKBOOK[0].slug);
  const [selections, setSelections] = useState<Record<string, RangeRef>>({});
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [macros, setMacros] = useState<Record<string, SheetMacroValues>>(() =>
    readSheetMacros(client.id),
  );
  const [stamps, setStamps] = useState<
    Record<string, [number, number, number]>
  >(() => readWeekTargets(client.id));
  const [toolsOpen, setToolsOpen] = useState(false);
  const today = useMemo(() => localToday(), []);

  // Hydrate the sheet seam; when the workspace resolves, merge the staff
  // NutritionLog range read (server rows win until the coach edits locally).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refreshLocal = () => {
      if (cancelled) return;
      setMacros(readSheetMacros(client.id));
      setStamps(readWeekTargets(client.id));
    };
    if (!workspaceId) {
      void Promise.resolve().then(refreshLocal);
      return () => {
        cancelled = true;
      };
    }
    void clientProfileIdFor(client.name).then((profileId) => {
      refreshLocal();
      if (!profileId || cancelled) return;
      const from = localToday(new Date(Date.now() - 30 * 86_400_000));
      const to = localToday(new Date(Date.now() + 14 * 86_400_000));
      void fetchStaffNutritionLogs(workspaceId, profileId, { from, to })
        .then((wire) => {
          if (cancelled || wire.state !== "ready") return;
          setMacros((prev) => {
            const next = { ...prev };
            for (const item of wire.items)
              next[item.entryDate] = {
                protein: item.protein,
                carbohydrate: item.carbohydrate,
                fat: item.fat,
              };
            return next;
          });
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [open, client.id, client.name, workspaceId, clientProfileIdFor]);

  const tab = tabBySlug(activeSlug) ?? WORKBOOK[0];
  const selection = selections[tab.slug] ?? selectionStart(tab);
  // The week rows anchor at the block start — DASHBOARD!H13, the client's
  // first phase start in the store — or the imported anchor when the client
  // has no phases yet.
  const weekAnchor =
    client.phases?.[0]?.startDate ??
    parseSheetDate(IMPORTED_CELLS.timeline?.["10:4"]?.value ?? "") ??
    today;
  const weeks = useMemo(() => projectWeekWindows(weekAnchor), [weekAnchor]);
  const ctx: SheetContext = {
    entries: client.tracking?.entries ?? [],
    macros,
    calorieTargets: calorieTargetsFor(client, today),
    weekStamps: stamps,
    weeks,
    today,
  };
  const tabCells = useMemo(
    () => bindTab(tab.slug, IMPORTED_CELLS[tab.slug] ?? {}, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.slug, client.tracking?.entries, macros, stamps, today],
  );

  const setSelection = (next: RangeRef) => {
    setSelections((prev) => ({ ...prev, [tab.slug]: next }));
    setNameEdit(null);
  };

  /** One commit path per bound cell — the same records the tracker edits. */
  const commit = (row: number, col: number, raw: string) => {
    const edit = boundEditFor(tab.slug, row, col, today);
    if (!edit) return;
    const value = raw.trim() === "" ? null : Number(raw.trim());
    if (value !== null && !Number.isFinite(value)) return;
    if (edit.store === "tracker") {
      // Same record the tracker screens read: client.tracking.entries,
      // values keyed by tracker parameter id.
      setState((prev) => ({
        ...prev,
        clients: prev.clients.map((c) => {
          if (c.id !== client.id) return c;
          const tracking = c.tracking ?? { entries: [], text: {} };
          const existing = tracking.entries.find((e) => e.date === edit.date);
          const nextEntry = {
            date: edit.date,
            values: { ...(existing?.values ?? {}), [edit.key]: value },
          };
          return {
            ...c,
            tracking: {
              ...tracking,
              entries: [
                ...tracking.entries.filter((e) => e.date !== edit.date),
                nextEntry,
              ].sort((a, b) => (a.date < b.date ? -1 : 1)),
            },
          };
        }),
      }));
    } else {
      const next = writeSheetMacro(client.id, edit.date, edit.field, value);
      setMacros(next.macros[client.id] ?? {});
    }
  };

  /** Update Timeline: applyWeekTargets(today), on click only, like Code.gs. */
  const updateTimeline = () => {
    const stamp = applyWeekTargets(today, ctx.weeks, ctx.calorieTargets);
    setToolsOpen(false);
    if (!stamp) {
      toast("Update Timeline: no week row covers today.");
      return;
    }
    const values = stamp.values.map((v) => v ?? 0) as [
      number,
      number,
      number,
    ];
    const next = writeWeekTargets(client.id, stamp.weekStart, values);
    setStamps(next.weekTargets[client.id] ?? {});
    toast(`Update Timeline: stamped week of ${stamp.weekStart}.`);
  };

  const activeCell = tabCells[keyOf(selection.r1, selection.c1)];
  const badges: string[] = [];
  if (activeCell?.kind === "formula") {
    badges.push(
      activeCell.formulaWrap === "udf" ? UDF_SHAPE_BADGE : FORMULA_SHAPE_BADGE,
    );
  }
  if (activeCell?.value !== undefined && activeCell.value !== "") {
    badges.push(provenanceBadge(activeCell));
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
          onCommit={commit}
        />
      ) : null,
  }));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`PRGRSS 2.0 for ${client.name}`}
      description="Legacy workbook on the client store. Bound cells read and write the tracker and nutrition records."
      size="full"
      className="ls-modal"
    >
      <div className="ls-frame">
        <div className="ls-menu">
          {MENU.map((item) =>
            item === "Coach Tools" ? (
              <span key={item} className="ls-menu-item ls-menu--tools">
                <button
                  type="button"
                  className="ls-menu-btn"
                  aria-haspopup="menu"
                  aria-expanded={toolsOpen}
                  onClick={() => setToolsOpen((v) => !v)}
                >
                  {item}
                </button>
                {toolsOpen && (
                  <span className="ls-menu-pop" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="ls-menu-action"
                      onClick={updateTimeline}
                    >
                      Update Timeline
                    </button>
                  </span>
                )}
              </span>
            ) : (
              <span key={item} className="ls-menu-item" aria-hidden="true">
                {item}
              </span>
            ),
          )}
        </div>
        <p className="ls-banner" role="note">
          {LEGACY_SHEET_BANNER} Merged regions shown on this tab:{" "}
          {tab.merges.length} of {tab.mergeTotal}.
        </p>
        <div className="ls-toolbar">
          <span className="ls-namebox">
            <input
              className="v8-input"
              data-size="sm"
              aria-label="Name box"
              value={nameEdit ?? rangeAddress(selection)}
              onChange={(event) => setNameEdit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const next = nameBoxJump(tab, event.currentTarget.value);
                if (next) setSelection(next);
              }}
              onBlur={() => setNameEdit(null)}
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
            setToolsOpen(false);
          }}
          items={tabItems}
          className="ls-tabs"
        />
        <div className="ls-status">
          <span>{`${tab.name} · ${cellAddress({ row: selection.r1, col: selection.c1 })}`}</span>
          <span className="ls-status-synth">
            Bound cells write the store on commit
          </span>
        </div>
      </div>
    </Modal>
  );
}

export { loadSheetStore };
