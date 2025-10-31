// ========================================
// FIREBASE CONFIGURATION
// League Music Tournament
// ========================================

// Import Firebase (using CDN - no npm needed)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Your Firebase configuration (copied from Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyAZQSdl61UVgKwDz6QlCf-a4hB_QVDvQqc",
  authDomain: "league-music-tournament.firebaseapp.com",
  projectId: "league-music-tournament",
  storageBucket: "league-music-tournament.firebasestorage.app",
  messagingSenderId: "234217265735",
  appId: "1:234217265735:web:0be63d3829a251df57af62",
  measurementId: "G-73LGE8D3QQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log('✅ Firebase connected!');

// Make available to other files
export { db };
