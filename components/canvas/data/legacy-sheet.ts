// Legacy-sheet domain provider (card 12). Owns the sheet-side projections the
// dialog persists per client: the NutritionLog macro actuals it edits (the
// three nullable fields of card 09's NutritionLog, hydrated from the staff
// range read when a workspace resolves) and the TIMELINE W:Y week stamps
// `applyWeekTargets` writes on the "Update Timeline" click. Same standalone
// storage pattern as `coaching-mealplans-v1` in nutrition.ts.

import { readStorage, writeJson } from "./provider";

export const LEGACY_SHEET_KEY = "coach-data-legacy-sheet-v1";

export type SheetMacroValues = {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

export type SheetStore = {
  /** clientId -> "yyyy-mm-dd" -> NutritionLog macro actuals. */
  macros: Record<string, Record<string, SheetMacroValues>>;
  /** clientId -> week-start "yyyy-mm-dd" -> stamped [high, medium, low]. */
  weekTargets: Record<string, Record<string, [number, number, number]>>;
};

const EMPTY: SheetStore = { macros: {}, weekTargets: {} };

export function loadSheetStore(): SheetStore {
  const raw = readStorage(LEGACY_SHEET_KEY);
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<SheetStore>;
    return {
      macros:
        parsed.macros && typeof parsed.macros === "object" ? parsed.macros : {},
      weekTargets:
        parsed.weekTargets && typeof parsed.weekTargets === "object"
          ? parsed.weekTargets
          : {},
    };
  } catch {
    return EMPTY;
  }
}

export function saveSheetStore(store: SheetStore): void {
  writeJson(LEGACY_SHEET_KEY, store);
}

export function readSheetMacros(
  clientId: string,
): Record<string, SheetMacroValues> {
  return loadSheetStore().macros[clientId] ?? {};
}

/** One write per edited macro cell; `null` keeps the field unrecorded. */
export function writeSheetMacro(
  clientId: string,
  date: string,
  field: keyof SheetMacroValues,
  value: number | null,
): SheetStore {
  const store = loadSheetStore();
  const day = store.macros[clientId]?.[date] ?? {
    protein: null,
    carbohydrate: null,
    fat: null,
  };
  const next = { ...day, [field]: value };
  store.macros = {
    ...store.macros,
    [clientId]: { ...store.macros[clientId], [date]: next },
  };
  saveSheetStore(store);
  return store;
}

export function readWeekTargets(
  clientId: string,
): Record<string, [number, number, number]> {
  return loadSheetStore().weekTargets[clientId] ?? {};
}

/** W:Y stamp for one timeline week row; only `applyWeekTargets` calls this. */
export function writeWeekTargets(
  clientId: string,
  weekStart: string,
  values: [number, number, number],
): SheetStore {
  const store = loadSheetStore();
  store.weekTargets = {
    ...store.weekTargets,
    [clientId]: { ...store.weekTargets[clientId], [weekStart]: values },
  };
  saveSheetStore(store);
  return store;
}
