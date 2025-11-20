// ========================================
// PROFILE PAGE - ANTHEM ARENA
// ========================================

import { db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getUserXPFromStorage, getUserRank } from './rank-system.js';
import { getUnlockedAchievementsFromFirebase } from './achievement-tracker.js';
import { ACHIEVEMENTS } from './achievements.js';

// State
let currentProfile = null;
let isOwnProfile = false;
let currentUserId = null;
let currentUsername = null;

// ========================================
// INITIALIZE
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Profile page loading...');
    
    // Get current user info
    currentUserId = localStorage.getItem('tournamentUserId');
    currentUsername = localStorage.getItem('username');

     // ✅ ADD DEBUG LOGGING
    console.log('🔍 Current User ID:', currentUserId);
    console.log('🔍 Current Username:', currentUsername);
    console.log('🔍 localStorage keys:', Object.keys(localStorage));
    
    // Get target username from URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetUsername = urlParams.get('user') || currentUsername;
    
    console.log('👤 Target username:', targetUsername);
    console.log('👤 Current user:', currentUsername);
    
     // Check if user has setup their profile
    if (!targetUsername) {
        console.warn('⚠️ No target username - showing guest state');
        showGuestState();
        return;
    }
    
    // Load profile
    await loadProfile(targetUsername);
    
    // Setup tab switching
    setupTabs();
});

// ========================================
// LOAD PROFILE
// ========================================

async function loadProfile(username) {
    try {
        console.log('📥 Loading profile for:', username);
        
        // Show loading state
        showLoadingState();
        
        // Fetch profile from Firebase
        const profile = await fetchUserProfile(username);
        
        if (!profile) {
            console.warn('⚠️ Profile not found for:', username);
            showNotFoundState();
            return;
        }
        
        console.log('✅ Profile loaded:', profile);
        
        // Store profile data
        currentProfile = profile;
        isOwnProfile = (username === currentUsername);
        
        console.log('🔍 Is own profile?', isOwnProfile);
        
        // Render profile
        await renderProfile(profile);
        
        // Load content
        await Promise.all([
            loadProfileStats(profile.userId),
            loadFeaturedAchievements(profile.userId),
            loadFavoriteSongs(profile.userId),
            loadRecentPosts(profile.userId),
            loadAllPosts(profile.userId),
            loadAllAchievements(profile.userId)
        ]);
        
        // Show profile content
        showProfileContent();
        
    } catch (error) {
        console.error('❌ Error loading profile:', error);
        showNotFoundState();
    }
}

// ========================================
// FETCH USER PROFILE FROM FIREBASE
// ========================================
// ========================================
// FETCH USER PROFILE (WITH EDGE CACHE)
// ========================================

async function fetchUserProfile(username) {
    try {
        // ✅ Try edge-cached endpoint first
        const response = await fetch(`/api/profile?username=${encodeURIComponent(username)}`);
        
        if (response.ok) {
            const profile = await response.json();
            
            // ✅ Cache in localStorage with TTL (1 minute)
            const cacheKey = `profile-${username}`;
            const cacheData = {
                profile,
                timestamp: Date.now(),
                ttl: 60000 // 1 minute
            };
            
            try {
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (e) {
                console.warn('Could not cache profile:', e);
            }
            
            return profile;
        }
        
        // ✅ If edge endpoint fails (404 or not deployed yet), fallback to direct Firebase
        console.warn('⚠️ Edge endpoint not available, falling back to direct Firebase');
        return await fetchUserProfileDirect(username);
        
    } catch (error) {
        console.error('❌ Error fetching profile from edge:', error);
        
        // ✅ Try direct Firebase as fallback
        try {
            return await fetchUserProfileDirect(username);
        } catch (fallbackError) {
            console.error('❌ Direct Firebase also failed:', fallbackError);
        }
        
        // ✅ Try localStorage fallback
        const cacheKey = `profile-${username}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            const { profile, timestamp, ttl } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            
            // Use stale cache if less than 5 minutes old
            if (age < 300000) {
                console.log('📦 Using stale localStorage cache');
                return profile;
            }
        }
        
        return null;
    }
}

// ========================================
// DIRECT FIREBASE FALLBACK (temporary until edge function deployed)
// ========================================

async function fetchUserProfileDirect(username) {
    try {
        // Query profiles collection by username
        const profilesQuery = query(
            collection(db, 'profiles'),
            where('username', '==', username),
            limit(1)
        );
        
        const snapshot = await getDocs(profilesQuery);
        
        if (snapshot.empty) {
            console.warn('⚠️ No profile found for username:', username);
            return null;
        }
        
        const profileDoc = snapshot.docs[0];
        const profileData = profileDoc.data();
        
        return {
            userId: profileDoc.id,
            username: profileData.username,
            avatar: profileData.avatar || { type: 'emoji', value: '🎵' },
            bio: profileData.bio || '',
            privacy: profileData.privacy || {},
            createdAt: profileData.createdAt,
            updatedAt: profileData.updatedAt
        };
        
    } catch (error) {
        console.error('❌ Error fetching profile from Firebase:', error);
        return null;
    }
}

// ========================================
// RENDER PROFILE
// ========================================

async function renderProfile(profile) {
    // Avatar
    const avatarEl = document.getElementById('profileAvatar');
    if (profile.avatar.type === 'url') {
        avatarEl.innerHTML = `<img src="${profile.avatar.value}" alt="${profile.username}" />`;
    } else {
        avatarEl.textContent = profile.avatar.value;
    }
    
    // Username
    document.getElementById('profileUsername').textContent = profile.username;
    
    // Rank
    const xp = await getUserXPForUser(profile.userId);
    const rank = getUserRank(xp);
    const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
    document.getElementById('profileRank').innerHTML = `
        <i class="fas fa-star"></i> Level ${rank.currentLevel.level} - ${cleanTitle}
    `;
    
    // Bio
    const bioEl = document.getElementById('profileBio');
    if (profile.bio) {
        bioEl.textContent = profile.bio;
        bioEl.style.display = 'block';
    } else {
        bioEl.style.display = 'none';
    }
    
    // Badges
    renderProfileBadges(profile);
    
    // Joined date
    const joinedDate = profile.createdAt ? new Date(profile.createdAt) : new Date();
    document.getElementById('profileJoined').innerHTML = `
        <i class="fas fa-calendar"></i> Joined ${formatJoinDate(joinedDate)}
    `;
    
    // Vote count
    const voteCount = await getVoteCountForUser(profile.userId);
    document.getElementById('profileVotes').innerHTML = `
        <i class="fas fa-trophy"></i> ${voteCount} ${voteCount === 1 ? 'vote' : 'votes'}
    `;
    
    // Render action buttons
    renderProfileActions();
}

// ========================================
// RENDER PROFILE BADGES
// ========================================

function renderProfileBadges(profile) {
    const badgesEl = document.getElementById('profileBadges');
    const badges = [];
    
    // Founder badge (joined before a certain date - adjust as needed)
    const joinDate = profile.createdAt ? new Date(profile.createdAt) : new Date();
    const founderCutoff = new Date('2025-01-01'); // Example cutoff
    if (joinDate < founderCutoff) {
        badges.push('<span class="profile-badge founder">🏆 Founder</span>');
    }
    
    // Verified badge (you can add custom logic)
    // if (profile.verified) {
    //     badges.push('<span class="profile-badge verified">✓ Verified</span>');
    // }
    
    badgesEl.innerHTML = badges.join('');
}

// ========================================
// RENDER PROFILE ACTIONS
// ========================================

function renderProfileActions() {
    const actionsEl = document.getElementById('profileActions');
    
    if (isOwnProfile) {
        // Own profile - show edit buttons
        actionsEl.innerHTML = `
            <button class="profile-action-btn primary" onclick="window.openSettingsModal()">
                <i class="fas fa-cog"></i> Edit Profile
            </button>
            <a href="/my-votes.html" class="profile-action-btn secondary">
                <i class="fas fa-chart-line"></i> Detailed Analytics
            </a>
        `;
    } else {
        // Other user's profile - show follow/message buttons
        const isFollowing = false; // TODO: Check if following
        
        actionsEl.innerHTML = `
            <button class="profile-action-btn follow" onclick="window.toggleFollow('${currentProfile.userId}')">
                <i class="fas fa-user-plus"></i> Follow
            </button>
            <button class="profile-action-btn secondary" onclick="window.sendMessage('${currentProfile.userId}')">
                <i class="fas fa-envelope"></i> Message
            </button>
        `;
    }
}

// ========================================
// LOAD PROFILE STATS
// ========================================

async function loadProfileStats(userId) {
    try {
        // Total votes
        const voteCount = await getVoteCountForUser(userId);
        document.getElementById('statTotalVotes').textContent = voteCount;
        
        // Voting streak
        const streak = await getVotingStreakForUser(userId);
        document.getElementById('statStreak').textContent = streak;
        
        // Songs alive
        const songsAlive = await getSongsAliveForUser(userId);
        document.getElementById('statSongsAlive').textContent = songsAlive;
        
        // Followers (TODO: implement followers system)
        const followers = await getFollowerCount(userId);
        document.getElementById('statFollowers').textContent = followers;
        
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}

// ========================================
// LOAD FEATURED ACHIEVEMENTS
// ========================================

async function loadFeaturedAchievements(userId) {
    try {
        const unlockedIds = await getUnlockedAchievementsFromFirebase(userId);
        
        if (unlockedIds.length === 0) {
            return; // Keep no-content state
        }
        
        // Get top 3 achievements (highest rarity/XP)
        const unlockedAchievements = unlockedIds
            .map(id => ACHIEVEMENTS[id])
            .filter(Boolean)
            .sort((a, b) => {
                const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4 };
                const rarityA = rarityOrder[a.rarity] || 0;
                const rarityB = rarityOrder[b.rarity] || 0;
                if (rarityB !== rarityA) return rarityB - rarityA;
                return (b.xp || 0) - (a.xp || 0);
            })
            .slice(0, 3);
        
        const container = document.getElementById('featuredAchievements');
        
        if (unlockedAchievements.length === 0) {
            return; // Keep no-content state
        }
        
        container.innerHTML = unlockedAchievements.map(ach => `
            <div class="achievement-card">
                <div class="achievement-header">
                    <div class="achievement-icon">${ach.icon}</div>
                    <div class="achievement-info">
                        <div class="achievement-name">${ach.name}</div>
                        <span class="achievement-rarity ${ach.rarity}">${ach.rarity}</span>
                    </div>
                </div>
                <div class="achievement-description">${ach.description}</div>
                <div class="achievement-xp">+${ach.xp} XP</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Error loading featured achievements:', error);
    }
}

// ========================================
// LOAD FAVORITE SONGS
// ========================================

async function loadFavoriteSongs(userId) {
    try {
        const votes = await getVotesForUser(userId);
        
        if (votes.length === 0) {
            return; // Keep no-content state
        }
        
        // Count song votes
        const songCounts = {};
        
        votes.forEach(vote => {
            const match = vote.match;
            if (!match) return;
            
            const votedSong = vote.choice === 'song1' ? match.song1 : match.song2;
            if (!votedSong) return;
            
            const songId = votedSong.id;
            
            if (!songCounts[songId]) {
                songCounts[songId] = {
                    id: songId,
                    name: votedSong.shortTitle || votedSong.title,
                    artist: votedSong.artist,
                    videoId: votedSong.videoId,
                    seed: votedSong.seed,
                    count: 0
                };
            }
            
            songCounts[songId].count++;
        });
        
        // Get top 3
        const topSongs = Object.values(songCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
        
        if (topSongs.length === 0) {
            return; // Keep no-content state
        }
        
        const medals = ['🥇', '🥈', '🥉'];
        
        const container = document.getElementById('favoriteSongs');
        container.innerHTML = topSongs.map((song, index) => `
            <div class="favorite-song-card">
                <div class="song-rank">${medals[index] || (index + 1)}</div>
                <img 
                    src="https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg" 
                    alt="${song.name}"
                    class="song-thumbnail"
                    loading="lazy"
                />
                <div class="song-details">
                    <div class="song-title">${song.name}</div>
                    <div class="song-meta">
                        <span>${song.artist}</span>
                        <span class="song-meta-separator">•</span>
                        <span>Seed #${song.seed}</span>
                        <span class="song-meta-separator">•</span>
                        <span class="song-vote-count">${song.count} ${song.count === 1 ? 'vote' : 'votes'}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Error loading favorite songs:', error);
    }
}

// ========================================
// LOAD RECENT POSTS
// ========================================

async function loadRecentPosts(userId) {
    try {
        const postsQuery = query(
            collection(db, 'posts'),
            where('userId', '==', userId),
            orderBy('timestamp', 'desc'),
            limit(3)
        );
        
        const snapshot = await getDocs(postsQuery);
        
        if (snapshot.empty) {
            return; // Keep no-content state
        }
        
        const posts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const container = document.getElementById('recentPosts');
        container.innerHTML = posts.map(post => renderPostCard(post)).join('');
        
    } catch (error) {
        console.error('❌ Error loading recent posts:', error);
    }
}

// ========================================
// LOAD ALL POSTS
// ========================================

async function loadAllPosts(userId) {
    try {
        const postsQuery = query(
            collection(db, 'posts'),
            where('userId', '==', userId),
            orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(postsQuery);
        
        // Update count
        document.getElementById('postsCount').textContent = snapshot.size;
        
        if (snapshot.empty) {
            return; // Keep no-content state
        }
        
        const posts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const container = document.getElementById('allPosts');
        container.innerHTML = posts.map(post => renderPostCard(post)).join('');
        
    } catch (error) {
        console.error('❌ Error loading all posts:', error);
    }
}

// ========================================
// LOAD ALL ACHIEVEMENTS
// ========================================

async function loadAllAchievements(userId) {
    try {
        const unlockedIds = await getUnlockedAchievementsFromFirebase(userId);
        
        // Update count
        document.getElementById('achievementsCount').textContent = unlockedIds.length;
        
        if (unlockedIds.length === 0) {
            return; // Keep no-content state
        }
        
        const achievements = unlockedIds
            .map(id => ({ ...ACHIEVEMENTS[id], id }))
            .filter(Boolean)
            .sort((a, b) => {
                const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4 };
                const rarityA = rarityOrder[a.rarity] || 0;
                const rarityB = rarityOrder[b.rarity] || 0;
                if (rarityB !== rarityA) return rarityB - rarityA;
                return (b.xp || 0) - (a.xp || 0);
            });
        
        const container = document.getElementById('allAchievements');
        container.innerHTML = achievements.map(ach => `
            <div class="achievement-card">
                <div class="achievement-header">
                    <div class="achievement-icon">${ach.icon}</div>
                    <div class="achievement-info">
                        <div class="achievement-name">${ach.name}</div>
                        <span class="achievement-rarity ${ach.rarity}">${ach.rarity}</span>
                    </div>
                </div>
                <div class="achievement-description">${ach.description}</div>
                <div class="achievement-xp">+${ach.xp} XP</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Error loading all achievements:', error);
    }
}

// ========================================
// RENDER POST CARD
// ========================================

function renderPostCard(post) {
    const avatar = post.avatar?.type === 'url' 
        ? `<img src="${post.avatar.value}" alt="${post.username}" />`
        : post.avatar?.value || '🎵';
    
    const timestamp = new Date(post.timestamp);
    const timeAgo = getTimeAgo(timestamp);
    
    return `
        <div class="post-card">
            <div class="post-header">
                <div class="post-avatar">${avatar}</div>
                <div class="post-author-info">
                    <div class="post-author">${post.username}</div>
                    <div class="post-timestamp">${timeAgo}</div>
                </div>
            </div>
            <div class="post-content">
                ${post.text || 'Voted in a match'}
            </div>
            <div class="post-actions">
                <button class="post-action-btn">
                    <i class="fas fa-heart"></i> ${post.likeCount || 0}
                </button>
                <button class="post-action-btn">
                    <i class="fas fa-comment"></i> ${post.commentCount || 0}
                </button>
            </div>
        </div>
    `;
}


async function getVoteCountForUser(userId) {
    try {
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );
        
        const snapshot = await getDocs(votesQuery);
        return snapshot.size;
    } catch (error) {
        console.error('❌ Error getting vote count:', error);
        return 0;
    }
}

async function getVotingStreakForUser(userId) {
    try {
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId),
            orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(votesQuery);
        
        if (snapshot.empty) return 0;
        
        const votes = snapshot.docs.map(doc => doc.data());
        
        // Get unique voting days
        const votingDays = [...new Set(votes.map(v => {
            const date = new Date(v.timestamp);
            return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        }))].sort().reverse();
        
        if (votingDays.length === 0) return 0;
        
        // Calculate streak
        let streak = 1;
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
        
        // If no vote today, check if voted yesterday
        let checkDate = votingDays[0] === todayStr ? new Date() : new Date(Date.now() - 86400000);
        
        for (let i = 0; i < votingDays.length - 1; i++) {
            const currentDay = new Date(votingDays[i]);
            const nextDay = new Date(votingDays[i + 1]);
            
            const dayDiff = Math.floor((currentDay - nextDay) / 86400000);
            
            if (dayDiff === 1) {
                streak++;
            } else {
                break;
            }
        }
        
        return streak;
    } catch (error) {
        console.error('❌ Error calculating streak:', error);
        return 0;
    }
}

async function getSongsAliveForUser(userId) {
    try {
        const votes = await getVotesForUser(userId);
        
        // Get unique songs user voted for that are still active
        const uniqueSongs = new Set();
        
        votes.forEach(vote => {
            if (!vote.match) return;
            
            const votedSong = vote.choice === 'song1' ? vote.match.song1 : vote.match.song2;
            if (!votedSong) return;
            
            // Check if song is still in tournament (not eliminated)
            const isEliminated = vote.match.status === 'completed' && 
                               vote.match.winnerId && 
                               vote.match.winnerId !== votedSong.id;
            
            if (!isEliminated) {
                uniqueSongs.add(votedSong.id);
            }
        });
        
        return uniqueSongs.size;
    } catch (error) {
        console.error('❌ Error calculating songs alive:', error);
        return 0;
    }
}

async function getVotesForUser(userId) {
    try {
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );
        
        const snapshot = await getDocs(votesQuery);
        
        if (snapshot.empty) return [];
        
        // Get match data for each vote
        const { getAllMatches } = await import('./api-client.js');
        const allMatches = await getAllMatches();
        const matchMap = new Map(allMatches.map(m => [m.matchId || m.id, m]));
        
        return snapshot.docs.map(doc => {
            const voteData = doc.data();
            return {
                ...voteData,
                match: matchMap.get(voteData.matchId)
            };
        });
    } catch (error) {
        console.error('❌ Error fetching votes:', error);
        return [];
    }
}

async function getFollowerCount(userId) {
    // TODO: Implement followers system
    return 0;
}

function formatJoinDate(date) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) {
        return 'Recently';
    } else if (diffDays < 30) {
        return `${Math.floor(diffDays / 7)} weeks ago`;
    } else if (diffDays < 365) {
        return `${Math.floor(diffDays / 30)} months ago`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
}

function getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ========================================
// SETUP TABS
// ========================================

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Remove active from all
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });
}

// ========================================
// STATE MANAGEMENT
// ========================================

function showLoadingState() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('notFoundState').style.display = 'none';
    document.getElementById('guestState').style.display = 'none';
    document.getElementById('profileContent').style.display = 'none';
}

function showNotFoundState() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('notFoundState').style.display = 'flex';
    document.getElementById('guestState').style.display = 'none';
    document.getElementById('profileContent').style.display = 'none';
}

function showGuestState() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('notFoundState').style.display = 'none';
    document.getElementById('guestState').style.display = 'flex';
    document.getElementById('profileContent').style.display = 'none';
}

function showProfileContent() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('notFoundState').style.display = 'none';
    document.getElementById('guestState').style.display = 'none';
    document.getElementById('profileContent').style.display = 'block';
}

// ========================================
// CACHE HELPERS
// ========================================

/**
 * Check if cached profile is still fresh
 */
function getCachedProfile(username) {
    const cacheKey = `profile-${username}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return null;
    
    try {
        const { profile, timestamp, ttl } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        if (age < ttl) {
            console.log(`📦 Using cached profile for ${username} (${Math.floor(age/1000)}s old)`);
            return profile;
        }
        
        // Expired
        localStorage.removeItem(cacheKey);
        return null;
        
    } catch (e) {
        localStorage.removeItem(cacheKey);
        return null;
    }
}

/**
 * Invalidate profile cache (call after profile edit)
 */
function invalidateProfileCache(username) {
    const cacheKey = `profile-${username}`;
    localStorage.removeItem(cacheKey);
    console.log(`🗑️ Invalidated cache for ${username}`);
}

/**
 * Get user XP with cache fallback
 */
async function getUserXPForUser(userId) {
    // If viewing own profile, use localStorage (most up-to-date)
    if (userId === currentUserId) {
        return getUserXPFromStorage();
    }
    
    // Check cache first
    const cacheKey = `xp-${userId}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
        const { xp, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        // Use cache if less than 5 minutes old
        if (age < 300000) {
            return xp;
        }
    }
    
    // Fetch from Firebase
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            const xp = userDoc.data().xp || 0;
            
            // Cache it
            localStorage.setItem(cacheKey, JSON.stringify({
                xp,
                timestamp: Date.now()
            }));
            
            return xp;
        }
    } catch (error) {
        console.warn('⚠️ Could not fetch XP for user:', error);
    }
    
    return 0;
}

// ========================================
// GLOBAL FUNCTIONS (TODO: Implement)
// ========================================

window.toggleFollow = async function(userId) {
    console.log('🔔 Toggle follow:', userId);
    // TODO: Implement follow system
    alert('Follow system coming soon!');
};

window.sendMessage = function(userId) {
    console.log('💬 Send message to:', userId);
    // TODO: Implement messaging
    alert('Messaging system coming soon!');
};

window.openUsernamePrompt = function() {
    if (window.showUsernamePrompt) {
        window.showUsernamePrompt();
    } else {
        alert('Please set up your profile in settings');
    }
};

// ========================================
// EXPORTS
// ========================================

export { invalidateProfileCache };

// Make globally accessible
window.invalidateProfileCache = invalidateProfileCache;

console.log('✅ Profile page module loaded');
