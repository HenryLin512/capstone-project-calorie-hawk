# CalorieHawk Python Nutrition API

FastAPI server that provides nutrition data lookup for the CalorieHawk mobile app.

## Features

- Nutrition data lookup (calories, protein, fat, carbs)
- Multi-source: CalorieNinjas API → USDA FoodData Central → fallback data
- CORS enabled for mobile app access
- Fast async HTTP requests
- Easy deployment to Render, Railway, or Heroku

## Setup

### 1. Install Python dependencies

```bash
cd python-api
pip install -r requirements.txt
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```
CALORIE_NINJAS_KEY=your_key_here
FDC_API_KEY=your_key_here
```

### 3. Run locally

```bash
# Development with auto-reload
uvicorn main:app --reload

# Production
python main.py
```

Server runs at: http://localhost:8000

## API Endpoints

### `GET /`
Health check and API info

### `GET /health`
Health status (for deployment platforms)

### `GET /nutrition/{food_name}`
Get nutrition data for a food item

**Example:**
```bash
curl http://localhost:8000/nutrition/pizza
```

**Response:**
```json
{
  "calories": 285,
  "protein": 12,
  "fat": 10,
  "carbs": 36,
  "source": "fdc"
}
```

**Sources:**
- `calorieninjas` - CalorieNinjas API
- `fdc` - USDA FoodData Central
- `fallback` - Built-in data
- `none` - No data found

## Deployment

### Render.com (Free)

1. Create new Web Service
2. Connect your GitHub repo
3. Set:
   - **Build Command:** `pip install -r python-api/requirements.txt`
   - **Start Command:** `cd python-api && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (CALORIE_NINJAS_KEY, FDC_API_KEY)

### Railway.app

1. Create new project from GitHub
2. Add `python-api` directory
3. Railway auto-detects Python and runs it
4. Add environment variables in settings

### Docker

```bash
cd python-api
docker build -t caloriehawk-api .
docker run -p 8000:8000 --env-file .env caloriehawk-api
```

## Testing

```bash
# Test health
curl http://localhost:8000/health

# Test nutrition lookup
curl http://localhost:8000/nutrition/apple
curl http://localhost:8000/nutrition/chicken
curl http://localhost:8000/nutrition/pizza
```

## Integration with Expo App

Update `CalorieHawk/utils/nutrition.ts` to call this API instead of directly calling external APIs.

Replace the base URL in production:
```typescript
const API_URL = __DEV__ 
  ? 'http://localhost:8000' 
  : 'https://your-api.render.com';
```

## Tech Stack

- **FastAPI** - Modern Python web framework
- **Uvicorn** - ASGI server
- **httpx** - Async HTTP client
- **Pydantic** - Data validation
