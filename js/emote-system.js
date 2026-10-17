console.log('🎭 emote-system.js loaded');

import { db } from './firebase-config.js';
import { EMOTES_ENABLED } from './features.js';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// SEND EMOTE REACTION
// ========================================

export async function sendEmoteReaction(targetUsername, targetUserId, type, matchData, customMessage = null) {
    if (!EMOTES_ENABLED) { console.log('⏸️ Emotes are switched off (js/features.js)'); return false; }
    const currentUserId = localStorage.getItem('tournamentUserId');
    const currentUsername = localStorage.getItem('tournamentUsername') || localStorage.getItem('username') || 'Anonymous';
    
    if (!currentUserId || currentUsername === 'Anonymous') {
        console.log('⚠️ Anonymous users cannot send reactions');
        return false;
    }
    
    if (!targetUserId || currentUserId === targetUserId) {
        console.log('⚠️ Cannot send reaction to yourself (or nobody)');
        return false;
    }
    
    // Preset messages based on type
    const presetMessages = {
        'thanks': ['Great pick! 🎬', 'Thanks for the backup! 🤝', 'Let\'s go! 🔥'],
        'props': ['Nice pick! 👊', 'Respect! 💯', 'We got this! 💪'],
        'rivalry': ['May the best edit win! ⚔️', 'Game on! 🎮', 'Challenge accepted! ⚡'],
        'hype': ['This match is fire! 🔥', 'Epic battle! ⚡', 'What a matchup! 🎬']
    };
    
    const presets = presetMessages[type];
    if (!presets && !customMessage) {
        console.error(`❌ Unknown emote type "${type}"`);
        return false;
    }
    const message = customMessage || presets[Math.floor(Math.random() * presets.length)];
    
    try {
        matchData = matchData || {};
        // Firestore refuses a document with an undefined field, and the security rules cap the lengths: send only what exists.
        const text = (v, max) => (v === undefined || v === null || v === '' ? undefined : String(v).slice(0, max));
        const reactionData = {
            fromUserId: currentUserId,
            fromUsername: text(currentUsername, 60),
            toUserId: targetUserId,
            toUsername: text(targetUsername, 60) || 'Unknown',
            type: String(type).slice(0, 30),
            matchId: text(matchData.matchId, 200),
            matchTitle: text(matchData.matchTitle, 300),
            songTitle: text(matchData.songTitle, 300),
            message: String(message).slice(0, 200),
            timestamp: Date.now(),
            seen: false
        };
        Object.keys(reactionData).forEach(k => reactionData[k] === undefined && delete reactionData[k]);
        
        const docRef = await addDoc(collection(db, 'user-reactions'), reactionData);
        console.log(`✅ Emote sent to ${targetUsername}:`, type, message);

        // Also leave a note in their bell (already "shown": the live emote listener pops the toast), so it is not lost
        try {
            const { saveNotification } = await import('./notification-storage.js');
            await saveNotification(targetUserId, {
                type: 'emote-received', eventType: reactionData.type, priority: 8,
                message: `${currentUsername} sent you ${reactionData.type}`, detail: reactionData.message,
                matchId: reactionData.matchId, matchTitle: reactionData.matchTitle,
                triggerUsername: reactionData.fromUsername, triggerUserId: currentUserId,
                targetUrl: reactionData.matchId ? `/vote.html?match=${encodeURIComponent(reactionData.matchId)}` : null,
                ctaText: 'View match', shownAsToast: true
            });
        } catch (e) { console.warn('Emote bell note not saved:', e); }

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