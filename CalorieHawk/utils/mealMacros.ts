// utils/mealMacros.ts
import { ZERO_MACROS, type MacroTotals } from './macroMath';
import type { MacroSnap } from './macroHelpers';

export type MacroEntryLike = {
  kcal: number;
  macros?: MacroSnap & { basis?: string };
};

/**
 * Sum macros across entries (saved ones only),
 * respecting Add/Subtract via the sign of entry.kcal.
 */
export function sumEntriesMacros(entries: MacroEntryLike[]): MacroTotals {
  return entries.reduce<MacroTotals>(
    (acc, e) => {
      if (!e.macros) return acc;
      const sign = e.kcal >= 0 ? 1 : -1;
      acc.kcal      += sign * (e.macros.kcal      ?? 0);
      acc.protein_g += sign * (e.macros.protein_g ?? 0);
      acc.fat_g     += sign * (e.macros.fat_g     ?? 0);
      acc.carbs_g   += sign * (e.macros.carbs_g   ?? 0);
      return acc;
    },
    { ...ZERO_MACROS }
  );
}

/** Split one meal's kcal target into macro gram goals using 50/25/25. */
export function perMealGoals(kcalTarget: number) {
  const carbs_g   = (kcalTarget * 0.50) / 4;
  const protein_g = (kcalTarget * 0.25) / 4;
  const fat_g     = (kcalTarget * 0.25) / 9;
  return { carbs_g, protein_g, fat_g };
}

/** Round to 1 decimal; treat null/NaN as 0 for display. */
export function round1(n?: number | null) {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.round(n * 10) / 10;
}
