# backend/fastapi/app/main.py
"""
CalorieHawk Macro + Nutrition Service

- /macros: detailed macro data via USDA FDC, including per_100g and scaled_per_grams.
- /nutrition/{food_name}: simple calories/protein/fat/carbs with multi-source fallback
  (CalorieNinjas → USDA FDC → static fallback map).
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, Optional, Tuple, List, Union
import os
import asyncio
import httpx
#import base64

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

APP_TITLE = "CalorieHawk Macro Service"
APP_VERSION = "0.3.0"

app = FastAPI(title=APP_TITLE, version=APP_VERSION)

# --- CORS (dev-friendly; tighten in prod) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "*",  # convenient for Expo dev; restrict in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Config / constants ---
FDC_API_KEY = os.getenv("FDC_API_KEY")
FDC_BASE = "https://api.nal.usda.gov/fdc/v1"
PREFERRED_TYPES = ["Foundation", "SR Legacy", "Branded"]  # fallback order



# Optional extra API
CALORIE_NINJAS_KEY = os.getenv("CALORIE_NINJAS_KEY", "")

# Simple nutrition response model (partner-style)
class NutritionResponse(BaseModel):
    calories: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None
    source: str  # 'calorieninjas', 'fdc', 'fallback', 'none'


# Static fallback map (partner-style)
FALLBACK_MAP: Dict[str, Dict[str, float]] = {
    "banana": {"calories": 105, "protein": 1, "fat": 0, "carbs": 27},
    "apple": {"calories": 95, "protein": 0, "fat": 0, "carbs": 25},
    "orange": {"calories": 62, "protein": 1, "fat": 0, "carbs": 15},
    "egg": {"calories": 78, "protein": 6, "fat": 5, "carbs": 1},
    "rice": {"calories": 206, "protein": 4, "fat": 0, "carbs": 45},
    "bread": {"calories": 80, "protein": 3, "fat": 1, "carbs": 15},
    "yogurt": {"calories": 149, "protein": 8, "fat": 8, "carbs": 11},
    "chicken": {"calories": 231, "protein": 43, "fat": 5, "carbs": 0},
    "beef": {"calories": 250, "protein": 26, "fat": 15, "carbs": 0},
    "milk": {"calories": 122, "protein": 8, "fat": 5, "carbs": 12},
    "pizza": {"calories": 285, "protein": 12, "fat": 10, "carbs": 36},
}


# -------------------- robust HTTP helper (retries) --------------------
async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: Optional[Union[Dict[str, Any], List[tuple]]] = None,
    max_retries: int = 4,
    backoff_base: float = 0.35,
) -> Dict[str, Any]:
    """
    GET JSON with retries on transient network failures & 5xx.
    Backoff: ~0.35s, 0.7s, 1.4s, 2.8s
    """
    last_err: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            resp = await client.get(
                url,
                params=params,
                headers={"User-Agent": "CalorieHawk/0.2"},
            )
            if 500 <= resp.status_code < 600:
                last_err = HTTPException(
                    status_code=502, detail=f"USDA 5xx ({resp.status_code})"
                )
            else:
                resp.raise_for_status()
                return resp.json()

        except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as e:
            last_err = e

        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"USDA API error {e.response.status_code}",
            )

        await asyncio.sleep(backoff_base * (2 ** attempt))

    if isinstance(last_err, (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError)):
        raise HTTPException(
            status_code=503,
            detail=f"Network/DNS error contacting USDA after retries: {last_err!s}",
        )
    if isinstance(last_err, HTTPException):
        raise last_err
    raise HTTPException(status_code=503, detail="Upstream unavailable")


# -------------------- nutrient helpers --------------------
def _extract_from_label_nutrients(detail: Dict[str, Any]) -> Dict[str, Optional[float]]:
    ln = detail.get("labelNutrients") or {}

    def pick(key: str) -> Optional[float]:
        v = ln.get(key)
        if isinstance(v, dict):
            val = v.get("value")
            try:
                return float(val) if val is not None else None
            except Exception:
                return None
        return None

    return {
        "kcal": pick("calories"),
        "protein_g": pick("protein"),
        "fat_g": pick("fat"),
        "carbs_g": pick("carbohydrates"),
    }


def _extract_from_food_nutrients(detail: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """
    Extract kcal / protein / fat / carbs from foodNutrients.

    FDC uses:
      - nutrient["id"]     like 1008, 1003, 1004, 1005
      - nutrient["number"] like "208", "203", "204", "205"

    We support both, preferring IDs.
    """
    nums_by_id: Dict[int, float] = {}
    nums_by_number: Dict[str, float] = {}

    for n in detail.get("foodNutrients", []) or []:
        nutrient = n.get("nutrient") or {}
        nutrient_id = nutrient.get("id")
        number = nutrient.get("number")
        amount = n.get("amount")

        if amount is None:
            continue

        try:
            amt = float(amount)
        except Exception:
            continue

        if nutrient_id is not None:
            try:
                nums_by_id[int(nutrient_id)] = amt
            except Exception:
                pass

        if number:
            nums_by_number[str(number)] = amt

    # Prefer FDC IDs (1008/1003/1004/1005), fall back to numbers (208/203/204/205)
    kcal = nums_by_id.get(1008) or nums_by_number.get("208")
    protein = nums_by_id.get(1003) or nums_by_number.get("203")
    fat = nums_by_id.get(1004) or nums_by_number.get("204")
    carbs = nums_by_id.get(1005) or nums_by_number.get("205")

    return {
        "kcal": kcal,
        "protein_g": protein,
        "fat_g": fat,
        "carbs_g": carbs,
    }


def _merge_nutrient_sources(detail: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """
    Merge labelNutrients + foodNutrients, and if kcal is missing but macros exist,
    approximate kcal from P/C/F:
        kcal ≈ 4 * protein_g + 4 * carbs_g + 9 * fat_g
    """
    a = _extract_from_label_nutrients(detail)
    b = _extract_from_food_nutrients(detail)

    out: Dict[str, Optional[float]] = {}
    for k in ("kcal", "protein_g", "fat_g", "carbs_g"):
        out[k] = a.get(k) if a.get(k) is not None else b.get(k)

    if out.get("kcal") is None:
        p = out.get("protein_g")
        f = out.get("fat_g")
        c = out.get("carbs_g")

        if any(v is not None for v in (p, f, c)):
            safe_p = float(p) if p is not None else 0.0
            safe_f = float(f) if f is not None else 0.0
            safe_c = float(c) if c is not None else 0.0
            approx = 4.0 * safe_p + 4.0 * safe_c + 9.0 * safe_f
            out["kcal"] = round(approx, 3)

    return out


def _serving_info(detail: Dict[str, Any]) -> Tuple[Optional[float], Optional[str]]:
    size = detail.get("servingSize")
    unit = detail.get("servingSizeUnit")
    try:
        size = float(size) if size is not None else None
    except Exception:
        size = None
    unit = str(unit) if unit is not None else None
    return size, unit


def _per_100g(
    n: Dict[str, Optional[float]],
    grams_basis: Optional[float],
) -> Dict[str, Optional[float]]:
    if not grams_basis or grams_basis <= 0:
        return {k: None for k in ("kcal", "protein_g", "fat_g", "carbs_g")}
    f = 100.0 / grams_basis
    return {k: (round(v * f, 3) if v is not None else None) for k, v in n.items()}


def _scaled(
    n: Dict[str, Optional[float]],
    grams: float,
    grams_basis: Optional[float],
) -> Dict[str, Optional[float]]:
    if not grams_basis or grams_basis <= 0:
        return {k: None for k in ("kcal", "protein_g", "fat_g", "carbs_g")}
    f = grams / grams_basis
    return {k: (round(v * f, 3) if v is not None else None) for k, v in n.items()}


def _guess_grams_basis(detail: Dict[str, Any], data_type: str) -> Optional[float]:
    serving_size, _ = _serving_info(detail)
    if data_type == "Branded":
        return serving_size or None
    if data_type in ("Foundation", "SR Legacy"):
        return 100.0
    return serving_size or None


# -------------------- routes --------------------
@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "service": APP_TITLE,
        "version": APP_VERSION,
        "endpoints": {
            "macros": "/macros",
            "nutrition": "/nutrition/{food_name}",
            "health": "/health",
        },
    }


@app.get("/health")
def health() -> Dict[str, bool]:
    return {"ok": True}


@app.get("/macros")
async def macros(
    query: str = Query(..., min_length=1),
    grams: float = Query(154.0, gt=0),
    include_survey: bool = Query(False),
):
    """
    Detailed macro lookup:
    - Returns per_100g and scaled_per_grams
    - Uses USDA FDC with robust ranking & fallback kcal-from-P/C/F
    """
    if not FDC_API_KEY:
        raise HTTPException(500, "FDC_API_KEY not set")

    params_list: List[tuple] = [
        ("api_key", FDC_API_KEY),
        ("query", query),
        ("pageSize", 15),
    ]
    data_types = list(PREFERRED_TYPES)
    if include_survey:
        data_types.append("Survey (FNDDS)")
    for dt in data_types:
        params_list.append(("dataType", dt))

    timeout = httpx.Timeout(15.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        s_json = await fetch_json(
            client, f"{FDC_BASE}/foods/search", params=params_list
        )
        foods = s_json.get("foods") or []
        if not foods:
            raise HTTPException(404, f"No FDC foods for '{query}'")

        def rank_key(it: Dict[str, Any]) -> Tuple[int, int, float]:
            dt = it.get("dataType") or ""
            type_rank = (
                PREFERRED_TYPES.index(dt)
                if dt in PREFERRED_TYPES
                else (len(PREFERRED_TYPES) + (0 if dt == "Survey (FNDDS)" else 1))
            )
            nutrient_count = len(it.get("foodNutrients") or [])
            score = float(it.get("score") or 0.0)
            return (type_rank, -nutrient_count, -score)

        foods_sorted = sorted(foods, key=rank_key)

        chosen: Optional[Dict[str, Any]] = None
        detail: Optional[Dict[str, Any]] = None

        for cand in foods_sorted:
            fdc_id = cand.get("fdcId")
            if not fdc_id:
                continue
            d_json = await fetch_json(
                client,
                f"{FDC_BASE}/food/{fdc_id}",
                params={"api_key": FDC_API_KEY},
            )
            n = _merge_nutrient_sources(d_json)
            if any(n.get(k) is not None for k in ("kcal", "protein_g", "fat_g", "carbs_g")):
                chosen, detail = cand, d_json
                break

        if detail is None:
            fdc_id = foods_sorted[0].get("fdcId")
            d_json = await fetch_json(
                client,
                f"{FDC_BASE}/food/{fdc_id}",
                params={"api_key": FDC_API_KEY},
            )
            chosen, detail = foods_sorted[0], d_json

    data_type = (chosen or {}).get("dataType")
    brand_owner = (chosen or {}).get("brandOwner") or ((detail or {}).get("brandOwner"))
    fdc_id = (chosen or {}).get("fdcId")

    nutrients = _merge_nutrient_sources(detail or {})
    serving_size, serving_unit = _serving_info(detail or {})
    grams_basis = _guess_grams_basis(detail or {}, data_type or "")

    per100 = _per_100g(nutrients, grams_basis)
    scaled = _scaled(nutrients, grams, grams_basis)

    return JSONResponse(
        {
            "query": query,
            "fdcId": fdc_id,
            "description": (detail or {}).get("description"),
            "dataType": data_type,
            "brandOwner": brand_owner,
            "per_100g": per100,
            "scaled_per_grams": scaled,
            "servingSize": serving_size,
            "servingSizeUnit": serving_unit,
            "debug": {
                "chosen_dataType": data_type,
                "grams_basis": grams_basis,
                "used_labelNutrients": bool((detail or {}).get("labelNutrients")),
                "candidate_count": len(foods_sorted),
                "retries_hardened": True,
            },
        }
    )


@app.get("/nutrition/{food_name}", response_model=NutritionResponse)
async def get_nutrition(food_name: str):
    """
    Simple nutrition view (partner-style):
    - Tries CalorieNinjas, then USDA FDC, then static FALLBACK_MAP.
    - Returns calories/protein/fat/carbs + source label.
    """
    query = food_name.lower().strip()
    if not query:
        raise HTTPException(status_code=400, detail="Food name cannot be empty")

    # 1) Try CalorieNinjas if key is set
    if CALORIE_NINJAS_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"https://api.calorieninjas.com/v1/nutrition?query={query}",
                    headers={"X-Api-Key": CALORIE_NINJAS_KEY},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("items", [])
                    if items:
                        item = items[0]
                        return NutritionResponse(
                            calories=item.get("calories"),
                            protein=item.get("protein_g"),
                            fat=item.get("fat_total_g"),
                            carbs=item.get("carbohydrates_total_g"),
                            source="calorieninjas",
                        )
        except Exception as e:
            print(f"CalorieNinjas error: {e}")

    # 2) Try USDA FDC in a simpler way (per-partner)
    if FDC_API_KEY:
        try:
            timeout = httpx.Timeout(10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                search_json = await fetch_json(
                    client,
                    f"{FDC_BASE}/foods/search",
                    params={
                        "query": query,
                        "pageSize": 1,
                        "api_key": FDC_API_KEY,
                    },
                )
                foods = search_json.get("foods", [])
                if foods:
                    food = foods[0]
                    nutrients = food.get("foodNutrients", []) or []

                    def find_nutrient(code: str) -> Optional[float]:
                        for n in nutrients:
                            if n.get("nutrientNumber") == code:
                                val = n.get("value")
                                try:
                                    return float(val) if val is not None else None
                                except Exception:
                                    return None
                        return None

                    calories = find_nutrient("208")  # Energy
                    protein = find_nutrient("203")   # Protein
                    fat = find_nutrient("204")       # Total fat
                    carbs = find_nutrient("205")     # Carbohydrate

                    if any([calories, protein, fat, carbs]):
                        return NutritionResponse(
                            calories=calories,
                            protein=protein,
                            fat=fat,
                            carbs=carbs,
                            source="fdc",
                        )
        except Exception as e:
            print(f"FDC error (nutrition): {e}")

    # 3) Fallback to static map
    if query in FALLBACK_MAP:
        fb = FALLBACK_MAP[query]
        return NutritionResponse(
            calories=fb["calories"],
            protein=fb["protein"],
            fat=fb["fat"],
            carbs=fb["carbs"],
            source="fallback",
        )

    # 4) Nothing found
    return NutritionResponse(source="none")
