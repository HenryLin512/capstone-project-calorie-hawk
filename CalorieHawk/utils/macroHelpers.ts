// utils/macroHelpers.ts
import type { MacroServiceResponse } from './macros';

export type MacroSnap = {
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
};

// Portion we ask the macro API for (in grams).
export const ESTIMATE_PORTION_GRAMS = 200;

/** Map broad names like "mango" -> "mango, raw" so the backend picks the fresh version. */
export function normalizeFoodQuery(raw: string): string {
  const n = raw.toLowerCase();

  if (n.includes('mango')) {
    return 'mango, raw';
  }
  if (n.includes('apple')) {
    return 'apple, raw, with skin';
  }
  // You can add more mappings here:
  // if (n.includes('banana')) return 'banana, raw';
  // if (n.includes('orange')) return 'oranges, raw';

  return raw;
}

/**
 * Try to pick a usable macro snapshot out of whatever shape the server returns.
 * We look in:
 *   - res.scaled_per_grams
 *   - res.per_100g
 *   - res (top-level)
 */
export function pickMacroSnapshot(
  res: MacroServiceResponse | null | undefined
): MacroSnap | null {
  if (!res) return null;

  const candidates: any[] = [
    (res as any).scaled_per_grams,
    (res as any).per_100g,
    res,
  ];

  for (const c of candidates) {
    if (!c) continue;
    const { kcal, protein_g, fat_g, carbs_g } = c;

    const hasAny = [kcal, protein_g, fat_g, carbs_g].some(
      (x) => typeof x === 'number' && Number.isFinite(x)
    );
    if (!hasAny) continue;

    const safe = (x: any): number | null =>
      typeof x === 'number' && Number.isFinite(x) ? x : null;

    return {
      kcal: safe(kcal),
      protein_g: safe(protein_g),
      fat_g: safe(fat_g),
      carbs_g: safe(carbs_g),
    };
  }

  return null;
}
