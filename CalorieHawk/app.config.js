// Expo app.config.js for secrets
module.exports = () => ({
  expo: {
    name: "CalorieHawk",
    slug: "caloriehawk",
    version: "1.0.0",
    extra: {
      // Prefer PAT for accessing Clarifai public models (clarifai/main)
      CLARIFAI_PAT: process.env.CLARIFAI_PAT || "",
      // Keep API key fallbacks for compatibility
      CLARIFAI_API_KEY: process.env.CLARIFAI_API_KEY || process.env.CLEARIFAI_API_KEY || "",
      // Nutrition APIs (optional)
      CALORIE_NINJAS_KEY: process.env.CALORIE_NINJAS_KEY || "",
      FDC_API_KEY: process.env.FDC_API_KEY || "",
    },
  },
});
