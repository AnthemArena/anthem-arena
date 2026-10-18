console.log('🔒 privacy-helper.js loaded');

import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// CACHE FOR PRIVACY SETTINGS
// ========================================

const privacyCache = new Map();
const CACHE_DURATION = 60000; // 1 minute

// ========================================
// GET DEFAULT PRIVACY SETTINGS
// ========================================

function getDefaultPrivacySettings() {
    return {
        isPublic: true,
        allowFollows: true,  // ✅ Changed from allowFriendRequests
        showOnlineStatus: true,
        emotePrivacy: 'everyone'  // 'everyone', 'followers', 'nobody'
    };
}

// ========================================
// FETCH USER PRIVACY SETTINGS FROM FIREBASE
// ========================================

export async function getUserPrivacySettings(userId) {
    if (!userId) return getDefaultPrivacySettings();
    
    // Check cache
    const cached = privacyCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    
    try {
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        
        if (profileDoc.exists()) {
            const data = profileDoc.data();
            const privacy = data.privacy || getDefaultPrivacySettings();
            
            // ✅ Migrate old 'friends' settings to 'followers'
            if (privacy.emotePrivacy === 'friends') {
                privacy.emotePrivacy = 'followers';
            }
            
            // Cache it
            privacyCache.set(userId, {
                data: privacy,
                timestamp: Date.now()
            });
            
            return privacy;
        }
    } catch (error) {
        console.warn('⚠️ Could not fetch privacy settings:', error);
    }
    
    return getDefaultPrivacySettings();
}

// ========================================
// CHECK IF USER A FOLLOWS USER B
// ========================================

async function isFollowing(followerUserId, followingUserId) {
    try {
        const { isFollowing: checkFollow } = await import('./follow-system.js');
        
        // Temporarily store current user
        const originalUserId = localStorage.getItem('userId');
        
        // Set followerUserId as current user for the check
        localStorage.setItem('userId', followerUserId);
        
        const following = await checkFollow(followingUserId);
        
        // Restore original user
        localStorage.setItem('userId', originalUserId);
        
        return following;
        
    } catch (error) {
        console.warn('⚠️ Could not check follow status:', error);
        return false;
    }
}

// ========================================
// CHECK IF ACTION IS ALLOWED (WITH FIREBASE)
// ========================================

export async function canUserSendEmote(currentUserId, targetUserId, areFollowing = false) {
    if (currentUserId === targetUserId) return false;
    
    const privacy = await getUserPrivacySettings(targetUserId);
    
    switch (privacy.emotePrivacy) {
        case 'everyone':
            return true;
        case 'followers':  // ✅ Changed from 'friends'
            // If not provided, check follow status
            if (areFollowing === false) {
                areFollowing = await isFollowing(currentUserId, targetUserId);
            }
            return areFollowing;
        case 'nobody':
            return false;
        default:
            return true;
    }
}

export async function shouldShowOnlineStatus(userId) {
    const privacy = await getUserPrivacySettings(userId);
    return privacy.showOnlineStatus;
}

export async function isProfilePublic(userId) {
    const privacy = await getUserPrivacySettings(userId);
    return privacy.isPublic;
}

// ========================================
// CLEAR PRIVACY CACHE (call when settings are updated)
// ========================================

export function clearPrivacyCache(userId = null) {
    if (userId) {
        privacyCache.delete(userId);
        console.log(`🗑️ Cleared privacy cache for user: ${userId}`);
    } else {
        privacyCache.clear();
        console.log('🗑️ Cleared entire privacy cache');
    }
}