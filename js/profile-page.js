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
// MUSIC DATA CACHE (for thumbnails)
// ========================================

let musicData = {};

async function loadMusicData() {
    try {
        const response = await fetch('/data/music-videos.json');
        const data = await response.json();
        
        // Create lookup maps
        data.forEach(song => {
            musicData[song.id] = song;
            musicData[song.seed] = song;
            musicData[song.videoId] = song;
        });
        
        console.log(`✅ Loaded ${data.length} songs for thumbnails`);
    } catch (error) {
        console.error('❌ Error loading music data:', error);
    }
}

function getYoutubeThumbnail(songId) {
    const song = musicData[songId];
    
    if (song && song.videoId) {
        return `https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg`;
    }
    
    // If songId IS the videoId (11 characters)
    if (songId && songId.length === 11) {
        return `https://img.youtube.com/vi/${songId}/mqdefault.jpg`;
    }
    
    // Fallback
    return 'https://via.placeholder.com/160x90/0a0a0a/C8AA6E?text=No+Image';
}

// ========================================
// INITIALIZE
// ========================================

// Around line 65-80, update DOMContentLoaded:

document.addEventListener('DOMContentLoaded', async () => {
        showLoadingSpinner('Loading profile...');

    console.log('🎵 Profile page loading...');
    
    // ✅ FIX: Get userId with fallback
    const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    const currentUsername = localStorage.getItem('username') || localStorage.getItem('tournamentUsername');
    
    console.log('🔍 Current User ID:', userId);
    console.log('🔍 Current Username:', currentUsername);
    console.log('🔍 localStorage keys:', Object.keys(localStorage));
    
    // Load music data first
    await loadMusicData();
    
    // Get target username from URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetUsername = urlParams.get('user') || currentUsername;
    
    console.log('👤 Target username:', targetUsername);
    console.log('👤 Current user:', currentUsername);
    
    if (!targetUsername) {
        showNotFoundState();
        return;
    }
    
    // Setup tabs
    setupTabs();
    
    // Load profile
    await loadProfile(targetUsername);
});

// ========================================
// LOAD PROFILE
// ========================================

async function loadProfile(username) {
    try {
        console.log('📥 Loading profile for:', username);
        
        
        const profile = await fetchUserProfile(username);
        
        if (!profile) {
                        hideLoadingSpinner(); // ✅ Hide spinner before showing error

            showNotFoundState();
            return;
        }
        
        currentProfile = profile;
        isOwnProfile = (username === currentUsername);
        
        await renderProfile(profile);
        
        // Load Overview tab content + PRELOAD COUNTS
        await Promise.all([
            loadProfileStats(profile.userId),
            loadParticipationData(profile.userId),
            loadFeaturedAchievements(profile.userId),
            loadRecentVotes(profile.userId, 5),
            loadFavoriteSongs(profile.userId),
            preloadTabCounts(profile.userId),  // ✅ NEW: Preload counts
                        updateFollowCounts()  // ✅ ADD THIS

        ]);
        
         // ✅ ADD THIS: Render follow button
        await updateFollowButton();

        setupVoteFilters();
                hideLoadingSpinner(); // ✅ Hide spinner when done

        showProfileContent();
        
    } catch (error) {
        console.error('❌ Error loading profile:', error);
                hideLoadingSpinner(); // ✅ Hide spinner on error

        showNotFoundState();
    }
}

// ✅ NEW FUNCTION: Preload tab counts
async function preloadTabCounts(userId) {
    try {
        // Get vote count
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );
        const votesSnapshot = await getDocs(votesQuery);
        document.getElementById('votesCount').textContent = votesSnapshot.size;
        
        // Get achievements count
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        const achievementsCount = profileDoc.exists() 
            ? (profileDoc.data().unlockedAchievements || []).length 
            : 0;
        document.getElementById('achievementsCount').textContent = achievementsCount;
        
        console.log('✅ Tab counts preloaded');
        
    } catch (error) {
        console.error('❌ Error preloading counts:', error);
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
            const profile = await fetchUserProfileDirect(username);
            if (profile) return profile;
        } catch (fallbackError) {
            console.error('❌ Direct Firebase also failed:', fallbackError);
        }
        
        // ✅ Last resort: generate fallback profile
        console.log('🔧 Using fallback profile generation');
        return generateFallbackProfile(username);
    }
}

// ========================================
// DIRECT FIREBASE FALLBACK (temporary until edge function deployed)
// ========================================

// ========================================
// DIRECT FIREBASE FALLBACK (with user generation)
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
            
            // ✅ FALLBACK: Generate temporary profile for users without one
            return generateFallbackProfile(username);
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
// GENERATE FALLBACK PROFILE
// ========================================

function generateFallbackProfile(username) {
    console.log('🔧 Generating fallback profile for:', username);
    
    // Champion avatar pool
    const champions = [
        { championId: 'Ahri', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Ahri.png' },
        { championId: 'Akali', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Akali.png' },
        { championId: 'Yasuo', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Yasuo.png' },
        { championId: 'Jinx', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Jinx.png' },
        { championId: 'Lux', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Lux.png' },
        { championId: 'Ezreal', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Ezreal.png' },
        { championId: 'Zed', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Zed.png' },
        { championId: 'KSante', imageUrl: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/KSante.png' }
    ];
    
    // Use username hash to consistently pick same champion
    const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const champion = champions[hash % champions.length];
    
    return {
        userId: 'unknown',
        username: username,
        avatar: {
            type: 'champion',
            championId: champion.championId,
            imageUrl: champion.imageUrl
        },
        bio: 'New to Anthem Arena',
        privacy: {
            isPublic: true
        },
        createdAt: Date.now(),
        isFallback: true  // Flag to indicate this is a generated profile
    };
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
    
    // ✅ FIXED: Rank with proper XP detection
    const { getUserXPFromStorage, getUserRank, calculateUserXP } = await import('./rank-system.js');
    
    // Get current user ID with fallback
    const currentUserId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    const isViewingOwnProfile = (profile.userId === currentUserId);
    
    let xp;
    
    if (isViewingOwnProfile) {
        // ✅ Use stored XP for own profile
        xp = getUserXPFromStorage();
        console.log('✅ Using stored XP for rank display:', xp);
    } else {
        // ✅ Calculate XP from votes for other profiles
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', profile.userId)
        );
        const votesSnapshot = await getDocs(votesQuery);
        const allVotes = votesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const xpData = calculateUserXP(allVotes);
        xp = xpData.totalXP;
        console.log('✅ Calculated XP for rank display:', xp);
    }
    
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

    // ✅ NEW: Show fallback notice if this is a generated profile
    if (profile.isFallback) {
        const bioEl = document.getElementById('profileBio');
        bioEl.innerHTML = `
            <div style="padding: 1rem; background: rgba(200, 170, 110, 0.1); border-radius: 8px; border: 1px solid rgba(200, 170, 110, 0.3);">
                <p style="margin: 0; color: rgba(240, 230, 210, 0.7); font-size: 0.9rem;">
                    <i class="fas fa-info-circle"></i> This user hasn't set up their profile yet. Their activity and votes are still tracked!
                </p>
            </div>
        `;
        bioEl.style.display = 'block';
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
renderProfileActions(isViewingOwnProfile);
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

// ========================================
// RENDER PROFILE ACTIONS
// ========================================

async function renderProfileActions(isOwnProfile) {
    console.log('🎬 renderProfileActions called, isOwnProfile =', isOwnProfile);
    const actionsEl = document.getElementById('profileActions');
    if (!actionsEl) return;
    
    if (isOwnProfile) {
        // ========================================
        // OWN PROFILE - Show Notifications + Settings
        // ========================================
        actionsEl.innerHTML = `
            <button class="profile-action-btn secondary" id="profileNotificationBtn" onclick="window.openNotificationPanel()">
                <i class="fas fa-bell"></i> Notifications
                <span class="notification-badge" id="profileNotificationBadge" style="display: none;">0</span>
            </button>
            <button class="profile-action-btn primary" onclick="window.openSettingsModal()">
                <i class="fas fa-cog"></i> Settings
            </button>
        `;
        
        // Update notification badge count
        updateProfileNotificationBadge();
        
    } else {
        // ========================================
        // OTHER USER'S PROFILE - Show Follow + Message (with privacy checks)
        // ========================================
        
        // Show loading state initially
        actionsEl.innerHTML = `
            <button class="profile-action-btn follow" disabled style="opacity: 0.6;">
                <i class="fas fa-spinner fa-spin"></i> Loading...
            </button>
            <button class="profile-action-btn secondary" disabled style="opacity: 0.6;">
                <i class="fas fa-spinner fa-spin"></i> Loading...
            </button>
        `;
        
        try {
            // Check follow status
            const { isFollowing } = await import('./follow-system.js');
            const following = await isFollowing(currentProfile.userId);
            
            // Check privacy permissions
            const { getAvailableActions } = await import('./notification-storage.js');
            const permissions = await getAvailableActions(currentProfile.userId);
            
            console.log('🔐 Permissions for profile actions:', permissions);
            
            // Build Follow button
            const followBtn = `
                <button class="profile-action-btn follow ${following ? 'following' : ''}" 
                        id="profileFollowBtn"
                        data-user-id="${currentProfile.userId}"
                        data-username="${currentProfile.username}">
                    ${following ? 
                        '<i class="fas fa-user-check"></i> Following' : 
                        '<i class="fas fa-user-plus"></i> Follow'
                    }
                </button>
            `;
            
            // Build Message button (with privacy check)
            let messageBtn;
            if (permissions.canMessage) {
                messageBtn = `
                    <button class="profile-action-btn secondary" id="profileMessageBtn"
                            data-user-id="${currentProfile.userId}"
                            data-username="${currentProfile.username}">
                        <i class="fas fa-envelope"></i> Message
                    </button>
                `;
            } else {
                // Show disabled button with reason
                const reason = permissions.messageReason || 'Messages disabled';
                messageBtn = `
                    <button class="profile-action-btn secondary" 
                            disabled 
                            style="opacity: 0.5; cursor: not-allowed;"
                            title="${reason}">
                        <i class="fas fa-lock"></i> ${reason.includes('followers') ? 'Follow to Message' : 'Messages Off'}
                    </button>
                `;
            }
            
            actionsEl.innerHTML = followBtn + messageBtn;
            
            // Attach event listeners
            const followButton = document.getElementById('profileFollowBtn');
            if (followButton) {
                followButton.addEventListener('click', handleFollowClick);
            }
            
            const messageButton = document.getElementById('profileMessageBtn');
            if (messageButton && permissions.canMessage) {
                messageButton.addEventListener('click', handleMessageClick);
            }
            
        } catch (error) {
            console.error('❌ Error loading profile actions:', error);
            
            // Fallback to basic buttons on error
            actionsEl.innerHTML = `
                <button class="profile-action-btn follow" id="profileFollowBtn"
                        data-user-id="${currentProfile.userId}"
                        data-username="${currentProfile.username}">
                    <i class="fas fa-user-plus"></i> Follow
                </button>
                <button class="profile-action-btn secondary" id="profileMessageBtn"
                        data-user-id="${currentProfile.userId}"
                        data-username="${currentProfile.username}">
                    <i class="fas fa-envelope"></i> Message
                </button>
            `;
            
            document.getElementById('profileFollowBtn')?.addEventListener('click', handleFollowClick);
            document.getElementById('profileMessageBtn')?.addEventListener('click', handleMessageClick);
        }
    }
}

// ========================================
// UPDATE PROFILE NOTIFICATION BADGE
// ========================================

async function updateProfileNotificationBadge() {
    try {
        const { getUnreadCount } = await import('./notification-storage.js');
        const userId = localStorage.getItem('tournamentUserId');
        
        if (!userId || userId === 'anonymous') return;
        
        const count = await getUnreadCount(userId);
        const badge = document.getElementById('profileNotificationBadge');
        
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.warn('Could not update notification badge:', error);
    }
}

// ========================================
// HANDLE FOLLOW BUTTON CLICK
// ========================================
async function handleFollowClick(e) {
    const btn = e.currentTarget;
    const targetUserId = btn.dataset.userId;
    const targetUsername = btn.dataset.username;
    const isCurrentlyFollowing = btn.classList.contains('following');
    
    // Disable button during action
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    
    try {
        if (isCurrentlyFollowing) {
            const { unfollowUser } = await import('./follow-system.js');
            const result = await unfollowUser(targetUserId);
            
            if (result.success) {
                btn.classList.remove('following');
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                await updateFollowCounts();
                
                if (window.showQuickToast) {
                    window.showQuickToast(`Unfollowed ${targetUsername}`, 2000);
                }
            } else {
                throw new Error('Failed to unfollow');
            }
        } else {
            const { followUser } = await import('./follow-system.js');
            const result = await followUser(targetUserId, targetUsername);
            
            if (result.success) {
                btn.classList.add('following');
                btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
                await updateFollowCounts();
                
                if (window.showQuickToast) {
                    window.showQuickToast(`✅ Now following ${targetUsername}!`, 2000);
                }
            } else {
                throw new Error('Failed to follow');
            }
        }
    } catch (error) {
        console.error('❌ Follow action failed:', error);
        btn.innerHTML = originalHTML;
        
        if (window.showQuickToast) {
            window.showQuickToast('⚠️ Action failed, please try again', 2000);
        }
    } finally {
        btn.disabled = false;
    }
}

// ========================================
// HANDLE MESSAGE BUTTON CLICK
// ========================================

async function handleMessageClick(e) {
    const btn = e.currentTarget;
    const targetUserId = btn.dataset.userId;
    const targetUsername = btn.dataset.username;
    
    try {
        // Open message composer
        showProfileMessageComposer(targetUserId, targetUsername);
    } catch (error) {
        console.error('❌ Error opening message composer:', error);
        alert('Could not open message composer. Please try again.');
    }
}

// ========================================
// MESSAGE COMPOSER MODAL
// ========================================

function showProfileMessageComposer(toUserId, toUsername) {
    const existing = document.getElementById('messageComposer');
    if (existing) existing.remove();
    
    const composer = document.createElement('div');
    composer.id = 'messageComposer';
    composer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(5px);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
    `;
    
    composer.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 2px solid rgba(200, 170, 110, 0.3);
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #C8AA6E; font-size: 1.2rem;">
                    💬 Message ${toUsername}
                </h3>
                <button id="closeComposer" style="
                    background: none;
                    border: none;
                    color: #888;
                    font-size: 1.5rem;
                    cursor: pointer;
                ">×</button>
            </div>
            
            <textarea id="messageInput" 
                placeholder="Type your message... (max 300 characters)"
                maxlength="300"
                style="
                    width: 100%;
                    height: 120px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid rgba(200, 170, 110, 0.3);
                    border-radius: 8px;
                    padding: 12px;
                    color: #fff;
                    font-family: inherit;
                    font-size: 1rem;
                    resize: vertical;
                    margin-bottom: 12px;
                    box-sizing: border-box;
                "
            ></textarea>
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span id="charCount" style="color: #888; font-size: 0.85rem;">0/300</span>
                <div style="display: flex; gap: 8px;">
                    <button id="cancelMessage" style="
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                    ">Cancel</button>
                    <button id="sendMessage" style="
                        background: linear-gradient(135deg, #C8AA6E, #B89A5E);
                        border: none;
                        color: #1a1a2e;
                        padding: 10px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 700;
                    ">Send 💬</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(composer);
    
    const input = document.getElementById('messageInput');
    const charCount = document.getElementById('charCount');
    const sendBtn = document.getElementById('sendMessage');
    const cancelBtn = document.getElementById('cancelMessage');
    const closeBtn = document.getElementById('closeComposer');
    
    input.focus();
    
    input.addEventListener('input', () => {
        const length = input.value.length;
        charCount.textContent = `${length}/300`;
    });
    
    const closeComposer = () => {
        composer.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => composer.remove(), 200);
    };
    
    closeBtn.addEventListener('click', closeComposer);
    cancelBtn.addEventListener('click', closeComposer);
    composer.addEventListener('click', (e) => {
        if (e.target === composer) closeComposer();
    });
    
    sendBtn.addEventListener('click', async () => {
        const message = input.value.trim();
        if (!message) return;
        
        sendBtn.textContent = 'Sending...';
        sendBtn.disabled = true;
        
        try {
            const { sendMessage } = await import('./message-system.js');
            const result = await sendMessage(toUserId, toUsername, message, { source: 'profile' });
            
            if (result.success) {
                sendBtn.textContent = '✓ Sent!';
                setTimeout(() => {
                    closeComposer();
                    if (window.showQuickToast) {
                        window.showQuickToast(`✅ Message sent to ${toUsername}!`, 2000);
                    }
                }, 1000);
            } else {
                throw new Error(result.error || 'Failed to send');
            }
        } catch (error) {
            console.error('❌ Send message error:', error);
            sendBtn.textContent = '✗ Failed';
            setTimeout(() => {
                sendBtn.textContent = 'Send 💬';
                sendBtn.disabled = false;
            }, 2000);
        }
    });
}

// ========================================
// OPEN NOTIFICATION PANEL
// ========================================

window.openNotificationPanel = async function() {
    try {
        // Click the notification bell if it exists in nav
        const bell = document.getElementById('notificationBell');
        if (bell) {
            bell.click();
        } else {
            // Initialize notification center if not already loaded
            const { initNotificationCenter } = await import('./notification-center.js');
            await initNotificationCenter();
            
            // Try clicking again after init
            setTimeout(() => {
                const bellAfterInit = document.getElementById('notificationBell');
                if (bellAfterInit) {
                    bellAfterInit.click();
                }
            }, 100);
        }
    } catch (error) {
        console.error('❌ Could not open notifications:', error);
        alert('Notifications are not available at the moment.');
    }
};

// ========================================
// LOAD PROFILE STATS
// ========================================

// ========================================
// LOAD PROFILE STATS
// ========================================

// ========================================
// LOAD PROFILE STATS
// ========================================

// ========================================
// LOAD PROFILE STATS
// ========================================

async function loadProfileStats(userId) {
    try {
        console.log('📊 Loading stats for user:', userId);
         // ✅ FIX: Get current user ID with fallback
        const currentUserId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        const isViewingOwnProfile = (userId === currentUserId);
        
        console.log('🔍 Is viewing own profile?', isViewingOwnProfile);
        console.log('🔍 Current user ID:', currentUserId);
        console.log('🔍 Profile user ID:', userId);
        
        // Get votes count
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );
        const votesSnapshot = await getDocs(votesQuery);
        const votesCount = votesSnapshot.size;
        
        // ✅ NEW: Check for newly unlocked achievements (only for own profile)
        if (isViewingOwnProfile && votesCount > 0) {
            console.log('🏆 Checking for newly unlocked achievements...');
            
            // Get full vote data for achievement checking
            const votes = votesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Import and run achievement checker
            const { checkAchievements } = await import('./achievement-tracker.js');
            await checkAchievements(votes);
            
            console.log('✅ Achievement check complete');
        }
        
        // Get achievements count (might have changed after checking)
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        const unlockedAchievements = profileDoc.exists() 
            ? (profileDoc.data().unlockedAchievements || [])
            : [];
        const achievementsCount = unlockedAchievements.length;
        
        // ✅ GET RANK - Different logic for own profile vs others
        const { getUserXPFromStorage, getUserRank, calculateUserXP } = await import('./rank-system.js');
        
        let currentXP;
        let rank;
        
        if (isViewingOwnProfile) {
            // ✅ For your own profile: Use stored XP (faster, includes bonuses)
            currentXP = getUserXPFromStorage();
            rank = getUserRank(currentXP);
            console.log('✅ Using stored XP for own profile:', currentXP);
        } else {
            // ✅ For other profiles: Calculate XP from their votes
            const allVotes = votesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            const xpData = calculateUserXP(allVotes);
            currentXP = xpData.totalXP;
            rank = getUserRank(currentXP);
            console.log('✅ Calculated XP for other user:', currentXP, xpData);
        }
        
        // Update stats display
        document.getElementById('statTotalVotes').textContent = votesCount;
        document.getElementById('statAchievements').textContent = achievementsCount;
        
        // ✅ UPDATE ACTIVITY LEVEL WITH RANK
        const activityLevelEl = document.getElementById('statActivityLevel');
        if (activityLevelEl) {
            // Remove emoji from rank title
            const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
            
            // Two-line display: Level number + Title
            activityLevelEl.innerHTML = `
                <span style="font-size: 1.5rem; font-weight: 700; color: #c8aa6e; display: block;">Lv. ${rank.currentLevel.level}</span>
                <span style="font-size: 1rem; font-weight: 600; color: rgba(240, 230, 210, 0.8); display: block; margin-top: 4px;">${cleanTitle}</span>
            `;
        }
        
        console.log('✅ Stats loaded:', {
            userId,
            isOwnProfile: isViewingOwnProfile,
            votes: votesCount,
            achievements: achievementsCount,
            xp: currentXP,
            level: rank.currentLevel.level,
            title: rank.currentLevel.title
        });
        
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}


// ========================================
// LOAD FEATURED ACHIEVEMENTS
// ========================================

// ========================================
// LOAD FEATURED ACHIEVEMENTS
// ========================================

async function loadFeaturedAchievements(userId) {
    try {
        console.log('🏆 Loading featured achievements for:', userId);
        
        // ✅ Don't try to load achievements for fallback profiles
        if (!userId || userId === 'unknown') {
            console.log('⚠️ Skipping achievements for fallback profile');
            return;
        }
        
        const unlockedIds = await getUnlockedAchievementsFromFirebase(userId);
        console.log('🏆 Unlocked achievement IDs:', unlockedIds);
        
        if (unlockedIds.length === 0) {
            console.log('⚠️ No achievements unlocked yet');
            return; // Keep no-content state
        }
        
        // Get top 3 achievements (highest rarity/XP)
        const unlockedAchievements = unlockedIds
            .map(id => {
                const ach = ACHIEVEMENTS[id];
                if (!ach) {
                    console.warn(`⚠️ Achievement not found in ACHIEVEMENTS object: ${id}`);
                }
                return ach;
            })
            .filter(Boolean)
            .sort((a, b) => {
                const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4 };
                const rarityA = rarityOrder[a.rarity] || 0;
                const rarityB = rarityOrder[b.rarity] || 0;
                if (rarityB !== rarityA) return rarityB - rarityA;
                return (b.xp || 0) - (a.xp || 0);
            })
            .slice(0, 3);
        
        console.log('🏆 Featured achievements to display:', unlockedAchievements);
        
        const container = document.getElementById('featuredAchievements');
        
        if (!container) {
            console.error('❌ featuredAchievements container not found!');
            return;
        }
        
        if (unlockedAchievements.length === 0) {
            console.log('⚠️ No valid achievements to display');
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
        
        console.log('✅ Featured achievements rendered');
        
    } catch (error) {
        console.error('❌ Error loading featured achievements:', error);
    }
}

// ========================================
// LOAD FAVORITE SONGS
// ========================================

// ========================================
// LOAD FAVORITE SONGS
// ========================================

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
                // ✅ Look up song data from musicData cache
                const songData = musicData[votedSong.videoId] || musicData[songId] || votedSong;
                
                songCounts[songId] = {
                    id: songId,
                    name: votedSong.shortTitle || votedSong.title,
                    artist: votedSong.artist,
                    videoId: votedSong.videoId,
                    seed: votedSong.seed,
                    thumbnail: songData.thumbnail || `https://img.youtube.com/vi/${votedSong.videoId}/mqdefault.jpg`, // ✅ Use thumbnail from JSON
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
                    src="${song.thumbnail}" 
                    alt="${song.name}"
                    class="song-thumbnail"
                    loading="lazy"
                    onerror="this.src='https://via.placeholder.com/160x90/0a0a0a/C8AA6E?text=🎵'"
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
// LOAD ALL FAVORITE SONGS (for Songs tab)
// ========================================

// ========================================
// LOAD ALL FAVORITE SONGS (for Songs tab)
// ========================================

async function loadAllFavoriteSongs(userId) {
    try {
        const votes = await getVotesForUser(userId);
        
        if (votes.length === 0) {
            document.getElementById('allFavoriteSongs').innerHTML = `
                <div class="no-content">
                    <i class="fas fa-music"></i>
                    <p>No votes yet</p>
                </div>
            `;
            return;
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
                // ✅ Look up song data from musicData cache
                const songData = musicData[votedSong.videoId] || musicData[songId] || votedSong;
                
                songCounts[songId] = {
                    id: songId,
                    name: votedSong.shortTitle || votedSong.title,
                    artist: votedSong.artist,
                    videoId: votedSong.videoId,
                    seed: votedSong.seed,
                    thumbnail: songData.thumbnail || `https://img.youtube.com/vi/${votedSong.videoId}/mqdefault.jpg`, // ✅ Use thumbnail from JSON
                    count: 0
                };
            }
            
            songCounts[songId].count++;
        });
        
        // Sort by count
        const allSongs = Object.values(songCounts)
            .sort((a, b) => b.count - a.count);
        
        if (allSongs.length === 0) {
            document.getElementById('allFavoriteSongs').innerHTML = `
                <div class="no-content">
                    <i class="fas fa-music"></i>
                    <p>No votes yet</p>
                </div>
            `;
            return;
        }
        
        const container = document.getElementById('allFavoriteSongs');
        container.innerHTML = allSongs.map((song, index) => {
            const medals = ['🥇', '🥈', '🥉'];
            const rank = medals[index] || `#${index + 1}`;
            
            return `
                <div class="favorite-song-card">
                    <div class="song-rank">${rank}</div>
                    <img 
                        src="${song.thumbnail}" 
                        alt="${song.name}"
                        class="song-thumbnail"
                        loading="lazy"
                        onerror="this.src='https://via.placeholder.com/160x90/0a0a0a/C8AA6E?text=🎵'"
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
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading all favorite songs:', error);
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
// LOAD RECENT VOTES (for Overview tab)
// ========================================

// ✅ AFTER - Change parameter name to "limitCount"
async function loadRecentVotes(userId, limitCount = 5) {
    try {
        console.log(`📥 Loading recent ${limitCount} votes for user:`, userId);
        
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId),
            orderBy('timestamp', 'desc'),
            limit(limitCount)  // ✅ Now limit() is the Firestore function, limitCount is the value
        );
        
        const snapshot = await getDocs(votesQuery);
        
        const recentVotesContainer = document.getElementById('recentVotes');
        
        if (snapshot.empty) {
            recentVotesContainer.innerHTML = `
                <div class="no-content">
                    <i class="fas fa-vote-yea"></i>
                    <p>No votes yet</p>
                </div>
            `;
            return;
        }
        
        // Get all matches for lookup
        const { getAllMatches } = await import('./api-client.js');
        const allMatches = await getAllMatches();
        const matchMap = new Map(allMatches.map(m => [m.matchId || m.id, m]));
        
        // Render votes
        const votesHTML = snapshot.docs
            .map(doc => renderVoteCard(doc.data(), matchMap))
            .join('');
        
        recentVotesContainer.innerHTML = votesHTML;
        
        console.log(`✅ Loaded ${snapshot.size} recent votes`);
        
    } catch (error) {
        console.error('❌ Error loading recent votes:', error);
        document.getElementById('recentVotes').innerHTML = `
            <div class="no-content">
                <i class="fas fa-exclamation-circle"></i>
                <p>Could not load recent votes</p>
            </div>
        `;
    }
}

// ========================================
// LOAD ALL VOTES (for Votes tab)
// ========================================

let currentVoteFilter = 'all';
let allUserVotes = [];

async function loadAllVotes(userId) {
    try {
        console.log(`📥 Loading all votes for user:`, userId);
        
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId),
            orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(votesQuery);
        
        // Update count badge
        document.getElementById('votesCount').textContent = snapshot.size;
        
        if (snapshot.empty) {
            document.getElementById('allVotes').innerHTML = `
                <div class="no-content">
                    <i class="fas fa-vote-yea"></i>
                    <p>No votes yet</p>
                </div>
            `;
            return;
        }
        
        // Get all matches for lookup
        const { getAllMatches } = await import('./api-client.js');
        const allMatches = await getAllMatches();
        const matchMap = new Map(allMatches.map(m => [m.matchId || m.id, m]));
        
        // Store votes for filtering
        allUserVotes = snapshot.docs.map(doc => ({
            voteData: doc.data(),
            match: matchMap.get(doc.data().matchId)
        }));
        
        // Render with current filter
        renderFilteredVotes(currentVoteFilter);
        
        console.log(`✅ Loaded ${snapshot.size} total votes`);
        
    } catch (error) {
        console.error('❌ Error loading all votes:', error);
        document.getElementById('allVotes').innerHTML = `
            <div class="no-content">
                <i class="fas fa-exclamation-circle"></i>
                <p>Could not load votes</p>
            </div>
        `;
    }
}

// ========================================
// RENDER FILTERED VOTES
// ========================================

function renderFilteredVotes(filter) {
    const allVotesContainer = document.getElementById('allVotes');
    
    if (!allUserVotes || allUserVotes.length === 0) {
        allVotesContainer.innerHTML = `
            <div class="no-content">
                <i class="fas fa-vote-yea"></i>
                <p>No votes yet</p>
            </div>
        `;
        return;
    }
    
    // Filter votes
    let filteredVotes = allUserVotes;
    
    if (filter !== 'all') {
        filteredVotes = allUserVotes.filter(({ voteData, match }) => {
            const status = getVoteStatus(voteData, match);
            return status === filter;
        });
    }
    
    if (filteredVotes.length === 0) {
        allVotesContainer.innerHTML = `
            <div class="no-content">
                <i class="fas fa-filter"></i>
                <p>No ${filter} votes found</p>
            </div>
        `;
        return;
    }
    
    // Create match map for rendering
    const matchMap = new Map(allUserVotes.map(v => [v.voteData.matchId, v.match]));
    
    // Render votes
    const votesHTML = filteredVotes
        .map(({ voteData }) => renderVoteCard(voteData, matchMap))
        .join('');
    
    allVotesContainer.innerHTML = votesHTML;
}

// ========================================
// RENDER VOTE CARD (Activity style)
// ========================================

// ========================================
// RENDER VOTE CARD (Activity style)
// ========================================

function renderVoteCard(vote, matchMap) {
    const match = matchMap.get(vote.matchId);
    
    if (!match) {
        return `
            <div class="vote-card-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Match data not found</p>
            </div>
        `;
    }
    
    const { song1, song2 } = match;

    // ✅ Helper to get artist/champion name with fallback
    const getArtistName = (song) => {
        if (!song) return 'Unknown';
        return song.artist || song.champion || 'League of Legends';
    };
    
    // ✅ GET THUMBNAILS FROM YOUTUBE (like activity.js)
    const getThumbnail = (song) => {
        if (!song) return 'https://via.placeholder.com/160x90?text=No+Image';
        
        // Try to get from music data using videoId
        if (song.videoId) {
            return getYoutubeThumbnail(song.videoId);
        }
        
        // Try to get from music data using song ID
        if (song.id) {
            return getYoutubeThumbnail(song.id);
        }
        
        // Fallback: check if thumbnail is already a string URL
        if (typeof song.thumbnail === 'string' && song.thumbnail.includes('http')) {
            return song.thumbnail;
        }
        
        // Last resort placeholder
        return 'https://via.placeholder.com/160x90/0a0a0a/C8AA6E?text=🎵';
    };
    
    // Determine vote status
    const status = getVoteStatus(vote, match);
    const statusConfig = {
        won: { emoji: '✅', label: 'WON', class: 'won' },
        lost: { emoji: '❌', label: 'LOST', class: 'lost' },
        live: { emoji: '🔴', label: 'LIVE', class: 'live' }
    };
    
    const statusInfo = statusConfig[status];
    
    // Get chosen and opponent songs
    const votedForSong1 = vote.choice === 'song1';
    const chosenSong = votedForSong1 ? song1 : song2;
    const opponentSong = votedForSong1 ? song2 : song1;
    
    // ✅ Get thumbnails
    const chosenThumbnail = getThumbnail(chosenSong);
    const opponentThumbnail = getThumbnail(opponentSong);
    
    // Format timestamp
    const timeAgo = formatTimeAgo(vote.timestamp);
    
    // Get tournament name
    const tournamentName = match.tournamentName || 'League of Legends';
    
    console.log('🖼️ Thumbnails:', {
        chosenSong: chosenSong.title,
        chosenThumbnail,
        chosenArtist: getArtistName(chosenSong),
        opponentSong: opponentSong.title,
        opponentThumbnail,
        opponentArtist: getArtistName(opponentSong)
    });
    
    return `
        <div class="vote-card ${status}">
            <div class="vote-header">
                <div class="vote-status-badge ${statusInfo.class}">
                    ${statusInfo.emoji} ${statusInfo.label}
                </div>
                <div class="vote-timestamp">${timeAgo}</div>
            </div>
            
            <div class="vote-matchup">
                <!-- Chosen Song (Left) -->
                <div class="vote-song chosen">
                    <div class="vote-song-thumbnail">
                        <img src="${chosenThumbnail}" alt="${chosenSong.title}" loading="lazy">
                    </div>
                    <div class="vote-song-info">
                        <div class="vote-song-title">${chosenSong.shortTitle || chosenSong.title}</div>
                        <div class="vote-song-meta">${getArtistName(chosenSong)} • Seed #${chosenSong.seed}</div>
                    </div>
                </div>
                
                <!-- VS Separator -->
                <div class="vote-vs">VS</div>
                
                <!-- Opponent Song (Right) -->
                <div class="vote-song opponent">
                    <div class="vote-song-thumbnail">
                        <img src="${opponentThumbnail}" alt="${opponentSong.title}" loading="lazy">
                    </div>
                    <div class="vote-song-info">
                        <div class="vote-song-title">${opponentSong.shortTitle || opponentSong.title}</div>
                        <div class="vote-song-meta">${getArtistName(opponentSong)} • Seed #${opponentSong.seed}</div>
                    </div>
                </div>
            </div>
            
            <div class="vote-footer">
                <span class="vote-tournament">${tournamentName}</span>
                <span class="vote-round">Round ${match.round}</span>
                <a href="/vote.html?id=${vote.matchId}" class="view-match-link">
                    View Match →
                </a>
            </div>
        </div>
    `;
}

// ========================================
// HELPER: Determine vote status
// ========================================

// ========================================
// HELPER: Determine vote status
// ========================================

// ========================================
// HELPER: Determine vote status
// ========================================

function getVoteStatus(vote, match) {
    if (!match) {
        return 'live';
    }
    
    // ✅ Check if match is completed
    if (match.status !== 'completed' && !match.winnerId) {
        return 'live';
    }
    
    // ✅ Determine which song the user voted for
    const votedSong = vote.choice === 'song1' ? match.song1 : match.song2;
    
    // ✅ Check if the voted song won (compare IDs)
    const userWon = match.winnerId === votedSong.id;
    
    console.log('🔍 Vote status check:', {
        matchId: match.id,
        status: match.status,
        winnerId: match.winnerId,
        voteChoice: vote.choice,
        votedSongId: votedSong.id,
        userWon: userWon,
        round: match.round
    });
    
    return userWon ? 'won' : 'lost';
}

// ========================================
// HELPER: Format time ago
// ========================================

// ========================================
// HELPER: Format time ago
// ========================================

// ========================================
// HELPER: Format time ago
// ========================================

function formatTimeAgo(timestamp) {
    let timeInMs;
    
    // Handle different timestamp formats
    if (timestamp && typeof timestamp === 'object' && timestamp.toMillis) {
        // Firestore Timestamp object
        timeInMs = timestamp.toMillis();
    } else if (typeof timestamp === 'string') {
        // ISO string (e.g., "2025-11-20T17:25:36.202Z")
        timeInMs = new Date(timestamp).getTime();
    } else if (typeof timestamp === 'number') {
        // Raw timestamp in milliseconds
        timeInMs = timestamp;
    } else {
        console.warn('⚠️ Invalid timestamp:', timestamp);
        return 'Unknown';
    }
    
    const now = Date.now();
    const diff = now - timeInMs;
    
    // Handle future timestamps
    if (diff < 0) {
        return 'Just now';
    }
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    return `${months}mo ago`;
}

// ========================================
// SETUP VOTE FILTERS
// ========================================

function setupVoteFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update filter and re-render
            currentVoteFilter = btn.dataset.filter;
            renderFilteredVotes(currentVoteFilter);
            
            console.log(`🔍 Filter changed to: ${currentVoteFilter}`);
        });
    });
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
        btn.addEventListener('click', async () => {
            const targetTab = btn.dataset.tab;
            
            // Remove active from all
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
            
            // Lazy load tab content
            if (targetTab === 'votes' && allUserVotes.length === 0) {
                await loadAllVotes(currentProfile.userId);
            }
            
            if (targetTab === 'participation' && window.participationData) {
                renderParticipationTab();  // ✅ NEW
            }
            
            if (targetTab === 'achievements' && document.getElementById('allAchievements').querySelector('.no-content')) {
                await loadAllAchievements(currentProfile.userId);
            }
            
            if (targetTab === 'songs' && document.getElementById('allFavoriteSongs').querySelector('.no-content')) {
                await loadAllFavoriteSongs(currentProfile.userId);
            }
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


// ========================================
// CALCULATE TOURNAMENT PARTICIPATION
// ========================================

// ========================================
// CALCULATE TOURNAMENT PARTICIPATION (CURRENT TOURNAMENT ONLY)
// ========================================

async function calculateTournamentParticipation(userId) {
    try {
        console.log('📊 Loading participation data...');
        
        const CURRENT_TOURNAMENT = '2025-worlds-anthems';
        
        // Total possible matches per round
        const TOTAL_MATCHES_BY_ROUND = {
            1: 29,
            2: 16,
            3: 8,
            4: 4,
            5: 2,
            6: 1
        };
        
        // Get ALL matches to filter by tournament
        const { getAllMatches } = await import('./api-client.js');
        const allMatches = await getAllMatches();
        const tournamentMatches = allMatches.filter(m => m.tournament === CURRENT_TOURNAMENT);
        
        console.log(`📊 Found ${tournamentMatches.length} matches in current tournament`);
        
        // Get user's votes
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );
        
        const snapshot = await getDocs(votesQuery);
        
        if (snapshot.empty) {
            return {
                overallPercentage: 0,
                byRound: Object.entries(TOTAL_MATCHES_BY_ROUND).map(([round, total]) => ({
                    round: parseInt(round),
                    roundName: getRoundName(parseInt(round)),
                    voted: 0,
                    total,
                    percentage: 0
                })),
                totalVotes: 0,
                totalPossible: 60
            };
        }
        
        // Filter votes to only include current tournament matches
        const tournamentVotes = snapshot.docs
            .map(doc => doc.data())
            .filter(vote => {
                // Check if this vote's match is in the current tournament
                const match = tournamentMatches.find(m => m.matchId === vote.matchId || m.id === vote.matchId);
                return match !== undefined;
            });
        
        console.log(`📊 User has ${tournamentVotes.length} votes in current tournament (${snapshot.size} total votes)`);
        
        // Count votes by round (only current tournament)
        const votesByRound = {};
        tournamentVotes.forEach(vote => {
            const match = tournamentMatches.find(m => m.matchId === vote.matchId || m.id === vote.matchId);
            if (match) {
                const round = match.round || vote.round || 1;
                votesByRound[round] = (votesByRound[round] || 0) + 1;
            }
        });
        
        // Calculate participation by round
        const byRound = Object.entries(TOTAL_MATCHES_BY_ROUND).map(([round, total]) => {
            const voted = votesByRound[round] || 0;
            const percentage = total > 0 ? Math.round((voted / total) * 100) : 0;
            
            return {
                round: parseInt(round),
                roundName: getRoundName(parseInt(round)),
                voted,
                total,
                percentage
            };
        });
        
        // Calculate overall participation (current tournament only)
        const totalPossible = Object.values(TOTAL_MATCHES_BY_ROUND).reduce((a, b) => a + b, 0);
        const totalVotes = tournamentVotes.length;
        const overallPercentage = Math.round((totalVotes / totalPossible) * 100);
        
        console.log('✅ Participation calculated:', {
            overallPercentage,
            totalVotes,
            totalPossible,
            byRound
        });
        
        return {
            overallPercentage,
            byRound,
            totalVotes,
            totalPossible
        };
        
    } catch (error) {
        console.error('❌ Error calculating participation:', error);
        return {
            overallPercentage: 0,
            byRound: [],
            totalVotes: 0,
            totalPossible: 60
        };
    }
}

// Helper: Get round name
function getRoundName(roundNumber) {
    const roundNames = {
        1: 'Round 1',
        2: 'Round 2',
        3: 'Sweet 16',
        4: 'Quarterfinals',
        5: 'Semifinals',
        6: 'Finals'
    };
    return roundNames[roundNumber] || `Round ${roundNumber}`;
}

// ========================================
// FOLLOW SYSTEM INTEGRATION
// ========================================

async function renderFollowButton(targetUserId, targetUsername) {
    const currentUserId = localStorage.getItem('userId');
    
    // Don't show follow button on own profile
    if (!currentUserId || currentUserId === targetUserId) {
        return '';
    }
    
    const { isFollowing } = await import('./follow-system.js');
    const following = await isFollowing(targetUserId);
    
    return `
        <button class="profile-follow-btn ${following ? 'following' : ''}" 
                id="followBtn"
                data-user-id="${targetUserId}"
                data-username="${targetUsername}">
            ${following ? 
                '<i class="fas fa-user-check"></i> Following' : 
                '<i class="fas fa-user-plus"></i> Follow'
            }
        </button>
    `;
}

async function updateFollowButton() {
    if (!currentProfile) return;

      // ✅ ADD THIS: Don't overwrite on own profile
    const currentUserId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    if (currentProfile.userId === currentUserId) {
        console.log('👤 Own profile - skipping follow button');
        return;
    }
    
    const profileActions = document.querySelector('.profile-actions');
    if (profileActions) {
        const followBtn = await renderFollowButton(currentProfile.userId, currentProfile.username);
        profileActions.innerHTML = followBtn;
        
        // Attach click handler
        const btn = document.getElementById('followBtn');
        if (btn) {
            btn.addEventListener('click', handleFollowClick);
        }
    }
}



async function updateFollowCounts() {
    if (!currentProfile) return;
    
    const { getFollowerCount, getFollowingCount } = await import('./follow-system.js');
    
    const followerCount = await getFollowerCount(currentProfile.userId);
    const followingCount = await getFollowingCount(currentProfile.userId);
    
    // Update counts in the profile header
    const followerCountEl = document.getElementById('followerCount');
    const followingCountEl = document.getElementById('followingCount');
    
    if (followerCountEl) followerCountEl.textContent = followerCount;
    if (followingCountEl) followingCountEl.textContent = followingCount;
}

// ========================================
// LOAD PARTICIPATION DATA
// ========================================

async function loadParticipationData(userId) {
    try {
        console.log('📊 Loading participation data...');
        
        const participation = await calculateTournamentParticipation(userId);
        
        // Update overall participation stat card
document.getElementById('statParticipation').textContent = `${participation.overallPercentage}%`;        
        // Update participation tab (lazy loaded when clicked)
        window.participationData = participation;
        
        console.log('✅ Participation data loaded:', participation);
        
    } catch (error) {
        console.error('❌ Error loading participation:', error);
    }
}

// ========================================
// RENDER PARTICIPATION TAB
// ========================================

// ========================================
// RENDER PARTICIPATION TAB
// ========================================

function renderParticipationTab() {
    const participation = window.participationData;
    
    if (!participation) {
        console.warn('⚠️ No participation data available');
        return;
    }
    
    // Animate circular progress
    const circle = document.getElementById('participationCircle');
    const circumference = 565.48; // 2 * π * 90
    const offset = circumference - (circumference * participation.overallPercentage / 100);
    
    setTimeout(() => {
        circle.style.strokeDashoffset = offset;
    }, 100);
    
    // Update percentage display
    document.getElementById('overallParticipation').textContent = `${participation.overallPercentage}%`;
    
    // Update summary text with tournament name
    const summary = document.getElementById('participationSummary');
    summary.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <strong style="color: #c8aa6e; font-size: 1.1rem;">🏆 2025 Worlds Anthems Championship</strong>
        </div>
        <p>You've voted in ${participation.totalVotes} out of ${participation.totalPossible} matches in this tournament.</p>
    `;
    
    // Render rounds breakdown
    const roundsContainer = document.getElementById('roundsBreakdown');
    
    roundsContainer.innerHTML = participation.byRound.map(round => `
        <div class="round-participation-card">
            <div class="round-header-row">
                <div class="round-name">${round.roundName}</div>
                <div class="round-stats">
                    <span class="round-votes">${round.voted}</span>
                    <span>/</span>
                    <span>${round.total}</span>
                </div>
            </div>
            <div class="round-progress-container">
                <div class="round-progress-fill" style="width: ${round.percentage}%"></div>
                <div class="round-percentage-badge">${round.percentage}%</div>
            </div>
        </div>
    `).join('');
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
