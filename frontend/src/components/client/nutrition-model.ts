export type Macro = {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type MacroKcal = {
  value: number | null;
  complete: boolean;
};

// 4 kcal per gram of protein or carbs, 9 per gram of fat. A null macro means
// not recorded: it contributes nothing and makes the result incomplete. The
// value is null only when nothing at all was recorded.
export function macroKcal(macro: Macro): MacroKcal {
  const recorded =
    macro.protein !== null || macro.carbs !== null || macro.fat !== null;
  if (!recorded) return { value: null, complete: false };
  const value =
    4 * (macro.protein ?? 0) + 4 * (macro.carbs ?? 0) + 9 * (macro.fat ?? 0);
  return {
    value,
    complete:
      macro.protein !== null && macro.carbs !== null && macro.fat !== null,
  };
}
