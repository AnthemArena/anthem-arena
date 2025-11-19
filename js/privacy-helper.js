console.log('🔒 privacy-helper.js loaded');

// ========================================
// CHECK USER PRIVACY SETTINGS
// ========================================

export function canSendFriendRequest(targetUserId) {
    // TODO: Check target user's allowFriendRequests setting from Firebase
    // For now, check localStorage (will work for current user only)
    const allowFriendRequests = localStorage.getItem('allowFriendRequests');
    return allowFriendRequests === null || allowFriendRequests === 'true';
}

export function canSendMessage(currentUserId, targetUserId, areFriends = false) {
    // TODO: Fetch target user's messagePrivacy from Firebase
    // For now, check localStorage (will work for current user only)
    const messagePrivacy = localStorage.getItem('messagePrivacy') || 'everyone';
    
    if (currentUserId === targetUserId) {
        return false; // Can't message yourself
    }
    
    switch (messagePrivacy) {
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

export function canSendEmote(currentUserId, targetUserId, areFriends = false) {
    const emotePrivacy = localStorage.getItem('emotePrivacy') || 'everyone';
    
    if (currentUserId === targetUserId) {
        return false; // Can't emote yourself
    }
    
    switch (emotePrivacy) {
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

export function shouldShowOnlineStatus(userId) {
    // TODO: Fetch from Firebase
    const showOnlineStatus = localStorage.getItem('showOnlineStatus');
    return showOnlineStatus === null || showOnlineStatus === 'true';
}

export function isProfilePublic(userId) {
    // TODO: Fetch from Firebase
    const isPublic = localStorage.getItem('isPublic');
    return isPublic === null || isPublic === 'true';
}

// ========================================
// FETCH USER PRIVACY SETTINGS FROM FIREBASE
// ========================================

import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const privacyCache = new Map();
const CACHE_DURATION = 60000; // 1 minute

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