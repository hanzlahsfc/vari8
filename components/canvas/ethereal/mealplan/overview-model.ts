import type { Nutrients } from "./model";

export type MacroEnergyShares = Pick<Nutrients, "protein" | "carbs" | "fat">;

/** Macro percentages use the standard 4/4/9 factors, independently of source kcal. */
export function macroEnergyShares(nutrients: Nutrients): MacroEnergyShares {
  const proteinEnergy = Math.max(0, nutrients.protein) * 4;
  const carbsEnergy = Math.max(0, nutrients.carbs) * 4;
  const fatEnergy = Math.max(0, nutrients.fat) * 9;
  const totalEnergy = proteinEnergy + carbsEnergy + fatEnergy;
  if (totalEnergy === 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: proteinEnergy / totalEnergy,
    carbs: carbsEnergy / totalEnergy,
    fat: fatEnergy / totalEnergy,
  };
}
