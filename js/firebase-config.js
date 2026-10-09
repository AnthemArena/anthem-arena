// ========================================
// FIREBASE CONFIGURATION
// League Music Tournament
// ========================================

// Import Firebase (using CDN - no npm needed)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
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
// Sign visitors in anonymously so Firestore can securely identify them.
// Only when nobody is signed in: calling signInAnonymously() while a real
// account (the admin's email login) is active would silently replace it.
let anonymousSignInStarted = false;

onAuthStateChanged(auth, user => {
    if (user) {
        anonymousSignInStarted = false;

        // Visitors only. The admin's uid must never become a voter identity.
        if (user.isAnonymous) {
            localStorage.setItem('tournamentUserId', user.uid);
            localStorage.setItem('userId', user.uid);

            console.log('✅ Anonymous Firebase user:', user.uid);
        }
        return;
    }

    if (anonymousSignInStarted) return;
    anonymousSignInStarted = true;

    signInAnonymously(auth).catch(error => {
        anonymousSignInStarted = false;
        console.error('❌ Anonymous Firebase sign-in failed:', error);
    });
});

console.log('✅ Firebase connected!');

// ✅ Make available globally for console scripts
window.db = db;
window.auth = auth;

// Make available to other files
export { db, auth };