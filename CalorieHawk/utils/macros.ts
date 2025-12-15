// utils/macros.ts
// FastAPI -> CalorieHawk Macro Service client
// - Platform-aware base URL selection (iOS/Android/device)
// - Supports EXPO_PUBLIC_MACRO_API and app.config extra.MACRO_API_BASE
// - 12s timeout with AbortController
// - Tiny in-memory cache by (query, grams, includeSurvey)
// - Exposes getMacros / tryGetMacros and a compatibility fetchMacros()
// - Types for strong TS usage

import { Platform } from "react-native";
//import Constants from "expo-constants";

/* ----------------------------- Types ----------------------------- */

export type MacroNutrients = {
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
};

export type MacroServiceResponse = {
  query: string;
  fdcId: number | null;
  description?: string | null;
  dataType?: string | null;
  brandOwner?: string | null;
  per_100g: MacroNutrients;
  scaled_per_grams: MacroNutrients;
  servingSize?: number | null;
  servingSizeUnit?: string | null;
  debug?: Record<string, unknown>;
};

export type GetMacrosOptions = {
  grams?: number;           // scale to this many grams (server defaults to 154)
  includeSurvey?: boolean;  // include FNDDS fallbacks
  timeoutMs?: number;       // request timeout (default 12s)
  baseUrlOverride?: string; // override base URL per-call
  signal?: AbortSignal;     // optional external cancel signal
};

/* ----------------------- Base URL Selection ---------------------- */

/*function pickBase(): string {
  // Prefer EXPO_PUBLIC_* at build/runtime (Expo EAS / env)
  const envBase =
    (process?.env?.EXPO_PUBLIC_MACRO_API as string) ||
    process?.env?.MACRO_API_BASE;
  if (envBase) return envBase.replace(/\/+$/, "");

  // Fallback to app.json/app.config.ts -> extra.MACRO_API_BASE if set
  //const extra = (Constants.expoConfig?.extra as any) ?? {};
  const extra =
  Constants.expoConfig?.extra ??
  (Constants.manifest as any)?.extra ??
  {};

  if (extra.MACRO_API_BASE)
    return String(extra.MACRO_API_BASE).replace(/\/+$/, "");

  // Last-resort device/simulator defaults (edit the IP for your LAN!)
  // iOS simulator can hit host via localhost
  if (Platform.OS === "ios") return "http://localhost:8000";

  // Android emulator uses 10.0.2.2 to reach host machine
  if (Platform.OS === "android") return "http://10.0.2.2:8000";

  // Physical devices on same Wi-Fi need your machine’s LAN IP
  return "http://local:8000"; // ← change to your machine’s LAN IP if testing on device
}*/

//let BASE_URL = pickBase();
let BASE_URL = "https://capstone-project-calorie-hawk.onrender.com";
export function setMacroApiBase(url: string) {
  BASE_URL = url.replace(/\/+$/, "");
}

/* -------------------------- Mini Cache --------------------------- */

type CacheKey = string;
const cache = new Map<CacheKey, MacroServiceResponse>();
const MAX_CACHE = 100;

function makeKey(
  q: string,
  grams: number | undefined,
  includeSurvey: boolean
): CacheKey {
  return `${q.toLowerCase().trim()}|g=${grams ?? -1}|s=${
    includeSurvey ? 1 : 0
  }`;
}
function putCache(k: CacheKey, v: MacroServiceResponse) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(k, v);
}

/* --------------------------- Helpers ----------------------------- */

function withTimeout(ms: number): AbortController {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  // @ts-ignore attach for cleanup
  controller.__timeoutId = id;
  return controller;
}

function mergeSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

/**
 * Accept numbers OR numeric strings from the backend.
 * Anything non-numeric becomes null.
 */
function roundOrNull(v: unknown, digits = 2): number | null {
  if (v === null || v === undefined) return null;

  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.trim())
      : Number(v);

  if (!Number.isFinite(n)) return null;

  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

/* --------------------------- Public API -------------------------- */

export async function getMacros(
  query: string,
  opts: GetMacrosOptions = {}
): Promise<MacroServiceResponse> {
  if (!query || !query.trim()) {
    throw new Error("getMacros: 'query' is required.");
  }

  const grams = typeof opts.grams === "number" ? opts.grams : undefined;
  const includeSurvey = !!opts.includeSurvey;
  const baseUrl = (opts.baseUrlOverride || BASE_URL).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 12_000;

  // cache check
  const key = makeKey(query, grams, includeSurvey);
  const cached = cache.get(key);
  if (cached) return cached;

  // build URL
  const url = new URL(`${baseUrl}/macros`);
  url.searchParams.set("query", query.trim());
  if (typeof grams === "number") url.searchParams.set("grams", String(grams));
  if (includeSurvey) url.searchParams.set("include_survey", "true");

  // timeout + optional external signal
  const internal = withTimeout(timeoutMs);
  const signals = [internal.signal].concat(opts.signal ? [opts.signal] : []);
  const signal = mergeSignals(signals);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  }).catch((e) => {
    if ((e as any)?.name === "AbortError")
      throw new Error("Macro service request timed out");
    throw new Error(`Macro service network error: ${(e as Error).message}`);
  });

  clearTimeout((internal as any).__timeoutId);

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail
        ? typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail)
        : "";
    } catch {
      /* ignore */
    }
    const msg = detail
      ? `Macro service error ${res.status}: ${detail}`
      : `Macro service error ${res.status}`;
    throw new Error(msg);
  }

  const json = (await res.json()) as MacroServiceResponse;

  // normalize/round to keep UI tidy (and coerce numeric strings)
  json.per_100g = {
    kcal: roundOrNull(json.per_100g?.kcal, 2),
    protein_g: roundOrNull(json.per_100g?.protein_g, 2),
    fat_g: roundOrNull(json.per_100g?.fat_g, 2),
    carbs_g: roundOrNull(json.per_100g?.carbs_g, 2),
  };
  json.scaled_per_grams = {
    kcal: roundOrNull(json.scaled_per_grams?.kcal, 2),
    protein_g: roundOrNull(json.scaled_per_grams?.protein_g, 2),
    fat_g: roundOrNull(json.scaled_per_grams?.fat_g, 2),
    carbs_g: roundOrNull(json.scaled_per_grams?.carbs_g, 2),
  };

  putCache(key, json);
  return json;
}

export async function tryGetMacros(
  query: string,
  opts: GetMacrosOptions = {}
): Promise<MacroServiceResponse | null> {
  try {
    return await getMacros(query, opts);
  } catch {
    return null;
  }
}

/* --------- Compatibility export for older imports/usages --------- */
// Keeps existing code that calls: fetchMacros(query, grams, includeSurvey?)
export async function fetchMacros(
  query: string,
  grams: number,
  includeSurvey = false
) {
  return getMacros(query, { grams, includeSurvey });
}
