console.log('💬 message-system.js loaded');

import { db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs,
    Timestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// SEND MESSAGE
// ========================================

export async function sendMessage(toUserId, toUsername, messageText, context = {}) {
    const fromUserId = localStorage.getItem('tournamentUserId');
    const fromUsername = localStorage.getItem('tournamentUsername');
    
    if (!fromUserId || fromUserId === 'anonymous') {
        console.error('❌ Must be logged in to send messages');
        return { success: false, reason: 'You must be logged in to send messages' };
    }
    
    // ✅ CHECK PRIVACY SETTINGS FIRST
    const { canUserSendMessage } = await import('./privacy-helper.js');
    const canSend = await canUserSendMessage(fromUserId, toUserId);
    
    if (!canSend) {
        console.warn('❌ User privacy settings block messaging');
        return { success: false, reason: 'This user has disabled messages from non-friends' };
    }
    
    if (!messageText || messageText.trim().length === 0) {
        console.error('❌ Message cannot be empty');
        return { success: false, reason: 'Message cannot be empty' };
    }
    
    if (messageText.length > 300) {
        console.error('❌ Message too long (max 300 characters)');
        return { success: false, reason: 'Message too long (max 300 characters)' };
    }
    
    try {
        // Save to messages collection
        const messageData = {
            fromUserId,
            fromUsername,
            toUserId,
            toUsername,
            message: messageText.trim(),
            timestamp: Date.now(),
            read: false,
            
            // Optional context (what match/notification triggered this)
            matchId: context.matchId || null,
            matchTitle: context.matchTitle || null,
            parentNotificationId: context.notificationId || null
        };
        
        await addDoc(collection(db, 'messages'), messageData);
        
        console.log(`✅ Message sent to ${toUsername}`);
        return { success: true };
        
    } catch (error) {
        console.error('❌ Error sending message:', error);
        return { success: false, reason: 'Failed to send message' };
    }
}

// ========================================
// GET CONVERSATION
// ========================================

export async function getConversation(otherUserId, limitCount = 50) {
    const currentUserId = localStorage.getItem('tournamentUserId');
    
    if (!currentUserId || currentUserId === 'anonymous') {
        return [];
    }
    
    try {
        // Get messages between current user and other user
        const messagesRef = collection(db, 'messages');
        
        // Query for messages in BOTH directions
        const q1 = query(
            messagesRef,
            where('fromUserId', '==', currentUserId),
            where('toUserId', '==', otherUserId),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );
        
        const q2 = query(
            messagesRef,
            where('fromUserId', '==', otherUserId),
            where('toUserId', '==', currentUserId),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );
        
        const [snapshot1, snapshot2] = await Promise.all([
            getDocs(q1),
            getDocs(q2)
        ]);
        
        // Combine and sort
        const messages = [];
        
        snapshot1.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data(), direction: 'sent' });
        });
        
        snapshot2.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data(), direction: 'received' });
        });
        
        // Sort by timestamp (newest first)
        messages.sort((a, b) => b.timestamp - a.timestamp);
        
        return messages.slice(0, limitCount);
        
    } catch (error) {
        console.error('❌ Error getting conversation:', error);
        return [];
    }
}

// ========================================
// GET RECENT CONVERSATIONS
// ========================================

export async function getRecentConversations(limitCount = 10) {
    const currentUserId = localStorage.getItem('tournamentUserId');
    
    if (!currentUserId || currentUserId === 'anonymous') {
        return [];
    }
    
    try {
        const messagesRef = collection(db, 'messages');
        
        // Get recent messages TO or FROM current user
        const q = query(
            messagesRef,
            where('toUserId', '==', currentUserId),
            orderBy('timestamp', 'desc'),
            limit(50)
        );
        
        const snapshot = await getDocs(q);
        
        // Group by conversation partner
        const conversationMap = new Map();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const partnerId = data.fromUserId;
            
            if (!conversationMap.has(partnerId)) {
                conversationMap.set(partnerId, {
                    userId: partnerId,
                    username: data.fromUsername,
                    lastMessage: data.message,
                    lastMessageTime: data.timestamp,
                    unreadCount: data.read ? 0 : 1
                });
            } else {
                // Increment unread count
                if (!data.read) {
                    conversationMap.get(partnerId).unreadCount++;
                }
            }
        });
        
        // Convert to array and sort by most recent
        const conversations = Array.from(conversationMap.values());
        conversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        
        return conversations.slice(0, limitCount);
        
    } catch (error) {
        console.error('❌ Error getting conversations:', error);
        return [];
    }
}

// ========================================
// MARK MESSAGE AS READ
// ========================================

export async function markMessageRead(messageId) {
    try {
        const messageRef = doc(db, 'messages', messageId);
        await updateDoc(messageRef, { read: true });
        console.log(`✅ Message ${messageId} marked as read`);
    } catch (error) {
        console.error('❌ Error marking message as read:', error);
    }
}