// ========================================
// MIGRATE EXISTING USERS TO SOCIAL SYSTEM
// Run once to add following/followers arrays
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

async function migrateUsers() {
    try {
        console.log('🔄 Starting user migration...');
        
        // Get all activity records to find unique users
        const activitySnapshot = await getDocs(collection(db, 'activity'));
        const uniqueUsers = new Map();
        
        activitySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.userId && data.username) {
                uniqueUsers.set(data.userId, {
                    userId: data.userId,
                    username: data.username,
                    avatar: data.avatar || { type: 'emoji', value: '🎵' }
                });
            }
        });
        
        console.log(`📊 Found ${uniqueUsers.size} unique users`);
        
        // Create user documents
        let created = 0;
        let updated = 0;
        
        for (const [userId, userData] of uniqueUsers) {
            const userDocRef = doc(db, 'users', userId);
            
            try {
                await setDoc(userDocRef, {
                    ...userData,
                    following: [],
                    followers: [],
                    createdAt: new Date(),
                    lastActive: new Date()
                }, { merge: true }); // merge: true won't overwrite existing data
                
                created++;
            } catch (error) {
                console.warn(`⚠️ Could not migrate user ${userId}:`, error);
            }
        }
        
        console.log(`✅ Migration complete!`);
        console.log(`   Created/updated: ${created} users`);
        
    } catch (error) {
        console.error('❌ Migration error:', error);
    }
}

// Run migration
document.addEventListener('DOMContentLoaded', () => {
    const migrateBtn = document.createElement('button');
    migrateBtn.textContent = '🔄 Migrate Users to Social System';
    migrateBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 9999;
        padding: 15px 25px;
        background: #e74c3c;
        color: white;
        border: none;
        border-radius: 25px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
    `;
    
    migrateBtn.addEventListener('click', async () => {
        if (!confirm('This will create user documents for all existing users. Continue?')) {
            return;
        }
        
        migrateBtn.textContent = '⏳ Migrating...';
        migrateBtn.disabled = true;
        
        await migrateUsers();
        
        migrateBtn.textContent = '✅ Migration Complete!';
        setTimeout(() => {
            migrateBtn.remove();
        }, 3000);
    });
    
    document.body.appendChild(migrateBtn);
});