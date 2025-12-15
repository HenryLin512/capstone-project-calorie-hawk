// Expo app.config.js for secrets
module.exports = () => ({
  expo: {
    name: "CalorieHawk",
    slug: "caloriehawk",
    version: "1.0.0",
    owner: "vinhtu27",

    scheme: "caloriehawk",

    android: {
      package: "com.vinhtu27.caloriehawk",
    },

    runtimeVersion: "1.0.0",

    updates: {
      url: "https://u.expo.dev/b4a59533-2248-4d83-8604-77ef484d1287",
      fallbackToCacheTimeout: 0,
    },

    extra: {
      eas: {
        projectId: "b4a59533-2248-4d83-8604-77ef484d1287",
      },
      CLARIFAI_PAT: process.env.CLARIFAI_PAT || "",
      CLARIFAI_API_KEY: process.env.CLARIFAI_API_KEY || "",
    },
  },
});