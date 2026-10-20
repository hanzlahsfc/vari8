"use client";

import { Popover } from "@base-ui/react/popover";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Food } from "./model";
import "./swap-food-picker.css";

export function SwapFoodPicker({
  sourceFood,
  foods,
  open,
  onOpenChange,
  onSelect,
}: {
  sourceFood: Food;
  foods: Food[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (food: Food) => void;
}) {
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const results = useMemo(
    () =>
      foods
        .filter((food) =>
          food.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 32),
    [foods, query],
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <Popover.Trigger
        type="button"
        ref={setAnchor}
        className="mp-swap-action"
        aria-label={`Add approved alternative for ${sourceFood.name}`}
      >
        Swap
      </Popover.Trigger>
      <Popover.Portal container={anchor?.closest<HTMLElement>(".mp-workspace")}>
        <Popover.Positioner
          className="mp-swap-picker-positioner"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <Popover.Popup
            className="mp-swap-picker"
            initialFocus={() => searchRef.current}
          >
            <div className="mp-swap-picker-heading">
              <div>
                <Popover.Title className="mp-swap-picker-title">
                  Choose alternative
                </Popover.Title>
                <Popover.Description className="mp-swap-picker-description">
                  For {sourceFood.name}
                </Popover.Description>
              </div>
              <Popover.Close
                className="mp-swap-picker-close"
                aria-label="Cancel swap"
                title="Cancel swap"
              >
                <X size={15} />
              </Popover.Close>
            </div>
            <label className="mp-swap-picker-search">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    event.currentTarget
                      .closest(".mp-swap-picker")
                      ?.querySelector<HTMLButtonElement>(
                        'button[role="option"]',
                      )
                      ?.focus();
                  }
                }}
                placeholder="Search foods…"
                aria-label={`Search alternatives for ${sourceFood.name}`}
              />
            </label>
            <div
              className="mp-swap-picker-results"
              role="listbox"
              aria-label="Food alternatives"
            >
              {results.length ? (
                results.map((food, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    key={food.id}
                    onClick={() => {
                      setQuery("");
                      onSelect(food);
                    }}
                    onKeyDown={(event) => {
                      const options =
                        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                          'button[role="option"]',
                        );
                      if (!options?.length) return;
                      const next =
                        event.key === "ArrowDown"
                          ? (index + 1) % options.length
                          : event.key === "ArrowUp"
                            ? (index + options.length - 1) % options.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? options.length - 1
                                : -1;
                      if (next >= 0) {
                        event.preventDefault();
                        options[next]?.focus();
                      }
                    }}
                  >
                    <span>
                      <strong>{food.name}</strong>
                      <small>
                        {food.calories} kcal · per {food.amount} {food.unit}
                      </small>
                    </span>
                    <Plus size={14} aria-hidden="true" />
                  </button>
                ))
              ) : (
                <p>No matching foods.</p>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
