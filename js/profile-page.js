// ========================================
// PROFILE PAGE - ARCANE MOMENTS
// ========================================

import { db } from './firebase-config.js';
import { hiddenByReports } from './moderation-model.js';
// a post reported enough times is held back from everyone but its author until the admin has looked (js/moderation.js)
// Votes already have their own tab, so the Posts tab and its count are only what people typed
const isTypedPost = p => p.type !== 'vote';
const notHeld = p => !hiddenByReports(p, localStorage.getItem('tournamentUserId') || '');
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
import { achievementBadgeHtml, hasAchievementIcon } from './achievement-icons.js';
import { getUserXPFromStorage, getUserRank } from './rank-system.js';
import { getUnlockedAchievementsFromFirebase, calculateAchievementStats } from './achievement-tracker.js';
import { ACHIEVEMENTS } from './achievements.js';
import { buildAchievementsView, renderAchievementsHtml } from './achievements-view-model.js';
import { achievementVote } from './vote-facts.js';
import { ARCANE_CONFIG, ddragonUrl, getCompanionPack } from './arcane-config.js';
import { tidyNames, shortTitle } from './title-clean.js';
import { votePostText, lockedVoteNames } from './vote-post-text.js';
import { cupDisplayName } from './bracket-builder.js';
import { arrangeVotes, lockedLabel, backedMost, voteLocked, matchLabel, lockedVoteText, isClosed } from './profile-visibility.js';
import { hasSeed, renderOwnerInsights } from './profile-insights.js';
import { loadCupHistory } from './cup-history.js';
import { loadChampionsTab } from './champions-tab.js';
import { openReportDialog, openBlockDialog, getBlocked, unblockUser } from './moderation.js';

import { fixAvatarUrl, splashFromAvatar } from './avatar-url.js';
import { compareVotes, pickTitle, pickThumb } from './taste-match.js';
// ========================================
// HELPER FUNCTIONS - Loading Spinner
// ========================================

/**
 * Show loading spinner with custom message
 */
function showLoadingSpinner(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const spinnerText = document.getElementById('spinner-text');
    
    if (overlay && spinnerText) {
        spinnerText.textContent = message;
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Hide loading spinner
 */
function hideLoadingSpinner() {
    const overlay = document.getElementById('loading-overlay');
    
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    }
}


// State
let currentProfile = null;
let isOwnProfile = false;
// Is the person looking at this page its owner? (decides what a vote in a live match may show: see js/profile-visibility.js)
let viewerOwnsProfile = false;
let currentUserId = null;
let currentUsername = null;

// ========================================
// PREVENT DUPLICATE ACHIEVEMENT CHECKS
// ========================================

let profileStatsLoaded = false;
window.profileStatsLoaded = false;

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
    return 'https://via.placeholder.com/160x90/0a0a0a/ff4fb4?text=No+Image';
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
    // ?uid=<id> (the share link) wins over ?user=<name>; an id that is malformed or unknown is "not found", never a different person
    const rawUid = urlParams.get('uid');
    const targetUid = rawUid === null ? null : (/^[A-Za-z0-9_-]{6,128}$/.test(rawUid) ? rawUid : '');
    const targetUsername = urlParams.get('user') || currentUsername;
    
    console.log('👤 Target username:', targetUsername);
    console.log('👤 Current user:', currentUsername);
    
    if (targetUid === '' || (targetUid === null && !targetUsername)) {
        showNotFoundState();
        return;
    }
    
    // Setup tabs
    setupTabs();
    
    // Load profile
    await loadProfile(targetUid ? null : targetUsername, targetUid);
});

// ========================================
// LOAD PROFILE
// ========================================

async function loadProfile(username, uid = null) {
    try {
        console.log('📥 Loading profile for:', uid || username);
        
        
        const profile = uid ? await fetchProfileById(uid) : await fetchUserProfile(username);
        
        if (!profile) {
                        hideLoadingSpinner(); // ✅ Hide spinner before showing error

            showNotFoundState();
            return;
        }
        
        currentProfile = profile;
        isOwnProfile = uid ? (profile.userId === (localStorage.getItem('userId') || localStorage.getItem('tournamentUserId'))) : (username === currentUsername);
        viewerOwnsProfile = !!profile.userId && profile.userId === (localStorage.getItem('userId') || localStorage.getItem('tournamentUserId'));
        setEmptyVotesText();

            // ADD THIS LINE RIGHT HERE — PERFECT SPOT
        if (isOwnProfile && profile.userId) {
            await syncLocalAchievementsToFirebase(profile.userId);
        }
        // End of new line

        
        
        await renderProfile(profile);
        
        // Load Overview tab content + PRELOAD COUNTS
        await Promise.all([
            loadProfileStats(profile.userId),
            loadParticipationData(profile.userId),
            loadFeaturedAchievements(profile.userId),
            loadRecentVotes(profile.userId, 5),
            loadFavoriteSongs(profile.userId),
                loadFeaturedPosts(profile.userId),  // ✅ ADD THIS

            preloadTabCounts(profile.userId),  // ✅ NEW: Preload counts
                        updateFollowCounts()  // ✅ ADD THIS

        ]);
        
         // ✅ ADD THIS: Render follow button
        await updateFollowButton();

        setupVoteFilters();
                hideLoadingSpinner(); // ✅ Hide spinner when done

        showProfileContent();
        // The share band (footer.js) shares this profile's id link. A generated placeholder profile (no real id) has nothing to share.
        if (!profile.isFallback && profile.userId && profile.userId !== 'unknown') window.setProfileShare?.({ uid: profile.userId, name: profile.username });

        // Owner-only voting style + share image, then honour #votes etc.
        await loadOwnerInsights(profile.userId);
        loadTasteMatch(profile);          // not awaited: appears once both vote lists are in
        loadCupHistory(profile.userId, { isOwner: viewerOwnsProfile, viewerVoted: viewerHasVoted });   // not awaited: the history fills in when it is ready
        openTabFromHash();
        
    } catch (error) {
        console.error('❌ Error loading profile:', error);
                hideLoadingSpinner(); // ✅ Hide spinner on error

        showNotFoundState();
    }
}

/** "Sam hasn't voted in Jinx Cup 1 yet." (or "You haven't...") */
function emptyVotesText() {
    const cup = cupDisplayName(ARCANE_CONFIG.tournamentId);
    return viewerOwnsProfile ? `You haven't voted in ${cup} yet.` : `${currentProfile?.username || 'They'} hasn't voted in ${cup} yet.`;
}
function setEmptyVotesText() {
    document.querySelectorAll('[data-empty-votes]').forEach(el => { el.textContent = emptyVotesText(); });
}

// ✅ NEW FUNCTION: Preload tab counts
async function preloadTabCounts(userId) {
    const counts = { votes: 0, posts: 0, achievements: 0 };

    // Each count is fetched on its own, so one failing query can no longer
    // leave the later badges stuck on their default 0.

    // Votes (only votes whose match still exists)
    try {
        const { votes: visibleVotes } = await fetchUserVotes(userId);
        counts.votes = visibleVotes.length;
        document.getElementById('votesCount').textContent = counts.votes;
    } catch (error) {
        console.error('❌ Error preloading vote count:', error);
    }

    // Posts. The Firestore rules only allow reading posts whose privacy is
    // 'public', so the query has to say so or it is rejected outright.
    try {
        const postsSnapshot = await getDocs(query(
            collection(db, 'posts'),
            where('userId', '==', userId),
            where('privacy', '==', 'public')
        ));
        counts.posts = postsSnapshot.docs.filter(d => isTypedPost(d.data())).length;
        document.getElementById('postsCount').textContent = counts.posts;
    } catch (error) {
        console.error('❌ Error preloading post count:', error);
    }

    // Achievements
    try {
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        counts.achievements = profileDoc.exists()
            ? (profileDoc.data().unlockedAchievements || []).filter(id => ACHIEVEMENTS[id]).length
            : 0;
        document.getElementById('achievementsCount').textContent = counts.achievements;
    } catch (error) {
        console.error('❌ Error preloading achievement count:', error);
    }

    console.log('✅ Tab counts preloaded:', counts);
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

// By id (the share link). Same public data and the same shape as the name lookup; no placeholder profile for an unknown id.
async function fetchProfileById(uid) {
    try {
        const snap = await getDoc(doc(db, 'profiles', uid));
        return snap.exists() ? profileFromDoc(snap.id, snap.data()) : null;
    } catch (error) {
        console.error('❌ Error fetching profile by id:', error);
        return null;
    }
}

function profileFromDoc(id, profileData) {
    return {
        ...profileData,                       // the whole public profile, as the name lookup (edge function) returns it
        userId: id,
        username: profileData.username,
        avatar: profileData.avatar || { type: 'emoji', value: '👤' },
        companionId: profileData.companionId || profileData.championPackId || 'jinx',
        championPackId: profileData.championPackId || profileData.companionId || 'jinx',
        bio: profileData.bio || '',
        xp: profileData.xp,
        packXp: profileData.packXp,
        privacy: profileData.privacy || {},
        createdAt: profileData.createdAt,
        updatedAt: profileData.updatedAt
    };
}

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
        
       // In fetchUserProfileDirect()
return {
    userId: profileDoc.id,
    username: profileData.username,
    avatar: profileData.avatar || { type: 'emoji', value: '👤' },

    // Prefer the new Arcane field, fall back to the legacy field
    companionId: profileData.companionId || profileData.championPackId || 'jinx',

    // Keep legacy field available to older profile code for now
    championPackId: profileData.championPackId || profileData.companionId || 'jinx',

    bio: profileData.bio || '',
    xp: profileData.xp,                 // the saved XP total, so levels match for every viewer
    packXp: profileData.packXp,
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
        { championId: 'Ahri', imageUrl: ddragonUrl('img/champion/Ahri.png') },
        { championId: 'Akali', imageUrl: ddragonUrl('img/champion/Akali.png') },
        { championId: 'Yasuo', imageUrl: ddragonUrl('img/champion/Yasuo.png') },
        { championId: 'Jinx', imageUrl: ddragonUrl('img/champion/Jinx.png') },
        { championId: 'Lux', imageUrl: ddragonUrl('img/champion/Lux.png') },
        { championId: 'Ezreal', imageUrl: ddragonUrl('img/champion/Ezreal.png') },
        { championId: 'Zed', imageUrl: ddragonUrl('img/champion/Zed.png') },
        { championId: 'KSante', imageUrl: ddragonUrl('img/champion/KSante.png') }
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
bio: 'New to Arcane Moments',
companionId: 'jinx',
championPackId: 'jinx',
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

      // ✅ ADD THIS: Apply banner FIRST (before avatar)
    applyProfileBanner(profile);

    // Avatar
    const avatarEl = document.getElementById('profileAvatar');
    if (profile.avatar.type === 'url') {
        avatarEl.innerHTML = `<img src="${escapeHtml(fixAvatarUrl(profile.avatar.value))}" alt="${escapeHtml(profile.username)}" />`;
    } else {
        avatarEl.textContent = profile.avatar.value;
    }
    
    // Username
    document.getElementById('profileUsername').textContent = profile.username;
    
    // ✅ FIXED: Rank with proper XP detection
    const { getUserXPFromStorage, getUserRank, calculateUserXP, xpForProfile } = await import('./rank-system.js');
    
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
        
        xp = xpForProfile(profile, allVotes);   // the saved total (votes + achievements), so everyone sees the same level
        console.log('✅ XP for rank display:', xp);
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
            <div style="padding: 1rem; background: color-mix(in srgb, var(--pink, #c8aa6e) 10%, transparent); border-radius: 8px; border: 1px solid color-mix(in srgb, var(--pink, #c8aa6e) 30%, transparent);">
                <p style="margin: 0; color: color-mix(in srgb, var(--text, #f0e6d2) 70%, transparent); font-size: 0.9rem;">
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
    
    // ✅ NEW: Render social links
    renderSocialLinks(profile);

    // Render action buttons
renderProfileActions(isViewingOwnProfile);
}


// ✅ ADD THIS: New function to apply banner
function applyProfileBanner(profile) {
    const bannerEl = document.querySelector('.profile-banner');
    if (!bannerEl) return;
    
    const banner = { type: 'auto' };   // the cover follows the champion (and skin) in the avatar; banners are no longer chosen separately
    
    if (banner.type === 'default') {
        // Default gold gradient
        bannerEl.style.background = `
            linear-gradient(135deg, 
                color-mix(in srgb, var(--pink, #c8aa6e) 90%, transparent) 0%, 
                rgba(26, 26, 46, 0.95) 50%,
                rgba(10, 10, 10, 0.98) 100%
            )
        `;
        bannerEl.style.backgroundImage = '';
        
    } else if (banner.type === 'champion') {
        // Specific champion splash
        const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${banner.championId}_${banner.skinNumber || 0}.jpg`;
        bannerEl.style.backgroundImage = `
            linear-gradient(to bottom, 
                rgba(0, 0, 0, 0.4) 0%,
                rgba(10, 10, 10, 0.85) 100%
            ),
            url('${splashUrl}')
        `;
        bannerEl.style.backgroundSize = 'cover';
        bannerEl.style.backgroundPosition = 'center 25%';
        
    } else {
        // Auto-match avatar (default behavior)
        const splashUrl = splashFromAvatar(profile.avatar);   // the champion in the picture, wearing the same skin
        if (splashUrl) {
            
            bannerEl.style.backgroundImage = `
                linear-gradient(to bottom, 
                    rgba(0, 0, 0, 0.4) 0%,
                    rgba(10, 10, 10, 0.85) 100%
                ),
                url('${splashUrl}')
            `;
            bannerEl.style.backgroundSize = 'cover';
            bannerEl.style.backgroundPosition = 'center 25%';
        } else {
            // Fallback to gold gradient for emoji avatars
            bannerEl.style.background = `
                linear-gradient(135deg, 
                    color-mix(in srgb, var(--pink, #c8aa6e) 90%, transparent) 0%, 
                    rgba(26, 26, 46, 0.95) 50%,
                    rgba(10, 10, 10, 0.98) 100%
                )
            `;
            bannerEl.style.backgroundImage = '';
        }
    }
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
    // OWN PROFILE - Show Edit Profile Button
    // ========================================
    actionsEl.innerHTML = `
        <button class="profile-action-btn primary" onclick="window.openSettingsModal()">
            <i class="fas fa-edit"></i> Edit Profile
        </button>
    `;
        
    } else {
        // ========================================
        // OTHER USER'S PROFILE - Show Follow
        // ========================================
        
        // Show loading state initially
        actionsEl.innerHTML = `
            <button class="profile-action-btn follow" disabled style="opacity: 0.6;">
                <i class="fas fa-spinner fa-spin"></i> Loading...
            </button>
        `;
        
        try {
            // Check follow status
            const { isFollowing } = await import('./follow-system.js');
            const following = await isFollowing(currentProfile.userId);
            
            // Build Follow button
            const followBtn = `
                <button class="profile-action-btn follow ${following ? 'following' : ''}" 
                        id="profileFollowBtn"
                        data-user-id="${escapeHtml(currentProfile.userId)}"
                        data-username="${escapeHtml(currentProfile.username)}">
                    ${following ? 
                        '<i class="fas fa-user-check"></i> Following' : 
                        '<i class="fas fa-user-plus"></i> Follow'
                    }
                </button>
            `;
            
            actionsEl.innerHTML = followBtn + profileMoreHtml();
            bindProfileMore();
            
            // Attach event listeners
            const followButton = document.getElementById('profileFollowBtn');
            if (followButton) {
                followButton.addEventListener('click', handleFollowClick);
            }
            
        } catch (error) {
            console.error('❌ Error loading profile actions:', error);
            
            // Fallback to basic buttons on error
            actionsEl.innerHTML = `
                <button class="profile-action-btn follow" id="profileFollowBtn"
                        data-user-id="${escapeHtml(currentProfile.userId)}"
                        data-username="${escapeHtml(currentProfile.username)}">
                    <i class="fas fa-user-plus"></i> Follow
                </button>
            `;
            
            document.getElementById('profileFollowBtn')?.addEventListener('click', handleFollowClick);
        }
    }
}


// ========================================
// HANDLE FOLLOW BUTTON CLICK
// ========================================
async function handleFollowClick(e) {
    const btn = e.currentTarget;
    if (!hasProfileId()) {
        // one route to claiming a profile: the settings modal, as the nav avatar button does
        if (window.showQuickToast) window.showQuickToast('Claim your profile to follow', 2500);
        window.openSettingsModal?.();
        return;
    }
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
                    window.showQuickToast(`Unfollowed ${escapeHtml(targetUsername)}`, 2000);
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
                    window.showQuickToast(`✅ Now following ${escapeHtml(targetUsername)}!`, 2000);
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
        
        const currentUserId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        const isViewingOwnProfile = (userId === currentUserId);
        
        // Get votes count
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );
        const votesSnapshot = await getDocs(votesQuery);
        const votesCount = votesSnapshot.size;
        
        // ✅ ONE-TIME achievement check for own profile (max once per hour)
        if (isViewingOwnProfile && votesCount > 0) {
            const lastCheckKey = 'lastProfileAchievementCheck';
            const lastCheck = parseInt(localStorage.getItem(lastCheckKey) || '0');
            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000;
            
            if (now - lastCheck > ONE_HOUR) {
                console.log('🏆 Running hourly achievement check...');
                localStorage.setItem(lastCheckKey, now.toString());
                
                // Get full vote data for achievement checking
                const votes = votesSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                // Import and run achievement checker
                const { checkAchievements } = await import('./achievement-tracker.js');
                await checkAchievements(votes);
                
                console.log('✅ Achievement check complete');
            } else {
                const minutesAgo = Math.floor((now - lastCheck) / 1000 / 60);
                console.log(`⏭️ Skipping achievement check (ran ${minutesAgo} minutes ago)`);
            }
        }
        
     // NEW FIXED CODE (copy-paste this)
let unlockedAchievements = [];

// First try: Firebase profile (normal case)
const profileDoc = await getDoc(doc(db, 'profiles', userId));
if (profileDoc.exists()) {
    unlockedAchievements = profileDoc.data().unlockedAchievements || [];
    console.log(`Achievements loaded from Firebase: ${unlockedAchievements.length}`);
} 
// Second try: Fallback to localStorage (for users who never edited profile)
else if (isViewingOwnProfile) {
    const localAchievements = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    unlockedAchievements = localAchievements;
    console.log(`No Firebase profile → loaded ${unlockedAchievements.length} achievements from localStorage`);
} 
else {
    console.log('No Firebase profile and not own profile → showing 0 achievements (normal)');
}
        const achievementsCount = unlockedAchievements.length;
        
        console.log(`🏆 Found ${achievementsCount} unlocked achievements`);
        
        // ... rest of the function (rank calculation, UI updates, etc.)
        
        // ✅ GET RANK
        const { getUserXPFromStorage, getUserRank, calculateUserXP, xpForProfile } = await import('./rank-system.js');
        
        let currentXP;
        let rank;
        
        if (isViewingOwnProfile) {
            currentXP = getUserXPFromStorage();
            rank = getUserRank(currentXP);
            console.log('✅ Using stored XP for own profile:', currentXP);
        } else {
            const allVotes = votesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            currentXP = xpForProfile(profileDoc.exists() ? profileDoc.data() : null, allVotes);
            rank = getUserRank(currentXP);
            console.log('✅ XP for other user:', currentXP);
        }
        
        // Update stats display
        const { votes: visibleVotesForStats } = await fetchUserVotes(userId);
        document.getElementById('statTotalVotes').textContent = visibleVotesForStats.length;
        document.getElementById('statAchievements').textContent = achievementsCount;
        const achLabel = document.querySelector('#statAchievements + .stat-label');
        if (achLabel) achLabel.textContent = achievementsCount === 1 ? 'Achievement' : 'Achievements';
        
        // ✅ UPDATE ACTIVITY LEVEL WITH RANK
        const activityLevelEl = document.getElementById('statActivityLevel');
        if (activityLevelEl) {
            const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
            
            activityLevelEl.innerHTML = `
                <span style="font-size: 1.5rem; font-weight: 700; color: var(--pink-bright, #c8aa6e); display: block;">Lv. ${rank.currentLevel.level}</span>
                <span style="font-size: 1rem; font-weight: 600; color: color-mix(in srgb, var(--text, #f0e6d2) 80%, transparent); display: block; margin-top: 4px;">${rank.nextLevel ? `${rank.progressXP} / ${rank.xpForNextLevel} XP` : `${rank.totalXP} XP · Max`}</span>
            `;
        }
        
        console.log('✅ Stats loaded:', {
            votes: votesCount,
            achievements: achievementsCount,
            xp: currentXP,
            level: rank.currentLevel.level
        });
        
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}

// NEW: Sync local achievements to Firebase if missing
async function syncLocalAchievementsToFirebase(userId) {
    try {
        // Get local achievements (from browser storage)
        const localAchievements = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
        
        if (localAchievements.length === 0) {
            console.log('No local achievements to sync');
            return;
        }
        
        // Get Firebase profile
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        let firebaseAchievements = [];
        if (profileDoc.exists()) {
            firebaseAchievements = profileDoc.data().unlockedAchievements || [];
        }
        
        // Find missing ones in Firebase
        const missingInFirebase = localAchievements.filter(id => !firebaseAchievements.includes(id));
        
        if (missingInFirebase.length === 0) {
            console.log('All achievements already synced');
            return;
        }
        
        console.log(`Syncing ${missingInFirebase.length} missing achievements to Firebase...`);
        
        // Add them to Firebase
        await updateDoc(profileRef, {
            unlockedAchievements: arrayUnion(...missingInFirebase),
            lastAchievementSync: Date.now()
        });
        
        console.log('✅ Achievements synced to Firebase!');
        
    } catch (error) {
        console.error('Error syncing achievements:', error);
    }
}


// ========================================
// LOAD FEATURED ACHIEVEMENTS
// ========================================

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
        
let unlockedIds = [];

// Try Firebase first
const profileDoc = await getDoc(doc(db, 'profiles', userId));
if (profileDoc.exists()) {
    unlockedIds = profileDoc.data().unlockedAchievements || [];
} 
// Fallback for own profile
else if (userId === currentUserId) {
    unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
}        console.log('🏆 Unlocked achievement IDs:', unlockedIds);
        
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
        
        // ✅ FIX: Check if icon is URL and render as image
        container.innerHTML = unlockedAchievements.map(ach => {
            const isUrl = ach.icon && typeof ach.icon === 'string' && ach.icon.startsWith('http');
            
            return `
                <div class="achievement-card">
                    <div class="achievement-header">
                        <div class="achievement-icon">
                            ${hasAchievementIcon(ach.id) ? achievementBadgeHtml(ach.id, ach.rarity, { size: 56 }) : isUrl 
                                ? `<img src="${ach.icon}" 
                                        alt="${ach.name}" 
                                        class="achievement-icon-img"
                                        style="width: 100%; height: 100%; object-fit: contain;"
                                        onerror="this.style.display='none'; this.parentElement.textContent='🏆';">`
                                : ach.icon
                            }
                        </div>
                        <div class="achievement-info">
                            <div class="achievement-name">${ach.name}</div>
                            <span class="achievement-rarity ${ach.rarity}">${ach.rarity}</span>
                        </div>
                    </div>
                    <div class="achievement-description">${ach.description}</div>
                    <div class="achievement-xp">+${ach.xp} XP</div>
                </div>
            `;
        }).join('');
        
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
        let votes = await getVotesForUser(userId);

        // On someone else's page, picks in matches that are still open are left out of this list altogether
        if (!viewerOwnsProfile) {
            votes = votes.filter(v => v.match && isClosed(v.match));
            if (votes.length === 0) {
                const sec = document.getElementById('favoriteSongs')?.closest('.overview-section');
                if (sec) sec.hidden = true;   // an empty list during a live cup: no heading either
                return;
            }
        }
        
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
        
        // Only a real order: 2+ picks, no arbitrary tie-breaks (see backedMost)
        const topSongs = backedMost(Object.values(songCounts));

        if (topSongs.length === 0) {
            const sec = document.getElementById('favoriteSongs')?.closest('.overview-section');
            if (sec) sec.hidden = true;
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        
        const container = document.getElementById('favoriteSongs');
        container.innerHTML = topSongs.map((song, index) => `
            <div class="favorite-song-card">
                <div class="song-rank">${medals[index] || (index + 1)}</div>
                <img 
                    src="${escapeHtml(song.thumbnail)}" 
                    alt="${song.name}"
                    class="song-thumbnail"
                    loading="lazy"
                    onerror="this.src='https://via.placeholder.com/160x90/0a0a0a/ff4fb4?text=🎬'"
                />
                <div class="song-details">
                    <div class="song-title">${song.name}</div>
                    <div class="song-meta">
                        <span>${song.artist}</span>
                        ${hasSeed(song.seed) ? `<span class="song-meta-separator">·</span>
                        <span>Seed #${song.seed}</span>` : ''}
                        <span class="song-meta-separator">·</span>
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
            where('privacy', '==', 'public'),
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
        container.innerHTML = posts.filter(notHeld).map(post => renderPostCard(post)).join('');
        
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
            where('privacy', '==', 'public'),
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
        container.innerHTML = posts.filter(notHeld).map(post => renderPostCard(post)).join('');
        
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
        const own = userId === (localStorage.getItem('userId') || localStorage.getItem('tournamentUserId'));

        // Own profile: progress for the locked ones, from the votes saved in this browser
        let stats = null;
        if (own) {
            try {
                const saved = JSON.parse(localStorage.getItem('userVotes') || '{}');
                const votes = Object.keys(saved).map(id => achievementVote(id, saved[id], null));
                stats = await calculateAchievementStats(votes);
            } catch (e) { console.warn('Achievement progress unavailable:', e); }
        }

        const view = buildAchievementsView({ unlockedIds, own, stats, packName: id => getCompanionPack(id)?.name || id.charAt(0).toUpperCase() + id.slice(1) });
        document.getElementById('achievementsCount').textContent = view.unlockedTotal;
        if (view.unlockedTotal === 0 && !own) return;   // keep the no-content state

        const container = document.getElementById('allAchievements');
        container.classList.remove('achievements-grid');
        container.classList.add('ach-sections');
        container.innerHTML = renderAchievementsHtml(view);
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

        const { votes, orphanedCount } = await fetchUserVotes(userId);
        showHiddenVotesNote(orphanedCount);
        const recentVotesContainer = document.getElementById('recentVotes');

        if (votes.length === 0) {
            recentVotesContainer.innerHTML = `
                <div class="no-content">
                    <i class="fas fa-vote-yea"></i>
                    <p>${escapeHtml(emptyVotesText())}</p>
                </div>
            `;
            return;
        }

        const matchMap = new Map(votes.map(v => [v.matchId, v.match]));

        const votesHTML = arrangeForViewer(votes.slice(0, limitCount), v => v.match, v => v.matchId)
            .map(({ match, ...voteData }) => renderVoteCard(voteData, matchMap))
            .join('');

        recentVotesContainer.innerHTML = votesHTML;

        console.log(`✅ Loaded ${Math.min(votes.length, limitCount)} recent votes`);

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

        const { votes, orphanedCount } = await fetchUserVotes(userId);
        showHiddenVotesNote(orphanedCount);

        // Update count badge
        document.getElementById('votesCount').textContent = votes.length;

        if (votes.length === 0) {
            document.querySelector('.filter-buttons')?.setAttribute('hidden', '');
            document.getElementById('allVotes').innerHTML = `
                <div class="no-content">
                    <i class="fas fa-vote-yea"></i>
                    <p>${escapeHtml(emptyVotesText())}</p>
                </div>
            `;
            return;
        }

        // fetchUserVotes already sorts newest first
        allUserVotes = votes.map(({ match, ...voteData }) => ({ voteData, match }));

        // Render with current filter
        renderFilteredVotes(currentVoteFilter);

        console.log(`✅ Loaded ${votes.length} total votes`);

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

// counts on the filter chips and one summary line ("3 votes · 2 live · 1 advanced")
function updateVoteFilterBar() {
    const counts = { all: 0, won: 0, lost: 0, live: 0 };
    for (const { voteData, match } of allUserVotes || []) { counts.all++; counts[getVoteStatus(voteData, match)]++; }
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const n = counts[btn.dataset.filter] ?? 0;
        let c = btn.querySelector('.filter-count');
        if (!c) { c = document.createElement('span'); c.className = 'filter-count'; btn.appendChild(c); }
        c.textContent = n;
        // a chip that can't match anything says nothing: hide it unless it is All or the one in use
        btn.toggleAttribute('hidden', btn.dataset.filter !== 'all' && n === 0 && !btn.classList.contains('active'));
    });
    // one status only (every vote live, say): nothing to filter, so the whole row goes
    const statusKinds = ['won', 'lost', 'live'].filter(k => counts[k] > 0).length;
    document.querySelector('.filter-buttons')?.toggleAttribute('hidden', counts.all === 0 || statusKinds < 2);
    const el = document.getElementById('votesSummary');
    if (el) {
        const bits = [`${counts.all} ${counts.all === 1 ? 'vote' : 'votes'}`];
        if (counts.live) bits.push(`${counts.live} live`);
        if (counts.won) bits.push(`${counts.won} advanced`);
        if (counts.lost) bits.push(`${counts.lost} eliminated`);
        el.textContent = counts.all ? bits.join(' · ') : '';
    }
}

function renderFilteredVotes(filter) {
    const allVotesContainer = document.getElementById('allVotes');
    updateVoteFilterBar();
    
    if (!allUserVotes || allUserVotes.length === 0) {
        allVotesContainer.innerHTML = `
            <div class="no-content">
                <i class="fas fa-vote-yea"></i>
                <p>${escapeHtml(emptyVotesText())}</p>
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
    const votesHTML = arrangeForViewer(filteredVotes, v => v.match, v => v.voteData.matchId)
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

let voteRowSeq = 0;
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

    // Someone else's pick in a match that is still open stays hidden until you have voted in it too (or it has closed).
    // The row is text only: even the order of the two edits would show the pick (the pick is drawn first).
    if (voteLocked(match, { isOwner: viewerOwnsProfile, viewerVoted: viewerHasVoted(vote.matchId) })) {
        return `
        <div class="vote-card live locked">
            <div class="vote-header">
                <div class="vote-status-badge live">🔴 LIVE</div>
                <div class="vote-timestamp">${formatTimeAgo(vote.timestamp)}</div>
            </div>
            <p class="vote-locked-text"><i class="fa-solid fa-lock" aria-hidden="true"></i> ${escapeHtml(lockedVoteText(lockedLabel(match, cupDisplayName(match?.tournamentId || ARCANE_CONFIG.tournamentId))))}</p>
            <div class="vote-footer">
                <a href="/vote.html?id=${encodeURIComponent(vote.matchId)}" class="view-match-link">Vote in this match →</a>
            </div>
        </div>`;
    }

    const { song1, song2 } = match;

    const getThumbnail = (moment) => {
        if (!moment) {
            return 'https://via.placeholder.com/160x90/0a0a0a/ff4fb4?text=No+Image';
        }

        if (moment.videoId) {
            return getYoutubeThumbnail(moment.videoId);
        }

        if (typeof moment.thumbnail === 'string' && moment.thumbnail.includes('http')) {
            return moment.thumbnail;
        }

        return 'https://via.placeholder.com/160x90/0a0a0a/ff4fb4?text=No+Image';
    };

    const status = getVoteStatus(vote, match);

    const statusConfig = {
        won: {
            emoji: '✅',
            label: 'ADVANCED',
            class: 'won'
        },
        lost: {
            emoji: '❌',
            label: 'ELIMINATED',
            class: 'lost'
        },
        live: {
            emoji: '🔴',
            label: 'LIVE',
            class: 'live'
        }
    };

    const statusInfo = statusConfig[status];

    const choseFirst = vote.choice === 'song1';
    const chosenMoment = choseFirst ? song1 : song2;
    const opponentMoment = choseFirst ? song2 : song1;

    const chosenTitle =
        chosenMoment?.shortTitle ||
        chosenMoment?.title ||
        'Unknown Moment';

    const opponentTitle =
        opponentMoment?.shortTitle ||
        opponentMoment?.title ||
        'Unknown Moment';

    const chosenThumbnail = getThumbnail(chosenMoment);
    const opponentThumbnail = getThumbnail(opponentMoment);

    const timeAgo = formatTimeAgo(vote.timestamp);

    // One line per vote on a phone (thumbnail, title, "vs", status, time); the full card opens under it. The toggle is hidden on desktop,
    // where the full card is always shown. Locked votes never reach here (they returned a text-only row above), so a hidden pick can't exist.
    const rowId = 'vr-' + (++voteRowSeq) + '-' + String(vote.matchId).replace(/[^a-zA-Z0-9_-]/g, '');
    return `
        <div class="vote-row ${status}">
            <button type="button" class="vote-row-toggle" aria-expanded="false" aria-controls="${rowId}">
                <img class="vr-thumb" src="${escapeHtml(chosenThumbnail)}" alt="" loading="lazy">
                <span class="vr-text">
                    <span class="vr-title">${escapeHtml(chosenTitle)}</span>
                    <span class="vr-vs">vs ${escapeHtml(opponentTitle)}</span>
                </span>
                <span class="vr-meta">
                    <span class="vr-chip ${statusInfo.class}">${statusInfo.label}</span>
                    <span class="vr-time">${timeAgo}</span>
                </span>
                <i class="fas fa-chevron-down vr-chev" aria-hidden="true"></i>
            </button>
            <div class="vote-row-detail" id="${rowId}" hidden>
        <div class="vote-card ${status}">
            <div class="vote-header">
                <div class="vote-status-badge ${statusInfo.class}">
                    ${statusInfo.emoji} ${statusInfo.label}
                </div>

                <div class="vote-timestamp">${timeAgo}</div>
            </div>

            <div class="vote-matchup">

                <div class="vote-song chosen">
                    <div class="vote-song-thumbnail">
                        <img
                            src="${chosenThumbnail}"
                            alt=""
                            loading="lazy"
                        >
                    </div>

                    <div class="vote-song-info">
                        <div class="vote-song-title">${escapeHtml(chosenTitle)}</div>
                        <div class="vote-song-meta">
                            ${viewerOwnsProfile ? 'Your pick' : 'Their pick'}
                        </div>
                    </div>
                </div>

                <div class="vote-vs">VS</div>

                <div class="vote-song opponent">
                    <div class="vote-song-thumbnail">
                        <img
                            src="${opponentThumbnail}"
                            alt=""
                            loading="lazy"
                        >
                    </div>

                    <div class="vote-song-info">
                        <div class="vote-song-title">${escapeHtml(opponentTitle)}</div>
                        <div class="vote-song-meta">
                            Opponent
                        </div>
                    </div>
                </div>

            </div>

            <div class="vote-footer">
                <span class="vote-tournament">${escapeHtml(cupMatchLabel(match))}</span>

                <a
                    href="/vote.html?id=${vote.matchId}"
                    class="view-match-link"
                >
                    View Match →
                </a>
            </div>
        </div>
    </div>
        </div>
    `;
}

// ========================================
// HELPER: Determine vote status
// ========================================

function getVoteStatus(vote, match) {
    if (!match) {
        return 'live';
    }
    
    // ✅ Check if match is completed. Trust `status` when it is set: a re-opened match can
    // still carry an old winnerId. Only fall back to winnerId for old docs with no status.
    const isFinished = match.status ? match.status === 'completed' : !!match.winnerId;
    if (!isFinished) {
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
            filterButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
            btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
            
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
        ? `<img src="${escapeHtml(fixAvatarUrl(post.avatar.value))}" alt="${escapeHtml(post.username)}" />`
        : escapeHtml(post.avatar?.value || '👤');
    
    const timestamp = new Date(post.timestamp);
    const timeAgo = getTimeAgo(timestamp);
    
    return `
        <div class="post-card">
            <div class="post-header">
                <div class="post-avatar">${avatar}</div>
                <div class="post-author-info">
                    <div class="post-author">${escapeHtml(post.username)}</div>
                    <div class="post-timestamp">${timeAgo}</div>
                </div>
            </div>
            <div class="post-content">
                ${escapeHtml(post.type === 'vote' ? votePostText(post) : (post.text || 'Voted in a match'))}
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


// ========================================
// TASTE MATCH ("You and X agree on N of M matches")
// Both vote lists come from the shared, cached fetchUserVotes (votes are public, and this profile already shows them), so the
// only extra read is your own vote list, once per page load.
// ========================================

async function loadTasteMatch(profile) {
    try {
        const section = document.getElementById('tasteMatch');
        const me = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        if (!section || !profile?.userId || !me || me === 'anonymous' || me === profile.userId || isOwnProfile) return;

        const [{ votes: mine }, { votes: theirs }] = await Promise.all([fetchUserVotes(me), fetchUserVotes(profile.userId)]);
        const r = compareVotes(mine, theirs);
        if (!r.shared) return;

        const name = escapeHtml(profile.username || 'them');
        const tier = r.tier;
        section.dataset.tone = tier.tone;
        document.getElementById('tasteTitle').innerHTML = tier.showPct
            ? `You and <strong>${name}</strong> agree on <strong>${r.agreeCount} of ${r.shared}</strong> matches`
            : `You and <strong>${name}</strong> have voted in <strong>${r.shared}</strong> of the same match${r.shared === 1 ? '' : 'es'}`;
        document.getElementById('tasteLabel').textContent = tier.showPct ? `${tier.label} · ${r.pct}%` : (r.shared === 1 ? 'Keep voting to compare more' : 'A few more votes will tell');
        const bar = document.getElementById('tasteBar');
        bar.hidden = !tier.showPct;
        bar.setAttribute('aria-label', `${r.pct}% agreement`);
        document.getElementById('tasteBarAgree').style.width = `${r.pct}%`;
        document.getElementById('tasteCounts').innerHTML = `<span class="taste-agree">${r.agreeCount} same pick${r.agreeCount === 1 ? '' : 's'}</span><span class="taste-disagree">${r.disagreeCount} voted differently</span>`;

        const tabs = section.querySelectorAll('.taste-tab');
        tabs[0].textContent = `Voted differently (${r.disagreeCount})`;
        tabs[1].textContent = `Same pick (${r.agreeCount})`;
        const thumb = (row, side) => { const u = pickThumb(row, side, id => musicData[id]?.videoId); return u ? `<img src="${escapeHtml(u)}" alt="" loading="lazy" onerror="this.remove()">` : ''; };
        const pick = (row, side, who, cls) => `<span class="taste-pick ${cls}">${thumb(row, side)}<span class="taste-pick-text"><em>${who}</em><span>${escapeHtml(pickTitle(row, side))}</span></span></span>`;
        let showAll = false, current = r.disagreeCount ? 'disagree' : 'agree';
        const draw = which => {
            current = which;
            const all = which === 'agree' ? r.agree : r.disagree;
            const rows = showAll ? all : all.slice(0, 3);
            document.getElementById('tasteList').innerHTML = (rows.length ? rows.map(row => {
                const href = `/vote.html?id=${encodeURIComponent(row.matchId)}`;
                return which === 'agree'
                    ? `<li><a href="${href}">${pick(row, 'yours', 'You both', 'both')}</a></li>`
                    : `<li><a href="${href}">${pick(row, 'yours', 'You', 'you')}<span class="taste-vs">VS</span>${pick(row, 'theirs', name, 'them')}</a></li>`;
            }).join('') : '<li class="taste-empty">Nothing here yet.</li>')
                + (all.length > 3 ? `<li class="taste-more"><button type="button" id="tasteMore">${showAll ? 'Show fewer' : `Show all ${all.length}`}</button></li>` : '');
            document.getElementById('tasteMore')?.addEventListener('click', () => { showAll = !showAll; draw(current); });
            tabs.forEach(t => t.classList.toggle('active', t.dataset.which === which));
        };
        tabs.forEach(t => t.addEventListener('click', () => { showAll = false; draw(t.dataset.which); }));
        draw(current);
        section.hidden = false;
    } catch (error) {
        console.warn('Taste match unavailable:', error);   // optional extra: never breaks the profile
    }
}

// ========================================
// SHARED VOTE LOOKUP
// One fetch per page load. Only votes whose match still exists in the
// current match list are returned, so the header, tab badge, stats card,
// Recent Votes and Votes tab always agree. Votes pointing at a deleted
// or old-tournament match are skipped and counted in `orphanedCount`.
// ========================================

const userVotesCache = new Map();

// Muted line shown above vote lists when some votes point at matches that
// no longer exist (e.g. cast in an earlier round of the test tournament).
function showHiddenVotesNote(orphanedCount) {
    const text = orphanedCount === 1
        ? "1 earlier vote from a previous round isn't shown."
        : `${orphanedCount} earlier votes from a previous round aren't shown.`;

    document.querySelectorAll('.hidden-votes-note').forEach(el => {
        el.textContent = text;
        el.hidden = !orphanedCount;
    });
}

function fetchUserVotes(userId) {
    if (!userVotesCache.has(userId)) {
        const request = (async () => {
            const snapshot = await getDocs(query(
                collection(db, 'votes'),
                where('userId', '==', userId)
            ));

            const rawVotes = snapshot.docs.map(d => d.data());

            let matches = [];
            try {
                const { getAllMatches } = await import('./api-client.js');
                matches = await getAllMatches();
            } catch (error) {
                console.warn('⚠️ Could not load matches:', error);
            }

            // If the match list is unavailable we can't tell which votes are
            // orphaned, so show everything instead of hiding it all.
            const matchesKnown = Array.isArray(matches) && matches.length > 0;
            const matchMap = new Map((matches || []).map(m => [m.matchId || m.id, m]));

            const withMatch = rawVotes.map(vote => ({
                ...vote,
                match: matchMap.get(vote.matchId)
            }));

            const votes = (matchesKnown ? withMatch.filter(v => v.match) : withMatch)
                .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

            const orphanedCount = matchesKnown ? withMatch.length - votes.length : 0;
            if (orphanedCount > 0) {
                console.warn(`⚠️ ${orphanedCount} vote(s) point at matches that no longer exist and are hidden`);
            }

            return { votes, orphanedCount, matchesKnown };
        })();

        request.catch(() => userVotesCache.delete(userId));
        userVotesCache.set(userId, request);
    }
    return userVotesCache.get(userId);
}

async function getVoteCountForUser(userId) {
    try {
        const { votes } = await fetchUserVotes(userId);
        return votes.length;
    } catch (error) {
        console.error('❌ Error getting vote count:', error);
        return 0;
    }
}

async function getVotesForUser(userId) {
    try {
        const { votes } = await fetchUserVotes(userId);
        return votes;
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

// ========================================
// OWNER-ONLY INSIGHTS (replaces the old My Votes page)
// ========================================

async function loadOwnerInsights(userId) {
    const container = document.getElementById('ownerInsights');
    if (!container) return;

    // Decide ownership by user id, the same way renderProfile() does.
    // (The module-level isOwnProfile is computed from a never-assigned
    // currentUsername in loadProfile(), so it is always false.)
    const signedInUserId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    const viewingOwnProfile = Boolean(userId) && userId === signedInUserId;

    if (!viewingOwnProfile) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    try {
        const { votes } = await fetchUserVotes(userId);
        renderOwnerInsights(container, votes);
    } catch (error) {
        console.error('❌ Error loading voting insights:', error);
        container.hidden = true;
    }
}

// ========================================
// DEEP LINKS: /profile#votes, #achievements, #journey, #posts (#moments and #songs open Overview)
// ========================================

const TAB_HASHES = {
    overview: 'overview',
    votes: 'votes',
    posts: 'posts',
    journey: 'participation',
    champions: 'champions',
    achievements: 'achievements',
    moments: 'overview',     // the old Top Moments tab is gone: Overview has "Edits you backed most"
    songs: 'overview'
};

function openTabFromHash() {
    // #votes (old links) or ?tab=votes (the account menu's "My votes")
    const q = new URLSearchParams(window.location.search).get('tab') || '';
    const key = (window.location.hash.replace('#', '') || q).replace(/^tab-/, '').toLowerCase();
    const tab = Object.prototype.hasOwnProperty.call(TAB_HASHES, key) ? TAB_HASHES[key] : null;
    if (!tab) return;

    const button = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (button && !button.classList.contains('active')) button.click();
}

// vote rows: the toggle opens and closes the full card under it (phones)
document.addEventListener('click', e => {
    const t = e.target.closest?.('.vote-row-toggle');
    if (!t) return;
    const open = t.getAttribute('aria-expanded') !== 'true';
    t.setAttribute('aria-expanded', String(open));
    (t.nextElementSibling?.id === t.getAttribute('aria-controls') ? t.nextElementSibling : document.getElementById(t.getAttribute('aria-controls')))?.toggleAttribute('hidden', !open);
});

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    // arrow keys move between tabs (the tab row is one tab stop; the panel is the next)
    document.querySelector('.tabs-nav')?.addEventListener('keydown', e => {
        const tabs = [...tabButtons], i = tabs.indexOf(document.activeElement);
        if (i < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].focus(); tabs[next].click();
    });
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // a badge with 0 is hidden (Posts, Achievements while empty); it shows again when the number changes
    const syncBadges = () => document.querySelectorAll('.tab-count').forEach(c => { c.hidden = (c.textContent || '').trim() === '0' || (c.textContent || '').trim() === ''; });
    document.querySelectorAll('.tab-count').forEach(c => new MutationObserver(syncBadges).observe(c, { childList: true, characterData: true, subtree: true }));
    syncBadges();

    tabButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetTab = btn.dataset.tab;
            const scrollY = window.scrollY;   // changing tab must not jump the page
            
            // Remove active from all
            tabButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); b.tabIndex = -1; });
            tabPanels.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); btn.tabIndex = 0;
            document.getElementById(`tab-${targetTab}`).classList.add('active');
            btn.scrollIntoView({ inline: 'center', block: 'nearest' });   // the tab row scrolls sideways on phones
            window.scrollTo({ top: scrollY });
            
            // Lazy load tab content
            if (targetTab === 'votes' && allUserVotes.length === 0) {
                await loadAllVotes(currentProfile.userId);
            }
            
              // ✅ NEW: Load posts tab
            if (targetTab === 'posts') {
                await loadAllUserPosts(currentProfile.userId);
            }

            if (targetTab === 'champions') {
                await primeLiveMatches();
                await loadChampionsTab(currentProfile, viewerOwnsProfile, viewerOwnsProfile ? null : openMatchIds);
            }

            if (targetTab === 'participation' && window.participationData) {
                renderParticipationTab();  // ✅ NEW
            }
            
            if (targetTab === 'achievements' && document.getElementById('allAchievements').querySelector('.no-content')) {
                await loadAllAchievements(currentProfile.userId);
            }
        });
    });
}

function showLoadingState() {
    // Use the new tournament spinner instead
    showLoadingSpinner('Loading profile...');
    
    // Hide all content states
    const notFound = document.getElementById('notFoundState');
    const guest = document.getElementById('guestState');
    const content = document.getElementById('profileContent');
    
    if (notFound) notFound.style.display = 'none';
    if (guest) guest.style.display = 'none';
    if (content) content.style.display = 'none';
}

function showNotFoundState() {
    hideLoadingSpinner();
    
    const notFound = document.getElementById('notFoundState');
    const guest = document.getElementById('guestState');
    const content = document.getElementById('profileContent');
    
    if (notFound) notFound.style.display = 'flex';
    if (guest) guest.style.display = 'none';
    if (content) content.style.display = 'none';
}

function showGuestState() {
    hideLoadingSpinner();
    
    const notFound = document.getElementById('notFoundState');
    const guest = document.getElementById('guestState');
    const content = document.getElementById('profileContent');
    
    if (notFound) notFound.style.display = 'none';
    if (guest) guest.style.display = 'flex';
    if (content) content.style.display = 'none';
}

function showProfileContent() {
    hideLoadingSpinner();
    
    const notFound = document.getElementById('notFoundState');
    const guest = document.getElementById('guestState');
    const content = document.getElementById('profileContent');
    
    if (notFound) notFound.style.display = 'none';
    if (guest) guest.style.display = 'none';
    if (content) content.style.display = 'block';
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

async function calculateTournamentParticipation(userId) {
    try {
        console.log('📊 Loading Arcane participation data...');

        const CURRENT_TOURNAMENT = ARCANE_CONFIG.tournamentId;
        const TOURNAMENT_NAME = ARCANE_CONFIG.tournamentName;

        // Get all matches from the current Arcane tournament.
        const { getAllMatches } = await import('./api-client.js');
        const allMatches = await getAllMatches();

        // Only matches that have opened can be voted on, so only those count. Measuring against all 384 group
        // matches would leave everyone near 0% while the groups open one at a time.
        const tournamentMatches = allMatches.filter(
            match => match.tournament === CURRENT_TOURNAMENT && match.status !== 'upcoming'
        );

        // Group stage matches all share round 1, so name that row from the matches themselves.
        const roundLabels = {};
        tournamentMatches.forEach(match => {
            const num = parseInt(String(match.round ?? 1).replace(/\D/g, ''), 10) || 1;
            if (!roundLabels[num]) roundLabels[num] = match.stage === 'group' ? 'Group stage' : (match.roundLabel || '');
        });
        // Under 1% would round to a flat 0%, which reads as "nothing". Show one decimal there instead.
        const pctOf = (a, b) => {
            if (!b) return 0;
            const x = (a / b) * 100;
            return x > 0 && x < 1 ? Math.max(0.1, Math.round(x * 10) / 10) : Math.round(x);
        };

        console.log(
            `📊 Found ${tournamentMatches.length} matches in ${TOURNAMENT_NAME}`
        );

        // Group actual tournament matches by round.
        const matchesByRound = {};

        tournamentMatches.forEach(match => {
            const roundValue = match.round ?? 1;
            const roundNumber =
                parseInt(String(roundValue).replace(/\D/g, ''), 10) || 1;

            if (!matchesByRound[roundNumber]) {
                matchesByRound[roundNumber] = 0;
            }

            matchesByRound[roundNumber]++;
        });

        // Get user's votes.
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );

        const snapshot = await getDocs(votesQuery);

        // Match IDs belonging to this tournament.
        const tournamentMatchIds = new Set(
            tournamentMatches.map(match => match.matchId || match.id)
        );

        // Only count votes for the current Arcane tournament.
        const tournamentVotes = snapshot.docs
            .map(doc => doc.data())
            .filter(vote => tournamentMatchIds.has(vote.matchId));

        // Count distinct matches voted in.
        const votedMatchIds = new Set(
            tournamentVotes.map(vote => vote.matchId)
        );

        // Count votes by round.
        const votesByRound = {};

        tournamentVotes.forEach(vote => {
            const match = tournamentMatches.find(
                item => (item.matchId || item.id) === vote.matchId
            );

            if (!match) return;

            const roundValue = match.round ?? vote.round ?? 1;
            const roundNumber =
                parseInt(String(roundValue).replace(/\D/g, ''), 10) || 1;

            votesByRound[roundNumber] =
                (votesByRound[roundNumber] || 0) + 1;
        });

        // Build round-by-round participation from the actual tournament.
        const byRound = Object.keys(matchesByRound)
            .map(Number)
            .sort((a, b) => a - b)
            .map(roundNumber => {
                const total = matchesByRound[roundNumber];
                const voted = votesByRound[roundNumber] || 0;
                const percentage = pctOf(voted, total);

                return {
                    round: roundNumber,
                    roundName: roundLabels[roundNumber] || getRoundName(roundNumber),
                    voted,
                    total,
                    percentage
                };
            });

        const totalPossible = tournamentMatches.length;
        const totalVotes = votedMatchIds.size;

        const overallPercentage = pctOf(totalVotes, totalPossible);

        return {
            tournamentId: CURRENT_TOURNAMENT,
            tournamentName: TOURNAMENT_NAME,
            overallPercentage,
            byRound,
            totalVotes,
            totalPossible
        };

    } catch (error) {
        console.error('❌ Error calculating Arcane participation:', error);

        return {
            tournamentId: ARCANE_CONFIG.tournamentId,
            tournamentName: ARCANE_CONFIG.tournamentName,
            overallPercentage: 0,
            byRound: [],
            totalVotes: 0,
            totalPossible: 0
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

// "…" beside Follow on someone else's profile: block / unblock. (Reports are for posts and comments only, so Report lives on each post.)
function profileMoreHtml() {
    if (!currentProfile?.userId || viewerOwnsProfile) return '';
    const name = escapeHtml(currentProfile.username);
    const blocked = !!getBlocked()[currentProfile.userId];
    return `
        <div class="profile-more">
            <button type="button" class="profile-more-btn" id="profileMoreBtn" aria-label="More actions for ${name}" aria-haspopup="menu" aria-expanded="false"><i class="fas fa-ellipsis" aria-hidden="true"></i></button>
            <div class="profile-more-menu" id="profileMoreMenu" role="menu" hidden>
                <button type="button" role="menuitem" class="menu-item" id="profileBlockBtn"><i class="fas fa-ban" aria-hidden="true"></i> ${blocked ? 'Unblock' : 'Block'} ${name}</button>
            </div>
        </div>`;
}
function bindProfileMore() {
    const btn = document.getElementById('profileMoreBtn'), menu = document.getElementById('profileMoreMenu');
    if (!btn || !menu) return;
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', e => { if (!e.target.closest('.profile-more')) close(); });
    btn.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.getElementById('profileBlockBtn').addEventListener('click', () => {
        close();
        if (getBlocked()[currentProfile.userId]) { unblockUser(currentProfile.userId); updateProfileMore(); return; }
        openBlockDialog({ userId: currentProfile.userId, name: currentProfile.username, onDone: updateProfileMore });
    });
}
function updateProfileMore() {
    const host = document.querySelector('.profile-more');
    if (!host) return;
    host.outerHTML = profileMoreHtml();
    bindProfileMore();
}

// Signed in = has a profile id on this device (same test follow-system.js uses)
const hasProfileId = () => { const id = localStorage.getItem('tournamentUserId'); return !!id && id !== 'anonymous'; };

async function renderFollowButton(targetUserId, targetUsername) {
    const currentUserId = localStorage.getItem('userId');
    
    // Don't show follow button on own profile
    if (currentUserId && currentUserId === targetUserId) {
        return '';
    }
    
    // No profile yet: Follow still shows, and a click opens the same claim flow as the nav avatar button
    if (!hasProfileId()) {
        return `
        <button class="profile-follow-btn" id="followBtn" data-user-id="${escapeHtml(targetUserId)}" data-username="${escapeHtml(targetUsername)}">
            <i class="fas fa-user-plus"></i> Follow
        </button>`;
    }
    
    const { isFollowing } = await import('./follow-system.js');
    const following = await isFollowing(targetUserId);
    
    return `
        <button class="profile-follow-btn ${following ? 'following' : ''}" 
                id="followBtn"
                data-user-id="${escapeHtml(targetUserId)}"
                data-username="${escapeHtml(targetUsername)}">
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
        profileActions.innerHTML = followBtn + profileMoreHtml();
        bindProfileMore();
        
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

// With one stage, the cup's row in Cup History already carries "N of M voted" and its bar, so the separate Journey card is dropped.
// If Cup History is not there (failed or still loading), the card stays.
function syncJourneyCard() {
    const card = document.querySelector('.participation-overview');
    const hist = document.getElementById('cupHistory');
    if (!card) return;
    card.hidden = !!(window.__journeySingle && hist && !hist.hidden && hist.querySelector('.ch-cup .ch-bar'));
}
document.getElementById('cupHistory')?.addEventListener('cuphistory:ready', syncJourneyCard);

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
    
    const journeyTitle = document.getElementById('journeyTitle');
    if (journeyTitle) journeyTitle.textContent = viewerOwnsProfile ? 'Your Arcane Journey' : `${currentProfile?.username || 'Their'}'s journey`;

    // One stage so far: one progress card (cup, stage, "2 of 6 matches voted", one bar) instead of a donut, a sentence and a second bar
    const single = participation.byRound.length <= 1;
    const donut = document.querySelector('.participation-circle');
    if (donut) donut.hidden = single;
    const breakdown = document.querySelector('.rounds-breakdown');
    if (breakdown) breakdown.hidden = single;
    window.__journeySingle = single;
    syncJourneyCard();

    // Update summary text with tournament name
    const summary = document.getElementById('participationSummary');
    const cupName = escapeHtml(cupDisplayName(ARCANE_CONFIG.tournamentId));
    const only = participation.byRound[0];
    summary.innerHTML = single && only ? `
        <div style="margin-bottom: .5rem;"><strong style="color: var(--pink-bright, #c8aa6e); font-size: 1.1rem;">${cupName}</strong></div>
        <p class="journey-line">${escapeHtml(only.roundName)}: ${only.voted} of ${only.total} matches voted</p>
        <div class="round-progress-container journey-bar" role="progressbar" aria-label="${escapeHtml(only.roundName)} matches voted" aria-valuenow="${only.voted}" aria-valuemin="0" aria-valuemax="${only.total}">
            <div class="round-progress-fill" style="width: ${only.percentage}%"></div>
        </div>
    ` : `
        <div style="margin-bottom: 1rem;">
<strong style="color: var(--pink-bright, #c8aa6e); font-size: 1.1rem;">
    ${cupName}
</strong>
        </div>
        <p>${viewerOwnsProfile ? 'You\'ve voted' : 'Voted'} in ${participation.totalVotes} of ${participation.totalPossible} open matches.</p>
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
// LOAD USER'S POSTS
// ========================================

// Matches that are live right now. A vote post by someone else in one of them does not say who they picked until the viewer
// has voted there too (the feed, the vote page and Brackets hide live results the same way).
let liveMatchIds = new Set();
let openMatchIds = new Set();   // matches not closed yet: a visitor's votes in them stay out of every count
async function primeLiveMatches() {
    try {
        const { getAllMatches } = await import('./api-client.js');
        const all = await getAllMatches();
        liveMatchIds = new Set(all.filter(m => m.status === 'live').map(m => m.id || m.matchId));
        openMatchIds = new Set(all.filter(m => !isClosed(m)).map(m => m.id || m.matchId));
    } catch (e) { console.warn('live matches not loaded; vote posts shown as saved:', e); }
}
function viewerHasVoted(matchId) {
    try {
        const saved = JSON.parse(localStorage.getItem('userVotes') || '{}') || {};
        return !!saved[matchId] || !!localStorage.getItem(`vote_${ARCANE_CONFIG.tournamentId}_${matchId}`);
    } catch (e) { return false; }
}

async function loadUserPosts(userId, limitCount = null) {
    try {
        await primeLiveMatches();
        const postsQuery = query(
            collection(db, 'posts'),
            where('userId', '==', userId),
            where('privacy', '==', 'public')
        );

        const snapshot = await getDocs(postsQuery);

        let posts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        posts = posts.filter(notHeld).filter(isTypedPost);
        posts.sort(
            (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
        );

        if (limitCount) {
            posts = posts.slice(0, limitCount);
        }

        return posts;

    } catch (error) {
        console.error('❌ Error loading posts:', error);
        return [];
    }
}

// ========================================
// LOAD ALL POSTS (for Posts Tab)
// ========================================

async function loadAllUserPosts(userId) {
    try {
        console.log('📥 Loading all posts for user:', userId);
        
        const posts = await loadUserPosts(userId);
        
        // Update count badge
        document.getElementById('postsCount').textContent = posts.length;
        
        const container = document.getElementById('allUserPosts');
        
        if (posts.length === 0) {
            container.innerHTML = `
                <div class="no-content">
                    <i class="fas fa-pen"></i>
                    <p>${viewerOwnsProfile ? 'No posts yet. Post about a match after you vote.' : 'No posts yet'}</p>
                    ${viewerOwnsProfile ? '<a class="btn-go-vote" href="/matches.html">Go vote</a>' : ''}
                </div>
            `;
            return;
        }
        
        // Render posts
        container.innerHTML = posts.map(post => renderProfilePostCard(post)).join('');
        
        // Setup interactions for each post
        setupProfilePostInteractions();
        
        console.log(`✅ Loaded ${posts.length} posts`);
        
    } catch (error) {
        console.error('❌ Error loading all posts:', error);
        document.getElementById('allUserPosts').innerHTML = `
            <div class="no-content">
                <i class="fas fa-exclamation-circle"></i>
                <p>Could not load posts</p>
            </div>
        `;
    }
}

// ========================================
// LOAD FEATURED (PINNED) POSTS
// ========================================

async function loadFeaturedPosts(userId) {
    try {
        console.log('📌 Loading featured posts for:', userId);
        
        // Get user's profile to see pinned posts
        const profileDoc = await getDoc(doc(db, 'profiles', userId));
        
        if (!profileDoc.exists()) {
            console.log('⚠️ No profile found for featured posts');
            return;
        }
        
        const pinnedPostIds = profileDoc.data().pinnedPosts || [];
        
        if (pinnedPostIds.length === 0) {
            console.log('⚠️ No pinned posts');
            return;
        }
        
        await primeLiveMatches();
        // Fetch the actual posts
        const pinnedPosts = [];
        for (const postId of pinnedPostIds) {
            const postDoc = await getDoc(doc(db, 'posts', postId));
            if (postDoc.exists()) {
                pinnedPosts.push({
                    id: postDoc.id,
                    ...postDoc.data(),
                    isPinned: true
                });
            }
        }
        
        if (pinnedPosts.length === 0) {
            return;
        }
        
        // Show in Overview tab
        const overviewSection = document.getElementById('featuredPostsOverview');
        const overviewGrid = document.getElementById('featuredPostsOverviewGrid');
        
        if (overviewSection && overviewGrid) {
            overviewSection.style.display = 'block';
            overviewGrid.innerHTML = pinnedPosts.map(post => renderProfilePostCard(post, true)).join('');
        }
        
        // Show in Posts tab
        const postsSection = document.getElementById('featuredPostsSection');
        const postsList = document.getElementById('featuredPostsList');
        
        if (postsSection && postsList) {
            postsSection.style.display = 'block';
            postsList.innerHTML = pinnedPosts.map(post => renderProfilePostCard(post, true)).join('');
        }
        
        // Setup interactions
        setupProfilePostInteractions();
        
        console.log(`✅ Loaded ${pinnedPosts.length} featured posts`);
        
    } catch (error) {
        console.error('❌ Error loading featured posts:', error);
    }
}

// ========================================
// RENDER PROFILE POST CARD
// ========================================

// the one ordering rule for lists of someone's votes (see arrangeVotes)
const arrangeForViewer = (rows, getMatch, getId) => arrangeVotes(rows, { getMatch, getId, isOwner: viewerOwnsProfile, viewerVoted: viewerHasVoted });

/** "Jinx Cup 1 · Group A": the cup's name from its id (the stored tournamentName is the site name), then the stage. */
function cupMatchLabel(match) {
    const cupId = match?.tournamentId || ARCANE_CONFIG.tournamentId;
    return matchLabel({ ...match, tournamentName: '' }, cupDisplayName(cupId));
}

function renderProfilePostCard(post, isFeatured = false) {
    const currentUserId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    const isOwnPost = post.userId === currentUserId;
    
    let avatarUrl, displayUsername;
    
    if (isOwnPost && /\/profile(\.html)?\/?$/.test(window.location.pathname)) {
        const currentAvatar = JSON.parse(localStorage.getItem('avatar') || '{}');
        const currentUsername = localStorage.getItem('username');
        
        avatarUrl = getAvatarUrl(currentAvatar);
        displayUsername = currentUsername || post.username;
    } else {
        avatarUrl = getAvatarUrl(post.avatar);
        displayUsername = post.username;
    }
    
    const timeAgo = formatTimeAgo(post.timestamp);
    const postAge = Date.now() - post.timestamp;
    const isEditable = isOwnPost && postAge < (15 * 60 * 1000);
    const editedIndicator = post.editedAt ? '<span class="edited-indicator">· Edited</span>' : '';
    const pinBadge = isFeatured ? '<span class="pin-badge"><i class="fas fa-thumbtack"></i> Pinned</span>' : '';
    
    return `
        <div class="profile-post-card" data-post-id="${escapeHtml(post.id)}">
            <div class="post-header">
                <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayUsername)}" class="post-avatar">
                <div class="post-meta">
                    <div class="post-username">${escapeHtml(displayUsername)}</div>
                    <div class="post-timestamp">${timeAgo}${editedIndicator}</div>
                </div>
                ${pinBadge}
                ${isOwnPost ? `
                    <div class="post-actions-menu">
                        <button class="post-menu-btn" data-post-id="${escapeHtml(post.id)}">
                            <i class="fa-solid fa-ellipsis"></i>
                        </button>
                        <div class="post-menu-dropdown" style="display: none;">
                            ${!isFeatured ? `
                                <button class="menu-item pin-post-btn" data-post-id="${escapeHtml(post.id)}">
                                    <i class="fa-solid fa-thumbtack"></i> Pin to Profile
                                </button>
                            ` : `
                                <button class="menu-item unpin-post-btn" data-post-id="${escapeHtml(post.id)}">
                                    <i class="fa-solid fa-thumbtack"></i> Unpin Post
                                </button>
                            `}
                            ${isEditable ? `
                                <button class="menu-item edit-post-btn" data-post-id="${escapeHtml(post.id)}">
                                    <i class="fa-solid fa-pen"></i> Edit Post
                                </button>
                            ` : ''}
                            <button class="menu-item delete-post-btn" data-post-id="${escapeHtml(post.id)}">
                                <i class="fa-solid fa-trash"></i> Delete Post
                            </button>
                        </div>
                    </div>
                ` : (post.userId ? `
                    <div class="post-actions-menu">
                        <button type="button" class="post-menu-btn" data-post-id="${escapeHtml(post.id)}" aria-label="More actions for ${escapeHtml(displayUsername)}'s post" aria-haspopup="menu">
                            <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
                        </button>
                        <div class="post-menu-dropdown" role="menu" style="display: none;">
                            <button type="button" role="menuitem" class="menu-item report-post-btn" data-post-id="${escapeHtml(post.id)}" data-author-id="${escapeHtml(post.userId)}" data-author-name="${escapeHtml(displayUsername)}">
                                <i class="fa-solid fa-flag" aria-hidden="true"></i> Report post
                            </button>
                            <button type="button" role="menuitem" class="menu-item block-user-btn" data-author-id="${escapeHtml(post.userId)}" data-author-name="${escapeHtml(displayUsername)}">
                                <i class="fa-solid fa-ban" aria-hidden="true"></i> Block ${escapeHtml(displayUsername)}
                            </button>
                        </div>
                    </div>
                ` : '')}
            </div>
            
            <div class="post-content">
                ${renderPostContent(post)}
            </div>
            
            <div class="post-stats">
                <span><i class="fa-solid fa-heart"></i> ${post.likeCount || 0}</span>
                <span><i class="fa-solid fa-comment"></i> ${post.commentCount || 0}</span>
            </div>
        </div>
    `;
}

// ========================================
// RENDER POST CONTENT (match feed version)
// ========================================

function renderPostContent(post) {
    if (post.type === 'vote') {
        const me = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        if (post.matchId && liveMatchIds.has(post.matchId) && post.userId !== me && !viewerHasVoted(post.matchId)) {
            return `
            <p class="post-text vote-text">
                <i class="fa-solid fa-lock"></i> voted in ${lockedVoteNames(post, name => shortTitle(name, 60)).map(n => `<strong>${escapeHtml(n)}</strong>`).join(' vs ')}. Vote in it to see who they picked.
            </p>`;
        }
        // one neutral sentence, rebuilt from the names (js/vote-post-text.js): older posts saved a line about how the match stood
        // at the moment of the vote ("TOO close!", "dominating at 72%"), which is out of date once the match closes
        const smartText = votePostText(post, name => shortTitle(name, 60));
        return `
            <p class="post-text vote-text">
                ${escapeHtml(smartText)}
            </p>
        `;
    } else if (post.type === 'user_post' && post.content) {
        return `<p class="post-text">${escapeHtml(post.content)}</p>`;
    }
    return '';
}

// ========================================
// SETUP PROFILE POST INTERACTIONS
// ========================================

function setupProfilePostInteractions() {
    // Post menus
    document.querySelectorAll('.post-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = btn.dataset.postId;
            const menu = btn.nextElementSibling;
            
            // Close other menus
            document.querySelectorAll('.post-menu-dropdown').forEach(m => {
                if (m !== menu) m.style.display = 'none';
            });
            
            // Toggle this menu
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });
    });
    
    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.post-actions-menu')) {
            document.querySelectorAll('.post-menu-dropdown').forEach(m => {
                m.style.display = 'none';
            });
        }
    });
    
    // Report and block (other people's posts)
    document.querySelectorAll('.profile-post-card .report-post-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.post-menu-dropdown').style.display = 'none';
            openReportDialog({ targetType: 'post', targetId: btn.dataset.postId, authorId: btn.dataset.authorId, authorName: btn.dataset.authorName });
        });
    });
    document.querySelectorAll('.profile-post-card .block-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.post-menu-dropdown').style.display = 'none';
            openBlockDialog({ userId: btn.dataset.authorId, name: btn.dataset.authorName, onDone: updateProfileMore });
        });
    });

    // Pin post buttons
    document.querySelectorAll('.pin-post-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await pinPost(btn.dataset.postId);
        });
    });
    
    // Unpin post buttons
    document.querySelectorAll('.unpin-post-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await unpinPost(btn.dataset.postId);
        });
    });
    
    // Edit post buttons
    document.querySelectorAll('.edit-post-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = btn.dataset.postId;
            // Redirect to feed page to edit
            window.location.href = `/feed.html#edit-${postId}`;
        });
    });
    
    // Delete post buttons
    document.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await deleteProfilePost(btn.dataset.postId);
        });
    });
}

// ========================================
// PIN POST TO PROFILE
// ========================================

async function pinPost(postId) {
    const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    
    if (!userId) {
        alert('You must be logged in to pin posts');
        return;
    }
    
    try {
        // ✅ Find the button and show loading state
        const menuBtn = document.querySelector(`[data-post-id="${postId}"].pin-post-btn`);
        
        if (menuBtn) {
            menuBtn.disabled = true;
            menuBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pinning...';
        }
        
        // Get current pinned posts
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        let pinnedPosts = [];
        if (profileDoc.exists()) {
            pinnedPosts = profileDoc.data().pinnedPosts || [];
        }
        
        // Check limit (max 3 pinned posts)
        if (pinnedPosts.length >= 3) {
            if (menuBtn) {
                menuBtn.innerHTML = '<i class="fa-solid fa-exclamation"></i> Max 3 Posts';
                setTimeout(() => {
                    menuBtn.disabled = false;
                    menuBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Pin to Profile';
                }, 2000);
            }
            alert('You can only pin up to 3 posts. Unpin one first.');
            return;
        }
        
        // Add this post
        if (!pinnedPosts.includes(postId)) {
            pinnedPosts.push(postId);
        }
        
        // Update Firestore
        const { setDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await updateDoc(profileRef, {
            pinnedPosts: pinnedPosts,
            updatedAt: Date.now()
        });
        
        console.log('✅ Post pinned');
        
        // ✅ Show success feedback
        if (menuBtn) {
            menuBtn.innerHTML = '<i class="fa-solid fa-check"></i> Pinned!';
        }
        
        if (window.showNotification) {
            window.showNotification('Post pinned to your profile!', 'success');
        }
        
        // ✅ Wait a moment to show success, then reload
        setTimeout(async () => {
            // Reload posts to show updated pin status
            await loadAllUserPosts(userId);
            await loadFeaturedPosts(userId);
        }, 800);
        
    } catch (error) {
        console.error('❌ Error pinning post:', error);
        
        // ✅ Show error state
        const menuBtn = document.querySelector(`[data-post-id="${postId}"].pin-post-btn`);
        if (menuBtn) {
            menuBtn.innerHTML = '<i class="fa-solid fa-times"></i> Failed';
            setTimeout(() => {
                menuBtn.disabled = false;
                menuBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Pin to Profile';
            }, 2000);
        }
        
        alert('Failed to pin post. Please try again.');
    }
}

// ========================================
// UNPIN POST FROM PROFILE
// ========================================

// ========================================
// UNPIN POST FROM PROFILE
// ========================================

// ========================================
// UNPIN POST FROM PROFILE
// ========================================

// ========================================
// UNPIN POST FROM PROFILE
// ========================================

async function unpinPost(postId) {
    const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    
    if (!userId) return;
    
    // ✅ Find elements and context FIRST
    const menuBtn = document.querySelector(`[data-post-id="${postId}"].unpin-post-btn`);
    const menu = menuBtn?.closest('.post-menu-dropdown');
    const postCard = document.querySelector(`.profile-post-card[data-post-id="${postId}"]`);
    const isFeaturedPost = postCard?.closest('#featuredPostsList, #featuredPostsOverviewGrid');
    
    console.log('🔓 Unpinning post:', postId, { isFeatured: !!isFeaturedPost });
    
    try {
        // ✅ Disable button and show loading
        if (menuBtn) {
            menuBtn.disabled = true;
            menuBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Unpinning...';
        }
        
        // Get current pinned posts
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        if (!profileDoc.exists()) {
            throw new Error('Profile not found');
        }
        
        let pinnedPosts = profileDoc.data().pinnedPosts || [];
        
        // Check if post is actually pinned
        if (!pinnedPosts.includes(postId)) {
            console.warn('⚠️ Post not in pinned list');
            if (menuBtn) {
                menuBtn.innerHTML = '<i class="fa-solid fa-info"></i> Not Pinned';
                setTimeout(() => {
                    menuBtn.disabled = false;
                    menuBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Unpin Post';
                }, 1500);
            }
            return;
        }
        
        // Remove this post
        pinnedPosts = pinnedPosts.filter(id => id !== postId);
        
        // Update Firestore
        const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await updateDoc(profileRef, {
            pinnedPosts: pinnedPosts,
            updatedAt: Date.now()
        });
        
        console.log('✅ Post unpinned from Firestore');
        
        // ✅ Show success
        if (menuBtn) {
            menuBtn.innerHTML = '<i class="fa-solid fa-check"></i> Unpinned!';
        }
        
        if (window.showNotification) {
            window.showNotification('Post unpinned', 'success');
        }
        
        // ✅ CRITICAL FIX: Update BOTH featured sections (Overview + Posts tab)
        if (isFeaturedPost) {
            console.log('📌 Unpinned from featured section - removing from ALL featured areas');
            
            // Close menu
            setTimeout(() => {
                if (menu) menu.style.display = 'none';
            }, 500);
            
            // ✅ Remove from BOTH featured sections
            const allFeaturedCards = document.querySelectorAll(`.profile-post-card[data-post-id="${postId}"]`);
            
            allFeaturedCards.forEach(card => {
                const isInFeatured = card.closest('#featuredPostsList, #featuredPostsOverviewGrid');
                
                if (isInFeatured) {
                    console.log('🎬 Animating removal of featured post card');
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                    
                    setTimeout(() => {
                        card.remove();
                    }, 300);
                }
            });
            
            // ✅ Check and hide empty featured sections
            setTimeout(() => {
                // Posts Tab - Featured Section
                const featuredSection = document.getElementById('featuredPostsSection');
                const featuredList = document.getElementById('featuredPostsList');
                
                if (featuredList && featuredList.children.length === 0) {
                    if (featuredSection) {
                        console.log('📭 Hiding Posts tab featured section (empty)');
                        featuredSection.style.display = 'none';
                    }
                }
                
                // Overview Tab - Featured Section
                const featuredOverview = document.getElementById('featuredPostsOverview');
                const featuredOverviewGrid = document.getElementById('featuredPostsOverviewGrid');
                
                if (featuredOverviewGrid && featuredOverviewGrid.children.length === 0) {
                    if (featuredOverview) {
                        console.log('📭 Hiding Overview tab featured section (empty)');
                        featuredOverview.style.display = 'none';
                    }
                }
            }, 400);
            
        } else {
            console.log('📝 Unpinned from "All Posts" - updating UI in place');
            
            // ✅ IN-PLACE UPDATE: Just change the button without reloading
            if (postCard) {
                // Find the pin badge if it exists and remove it
                const pinBadge = postCard.querySelector('.pin-badge');
                if (pinBadge) {
                    pinBadge.style.transition = 'all 0.3s ease';
                    pinBadge.style.opacity = '0';
                    pinBadge.style.transform = 'scale(0)';
                    setTimeout(() => pinBadge.remove(), 300);
                }
                
                // Close menu
                setTimeout(() => {
                    if (menu) menu.style.display = 'none';
                }, 600);
                
                // Update menu to show "Pin" instead of "Unpin"
                setTimeout(() => {
                    const menuDropdown = postCard.querySelector('.post-menu-dropdown');
                    if (menuDropdown) {
                        // Find and replace the unpin button with pin button
                        const unpinBtn = menuDropdown.querySelector('.unpin-post-btn');
                        if (unpinBtn) {
                            const pinBtn = document.createElement('button');
                            pinBtn.className = 'menu-item pin-post-btn';
                            pinBtn.dataset.postId = postId;
                            pinBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Pin to Profile';
                            
                            // Replace unpin with pin
                            unpinBtn.replaceWith(pinBtn);
                            
                            // Reattach event listener
                            pinBtn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                await pinPost(postId);
                            });
                        }
                    }
                }, 700);
            }
            
            // ✅ ALSO remove from featured sections if they exist in other tabs
            const allFeaturedCards = document.querySelectorAll(`.profile-post-card[data-post-id="${postId}"]`);
            
            allFeaturedCards.forEach(card => {
                const isInFeatured = card.closest('#featuredPostsList, #featuredPostsOverviewGrid');
                
                if (isInFeatured && card !== postCard) {
                    console.log('🎬 Removing from other featured section');
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                    
                    setTimeout(() => {
                        card.remove();
                        
                        // Check if sections are now empty
                        const featuredSection = document.getElementById('featuredPostsSection');
                        const featuredList = document.getElementById('featuredPostsList');
                        const featuredOverview = document.getElementById('featuredPostsOverview');
                        const featuredOverviewGrid = document.getElementById('featuredPostsOverviewGrid');
                        
                        if (featuredList && featuredList.children.length === 0) {
                            if (featuredSection) featuredSection.style.display = 'none';
                        }
                        
                        if (featuredOverviewGrid && featuredOverviewGrid.children.length === 0) {
                            if (featuredOverview) featuredOverview.style.display = 'none';
                        }
                    }, 300);
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Error unpinning post:', error);
        
        // Show error state
        if (menuBtn) {
            menuBtn.innerHTML = '<i class="fa-solid fa-times"></i> Failed';
            setTimeout(() => {
                menuBtn.disabled = false;
                menuBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Unpin Post';
            }, 2000);
        }
        
        if (window.showNotification) {
            window.showNotification('Failed to unpin post', 'error');
        }
    }
}

// ========================================
// DELETE POST FROM PROFILE
// ========================================

async function deleteProfilePost(postId) {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
        return;
    }
    
    const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
    
    try {
        // Delete from Firestore
        const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await deleteDoc(doc(db, 'posts', postId));
        
        // Remove from pinned posts if it was pinned
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            let pinnedPosts = profileDoc.data().pinnedPosts || [];
            pinnedPosts = pinnedPosts.filter(id => id !== postId);
            
            const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            await updateDoc(profileRef, {
                pinnedPosts: pinnedPosts,
                updatedAt: Date.now()
            });
        }
        
        console.log('✅ Post deleted');
        
        if (window.showNotification) {
            window.showNotification('Post deleted', 'success');
        }
        
        // Reload posts
        await loadAllUserPosts(userId);
        await loadFeaturedPosts(userId);
        
    } catch (error) {
        console.error('❌ Error deleting post:', error);
        alert('Failed to delete post. Please try again.');
    }
}

// Helper function (if not already present)
// Escapes quotes as well, so it is safe inside attributes (a username or picture address can be anything someone wrote).
function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}



// ========================================
// RENDER SOCIAL LINKS
// ========================================

function renderSocialLinks(profile) {
    const socialLinks = profile.socialLinks || {};
    
    // Check if user has any social links
    const hasSocial = Object.values(socialLinks).some(link => link && link.trim() !== '');
    
    if (!hasSocial) {
        return; // Don't render anything if no social links
    }
    
    const socialIcons = [];
    
    if (socialLinks.twitter) {
        socialIcons.push(`
            <a href="https://twitter.com/${escapeHtml(socialLinks.twitter)}" 
               target="_blank" 
               rel="noopener noreferrer"
               class="social-icon twitter"
               title="X (Twitter)">
                <i class="fab fa-x-twitter"></i>
            </a>
        `);
    }
    
    if (socialLinks.instagram) {
        socialIcons.push(`
            <a href="https://instagram.com/${escapeHtml(socialLinks.instagram)}" 
               target="_blank" 
               rel="noopener noreferrer"
               class="social-icon instagram"
               title="Instagram">
                <i class="fab fa-instagram"></i>
            </a>
        `);
    }
    
    if (socialLinks.twitch) {
        socialIcons.push(`
            <a href="https://twitch.tv/${escapeHtml(socialLinks.twitch)}" 
               target="_blank" 
               rel="noopener noreferrer"
               class="social-icon twitch"
               title="Twitch">
                <i class="fab fa-twitch"></i>
            </a>
        `);
    }
    
    if (socialLinks.youtube) {
        socialIcons.push(`
            <a href="https://youtube.com/@${escapeHtml(socialLinks.youtube)}" 
               target="_blank" 
               rel="noopener noreferrer"
               class="social-icon youtube"
               title="YouTube">
                <i class="fab fa-youtube"></i>
            </a>
        `);
    }
    
    if (socialLinks.discord) {
        socialIcons.push(`
            <span class="social-icon discord" 
                  title="Discord: ${escapeHtml(socialLinks.discord)}"
                  data-handle="${escapeHtml(socialLinks.discord)}"
                  onclick="copyDiscordHandle(this.dataset.handle)">
                <i class="fab fa-discord"></i>
            </span>
        `);
    }
    
    // ✅ NEW: Insert after bio, before meta
    const bioEl = document.getElementById('profileBio');
    if (bioEl && socialIcons.length > 0) {
        // Create social container
        const socialContainer = document.createElement('div');
        socialContainer.className = 'profile-social-row';
        socialContainer.innerHTML = socialIcons.join('');
        
        // Insert after bio
        bioEl.parentNode.insertBefore(socialContainer, bioEl.nextSibling);
    }
    
    console.log('✅ Social links rendered below bio');
}

// ========================================
// GLOBAL FUNCTIONS (TODO: Implement)
// ========================================

window.toggleFollow = async function(userId) {
    console.log('🔔 Toggle follow:', userId);
    // TODO: Implement follow system
    alert('Follow system coming soon!');
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

// ========================================
// HELPER FUNCTIONS FOR POSTS
// ========================================

function getAvatarUrl(avatar) {
    if (!avatar) {
        return createEmojiAvatar('👤');
    }
    
    if (avatar.type === 'url') return fixAvatarUrl(avatar.value);
    if (avatar.type === 'champion') return avatar.imageUrl;
    if (avatar.type === 'emoji') return createEmojiAvatar(avatar.value);
    
    return createEmojiAvatar('👤');
}

function createEmojiAvatar(emoji) {
    return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">
            <rect width="50" height="50" fill="#ff4fb4"/>
            <text x="25" y="35" text-anchor="middle" font-size="30">${emoji}</text>
        </svg>
    `)}`;
}

console.log('✅ Profile page module loaded');

console.log('✅ Profile page module loaded');
