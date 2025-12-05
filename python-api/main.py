"""
CalorieHawk Nutrition API
FastAPI server that provides nutrition data for food items.
Queries CalorieNinjas and USDA FoodData Central APIs.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
from typing import Optional

app = FastAPI(
    title="CalorieHawk Nutrition API",
    description="Nutrition data lookup service",
    version="1.0.0"
)

# CORS - allow requests from Expo app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your app's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API keys from environment
CALORIE_NINJAS_KEY = os.getenv("CALORIE_NINJAS_KEY", "")
FDC_API_KEY = os.getenv("FDC_API_KEY", "")

# Response model
class NutritionResponse(BaseModel):
    calories: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None
    source: str  # 'calorieninjas', 'fdc', 'fallback', 'none'

# Fallback data
FALLBACK_MAP = {
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


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "CalorieHawk Nutrition API",
        "status": "running",
        "endpoints": {
            "nutrition": "/nutrition/{food_name}",
            "health": "/health"
        }
    }


@app.get("/health")
async def health():
    """Health check for deployment platforms"""
    return {"status": "healthy"}


@app.get("/nutrition/{food_name}", response_model=NutritionResponse)
async def get_nutrition(food_name: str):
    """
    Get nutrition information for a food item.
    
    Tries CalorieNinjas API first, then USDA FDC, then fallback data.
    """
    query = food_name.lower().strip()
    
    if not query:
        raise HTTPException(status_code=400, detail="Food name cannot be empty")
    
    # Try CalorieNinjas
    if CALORIE_NINJAS_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://api.calorieninjas.com/v1/nutrition?query={query}",
                    headers={"X-Api-Key": CALORIE_NINJAS_KEY}
                )
                if response.status_code == 200:
                    data = response.json()
                    items = data.get("items", [])
                    if items:
                        item = items[0]
                        return NutritionResponse(
                            calories=item.get("calories"),
                            protein=item.get("protein_g"),
                            fat=item.get("fat_total_g"),
                            carbs=item.get("carbohydrates_total_g"),
                            source="calorieninjas"
                        )
        except Exception as e:
            print(f"CalorieNinjas error: {e}")
    
    # Try USDA FoodData Central
    if FDC_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://api.nal.usda.gov/fdc/v1/foods/search",
                    params={
                        "query": query,
                        "pageSize": 1,
                        "api_key": FDC_API_KEY
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    foods = data.get("foods", [])
                    if foods:
                        food = foods[0]
                        nutrients = food.get("foodNutrients", [])
                        
                        def find_nutrient(code: str) -> Optional[float]:
                            for n in nutrients:
                                if n.get("nutrientNumber") == code:
                                    val = n.get("value")
                                    return float(val) if val is not None else None
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
                                source="fdc"
                            )
        except Exception as e:
            print(f"FDC error: {e}")
    
    # Fallback to static data
    if query in FALLBACK_MAP:
        fb = FALLBACK_MAP[query]
        return NutritionResponse(
            calories=fb["calories"],
            protein=fb["protein"],
            fat=fb["fat"],
            carbs=fb["carbs"],
            source="fallback"
        )
    
    # Nothing found
    return NutritionResponse(source="none")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
