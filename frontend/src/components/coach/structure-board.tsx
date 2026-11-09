"use client";

/**
 * Structure board for the setup editor.
 *
 * Mirrors the real tracker/timeline table header: groups sit side by side in
 * display order and their fields are compact chips. A chip drags to reorder
 * within its group or into another group; its popover carries the settings and
 * the accessible move control. All layout writes go through `setup-layout`.
 */

import { Popover } from "@base-ui/react/popover";
import { GripVertical, Pin, PinOff, Plus, Shrink, Trash2 } from "lucide-react";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Input as Vari8Input,
  Select as Vari8Select,
} from "../vari8/components";
import { uid } from "./model";
import {
  addGroup,
  CUSTOM_GROUP_PREFIX,
  isCustomGroup,
  type LayoutGroup,
  moveItem,
  moveItemToGroup,
  removeGroup,
  renameGroup,
  reorderGroup,
  setGroupFlag,
} from "./setup-layout";
import { IconButton } from "./ui";
import "./structure-board.css";

export type StructureBoardItem = {
  id: string;
  label: string;
  /** Muted suffix, usually the tracker unit. */
  unit?: string;
  /** Group or category shown in the settings popover. */
  hint?: string;
  /** Default group used when restoring a hidden timeline column. */
  homeGroup?: string;
  disabledReason?: string;
  /** Small marker, e.g. "Custom" for a workspace-defined parameter. */
  badge?: string;
};

export type StructureBoardAddSection = {
  label: string;
  items: readonly StructureBoardItem[];
};

export type StructureBoardProps = {
  label: string;
  groups: readonly LayoutGroup[];
  items: readonly StructureBoardItem[];
  /** Catalog offered by each group's "+ Add" search popover. */
  addable?: readonly StructureBoardItem[];
  /** Optional grouped Add catalog; takes precedence over `addable`. */
  addSections?: readonly StructureBoardAddSection[];
  /** Optional hidden tray below the board (timeline columns). */
  hidden?: readonly StructureBoardItem[];
  addLabel?: string;
  hiddenLabel?: string;
  hideActionLabel?: string;
  /** Shows a "Create parameter" action at the bottom of every Add popover. */
  onCreateItem?: (groupId: string) => void;
  createLabel?: string;
  onChange: (groups: LayoutGroup[]) => void;
  onReset?: () => void;
  onAddItem?: (itemId: string, groupId: string) => void;
  onHideItem?: (itemId: string) => void;
  onRestoreItem?: (itemId: string, homeGroup?: string) => void;
  /** Extra field settings rendered above the shared move/hide controls. */
  renderSettings?: (item: StructureBoardItem, group: LayoutGroup) => ReactNode;
};

type DragState = {
  kind: "group" | "item";
  id: string;
  label: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
};

type DropTarget =
  | { kind: "item"; groupId: string; index: number }
  | { kind: "group"; index: number; side: "before" | "after" };

const DRAG_THRESHOLD = 4;

export function StructureBoard({
  label,
  groups,
  items,
  addable = [],
  addSections,
  hidden = [],
  addLabel = "Add",
  hiddenLabel = "Hidden",
  hideActionLabel = "Hide",
  onCreateItem,
  createLabel = "Create parameter",
  onChange,
  onReset,
  onAddItem,
  onHideItem,
  onRestoreItem,
  renderSettings,
}: StructureBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const placed = groups.reduce((total, group) => total + group.items.length, 0);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [openAddGroupId, setOpenAddGroupId] = useState<string | null>(null);
  const [addSearch, setAddSearch] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const suppressClick = useRef(false);
  const suppressTimer = useRef<number | undefined>(undefined);
  const moveSelectOpen = useRef(false);
  const focusAfterMove = useRef<string | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    setPortalContainer(
      node.closest("dialog") ?? node.closest(".v8-theme") ?? document.body,
    );
  }, []);

  useEffect(() => {
    if (!focusAfterMove.current) return;
    const itemId = focusAfterMove.current;
    focusAfterMove.current = null;
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-structure-chip-id="${CSS.escape(itemId)}"]`,
        )
        ?.focus();
    });
  });

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const pointerId = dragRef.current?.pointerId;
    const findDrop = (
      state: DragState,
      x: number,
      y: number,
    ): DropTarget | null => {
      const scroller = boardRef.current;
      if (scroller) {
        const bounds = scroller.getBoundingClientRect();
        if (x < bounds.left + 48) scroller.scrollLeft -= 14;
        else if (x > bounds.right - 48) scroller.scrollLeft += 14;
      }
      const target = document.elementFromPoint(x, y);
      if (!(target instanceof Element)) return null;
      const groupElement = target.closest<HTMLElement>(
        "[data-structure-group]",
      );
      if (!groupElement) return null;
      if (state.kind === "group") {
        const index = Number(groupElement.dataset.structureGroupIndex);
        if (!Number.isFinite(index)) return null;
        const bounds = groupElement.getBoundingClientRect();
        return {
          kind: "group",
          index,
          side: x < bounds.left + bounds.width / 2 ? "before" : "after",
        };
      }
      const groupId = groupElement.dataset.structureGroup;
      if (!groupId) return null;
      const chip = target.closest<HTMLElement>("[data-structure-chip]");
      const chips = [
        ...(groupElement.querySelectorAll<HTMLElement>(
          "[data-structure-chip]",
        ) ?? []),
      ];
      let index = chips.length;
      if (chip) {
        const chipIndex = Number(chip.dataset.structureIndex);
        const bounds = chip.getBoundingClientRect();
        index = chipIndex + (y > bounds.top + bounds.height / 2 ? 1 : 0);
      } else {
        for (const [chipPosition, element] of chips.entries()) {
          const bounds = element.getBoundingClientRect();
          if (y < bounds.top + bounds.height / 2) {
            index = chipPosition;
            break;
          }
        }
      }
      return { kind: "item", groupId, index };
    };
    const move = (event: PointerEvent) => {
      if (pointerId === undefined || event.pointerId !== pointerId) return;
      const current = dragRef.current;
      if (!current) return;
      const delta = Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      );
      if (!current.moved && delta < DRAG_THRESHOLD) return;
      event.preventDefault();
      const next = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved: true,
      };
      dragRef.current = next;
      setDrag(next);
      const target = findDrop(next, event.clientX, event.clientY);
      dropRef.current = target;
      setDrop(target);
    };
    const finish = (event: PointerEvent) => {
      if (pointerId === undefined || event.pointerId !== pointerId) return;
      const current = dragRef.current;
      const target = dropRef.current;
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDrop(null);
      if (!current?.moved) return;
      suppressClick.current = true;
      window.clearTimeout(suppressTimer.current);
      suppressTimer.current = window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (!target) return;
      const currentGroups = groupsRef.current;
      if (current.kind === "group" && target.kind === "group") {
        const from = currentGroups.findIndex(
          (group) => group.id === current.id,
        );
        if (from < 0) return;
        const insert =
          target.side === "after" ? target.index + 1 : target.index;
        const to = from < insert ? insert - 1 : insert;
        if (to === from) return;
        onChange(reorderGroup(currentGroups, from, to));
        setAnnouncement(`${current.label} group moved to position ${to + 1}.`);
        return;
      }
      if (current.kind !== "item" || target.kind !== "item") return;
      const source = currentGroups.find((group) =>
        group.items.includes(current.id),
      );
      const targetGroup = currentGroups.find(
        (group) => group.id === target.groupId,
      );
      if (!source || !targetGroup) return;
      if (source.id === targetGroup.id) {
        const from = source.items.indexOf(current.id);
        const to = target.index > from ? target.index - 1 : target.index;
        if (to === from) return;
        onChange(moveItem(currentGroups, target.groupId, from, to));
      } else {
        onChange(
          moveItemToGroup(
            currentGroups,
            current.id,
            target.groupId,
            Math.min(target.index, targetGroup.items.length),
          ),
        );
      }
      setAnnouncement(
        `${current.label} moved to ${targetGroup.label}, position ${Math.min(
          target.index + 1,
          targetGroup.items.length + 1,
        )}.`,
      );
    };
    const cancel = (event: PointerEvent) => {
      if (pointerId === undefined || event.pointerId !== pointerId) return;
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDrop(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, onChange]);

  useEffect(
    () => () => {
      window.clearTimeout(suppressTimer.current);
    },
    [],
  );

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    next: Omit<
      DragState,
      "pointerId" | "startX" | "startY" | "x" | "y" | "moved"
    >,
  ) => {
    if (event.button !== 0) return;
    const state: DragState = {
      ...next,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    dragRef.current = state;
    dropRef.current = null;
    setDrag(state);
    setDrop(null);
  };

  const moveChipByKeyboard = (
    event: ReactKeyboardEvent<HTMLElement>,
    item: StructureBoardItem,
    group: LayoutGroup,
  ) => {
    if (!event.altKey) return;
    const groupIndex = groups.findIndex(
      (candidate) => candidate.id === group.id,
    );
    const itemIndex = group.items.indexOf(item.id);
    if (groupIndex < 0 || itemIndex < 0) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const to = itemIndex + (event.key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= group.items.length) return;
      onChange(moveItem(groups, group.id, itemIndex, to));
      focusAfterMove.current = item.id;
      setAnnouncement(`${item.label} moved within ${group.label}.`);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const target = groups[groupIndex + (event.key === "ArrowLeft" ? -1 : 1)];
      if (!target) return;
      onChange(
        moveItemToGroup(
          groups,
          item.id,
          target.id,
          Math.min(itemIndex, target.items.length),
        ),
      );
      focusAfterMove.current = item.id;
      setAnnouncement(`${item.label} moved to ${target.label}.`);
    }
  };

  const query = addSearch.trim().toLowerCase();
  const matches = (item: StructureBoardItem) =>
    `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(query);
  const filteredAddable = addable.filter(matches);
  const filteredSections = (addSections ?? []).map((section) => ({
    ...section,
    items: section.items.filter(matches),
  }));
  const shownAddable = addSections
    ? filteredSections.flatMap((section) => section.items)
    : filteredAddable;

  return (
    <div className="cd-structure" ref={rootRef}>
      <div className="cd-structure-summary">
        <span>
          {groups.length} group{groups.length === 1 ? "" : "s"} · {placed} shown
          {hidden.length > 0 ? ` · ${hidden.length} hidden` : ""}
        </span>
        <span className="cd-structure-summary-actions">
          <span className="cd-structure-hint">
            Drag to reorder · Alt + arrows to move
          </span>
          {onReset && (
            <button
              type="button"
              className="cd-structure-reset"
              onClick={onReset}
            >
              Reset layout
            </button>
          )}
        </span>
      </div>
      <div className="cd-structure-board-scroll" ref={boardRef}>
        <fieldset className="cd-structure-board" aria-label={label}>
          {groups.map((group, groupIndex) => {
            const groupDrop =
              drop?.kind === "group" && drop.index === groupIndex
                ? drop.side
                : undefined;
            const custom = isCustomGroup(group.id);
            return (
              <section
                className="cd-structure-group"
                key={group.id}
                data-structure-group={group.id}
                data-structure-group-index={groupIndex}
                data-drop={groupDrop}
                data-dragging={
                  drag?.kind === "group" && drag.id === group.id
                    ? ""
                    : undefined
                }
              >
                <header className="cd-structure-group-head">
                  <button
                    type="button"
                    className="cd-structure-grip"
                    aria-label={`Drag ${group.label} to reorder the group`}
                    title="Drag or use left/right arrows to reorder"
                    onPointerDown={(event) =>
                      beginDrag(event, {
                        kind: "group",
                        id: group.id,
                        label: group.label,
                      })
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowLeft" &&
                        event.key !== "ArrowRight"
                      )
                        return;
                      event.preventDefault();
                      const to =
                        groupIndex + (event.key === "ArrowLeft" ? -1 : 1);
                      if (to < 0 || to >= groups.length) return;
                      onChange(reorderGroup(groups, groupIndex, to));
                      setAnnouncement(
                        `${group.label} group moved to position ${to + 1}.`,
                      );
                    }}
                  >
                    <GripVertical size={14} />
                  </button>
                  <Vari8Input
                    className="cd-structure-group-name"
                    label={`Name for ${group.label || "group"}`}
                    hideLabel
                    size="sm"
                    aria-label={`Name for ${group.label || "group"}`}
                    value={group.label}
                    maxLength={60}
                    onChange={(event) =>
                      onChange(
                        renameGroup(groups, group.id, event.target.value),
                      )
                    }
                  />
                  {custom && (
                    <button
                      type="button"
                      className="cd-structure-group-delete"
                      aria-label={`Delete ${group.label}`}
                      title="Delete group"
                      onClick={() => onChange(removeGroup(groups, group.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </header>
                <div className="cd-structure-group-flags">
                  <IconButton
                    className="cd-structure-flag"
                    label={`${group.pinned ? "Unpin" : "Pin"} ${group.label} by default`}
                    title={
                      group.pinned
                        ? "Pinned by default"
                        : "Pin by default next to dates"
                    }
                    size="sm"
                    aria-pressed={group.pinned}
                    data-on={group.pinned ? "" : undefined}
                    onClick={() =>
                      onChange(
                        setGroupFlag(groups, group.id, "pinned", !group.pinned),
                      )
                    }
                  >
                    {group.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </IconButton>
                  <IconButton
                    className="cd-structure-flag"
                    label={`${group.collapsed ? "Expand" : "Collapse"} ${group.label} by default`}
                    title={
                      group.collapsed
                        ? "Collapsed by default"
                        : "Collapse by default"
                    }
                    size="sm"
                    aria-pressed={group.collapsed}
                    data-on={group.collapsed ? "" : undefined}
                    onClick={() =>
                      onChange(
                        setGroupFlag(
                          groups,
                          group.id,
                          "collapsed",
                          !group.collapsed,
                        ),
                      )
                    }
                  >
                    <Shrink size={12} />
                  </IconButton>
                  <span className="cd-structure-count">
                    {group.items.length}
                  </span>
                </div>
                <div className="cd-structure-chips" data-structure-chips>
                  {group.items.map((itemId, itemIndex) => {
                    const item = itemById.get(itemId);
                    if (!item) return null;
                    const showDrop =
                      drop?.kind === "item" &&
                      drop.groupId === group.id &&
                      drop.index === itemIndex;
                    return (
                      <Fragment key={item.id}>
                        {showDrop && (
                          <span
                            className="cd-structure-drop"
                            aria-hidden="true"
                          />
                        )}
                        <Popover.Root
                          open={openItemId === item.id}
                          onOpenChange={(open) => {
                            if (!open && moveSelectOpen.current) return;
                            setOpenItemId(open ? item.id : null);
                          }}
                        >
                          <Popover.Trigger
                            render={
                              <button
                                type="button"
                                className="cd-structure-chip"
                                data-structure-chip=""
                                data-structure-chip-id={item.id}
                                data-structure-chip-group={group.id}
                                data-structure-index={itemIndex}
                                data-dragging={
                                  drag?.kind === "item" && drag.id === item.id
                                    ? ""
                                    : undefined
                                }
                                aria-label={`${item.label} settings. Drag to reorder; Alt plus arrow keys to move.`}
                                onPointerDown={(event) =>
                                  beginDrag(event, {
                                    kind: "item",
                                    id: item.id,
                                    label: item.label,
                                  })
                                }
                                onKeyDown={(event) =>
                                  moveChipByKeyboard(event, item, group)
                                }
                                onClick={(event) => {
                                  if (!suppressClick.current) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                              />
                            }
                          >
                            <span className="cd-structure-chip-label">
                              {item.label}
                            </span>
                            {item.unit && (
                              <span className="cd-structure-chip-unit">
                                {item.unit}
                              </span>
                            )}
                            {item.badge && (
                              <span className="cd-structure-badge">
                                {item.badge}
                              </span>
                            )}
                            {item.disabledReason && (
                              <span
                                className="cd-structure-chip-warn"
                                title={item.disabledReason}
                                aria-hidden="true"
                              >
                                !
                              </span>
                            )}
                          </Popover.Trigger>
                          <Popover.Portal
                            container={portalContainer ?? undefined}
                          >
                            <Popover.Positioner
                              className="cd-structure-pop-positioner"
                              side="bottom"
                              align="start"
                              sideOffset={6}
                              collisionPadding={12}
                              collisionAvoidance={{
                                side: "flip",
                                align: "shift",
                              }}
                            >
                              <Popover.Popup
                                className="cd-structure-pop"
                                aria-label={`${item.label} settings`}
                              >
                                <header className="cd-structure-pop-head">
                                  <strong>{item.label}</strong>
                                  {item.hint && <span>{item.hint}</span>}
                                </header>
                                {item.disabledReason && (
                                  <p className="cd-structure-pop-note">
                                    {item.disabledReason}
                                  </p>
                                )}
                                {renderSettings?.(item, group)}
                                <div className="cd-structure-pop-move">
                                  <Vari8Select
                                    label="Move to group"
                                    value={group.id}
                                    onOpenChange={(open) => {
                                      moveSelectOpen.current = open;
                                    }}
                                    onValueChange={(nextGroupId) => {
                                      if (nextGroupId === group.id) return;
                                      onChange(
                                        moveItemToGroup(
                                          groups,
                                          item.id,
                                          nextGroupId,
                                        ),
                                      );
                                      setOpenItemId(null);
                                    }}
                                    options={groups.map((option) => ({
                                      value: option.id,
                                      label: option.label,
                                    }))}
                                  />
                                </div>
                                <footer className="cd-structure-pop-foot">
                                  <button
                                    type="button"
                                    className="cd-structure-pop-hide"
                                    onClick={() => {
                                      onHideItem?.(item.id);
                                      setOpenItemId(null);
                                    }}
                                  >
                                    {hideActionLabel}
                                  </button>
                                  <span>Alt + arrows also move</span>
                                </footer>
                              </Popover.Popup>
                            </Popover.Positioner>
                          </Popover.Portal>
                        </Popover.Root>
                      </Fragment>
                    );
                  })}
                  {drop?.kind === "item" &&
                    drop.groupId === group.id &&
                    drop.index === group.items.length && (
                      <span className="cd-structure-drop" aria-hidden="true" />
                    )}
                  {!group.items.length &&
                    !(drop?.kind === "item" && drop.groupId === group.id) && (
                      <p className="cd-structure-empty">
                        No fields in this group
                      </p>
                    )}
                </div>
                {onAddItem && (
                  <Popover.Root
                    open={openAddGroupId === group.id}
                    onOpenChange={(open) => {
                      setOpenAddGroupId(open ? group.id : null);
                      if (!open) setAddSearch("");
                    }}
                  >
                    <Popover.Trigger
                      render={
                        <button
                          type="button"
                          className="cd-structure-add v8-button v8-add-button"
                          data-size="sm"
                          data-variant="ghost"
                          aria-label={`${addLabel} to ${group.label}`}
                        />
                      }
                    >
                      <Plus size={13} />
                      {addLabel}
                    </Popover.Trigger>
                    <Popover.Portal container={portalContainer ?? undefined}>
                      <Popover.Positioner
                        className="cd-structure-pop-positioner"
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        collisionPadding={12}
                        collisionAvoidance={{ side: "flip", align: "shift" }}
                      >
                        <Popover.Popup
                          className="cd-structure-pop cd-structure-add-pop"
                          aria-label={`${addLabel} to ${group.label}`}
                        >
                          <Vari8Input
                            label="Search available fields"
                            type="search"
                            hideLabel
                            value={addSearch}
                            placeholder="Search fields"
                            onChange={(event) =>
                              setAddSearch(event.target.value)
                            }
                          />
                          <div className="cd-structure-add-list">
                            {addSections
                              ? filteredSections.map((section) =>
                                  section.items.length ? (
                                    <div
                                      className="cd-structure-add-section"
                                      key={section.label}
                                    >
                                      <span className="cd-structure-add-heading">
                                        {section.label}
                                      </span>
                                      {section.items.map((item) => (
                                        <button
                                          key={item.id}
                                          type="button"
                                          disabled={Boolean(
                                            item.disabledReason,
                                          )}
                                          title={item.disabledReason}
                                          onClick={() => {
                                            onAddItem(item.id, group.id);
                                            setOpenAddGroupId(null);
                                            setAddSearch("");
                                          }}
                                        >
                                          <span>{item.label}</span>
                                          {item.badge && (
                                            <small className="cd-structure-badge">
                                              {item.badge}
                                            </small>
                                          )}
                                          {item.unit && (
                                            <small>{item.unit}</small>
                                          )}
                                          {item.disabledReason && (
                                            <small>{item.disabledReason}</small>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null,
                                )
                              : filteredAddable.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    disabled={Boolean(item.disabledReason)}
                                    title={item.disabledReason}
                                    onClick={() => {
                                      onAddItem(item.id, group.id);
                                      setOpenAddGroupId(null);
                                      setAddSearch("");
                                    }}
                                  >
                                    <span>{item.label}</span>
                                    {item.badge && (
                                      <small className="cd-structure-badge">
                                        {item.badge}
                                      </small>
                                    )}
                                    {item.unit && <small>{item.unit}</small>}
                                    {item.disabledReason && (
                                      <small>{item.disabledReason}</small>
                                    )}
                                  </button>
                                ))}
                            {!shownAddable.length && (
                              <p className="cd-structure-empty">
                                {addSearch
                                  ? "No matching fields."
                                  : addable.length
                                    ? "No matching fields."
                                    : "Every available field is already shown."}
                              </p>
                            )}
                          </div>
                          {onCreateItem && (
                            <button
                              type="button"
                              className="cd-structure-create"
                              onClick={() => {
                                setOpenAddGroupId(null);
                                setAddSearch("");
                                onCreateItem(group.id);
                              }}
                            >
                              <Plus size={13} />
                              {createLabel}
                            </button>
                          )}
                        </Popover.Popup>
                      </Popover.Positioner>
                    </Popover.Portal>
                  </Popover.Root>
                )}
              </section>
            );
          })}
          <div className="cd-structure-add-group">
            <button
              type="button"
              onClick={() =>
                onChange(
                  addGroup(
                    groups,
                    `${CUSTOM_GROUP_PREFIX}${uid("group")}`,
                    "New group",
                  ),
                )
              }
            >
              <Plus size={14} />
              Add group
            </button>
          </div>
        </fieldset>
      </div>
      {hidden.length > 0 && (
        <section className="cd-structure-hidden" aria-label={hiddenLabel}>
          <header>
            <strong>{hiddenLabel}</strong>
            <span>Add a column back to a group</span>
          </header>
          <div className="cd-structure-hidden-list">
            {hidden.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={Boolean(item.disabledReason)}
                title={item.disabledReason}
                onClick={() => onRestoreItem?.(item.id, item.homeGroup)}
              >
                <Plus size={12} />
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {drag?.moved && (
        <div
          className="cd-structure-ghost"
          style={{
            transform: `translate3d(${drag.x + 12}px, ${drag.y + 12}px, 0)`,
          }}
          aria-hidden="true"
        >
          {drag.label}
        </div>
      )}
      <p className="cd-sr" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
