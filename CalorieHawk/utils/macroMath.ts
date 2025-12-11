// utils/macroMath.ts
export type MacroLike = {
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
};

export type MacroTotals = {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

export const ZERO_MACROS: MacroTotals = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

function addOne(acc: MacroTotals, m?: MacroLike | null): MacroTotals {
  if (!m) return acc;
  const n = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return {
    kcal: acc.kcal + n(m.kcal),
    protein_g: acc.protein_g + n(m.protein_g),
    fat_g: acc.fat_g + n(m.fat_g),
    carbs_g: acc.carbs_g + n(m.carbs_g),
  };
}

/** Sum an array of macros (ignores null/undefined values). */
export function sumMacros(list: Array<MacroLike | null | undefined>): MacroTotals {
  return list.reduce(addOne, { ...ZERO_MACROS });
}