// FireBaseConfig.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import * as Auth from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// --- Firebase configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDpSMeNBp63LpVW0g7qAoR71PevHV4nbLI",
  authDomain: "caloriehawk-175bc.firebaseapp.com",
  projectId: "caloriehawk-175bc",
  storageBucket: "caloriehawk-175bc.firebasestorage.app",
  messagingSenderId: "872994424947",
  appId: "1:872994424947:web:91b2ec351c8f63d6568206",
  measurementId: "G-Z6GEPPK3Q4",
};

// --- Initialize app (avoid re-init) ---
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// --- Create platform-aware Auth without importing RN subpath on web ---
function createAuth(app: FirebaseApp): Auth.Auth {
  if (Platform.OS === "web") {
    const auth = Auth.getAuth(app);
    // Prefer durable web persistence; fall back safely
    const webPersistence =
      // some builds expose indexedDBLocalPersistence more reliably than browserLocalPersistence
      (Auth as any).indexedDBLocalPersistence ??
      (Auth as any).browserLocalPersistence ??
      Auth.inMemoryPersistence;

    Auth.setPersistence(auth, webPersistence).catch((e) =>
      console.warn("Web auth persistence setup failed:", e)
    );
    return auth;
  }

  // Native (iOS/Android): require the RN helper *only* here so web bundler never sees it
  let getReactNativePersistence: ((storage: any) => any) | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getReactNativePersistence =
      require("firebase/auth/react-native").getReactNativePersistence;
  } catch {
    console.warn(
      "firebase/auth/react-native not found. Falling back to inMemoryPersistence."
    );
  }

  const nativePersistence = getReactNativePersistence
    ? getReactNativePersistence(AsyncStorage)
    : Auth.inMemoryPersistence;

  return Auth.initializeAuth(app, { persistence: nativePersistence });
}

const auth = createAuth(app);

// Shared Firebase services
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };