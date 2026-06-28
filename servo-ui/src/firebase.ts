import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "molecules-8487f.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "molecules-8487f",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "molecules-8487f.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "790999546979",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:790999546979:web:45674825f427711f474c56",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4SRH525ZFY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
