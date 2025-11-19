console.log('🎭 emote-system.js loaded');

import { db } from './firebase-config.js';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// SEND EMOTE REACTION
// ========================================

export async function sendEmoteReaction(targetUsername, targetUserId, type, matchData, customMessage = null) {
    const currentUserId = localStorage.getItem('tournamentUserId');
    const currentUsername = localStorage.getItem('tournamentUsername') || 'Anonymous';
    
    if (!currentUserId || currentUsername === 'Anonymous') {
        console.log('⚠️ Anonymous users cannot send reactions');
        return false;
    }
    
    if (currentUserId === targetUserId) {
        console.log('⚠️ Cannot send reaction to yourself');
        return false;
    }
    
    // Preset messages based on type
    const presetMessages = {
        'thanks': ['Great taste! 🎵', 'Thanks for the backup! 🤝', 'Let\'s go! 🔥'],
        'props': ['Nice pick! 👊', 'Respect! 💯', 'We got this! 💪'],
        'rivalry': ['May the best song win! ⚔️', 'Game on! 🎮', 'Challenge accepted! ⚡'],
        'hype': ['This match is fire! 🔥', 'Epic battle! ⚡', 'What a matchup! 🎵']
    };
    
    const message = customMessage || presetMessages[type][Math.floor(Math.random() * presetMessages[type].length)];
    
    try {
        const reactionData = {
            fromUserId: currentUserId,
            fromUsername: currentUsername,
            toUserId: targetUserId,
            toUsername: targetUsername,
            type: type,
            matchId: matchData.matchId,
            matchTitle: matchData.matchTitle,
            songTitle: matchData.songTitle,
            message: message,
            timestamp: Date.now(),
            seen: false
        };
        
        const docRef = await addDoc(collection(db, 'user-reactions'), reactionData);
        console.log(`✅ Emote sent to ${targetUsername}:`, type, message);
        
        return true;
    } catch (error) {
        console.error('❌ Error sending emote:', error);
        return false;
    }
}

// ========================================
// CHECK FOR NEW REACTIONS (for current user)
// ========================================

export async function checkNewReactions() {
    const currentUserId = localStorage.getItem('tournamentUserId');
    if (!currentUserId) return [];
    
    try {
        const q = query(
            collection(db, 'user-reactions'),
            where('toUserId', '==', currentUserId),
            where('seen', '==', false),
            orderBy('timestamp', 'desc'),
            limit(10)
        );
        
        const snapshot = await getDocs(q);
        const reactions = [];
        
        snapshot.forEach(doc => {
            reactions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`📬 Found ${reactions.length} new reactions`);
        return reactions;
        
    } catch (error) {
        console.error('❌ Error checking reactions:', error);
        return [];
    }
}

// ========================================
// MARK REACTIONS AS SEEN
// ========================================

export async function markReactionSeen(reactionId) {
    try {
        const reactionRef = doc(db, 'user-reactions', reactionId);
        await updateDoc(reactionRef, { seen: true });
        console.log(`✅ Reaction ${reactionId} marked as seen`);
    } catch (error) {
        console.error('❌ Error marking reaction as seen:', error);
    }
}

// ========================================
// GET REACTION COUNT (for a user)
// ========================================

export async function getUnseenReactionCount() {
    const currentUserId = localStorage.getItem('tournamentUserId');
    if (!currentUserId) return 0;
    
    try {
        const q = query(
            collection(db, 'user-reactions'),
            where('toUserId', '==', currentUserId),
            where('seen', '==', false)
        );
        
        const snapshot = await getDocs(q);
        return snapshot.size;
        
    } catch (error) {
        console.error('❌ Error getting reaction count:', error);
        return 0;
    }
}