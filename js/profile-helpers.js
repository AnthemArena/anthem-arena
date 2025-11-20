// ========================================
// PROFILE HELPERS - SHARED UTILITIES
// ========================================

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Fetch user profile by username
 */
export async function fetchUserByUsername(username) {
    try {
        const profilesQuery = query(
            collection(db, 'profiles'),
            where('username', '==', username),
            limit(1)
        );
        
        const snapshot = await getDocs(profilesQuery);
        
        if (snapshot.empty) {
            return null;
        }
        
        const profileDoc = snapshot.docs[0];
        return {
            userId: profileDoc.id,
            ...profileDoc.data()
        };
    } catch (error) {
        console.error('❌ Error fetching user by username:', error);
        return null;
    }
}

/**
 * Fetch user profile by userId
 */
export async function fetchUserById(userId) {
    try {
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        
        if (!profileDoc.exists()) {
            return null;
        }
        
        return {
            userId: profileDoc.id,
            ...profileDoc.data()
        };
    } catch (error) {
        console.error('❌ Error fetching user by ID:', error);
        return null;
    }
}

/**
 * Generate profile URL for a username
 */
export function getProfileUrl(username) {
    return `/profile.html?user=${encodeURIComponent(username)}`;
}

/**
 * Check if viewing own profile
 */
export function isOwnProfile(username) {
    const currentUsername = localStorage.getItem('username');
    return username === currentUsername;
}

/**
 * Format join date
 */
export function formatJoinDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) {
        return 'Recently';
    } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
}

/**
 * Get time ago string
 */
export function getTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        return `${mins}m ago`;
    }
    if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        return `${hours}h ago`;
    }
    if (seconds < 604800) {
        const days = Math.floor(seconds / 86400);
        return `${days}d ago`;
    }
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

console.log('✅ Profile helpers loaded');