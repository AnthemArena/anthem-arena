// ========================================
// FEED WIDGETS - Sidebars Population
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ========================================
// INITIALIZE ALL WIDGETS
// ========================================

export async function initializeFeedWidgets() {
    console.log('🎨 Initializing feed widgets...');
    
    await Promise.all([
        loadUserProfile(),
        loadLiveMatches(),
        loadRecentActivity(),
        loadTournamentStats()
    ]);
    
    console.log('✅ Feed widgets loaded');
}

// ========================================
// LEFT SIDEBAR - User Profile
// ========================================

async function loadUserProfile() {
    try {
        const userId = localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        const avatarJson = localStorage.getItem('avatar');
        
        if (!username || username === 'Anonymous') {
            document.querySelector('.sidebar-profile-card').style.display = 'none';
            return;
        }
        
        // Set username
        document.getElementById('sidebarUsername').textContent = username;
        
        // Set avatar
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        
        const avatarEl = document.getElementById('sidebarAvatar');
        if (avatar.type === 'url') {
            avatarEl.src = avatar.value;
        } else if (avatar.type === 'emoji') {
            avatarEl.src = createEmojiAvatar(avatar.value);
        } else if (avatar.type === 'champion') {
            avatarEl.src = avatar.imageUrl;
        }
        
        // Load stats
        const votesQuery = query(collection(db, 'votes'), where('userId', '==', userId));
        const votesSnapshot = await getDocs(votesQuery);
        document.getElementById('sidebarVotes').textContent = votesSnapshot.size;
        
        // Load following/followers
        const userDoc = await getDocs(query(collection(db, 'users'), where('userId', '==', userId), limit(1)));
        if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            document.getElementById('sidebarFollowing').textContent = userData.following?.length || 0;
            document.getElementById('sidebarFollowers').textContent = userData.followers?.length || 0;
        }
        
        // Load notification badge
        const { getUnreadCount } = await import('./notification-storage.js');
        const unreadCount = await getUnreadCount(userId);
        if (unreadCount > 0) {
            const badge = document.getElementById('sidebarNotifBadge');
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'inline-block';
        }
        
        console.log('✅ User profile loaded');
        
    } catch (error) {
        console.error('❌ Error loading user profile:', error);
    }
}

// ========================================
// RIGHT SIDEBAR - Live Matches Widget
// ========================================

async function loadLiveMatches() {
    const container = document.getElementById('liveMatchesWidget');
    
    try {
        // Fetch matches from API
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        
        // Filter live matches
        const liveMatches = allMatches
            .filter(m => m.status === 'live')
            .slice(0, 5);
        
        if (liveMatches.length === 0) {
            container.innerHTML = '<p class="widget-loading">No live matches right now</p>';
            return;
        }
        
        // Render live matches
        container.innerHTML = liveMatches.map(match => `
            <div class="live-match-item" onclick="window.location.href='/vote?match=${match.matchId}'">
                <div class="match-vs">
                    <span>${truncate(match.song1.shortTitle || match.song1.title, 15)}</span>
                    <span class="match-vs-separator">vs</span>
                    <span>${truncate(match.song2.shortTitle || match.song2.title, 15)}</span>
                </div>
                <div class="match-stats">
                    <span>${match.totalVotes || 0} votes</span>
                    <span>Round ${match.round}</span>
                </div>
            </div>
        `).join('');
        
        console.log('✅ Live matches loaded');
        
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
        container.innerHTML = '<p class="widget-loading">Failed to load matches</p>';
    }
}

// ========================================
// RIGHT SIDEBAR - Recent Activity Widget
// ========================================

async function loadRecentActivity() {
    const container = document.getElementById('recentActivityWidget');
    
    try {
        // Fetch recent activity
        const activityQuery = query(
            collection(db, 'activity'),
            where('isPublic', '!=', false),
            orderBy('timestamp', 'desc'),
            limit(5)
        );
        
        const snapshot = await getDocs(activityQuery);
        const activities = snapshot.docs.map(doc => doc.data());
        
        if (activities.length === 0) {
            container.innerHTML = '<p class="widget-loading">No recent activity</p>';
            return;
        }
        
        // Render activities
        container.innerHTML = activities.map(activity => {
            const avatarUrl = getAvatarUrl(activity.avatar);
            const timeAgo = getTimeAgo(activity.timestamp);
            const action = `voted for ${truncate(activity.songTitle, 20)}`;
            
            return `
                <div class="activity-item-mini" onclick="window.location.href='/vote?match=${activity.matchId}'">
                    <img src="${avatarUrl}" alt="${activity.username}" class="activity-avatar-mini">
                    <div class="activity-info-mini">
                        <div class="activity-username">${activity.username}</div>
                        <div class="activity-action">${action}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        console.log('✅ Recent activity loaded');
        
    } catch (error) {
        console.error('❌ Error loading recent activity:', error);
        container.innerHTML = '<p class="widget-loading">Failed to load activity</p>';
    }
}

// ========================================
// RIGHT SIDEBAR - Tournament Stats Widget
// ========================================

async function loadTournamentStats() {
    try {
        // Fetch matches for stats
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        
        const totalVotes = allMatches.reduce((sum, m) => sum + (m.totalVotes || 0), 0);
        const completedMatches = allMatches.filter(m => m.status === 'completed').length;
        
        // Get unique voters
        const votesSnapshot = await getDocs(collection(db, 'votes'));
        const uniqueVoters = new Set(votesSnapshot.docs.map(doc => doc.data().userId)).size;
        
        document.getElementById('widgetTotalVotes').textContent = totalVotes.toLocaleString();
        document.getElementById('widgetActiveVoters').textContent = uniqueVoters.toLocaleString();
        document.getElementById('widgetCompletedMatches').textContent = completedMatches;
        
        console.log('✅ Tournament stats loaded');
        
    } catch (error) {
        console.error('❌ Error loading tournament stats:', error);
    }
}

// ========================================
// SETUP SIDEBAR INTERACTIONS
// ========================================

export function setupSidebarInteractions() {
    // Notifications button
    const notifBtn = document.getElementById('sidebarNotifications');
    if (notifBtn) {
        notifBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.openNotificationPanel?.();
        });
    }
    
    // Messages button (placeholder)
    const msgBtn = document.getElementById('sidebarMessages');
    if (msgBtn) {
        msgBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.showNotification) {
                window.showNotification('Messages coming soon!', 'info');
            }
        });
    }
}

// ========================================
// UTILITIES
// ========================================

function truncate(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function getAvatarUrl(avatar) {
    if (!avatar) {
        return createEmojiAvatar('🎵');
    }
    
    if (avatar.type === 'url') return avatar.value;
    if (avatar.type === 'champion') return avatar.imageUrl;
    if (avatar.type === 'emoji') return createEmojiAvatar(avatar.value);
    
    return createEmojiAvatar('🎵');
}

function createEmojiAvatar(emoji) {
    return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">
            <rect width="50" height="50" fill="#C8AA6E"/>
            <text x="25" y="35" text-anchor="middle" font-size="30">${emoji}</text>
        </svg>
    `)}`;
}

console.log('✅ Feed widgets module loaded');