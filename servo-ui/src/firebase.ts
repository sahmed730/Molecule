import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBVigsFvpqfzQSeVuEKGJbVdmDQs6Gf1c4",
  authDomain: "molecules-8487f.firebaseapp.com",
  projectId: "molecules-8487f",
  storageBucket: "molecules-8487f.firebasestorage.app",
  messagingSenderId: "790999546979",
  appId: "1:790999546979:web:45674825f427711f474c56",
  measurementId: "G-4SRH525ZFY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
