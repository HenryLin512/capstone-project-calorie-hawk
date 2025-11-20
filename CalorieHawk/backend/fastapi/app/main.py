# backend/fastapi/app/main.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Dict, Optional, Tuple, List, Union
import os
import asyncio
import httpx

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

APP_TITLE = "CalorieHawk Macro Service"
APP_VERSION = "0.2.3"

app = FastAPI(title=APP_TITLE, version=APP_VERSION)

# --- CORS (dev-friendly; tighten in prod) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        # "exp://*",   # Expo dev schemes don't count as origins; keep "*" if you need broad dev access:
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Config / constants ---
FDC_API_KEY = os.getenv("FDC_API_KEY")  # set via:  set FDC_API_KEY=...  (Windows CMD)  or  $Env:FDC_API_KEY="..." (PowerShell)
FDC_BASE = "https://api.nal.usda.gov/fdc/v1"
PREFERRED_TYPES = ["Foundation", "SR Legacy", "Branded"]  # fallback order


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
                # Treat 5xx as retryable
                last_err = HTTPException(status_code=502, detail=f"USDA 5xx ({resp.status_code})")
            else:
                resp.raise_for_status()
                return resp.json()

        except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as e:
            # typical transient network problems
            last_err = e

        except httpx.HTTPStatusError as e:
            # Non-retryable 4xx, etc.
            raise HTTPException(status_code=e.response.status_code, detail=f"USDA API error {e.response.status_code}")

        # exponential backoff before retry
        await asyncio.sleep(backoff_base * (2 ** attempt))

    if isinstance(last_err, (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError)):
        raise HTTPException(status_code=503, detail=f"Network/DNS error contacting USDA after retries: {last_err!s}")
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
            return float(val) if val is not None else None
        return None

    return {
        "kcal": pick("calories"),
        "protein_g": pick("protein"),
        "fat_g": pick("fat"),
        "carbs_g": pick("carbohydrates"),
    }


def _extract_from_food_nutrients(detail: Dict[str, Any]) -> Dict[str, Optional[float]]:
    nums: Dict[str, float] = {}
    for n in detail.get("foodNutrients", []) or []:
        nutrient = n.get("nutrient") or {}
        number = nutrient.get("number")
        amount = n.get("amount")
        if number and amount is not None:
            try:
                nums[number] = float(amount)
            except Exception:
                pass
    # FDC standard nutrient numbers
    return {
        "kcal": nums.get("1008"),
        "protein_g": nums.get("1003"),
        "fat_g": nums.get("1004"),
        "carbs_g": nums.get("1005"),
    }


def _merge_nutrient_sources(detail: Dict[str, Any]) -> Dict[str, Optional[float]]:
    a = _extract_from_label_nutrients(detail)
    b = _extract_from_food_nutrients(detail)
    out: Dict[str, Optional[float]] = {}
    for k in ("kcal", "protein_g", "fat_g", "carbs_g"):
        out[k] = a.get(k) if a.get(k) is not None else b.get(k)
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


def _per_100g(n: Dict[str, Optional[float]], grams_basis: Optional[float]) -> Dict[str, Optional[float]]:
    if not grams_basis or grams_basis <= 0:
        return {k: None for k in ("kcal", "protein_g", "fat_g", "carbs_g")}
    f = 100.0 / grams_basis
    return {k: (round(v * f, 3) if v is not None else None) for k, v in n.items()}


def _scaled(n: Dict[str, Optional[float]], grams: float, grams_basis: Optional[float]) -> Dict[str, Optional[float]]:
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
    return {"service": APP_TITLE, "version": APP_VERSION}


@app.get("/health")
def health() -> Dict[str, bool]:
    return {"ok": True}


@app.get("/macros")
async def macros(
    query: str = Query(..., min_length=1),
    grams: float = Query(154.0, gt=0),
    include_survey: bool = Query(False),
):
    if not FDC_API_KEY:
        raise HTTPException(500, "FDC_API_KEY not set")

    # Build search params as a list of tuples (order preserved)
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

    # httpx timeout (single float ⇒ both connect/read)
    timeout = httpx.Timeout(15.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        # Search
        s_json = await fetch_json(client, f"{FDC_BASE}/foods/search", params=params_list)
        foods = s_json.get("foods") or []
        if not foods:
            raise HTTPException(404, f"No FDC foods for '{query}'")

        # Rank: prefer Foundation → SR Legacy → Branded, then more nutrients, then higher score
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

        # Pick the first candidate that yields some macro numbers
        for cand in foods_sorted:
            fdc_id = cand.get("fdcId")
            if not fdc_id:
                continue
            d_json = await fetch_json(client, f"{FDC_BASE}/food/{fdc_id}", params={"api_key": FDC_API_KEY})
            n = _merge_nutrient_sources(d_json)
            if any(n.get(k) is not None for k in ("kcal", "protein_g", "fat_g", "carbs_g")):
                chosen, detail = cand, d_json
                break

        # If none produced macros, at least return the first detail
        if detail is None:
            fdc_id = foods_sorted[0].get("fdcId")
            d_json = await fetch_json(client, f"{FDC_BASE}/food/{fdc_id}", params={"api_key": FDC_API_KEY})
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
