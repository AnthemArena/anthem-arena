console.log('🔔 notification-storage.js loaded');

import { db } from './firebase-config.js';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, orderBy, limit, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// FIRESTORE COLLECTION: user-notifications
// ========================================
// Structure:
// {
//   notificationId: "auto-generated",
//   userId: "user123",
//   type: "causal-event" | "live-activity" | "match-status" | "achievement" | "emote-received" | "message-received",
// //   priority: 10,
//   
//   message: "SummonerElite flipped the match!",
//   detail: "RISE is now trailing in RISE vs GODS",
//   icon: "⚠️",
//   
//   matchId: "round-1-match-4",
//   matchTitle: "RISE vs GODS",
//   
//   // For causal events
//   triggerUsername: "SummonerElite",
//   triggerUserId: "user456",
//   eventType: "flipped-match",
//   relationship: "opponent",
//   
//   // Action data
//   ctaText: "Share Battle!",
//   ctaAction: "copy-match-url" | "send-emote" | "navigate",
//   ctaData: { emoteType: "thanks", ... },
//   targetUrl: "/vote.html?match=...",
//   
//   timestamp: 1234567890,
//   read: false,
//   dismissed: false,
//   shownAsToast: false,
//   expiresAt: 1234567890 + (7 * 24 * 60 * 60 * 1000) // 7 days
// }

// ========================================
// SAVE NOTIFICATION
// ========================================

export async function saveNotification(userId, notificationData) {
    if (!userId || userId === 'anonymous') {
        console.log('⚠️ Cannot save notification for anonymous user');
        return null;
    }
    
    try {
        const notification = {
            userId: userId,
            type: notificationData.type,
            priority: notificationData.priority || 5,
            
            message: notificationData.message,
            detail: notificationData.detail || '',
            icon: notificationData.icon || '📢',
            
            matchId: notificationData.matchId || null,
            matchTitle: notificationData.matchTitle || null,
            
            // Causal event data
            triggerUsername: notificationData.triggerUsername || null,
            triggerUserId: notificationData.triggerUserId || null,
            eventType: notificationData.eventType || null,
            relationship: notificationData.relationship || null,
            
            // Action data
            ctaText: notificationData.ctaText || 'View',
            ctaAction: notificationData.ctaAction || 'navigate',
            ctaData: notificationData.ctaData || {},
            targetUrl: notificationData.targetUrl || null,
            
            timestamp: Date.now(),
            read: false,
            dismissed: false,
            shownAsToast: notificationData.shownAsToast || false,
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        };
        
        const docRef = await addDoc(collection(db, 'user-notifications'), notification);
        console.log(`✅ Notification saved: ${notificationData.type} for ${userId}`);
        
        return docRef.id;
        
    } catch (error) {
        console.error('❌ Error saving notification:', error);
        return null;
    }
}

// ========================================
// GET UNREAD NOTIFICATIONS
// ========================================

export async function getUnreadNotifications(userId) {
    if (!userId || userId === 'anonymous') return [];
    
    try {
        const q = query(
            collection(db, 'user-notifications'),
            where('userId', '==', userId),
            where('dismissed', '==', false),
            where('expiresAt', '>', Date.now()),
            orderBy('expiresAt', 'desc'),
            orderBy('timestamp', 'desc'),
            limit(50) // Max 50 notifications
        );
        
        const snapshot = await getDocs(q);
        const notifications = [];
        
        snapshot.forEach(doc => {
            notifications.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`📬 Found ${notifications.length} notifications for ${userId}`);
        return notifications;
        
    } catch (error) {
        console.error('❌ Error getting notifications:', error);
        return [];
    }
}

// ========================================
// GET RECENT UNSHOWN NOTIFICATIONS (for toasts)
// ========================================

export async function getRecentUnshownNotifications(userId, maxAgeMinutes = 60) {
    if (!userId || userId === 'anonymous') return [];
    
    const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);
    
    try {
        const q = query(
            collection(db, 'user-notifications'),
            where('userId', '==', userId),
            where('shownAsToast', '==', false),
            where('timestamp', '>', cutoffTime),
            where('expiresAt', '>', Date.now()),
            orderBy('timestamp', 'desc'),
            orderBy('expiresAt', 'desc'),
            limit(5) // Max 5 toasts on page load
        );
        
        const snapshot = await getDocs(q);
        const notifications = [];
        
        snapshot.forEach(doc => {
            notifications.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`🔔 Found ${notifications.length} recent unshown notifications`);
        return notifications;
        
    } catch (error) {
        console.error('❌ Error getting recent notifications:', error);
        return [];
    }
}

// ========================================
// MARK NOTIFICATION AS SHOWN (as toast)
// ========================================

export async function markNotificationShown(notificationId) {
    try {
        const notificationRef = doc(db, 'user-notifications', notificationId);
        await updateDoc(notificationRef, { 
            shownAsToast: true 
        });
        console.log(`✅ Notification ${notificationId} marked as shown`);
    } catch (error) {
        console.error('❌ Error marking notification as shown:', error);
    }
}

// ========================================
// MARK NOTIFICATION AS READ
// ========================================

export async function markNotificationRead(notificationId) {
    try {
        const notificationRef = doc(db, 'user-notifications', notificationId);
        await updateDoc(notificationRef, { 
            read: true 
        });
        console.log(`✅ Notification ${notificationId} marked as read`);
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
    }
}

// ========================================
// DISMISS NOTIFICATION
// ========================================

export async function dismissNotification(notificationId) {
    try {
        const notificationRef = doc(db, 'user-notifications', notificationId);
        await updateDoc(notificationRef, { 
            dismissed: true,
            read: true
        });
        console.log(`✅ Notification ${notificationId} dismissed`);
    } catch (error) {
        console.error('❌ Error dismissing notification:', error);
    }
}

// ========================================
// GET UNREAD COUNT
// ========================================

export async function getUnreadCount(userId) {
    if (!userId || userId === 'anonymous') return 0;
    
    try {
        const q = query(
            collection(db, 'user-notifications'),
            where('userId', '==', userId),
            where('read', '==', false),
            where('dismissed', '==', false),
            where('expiresAt', '>', Date.now())
        );
        
        const snapshot = await getDocs(q);
        return snapshot.size;
        
    } catch (error) {
        console.error('❌ Error getting unread count:', error);
        return 0;
    }
}

// ========================================
// SAVE MESSAGE NOTIFICATION
// ========================================

export async function saveMessageNotification(toUserId, fromUsername, fromUserId, messageText, context = {}) {
    return await saveNotification(toUserId, {
        type: 'message-received',
        priority: 8, // High priority
        message: `💬 ${fromUsername} sent you a message`,
        detail: messageText.length > 60 ? messageText.substring(0, 60) + '...' : messageText,
        icon: '💬',
        
        // Sender info
        triggerUsername: fromUsername,
        triggerUserId: fromUserId,
        
        // Context
        matchId: context.matchId || null,
        matchTitle: context.matchTitle || null,
        
        // Action
        ctaText: 'Reply',
        ctaAction: 'open-message',
        ctaData: {
            fromUsername,
            fromUserId,
            originalMessage: messageText
        },
        targetUrl: `/messages.html?user=${fromUserId}`
    });
}

// ========================================
// CLEANUP OLD NOTIFICATIONS (call periodically)
// ========================================

export async function cleanupExpiredNotifications(userId) {
    if (!userId) return;
    
    try {
        const q = query(
            collection(db, 'user-notifications'),
            where('userId', '==', userId),
            where('expiresAt', '<', Date.now())
        );
        
        const snapshot = await getDocs(q);
        
        const deletePromises = [];
        snapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        
        await Promise.all(deletePromises);
        console.log(`🗑️ Cleaned up ${snapshot.size} expired notifications`);
        
    } catch (error) {
        console.error('❌ Error cleaning up notifications:', error);
    }
}
// ========================================
// CHECK IF ACTION IS AVAILABLE
// ========================================

// ========================================
// CHECK IF ACTION IS AVAILABLE
// ========================================

export async function getAvailableActions(targetUserId, context = {}) {
    const currentUserId = localStorage.getItem('tournamentUserId');
    
    if (!targetUserId || currentUserId === targetUserId) {
        return {
            canMessage: false,
            canEmote: false,
            canAddFriend: false,
            reason: 'Cannot interact with yourself'
        };
    }
    
    // Import privacy helper
    const { getUserPrivacySettings } = await import('./privacy-helper.js');
    
    try {
        const privacy = await getUserPrivacySettings(targetUserId);
        const areFriends = context.areFriends || false; // TODO: Check friends list when implemented
        
        return {
            canMessage: checkMessagePermission(privacy.messagePrivacy, areFriends),
            canEmote: checkEmotePermission(privacy.emotePrivacy, areFriends),
            canAddFriend: privacy.allowFriendRequests,
            messageReason: getMessageRestrictionReason(privacy.messagePrivacy, areFriends),
            emoteReason: getEmoteRestrictionReason(privacy.emotePrivacy, areFriends),
            friendReason: privacy.allowFriendRequests ? null : 'This user is not accepting friend requests'
        };
    } catch (error) {
        console.warn('Could not check privacy settings, defaulting to allowed', error);
        // Default to allowing actions if can't fetch settings
        return {
            canMessage: true,
            canEmote: true,
            canAddFriend: true
        };
    }
}

function checkMessagePermission(messagePrivacy, areFriends) {
    switch (messagePrivacy) {
        case 'everyone': return true;
        case 'friends': return areFriends;
        case 'nobody': return false;
        default: return true;
    }
}

function checkEmotePermission(emotePrivacy, areFriends) {
    switch (emotePrivacy) {
        case 'everyone': return true;
        case 'friends': return areFriends;
        case 'nobody': return false;
        default: return true;
    }
}

function getMessageRestrictionReason(messagePrivacy, areFriends) {
    switch (messagePrivacy) {
        case 'friends': 
            return areFriends ? null : '🔒 This user only accepts messages from friends';
        case 'nobody': 
            return '🔒 This user has disabled messages';
        default: 
            return null;
    }
}

function getEmoteRestrictionReason(emotePrivacy, areFriends) {
    switch (emotePrivacy) {
        case 'friends': 
            return areFriends ? null : '🔒 This user only accepts emotes from friends';
        case 'nobody': 
            return '🔒 This user has disabled emotes';
        default: 
            return null;
    }
}