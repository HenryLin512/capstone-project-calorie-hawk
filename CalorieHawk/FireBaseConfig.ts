// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
//import { getAnalytics } from "firebase/analytics"; not needed right now for project purposees, may cause runtime issue 
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDpSMeNBp63LpVW0g7qAoR71PevHV4nbLI",
  authDomain: "caloriehawk-175bc.firebaseapp.com",
  projectId: "caloriehawk-175bc",
  storageBucket: "caloriehawk-175bc.firebasestorage.app",
  messagingSenderId: "872994424947",
  appId: "1:872994424947:web:91b2ec351c8f63d6568206",
  measurementId: "G-Z6GEPPK3Q4"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) });

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

export { app };
