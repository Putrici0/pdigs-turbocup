import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC6yWzFAhInaVwYKXSKla2rna1UK2Rnwwk",
  authDomain: "turbocup-77c28.firebaseapp.com",
  projectId: "turbocup-77c28",
  storageBucket: "turbocup-77c28.firebasestorage.app",
  messagingSenderId: "749477364801",
  appId: "1:749477364801:web:a6f85d6d6c42ac56bd32c0"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
