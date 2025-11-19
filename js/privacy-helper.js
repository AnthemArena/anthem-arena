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
        allowFriendRequests: true,
        messagePrivacy: 'everyone',
        showOnlineStatus: true,
        emotePrivacy: 'everyone'
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
// CHECK IF ACTION IS ALLOWED (WITH FIREBASE)
// ========================================

export async function canUserSendMessage(currentUserId, targetUserId, areFriends = false) {
    if (currentUserId === targetUserId) return false;
    
    const privacy = await getUserPrivacySettings(targetUserId);
    
    switch (privacy.messagePrivacy) {
        case 'everyone':
            return true;
        case 'friends':
            return areFriends;
        case 'nobody':
            return false;
        default:
            return true;
    }
}

export async function canUserSendFriendRequest(currentUserId, targetUserId) {
    if (currentUserId === targetUserId) return false;
    
    const privacy = await getUserPrivacySettings(targetUserId);
    return privacy.allowFriendRequests;
}

export async function canUserSendEmote(currentUserId, targetUserId, areFriends = false) {
    if (currentUserId === targetUserId) return false;
    
    const privacy = await getUserPrivacySettings(targetUserId);
    
    switch (privacy.emotePrivacy) {
        case 'everyone':
            return true;
        case 'friends':
            return areFriends;
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