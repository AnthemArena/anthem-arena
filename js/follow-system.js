console.log('👥 follow-system.js loaded');

import { db } from './firebase-config.js';
import { 
    collection, 
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    query, 
    where, 
    getDocs,
    orderBy,
    limit as firestoreLimit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// FOLLOW USER
// ========================================

export async function followUser(targetUserId, targetUsername) {
    const currentUserId = localStorage.getItem('tournamentUserId');
    const currentUsername = localStorage.getItem('username');
    
    if (!currentUserId || currentUserId === 'anonymous') {
        console.error('❌ Must be logged in to follow users');
        return { success: false, reason: 'You must be logged in to follow users' };
    }
    
    if (currentUserId === targetUserId) {
        console.error('❌ Cannot follow yourself');
        return { success: false, reason: 'You cannot follow yourself' };
    }
    
    try {
        // Create follow relationship (using composite key for easy lookup)
        const followId = `${currentUserId}_${targetUserId}`;
        
        await setDoc(doc(db, 'follows', followId), {
            followerId: currentUserId,
            followerUsername: currentUsername,
            followingId: targetUserId,
            followingUsername: targetUsername,
            timestamp: Date.now()
        });
        
        console.log(`✅ Now following ${targetUsername}`);
        
        // ✅ Send notification to the followed user
        const { saveNotification } = await import('./notification-storage.js');
        await saveNotification({
            userId: targetUserId,
            type: 'new-follower',
            message: `${currentUsername} started following you`,
            triggerUserId: currentUserId,
            triggerUsername: currentUsername,
            targetUrl: `/profile?user=${currentUsername}`,
            priority: 3
        });
        
        return { success: true };
        
    } catch (error) {
        console.error('❌ Error following user:', error);
        return { success: false, reason: 'Failed to follow user' };
    }
}

// ========================================
// UNFOLLOW USER
// ========================================

export async function unfollowUser(targetUserId) {
    const currentUserId = localStorage.getItem('tournamentUserId');
    
    if (!currentUserId || currentUserId === 'anonymous') {
        console.error('❌ Must be logged in to unfollow users');
        return { success: false, reason: 'You must be logged in' };
    }
    
    try {
        const followId = `${currentUserId}_${targetUserId}`;
        await deleteDoc(doc(db, 'follows', followId));
        
        console.log(`✅ Unfollowed user`);
        return { success: true };
        
    } catch (error) {
        console.error('❌ Error unfollowing user:', error);
        return { success: false, reason: 'Failed to unfollow user' };
    }
}

// ========================================
// CHECK IF FOLLOWING
// ========================================

export async function isFollowing(targetUserId) {
    const currentUserId = localStorage.getItem('tournamentUserId');
    
    if (!currentUserId || currentUserId === 'anonymous') {
        return false;
    }
    
    if (currentUserId === targetUserId) {
        return false; // Can't follow yourself
    }
    
    try {
        const followId = `${currentUserId}_${targetUserId}`;
        const followDoc = await getDoc(doc(db, 'follows', followId));
        
        return followDoc.exists();
        
    } catch (error) {
        console.error('❌ Error checking follow status:', error);
        return false;
    }
}

// ========================================
// GET FOLLOWER COUNT
// ========================================

export async function getFollowerCount(userId) {
    try {
        const followsQuery = query(
            collection(db, 'follows'),
            where('followingId', '==', userId)
        );
        
        const snapshot = await getDocs(followsQuery);
        return snapshot.size;
        
    } catch (error) {
        console.error('❌ Error getting follower count:', error);
        return 0;
    }
}

// ========================================
// GET FOLLOWING COUNT
// ========================================

export async function getFollowingCount(userId) {
    try {
        const followsQuery = query(
            collection(db, 'follows'),
            where('followerId', '==', userId)
        );
        
        const snapshot = await getDocs(followsQuery);
        return snapshot.size;
        
    } catch (error) {
        console.error('❌ Error getting following count:', error);
        return 0;
    }
}

// ========================================
// GET FOLLOWERS LIST
// ========================================

export async function getFollowers(userId, limitCount = 50) {
    try {
        const followsQuery = query(
            collection(db, 'follows'),
            where('followingId', '==', userId),
            orderBy('timestamp', 'desc'),
            firestoreLimit(limitCount)
        );
        
        const snapshot = await getDocs(followsQuery);
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            userId: doc.data().followerId,
            username: doc.data().followerUsername,
            timestamp: doc.data().timestamp
        }));
        
    } catch (error) {
        console.error('❌ Error getting followers:', error);
        return [];
    }
}

// ========================================
// GET FOLLOWING LIST
// ========================================

export async function getFollowing(userId, limitCount = 50) {
    try {
        const followsQuery = query(
            collection(db, 'follows'),
            where('followerId', '==', userId),
            orderBy('timestamp', 'desc'),
            firestoreLimit(limitCount)
        );
        
        const snapshot = await getDocs(followsQuery);
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            userId: doc.data().followingId,
            username: doc.data().followingUsername,
            timestamp: doc.data().timestamp
        }));
        
    } catch (error) {
        console.error('❌ Error getting following:', error);
        return [];
    }
}

// ========================================
// GET MUTUAL FOLLOWS (people who follow each other)
// ========================================

export async function getMutualFollows(userId) {
    try {
        const followers = await getFollowers(userId);
        const following = await getFollowing(userId);
        
        // Find users in both lists
        const followerIds = new Set(followers.map(f => f.userId));
        const mutuals = following.filter(f => followerIds.has(f.userId));
        
        return mutuals;
        
    } catch (error) {
        console.error('❌ Error getting mutual follows:', error);
        return [];
    }
}