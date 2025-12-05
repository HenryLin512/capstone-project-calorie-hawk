import Constants from 'expo-constants';

type ConceptCalorie = number | null;

export type NutritionInfo = {
  calories?: number;
  protein?: number;   // grams
  fat?: number;       // grams
  carbs?: number;     // grams
  source: 'calorieninjas' | 'fdc' | 'fallback' | 'none';
};

const EXPO_EXTRA: any = (Constants as any).expoConfig?.extra ?? (Constants as any).manifest?.extra;
const CALORIE_NINJAS_KEY: string | undefined =
  process.env.CALORIE_NINJAS_KEY || EXPO_EXTRA?.CALORIE_NINJAS_KEY;
const FDC_API_KEY: string | undefined = process.env.FDC_API_KEY || EXPO_EXTRA?.FDC_API_KEY;

// Python API URL - use localhost in dev, deployed URL in production
const PYTHON_API_URL = __DEV__ 
  ? 'http://localhost:8000' 
  : (EXPO_EXTRA?.PYTHON_API_URL || 'http://localhost:8000');

const FALLBACK_MAP: Record<string, { calories: number; protein: number; fat: number; carbs: number }> = {
  banana: { calories: 105, protein: 1, fat: 0, carbs: 27 },
  apple: { calories: 95, protein: 0, fat: 0, carbs: 25 },
  orange: { calories: 62, protein: 1, fat: 0, carbs: 15 },
  egg: { calories: 78, protein: 6, fat: 5, carbs: 1 },
  rice: { calories: 206, protein: 4, fat: 0, carbs: 45 },
  bread: { calories: 80, protein: 3, fat: 1, carbs: 15 },
  yogurt: { calories: 149, protein: 8, fat: 8, carbs: 11 },
  chicken: { calories: 231, protein: 43, fat: 5, carbs: 0 },
  beef: { calories: 250, protein: 26, fat: 15, carbs: 0 },
  milk: { calories: 122, protein: 8, fat: 5, carbs: 12 },
  pizza: { calories: 285, protein: 12, fat: 10, carbs: 36 },
};

export async function fetchCaloriesForFood(name: string): Promise<ConceptCalorie> {
  const info = await fetchNutritionForFood(name);
  return info.calories ?? null;
}

export async function fetchNutritionForFood(name: string): Promise<NutritionInfo> {
  const q = (name || '').toLowerCase().trim();
  if (!q) return { source: 'none' };

  // Try Python API first (if running)
  try {
    const resp = await fetch(`${PYTHON_API_URL}/nutrition/${encodeURIComponent(q)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (resp.ok) {
      const data: any = await resp.json();
      if (data.source !== 'none') {
        return {
          calories: data.calories,
          protein: data.protein,
          fat: data.fat,
          carbs: data.carbs,
          source: data.source,
        };
      }
    }
  } catch (e) {
    // Python API not available, fall back to direct API calls
    console.log('Python API unavailable, using direct API calls');
  }

  // 1) Try CalorieNinjas if key available
  if (CALORIE_NINJAS_KEY) {
    try {
      const resp = await fetch(`https://api.calorieninjas.com/v1/nutrition?query=${encodeURIComponent(q)}`, {
        headers: { 'X-Api-Key': CALORIE_NINJAS_KEY },
      });
      if (resp.ok) {
        const json: any = await resp.json();
        const item = Array.isArray(json?.items) ? json.items[0] : null;
        if (item) {
          const calories = num(item.calories);
          const protein = num(item.protein_g);
          const fat = num(item.fat_total_g);
          const carbs = num(item.carbohydrates_total_g);
          if (calories || protein || fat || carbs) {
            return { calories, protein, fat, carbs, source: 'calorieninjas' };
          }
        }
      }
    } catch (_) {}
  }

  // 2) Try USDA FoodData Central (per 100g energy, nutrientNumber 208)
  if (FDC_API_KEY) {
    try {
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&pageSize=1&api_key=${FDC_API_KEY}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data: any = await resp.json();
        const food = data?.foods?.[0];
        const nutrients: any[] = food?.foodNutrients || [];
        const findVal = (code: string) =>
          num(nutrients.find((n) => n?.nutrientNumber === code)?.value);
        const calories = findVal('208'); // Energy (kcal)
        const protein = findVal('203');  // Protein (g)
        const fat = findVal('204');      // Total fat (g)
        const carbs = findVal('205');    // Carbohydrate (g)
        if (calories || protein || fat || carbs) {
          return { calories, protein, fat, carbs, source: 'fdc' };
        }
      }
    } catch (_) {}
  }

  // 3) Fallback simple mapping
  const fb = FALLBACK_MAP[q];
  if (fb) {
    return { ...fb, source: 'fallback' };
  }

  return { source: 'none' };
}

function num(v: any): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}
