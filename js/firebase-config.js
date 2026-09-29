// ========================================
// FIREBASE CONFIGURATION
// League Music Tournament
// ========================================

// Import Firebase (using CDN - no npm needed)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';  // ← ADD THIS LINE

// Your Firebase configuration (copied from Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyCApnc605mPNOEsAcVnKeXbBTokk7iZP5E",
  authDomain: "arcane-moments.firebaseapp.com",
  projectId: "arcane-moments",
  storageBucket: "arcane-moments.firebasestorage.app",
  messagingSenderId: "466299671653",
  appId: "1:466299671653:web:8fff3cfed266c69b66228c",
  measurementId: "G-P2EJRS5RJ0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

console.log('✅ Firebase connected!');

// ✅ Make available globally for console scripts
window.db = db;
window.auth = auth;

// Make available to other files
export { db, auth };