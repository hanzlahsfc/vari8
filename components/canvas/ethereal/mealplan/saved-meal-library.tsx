"use client";

import { Dialog } from "@base-ui/react/dialog";
import { BookOpen, Copy, Pencil, Search, Trash2, Undo2, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/canvas/reduced-motion";
import {
  calculateMealNutrients,
  calculatePortionNutrients,
  createReusableMeal,
  type Food,
  type ReusableMeal,
} from "./model";
import "./client-plan-preview.css";
import "./saved-meal-library.css";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const calories = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function SavedMealLibrary({
  meals,
  foodMap,
  clientName,
  onChange,
}: {
  meals: ReusableMeal[];
  foodMap: Map<string, Food>;
  clientName: string;
  onChange: (meals: ReusableMeal[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleted, setDeleted] = useState<{
    meal: ReusableMeal;
    index: number;
  } | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const nameId = useId();
  const errorId = useId();
  const filtered = meals.filter((saved) => {
    const text = query.trim().toLowerCase();
    return (
      saved.name.toLowerCase().includes(text) ||
      saved.meal.portions.some(
        (portion) =>
          foodMap.get(portion.foodId)?.name.toLowerCase().includes(text) ||
          portion.swaps?.some((swap) =>
            foodMap.get(swap.foodId)?.name.toLowerCase().includes(text),
          ),
      )
    );
  });
  const selected =
    filtered.find((saved) => saved.id === selectedId) ?? filtered[0];
  const total = selected && calculateMealNutrients(selected.meal, foodMap);

  useEffect(() => {
    if (renaming) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [renaming]);

  function select(id: string) {
    setSelectedId(id);
    setRenaming(false);
    setError("");
  }

  function duplicate() {
    if (!selected) return;
    const base = `${selected.name} (copy)`;
    let name = base;
    let suffix = 2;
    while (meals.some((meal) => meal.name === name))
      name = `${base} ${suffix++}`;
    const copy = createReusableMeal(selected.meal, name);
    copy.meal.label = name;
    onChange([...meals, copy]);
    setQuery("");
    select(copy.id);
    setMessage(`“${name}” created.`);
    setDeleted(null);
  }

  function remove() {
    if (!selected) return;
    const index = meals.findIndex((saved) => saved.id === selected.id);
    setDeleted({ meal: selected, index });
    onChange(meals.filter((saved) => saved.id !== selected.id));
    select(filtered.find((saved) => saved.id !== selected.id)?.id ?? "");
    setMessage(`“${selected.name}” deleted from saved meals.`);
  }

  function undoDelete() {
    if (!deleted) return;
    const restored = [...meals];
    restored.splice(Math.min(deleted.index, restored.length), 0, deleted.meal);
    onChange(restored);
    setQuery("");
    select(deleted.meal.id);
    setMessage(`“${deleted.meal.name}” restored.`);
    setDeleted(null);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setQuery("");
          setRenaming(false);
          setError("");
        }
      }}
    >
      <Dialog.Trigger ref={setAnchor} className="mp-button mp-library-trigger">
        <BookOpen size={14} />
        Saved meals · {meals.length}
      </Dialog.Trigger>
      <Dialog.Portal container={anchor?.closest<HTMLElement>(".mp-workspace")}>
        <Dialog.Backdrop className="mp-library-backdrop" />
        <Dialog.Popup
          className="mp-library-popup"
          initialFocus={closeButton}
          render={
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
            />
          }
        >
          <header className="mp-library-header">
            <div>
              <Dialog.Title className="mp-library-title">
                Saved meals
              </Dialog.Title>
              <Dialog.Description className="mp-library-description">
                {clientName}’s meal library. Changes here leave assigned plans
                intact.
              </Dialog.Description>
            </div>
            <Dialog.Close
              ref={closeButton}
              className="mp-icon-button"
              aria-label="Close saved meals"
              title="Close saved meals"
            >
              <X size={16} />
            </Dialog.Close>
          </header>
          {message && (
            <div className="mp-library-feedback" role="status">
              <span>{message}</span>
              {deleted && (
                <button
                  type="button"
                  className="mp-button"
                  onClick={undoDelete}
                >
                  <Undo2 size={14} /> Undo delete
                </button>
              )}
              <button
                type="button"
                className="mp-icon-button"
                aria-label="Dismiss library notification"
                title="Dismiss notification"
                onClick={() => {
                  setMessage("");
                  setDeleted(null);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="mp-library-body">
            <aside
              className="mp-library-browser"
              aria-label="Browse saved meals"
            >
              <div className="mp-library-search">
                <Search size={15} aria-hidden="true" />
                <input
                  aria-label="Search saved meals"
                  placeholder="Search meals or foods…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setRenaming(false);
                    setError("");
                  }}
                />
              </div>
              <p className="mp-library-count">
                {filtered.length} of {meals.length} saved meals
              </p>
              <label className="mp-library-mobile-picker">
                <span>Saved meal</span>
                <select
                  value={selected?.id ?? ""}
                  disabled={!filtered.length}
                  onChange={(event) => select(event.target.value)}
                >
                  {!filtered.length && (
                    <option value="">No meals available</option>
                  )}
                  {filtered.map((saved) => (
                    <option key={saved.id} value={saved.id}>
                      {saved.name}
                    </option>
                  ))}
                </select>
              </label>
              <ul className="mp-library-list">
                {filtered.map((saved) => {
                  const nutrients = calculateMealNutrients(saved.meal, foodMap);
                  return (
                    <li key={saved.id}>
                      <button
                        type="button"
                        aria-pressed={selected?.id === saved.id}
                        onClick={() => select(saved.id)}
                      >
                        <strong>{saved.name}</strong>
                        <span>
                          {saved.meal.portions.length} foods ·{" "}
                          {calories.format(nutrients.calories)} kcal
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!filtered.length && (
                <p className="mp-library-empty">
                  {meals.length ? "No matching meals." : "No saved meals yet."}
                </p>
              )}
            </aside>
            <section
              className="mp-library-detail mp-client-plan"
              aria-label="Saved meal details"
            >
              {selected && total ? (
                <>
                  <div className="mp-library-detail-heading">
                    {renaming ? (
                      <form
                        className="mp-library-rename"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const name = draft.trim();
                          if (!name) {
                            setError("Enter a meal name.");
                            return;
                          }
                          onChange(
                            meals.map((saved) =>
                              saved.id === selected.id
                                ? {
                                    ...saved,
                                    name,
                                    meal: { ...saved.meal, label: name },
                                  }
                                : saved,
                            ),
                          );
                          setQuery("");
                          setSelectedId(selected.id);
                          setRenaming(false);
                          setMessage(`Meal renamed to “${name}”.`);
                          setDeleted(null);
                        }}
                      >
                        <label htmlFor={nameId}>Meal name</label>
                        <input
                          ref={nameInput}
                          id={nameId}
                          value={draft}
                          maxLength={120}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(event) => {
                            setDraft(event.target.value);
                            setError("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.stopPropagation();
                              setRenaming(false);
                              setError("");
                            }
                          }}
                        />
                        {error && (
                          <p id={errorId} role="alert">
                            {error}
                          </p>
                        )}
                        <div className="mp-library-actions">
                          <button
                            type="submit"
                            className="mp-button mp-primary"
                          >
                            Save name
                          </button>
                          <button
                            type="button"
                            className="mp-button"
                            onClick={() => {
                              setRenaming(false);
                              setError("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <h3>{selected.name}</h3>
                        <div className="mp-library-actions">
                          <button
                            type="button"
                            className="mp-button"
                            onClick={() => {
                              setDraft(selected.name);
                              setRenaming(true);
                            }}
                          >
                            <Pencil size={13} /> Rename
                          </button>
                          <button
                            type="button"
                            className="mp-button"
                            onClick={duplicate}
                          >
                            <Copy size={13} /> Duplicate
                          </button>
                          <button
                            type="button"
                            className="mp-button mp-library-delete"
                            onClick={remove}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mp-library-nutrition">
                    <div>
                      <strong>{calories.format(total.calories)}</strong>
                      <span>kcal</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Protein</dt>
                        <dd>{number.format(total.protein)} g</dd>
                      </div>
                      <div>
                        <dt>Carbs</dt>
                        <dd>{number.format(total.carbs)} g</dd>
                      </div>
                      <div>
                        <dt>Fat</dt>
                        <dd>{number.format(total.fat)} g</dd>
                      </div>
                    </dl>
                  </div>
                  <table className="mp-client-food-table">
                    <caption className="mp-library-food-caption">
                      Foods & portions
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Food</th>
                        <th scope="col">Portion</th>
                        <th scope="col">kcal</th>
                        <th scope="col">Protein (g)</th>
                        <th scope="col">Carbs (g)</th>
                        <th scope="col">Fat (g)</th>
                      </tr>
                    </thead>
                    {selected.meal.portions.map((portion, index) => {
                      const food = foodMap.get(portion.foodId);
                      const nutrients =
                        food &&
                        calculatePortionNutrients(food, portion.quantity);
                      return (
                        <tbody
                          className="mp-client-food-group"
                          // biome-ignore lint/suspicious/noArrayIndexKey: read-only stored portions have no IDs and can repeat foods
                          key={`${portion.foodId}-${index}`}
                        >
                          <tr className="mp-client-food-row">
                            <th scope="row" className="mp-client-food-name">
                              {food?.name ?? "Unavailable food"}
                            </th>
                            <td className="mp-client-food-portion">
                              <span className="mp-client-quantity">
                                {number.format(portion.quantity)}{" "}
                                <span>{food?.unit ?? ""}</span>
                              </span>
                            </td>
                            <td data-label="kcal">
                              {nutrients
                                ? calories.format(nutrients.calories)
                                : "—"}
                            </td>
                            <td data-label="Protein (g)">
                              {nutrients
                                ? number.format(nutrients.protein)
                                : "—"}
                            </td>
                            <td data-label="Carbs (g)">
                              {nutrients ? number.format(nutrients.carbs) : "—"}
                            </td>
                            <td data-label="Fat (g)">
                              {nutrients ? number.format(nutrients.fat) : "—"}
                            </td>
                          </tr>
                          {portion.swaps?.map((swap, swapIndex) => {
                            const alternative = foodMap.get(swap.foodId);
                            return (
                              <tr
                                className="mp-client-swap-row"
                                // biome-ignore lint/suspicious/noArrayIndexKey: read-only alternatives have no IDs and can repeat foods
                                key={`${swap.foodId}-${swapIndex}`}
                              >
                                <th scope="row">
                                  <span className="mp-client-swap-branch">
                                    <span className="mp-client-swap-label">
                                      Or
                                    </span>
                                    <span className="mp-client-swap-name">
                                      {alternative?.name ?? "Unavailable food"}
                                      {swap.note && (
                                        <small className="mp-library-swap-note">
                                          {swap.note}
                                        </small>
                                      )}
                                    </span>
                                  </span>
                                </th>
                                <td>
                                  <span className="mp-client-quantity">
                                    {number.format(swap.quantity)}{" "}
                                    <span>{alternative?.unit ?? ""}</span>
                                  </span>
                                </td>
                                <td colSpan={4} />
                              </tr>
                            );
                          })}
                        </tbody>
                      );
                    })}
                  </table>
                  {!selected.meal.portions.length && (
                    <p className="mp-library-empty">
                      This saved meal has no foods.
                    </p>
                  )}
                </>
              ) : (
                <div className="mp-library-empty-detail">
                  <BookOpen size={24} strokeWidth={1.3} aria-hidden="true" />
                  <h3>
                    {meals.length
                      ? "No meals found"
                      : "Build your meal library"}
                  </h3>
                  <p>
                    {meals.length
                      ? "Try another meal name or food."
                      : "Use the save icon on a meal in your plan to keep its foods, portions, and alternatives here."}
                  </p>
                  {query && (
                    <button
                      type="button"
                      className="mp-button"
                      onClick={() => setQuery("")}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
