"""
Test script for CalorieHawk Nutrition API
Run: python test_api.py
"""
import httpx
import asyncio

API_URL = "http://localhost:8000"

async def test_api():
    """Test the nutrition API endpoints"""
    async with httpx.AsyncClient() as client:
        # Test health
        print("Testing health endpoint...")
        response = await client.get(f"{API_URL}/health")
        print(f"✓ Health: {response.json()}\n")
        
        # Test various foods
        foods = ["pizza", "apple", "chicken", "banana", "nonexistent_food"]
        
        for food in foods:
            print(f"Testing: {food}")
            response = await client.get(f"{API_URL}/nutrition/{food}")
            data = response.json()
            
            if data["source"] != "none":
                print(f"  Calories: {data.get('calories', 'N/A')} kcal")
                print(f"  Protein: {data.get('protein', 'N/A')} g")
                print(f"  Fat: {data.get('fat', 'N/A')} g")
                print(f"  Carbs: {data.get('carbs', 'N/A')} g")
                print(f"  Source: {data['source']}")
            else:
                print(f"  ✗ No data found")
            print()

if __name__ == "__main__":
    print("CalorieHawk Nutrition API Test\n")
    print(f"API URL: {API_URL}")
    print("=" * 50 + "\n")
    asyncio.run(test_api())
