// ========================================
// ONE-TIME SETUP FOR SOCIAL FEATURES
// Run this once to initialize your user data
// ========================================

import { db } from './firebase-config.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

async function setupCurrentUser() {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        const avatarJson = localStorage.getItem('avatar');
        
        if (!userId) {
            console.log('❌ No user ID found. Vote first to create a user.');
            return;
        }
        
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '👤' };
        }
        
        // Check if user doc already exists
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            console.log('✅ User document already exists');
            return;
        }
        
        // Create user document with social fields
        await setDoc(userDocRef, {
            userId: userId,
            username: username || 'Anonymous',
            avatar: avatar,
            following: [],
            followers: [],
            createdAt: new Date(),
            lastActive: new Date()
        });
        
        console.log('✅ User document created successfully!');
        console.log('👤 User ID:', userId);
        console.log('📝 Username:', username);
        
    } catch (error) {
        console.error('❌ Setup error:', error);
    }
}

// Auto-run on page load
document.addEventListener('DOMContentLoaded', () => {
    const setupBtn = document.createElement('button');
    setupBtn.textContent = '🚀 Initialize Social Features';
    setupBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        padding: 15px 25px;
        background: linear-gradient(135deg, #C8AA6E, #a88a4d);
        color: black;
        border: none;
        border-radius: 25px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(200, 170, 110, 0.4);
    `;
    
    setupBtn.addEventListener('click', async () => {
        setupBtn.textContent = '⏳ Setting up...';
        setupBtn.disabled = true;
        
        await setupCurrentUser();
        
        setupBtn.textContent = '✅ Setup Complete!';
        setTimeout(() => {
            setupBtn.remove();
        }, 2000);
    });
    
    document.body.appendChild(setupBtn);
});

export { setupCurrentUser };