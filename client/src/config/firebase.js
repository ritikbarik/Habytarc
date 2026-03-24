import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration - YOUR PROJECT
const firebaseConfig = {
  apiKey: "AIzaSyAbPo3M66N6b7IfpdJc3sPIurW3Qtz2X8A",
  authDomain: "habytarc.firebaseapp.com",
  projectId: "habytarc",
  storageBucket: "habytarc.firebasestorage.app",
  messagingSenderId: "33656412218",
  appId: "1:33656412218:web:8841b13700fd10c867bd03",
  measurementId: "G-YLR5724YSM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Auth functions
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signOutUser = () => signOut(auth);

export default app;
