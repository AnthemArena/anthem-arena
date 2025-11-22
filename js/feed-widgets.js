// ========================================
// FEED WIDGETS - Sidebars Population
// ========================================

import { db } from './firebase-config.js';
import { createMatchCard } from './match-card-renderer.js';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFollowerCount, getFollowingCount } from './follow-system.js';

// ✅ NEW IMPORTS for personal widgets
import { getUserXPFromStorage, getUserRank } from './rank-system.js';
import { getUnlockedAchievementsFromFirebase } from './achievement-tracker.js';
import { ACHIEVEMENTS } from './achievements.js';

// ========================================
// INITIALIZE ALL WIDGETS
// ========================================

export async function initializeFeedWidgets() {
    console.log('🎨 Initializing feed widgets...');
    
    await Promise.all([
        loadUserProfile(),
        // ✅ NEW: Personal widgets
        loadPersonalRankCard(),
        loadRoundProgress(),
        loadFeaturedAchievement(),
        loadTopSong(),
        // Existing widgets
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
        
        // ✅ Load user's actual profile data from Firebase
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            const profileData = profileDoc.data();
            
            // ✅ Set bio from profile
            const bioEl = document.getElementById('sidebarBio');
            if (bioEl && profileData.bio) {
                bioEl.textContent = profileData.bio;
            }
        }
        
        // ✅ Use follow-system.js to get real counts from follows collection
        const [followingCount, followerCount] = await Promise.all([
            getFollowingCount(userId),
            getFollowerCount(userId)
        ]);
        
        document.getElementById('sidebarFollowing').textContent = followingCount;
        document.getElementById('sidebarFollowers').textContent = followerCount;
        
        // Load vote count
        const votesQuery = query(collection(db, 'votes'), where('userId', '==', userId));
        const votesSnapshot = await getDocs(votesQuery);
        document.getElementById('sidebarVotes').textContent = votesSnapshot.size;
        
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
// ✅ NEW: PERSONAL RANK CARD WIDGET
// ========================================

async function loadPersonalRankCard() {
    const container = document.getElementById('personalRankWidget');
    if (!container) return; // Widget not in HTML yet
    
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        const username = localStorage.getItem('username');
        
        if (!username || username === 'Anonymous') {
            container.style.display = 'none';
            return;
        }
        
        // Get XP and rank
        const xp = getUserXPFromStorage();
        const rank = getUserRank(xp);
        
        // Get avatar
        const avatarJson = localStorage.getItem('avatar');
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        const avatarUrl = getAvatarUrl(avatar);
        
        // Get vote count
        const votesQuery = query(collection(db, 'votes'), where('userId', '==', userId));
        const votesSnapshot = await getDocs(votesQuery);
        const voteCount = votesSnapshot.size;
        
        // Get achievement count
        const unlockedIds = await getUnlockedAchievementsFromFirebase(userId);
        const achievementCount = unlockedIds.length;
        
        // Progress percentage
        const progressPercent = Math.round(rank.progressPercent);
        
        // Clean rank title (remove emojis)
        const cleanTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
        
        container.innerHTML = `
            <div class="personal-rank-card" onclick="window.location.href='/profile.html'">
                <div class="rank-header">
                    <img src="${avatarUrl}" alt="${username}" class="rank-avatar">
                    <div class="rank-info">
                        <div class="rank-username">${username}</div>
                        <div class="rank-level">
                            <span class="level-badge">Lv. ${rank.currentLevel.level}</span>
                            <span class="rank-title">${cleanTitle}</span>
                        </div>
                    </div>
                </div>
                
                <div class="rank-progress-section">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="progress-text">
                        ${rank.currentXP.toLocaleString()} / ${rank.nextLevel.xpNeeded.toLocaleString()} XP
                    </div>
                </div>
                
                <div class="rank-stats-row">
                    <div class="rank-stat">
                        <i class="fa-solid fa-trophy"></i>
                        <span>${voteCount}</span>
                    </div>
                    <div class="rank-stat">
                        <i class="fa-solid fa-award"></i>
                        <span>${achievementCount}</span>
                    </div>
                </div>
            </div>
        `;
        
        console.log('✅ Personal rank card loaded');
        
    } catch (error) {
        console.error('❌ Error loading rank card:', error);
        container.style.display = 'none';
    }
}

// ========================================
// ✅ NEW: ROUND PROGRESS WIDGET (replaces streak)
// ========================================

async function loadRoundProgress() {
    const container = document.getElementById('roundProgressWidget');
    if (!container) return;
    
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            container.style.display = 'none';
            return;
        }
        
        // Get participation data
        const participation = await calculateTournamentParticipation(userId);
        
        if (participation.totalVotes === 0) {
            container.style.display = 'none';
            return;
        }
        
        // Find current incomplete round
        const currentRound = participation.byRound.find(r => r.percentage > 0 && r.percentage < 100);
        
        container.innerHTML = `
            <div class="round-progress-card">
                <div class="progress-header">
                    <i class="fa-solid fa-trophy"></i>
                    <span>Tournament Progress</span>
                </div>
                
                <div class="overall-progress">
                    <div class="progress-circle-mini">
                        <svg width="60" height="60">
                            <circle cx="30" cy="30" r="25" 
                                stroke="rgba(200, 170, 110, 0.2)" 
                                stroke-width="4" 
                                fill="none"/>
                            <circle cx="30" cy="30" r="25" 
                                stroke="#C8AA6E" 
                                stroke-width="4" 
                                fill="none"
                                stroke-dasharray="157"
                                stroke-dashoffset="${157 - (157 * participation.overallPercentage / 100)}"
                                transform="rotate(-90 30 30)"
                                style="transition: stroke-dashoffset 0.5s ease;"/>
                        </svg>
                        <div class="progress-value">${participation.overallPercentage}%</div>
                    </div>
                    <div class="progress-label">
                        ${participation.totalVotes} / ${participation.totalPossible} matches
                    </div>
                </div>
                
                <div class="rounds-breakdown-mini">
                    ${participation.byRound.map(round => `
                        <div class="round-row-mini ${round.percentage === 100 ? 'complete' : ''}">
                            <span class="round-name">${getRoundShortName(round.round)}</span>
                            <div class="round-bar-mini">
                                <div class="round-bar-fill" style="width: ${round.percentage}%"></div>
                            </div>
                            <span class="round-votes">${round.voted}/${round.total}</span>
                        </div>
                    `).join('')}
                </div>
                
                ${currentRound ? `
                    <div class="progress-cta">
                        🎯 ${currentRound.total - currentRound.voted} left in ${currentRound.roundName}!
                    </div>
                ` : participation.overallPercentage === 100 ? `
                    <div class="progress-cta complete">
                        🏆 100% Complete! 🎉
                    </div>
                ` : `
                    <div class="progress-cta">
                        <a href="/matches.html">View Matches →</a>
                    </div>
                `}
            </div>
        `;
        
        console.log('✅ Round progress loaded');
        
    } catch (error) {
        console.error('❌ Error loading round progress:', error);
        container.style.display = 'none';
    }
}

// Helper: Calculate tournament participation (from profile.js)
async function calculateTournamentParticipation(userId) {
    try {
        const CURRENT_TOURNAMENT = '2025-worlds-anthems';
        
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
                const match = tournamentMatches.find(m => m.matchId === vote.matchId || m.id === vote.matchId);
                return match !== undefined;
            });
        
        // Count votes by round
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
        
        // Calculate overall
        const totalPossible = Object.values(TOTAL_MATCHES_BY_ROUND).reduce((a, b) => a + b, 0);
        const totalVotes = tournamentVotes.length;
        const overallPercentage = Math.round((totalVotes / totalPossible) * 100);
        
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

// Helper: Get short round name
function getRoundShortName(roundNumber) {
    const roundNames = {
        1: 'R1',
        2: 'R2',
        3: 'R3',
        4: 'QF',
        5: 'SF',
        6: 'F'
    };
    return roundNames[roundNumber] || `R${roundNumber}`;
}

// ========================================
// ✅ NEW: FEATURED ACHIEVEMENT WIDGET
// ========================================

async function loadFeaturedAchievement() {
    const container = document.getElementById('featuredAchievementWidget');
    if (!container) return;
    
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            container.style.display = 'none';
            return;
        }
        
        const unlockedIds = await getUnlockedAchievementsFromFirebase(userId);
        
        if (unlockedIds.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        // Get highest rarity achievement
        const unlockedAchievements = unlockedIds
            .map(id => ({ ...ACHIEVEMENTS[id], id }))
            .filter(Boolean)
            .sort((a, b) => {
                const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4 };
                const rarityA = rarityOrder[a.rarity] || 0;
                const rarityB = rarityOrder[b.rarity] || 0;
                if (rarityB !== rarityA) return rarityB - rarityA;
                return (b.xp || 0) - (a.xp || 0);
            });
        
        const featured = unlockedAchievements[0];
        
        container.innerHTML = `
            <div class="featured-achievement-card" onclick="window.location.href='/profile.html#tab-achievements'">
                <div class="achievement-widget-header">
                    <i class="fa-solid fa-award"></i>
                    <span>Top Achievement</span>
                </div>
                <div class="achievement-content">
                    <div class="achievement-badge-lg">
                        ${featured.icon}
                    </div>
                    <div class="achievement-details">
                        <div class="achievement-name">${featured.name}</div>
                        <span class="achievement-rarity ${featured.rarity}">${featured.rarity}</span>
                    </div>
                    <div class="achievement-description">${featured.description}</div>
                    <div class="achievement-xp-badge">+${featured.xp} XP</div>
                </div>
                
                ${unlockedAchievements.length > 1 ? `
                    <div class="achievement-count">
                        ${unlockedAchievements.length} achievements unlocked
                    </div>
                ` : ''}
            </div>
        `;
        
        console.log('✅ Featured achievement loaded');
        
    } catch (error) {
        console.error('❌ Error loading featured achievement:', error);
        container.style.display = 'none';
    }
}

// ========================================
// ✅ NEW: TOP SONG WIDGET
// ========================================

async function loadTopSong() {
    const container = document.getElementById('topSongWidget');
    if (!container) return;
    
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        
        if (!userId) {
            container.style.display = 'none';
            return;
        }
        
        // Get all user votes
        const votesQuery = query(
            collection(db, 'votes'),
            where('userId', '==', userId)
        );
        
        const snapshot = await getDocs(votesQuery);
        
        if (snapshot.empty) {
            container.style.display = 'none';
            return;
        }
        
        // Load music data for thumbnails
        let musicVideos = [];
        try {
            const response = await fetch('/data/music-videos.json');
            musicVideos = await response.json();
        } catch (error) {
            console.warn('⚠️ Could not load music videos:', error);
        }
        
        // Get matches for song data
        const { getAllMatches } = await import('./api-client.js');
        const allMatches = await getAllMatches();
        const matchMap = new Map(allMatches.map(m => [m.matchId || m.id, m]));
        
        // Count song votes
        const songCounts = {};
        
        snapshot.docs.forEach(docSnap => {
            const vote = docSnap.data();
            const match = matchMap.get(vote.matchId);
            
            if (!match) return;
            
            const votedSong = vote.choice === 'song1' ? match.song1 : match.song2;
            if (!votedSong) return;
            
            const songId = votedSong.id;
            
            if (!songCounts[songId]) {
                const songData = musicVideos.find(v => v.id === songId || v.videoId === votedSong.videoId);
                
                songCounts[songId] = {
                    id: songId,
                    name: votedSong.shortTitle || votedSong.title,
                    artist: votedSong.artist,
                    videoId: votedSong.videoId,
                    thumbnail: songData?.videoId 
                        ? `https://img.youtube.com/vi/${songData.videoId}/mqdefault.jpg`
                        : null,
                    count: 0
                };
            }
            
            songCounts[songId].count++;
        });
        
        // Get top song
        const topSong = Object.values(songCounts)
            .sort((a, b) => b.count - a.count)[0];
        
        if (!topSong) {
            container.style.display = 'none';
            return;
        }
        
        container.innerHTML = `
            <div class="top-song-card" onclick="window.open('https://youtube.com/watch?v=${topSong.videoId}', '_blank')">
                <div class="song-widget-header">
                    <i class="fa-solid fa-music"></i>
                    <span>Your Top Song</span>
                </div>
                ${topSong.thumbnail ? `
                    <div class="song-thumbnail-container">
                        <img src="${topSong.thumbnail}" alt="${topSong.name}" class="song-thumbnail">
                        <div class="play-overlay">
                            <i class="fa-solid fa-play"></i>
                        </div>
                    </div>
                ` : ''}
                <div class="song-info">
                    <div class="song-medal">🥇</div>
                    <div class="song-details">
                        <div class="song-title">${topSong.name}</div>
                        <div class="song-artist">${topSong.artist}</div>
                        <div class="song-votes">${topSong.count} ${topSong.count === 1 ? 'vote' : 'votes'}</div>
                    </div>
                </div>
            </div>
        `;
        
        console.log('✅ Top song loaded');
        
    } catch (error) {
        console.error('❌ Error loading top song:', error);
        container.style.display = 'none';
    }
}

// ========================================
// RIGHT SIDEBAR - Live Matches Widget
// ========================================

async function loadLiveMatches() {
    const container = document.getElementById('liveMatchesWidget');
    
    try {
        // Fetch from live-matches edge function
        const response = await fetch('/api/live-matches');
        const data = await response.json();
        const liveMatches = data.matches || [];
        
        if (liveMatches.length === 0) {
            container.innerHTML = '<p class="widget-loading">No live matches right now</p>';
            return;
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Render up to 3 live matches using match cards
        liveMatches.slice(0, 3).forEach(match => {
            // Transform API data to match card format
            const matchData = transformToMatchCardFormat(match);
            
            // Create match card (reusing existing renderer)
            const card = createMatchCard(matchData);
            
            // Make it compact for widget
            card.classList.add('widget-match-card');
            
            container.appendChild(card);
        });
        
        // Add "View All" link if more than 3
        if (liveMatches.length > 3) {
            const viewAllLink = document.createElement('a');
            viewAllLink.href = '/matches';
            viewAllLink.className = 'widget-view-all';
            viewAllLink.innerHTML = `<i class="fa-solid fa-arrow-right"></i> View all ${liveMatches.length} matches`;
            container.appendChild(viewAllLink);
        }
        
        console.log('✅ Live matches loaded');
        
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
        container.innerHTML = '<p class="widget-loading">Failed to load matches</p>';
    }
}

// Transform live-matches API format to match card format
function transformToMatchCardFormat(apiMatch) {
    return {
        id: apiMatch.id || apiMatch.matchId,
        tournament: apiMatch.tournament || '2025-worlds-anthems',
        round: apiMatch.round,
        status: apiMatch.status,
        date: apiMatch.startDate,
        endDate: apiMatch.endDate,
        totalVotes: apiMatch.totalVotes || 0,
        hasVoted: false,  // Widget shows all matches regardless
        
        competitor1: {
            seed: apiMatch.song1?.seed || 1,
            name: apiMatch.song1?.shortTitle || apiMatch.song1?.title || 'Song 1',
            source: apiMatch.song1?.artist || 'Artist',
            videoId: apiMatch.song1?.videoId,
            votes: apiMatch.song1?.votes || 0,
            percentage: apiMatch.song1?.percentage || 0,
            leading: (apiMatch.song1?.votes || 0) > (apiMatch.song2?.votes || 0)
        },
        
        competitor2: {
            seed: apiMatch.song2?.seed || 2,
            name: apiMatch.song2?.shortTitle || apiMatch.song2?.title || 'Song 2',
            source: apiMatch.song2?.artist || 'Artist',
            videoId: apiMatch.song2?.videoId,
            votes: apiMatch.song2?.votes || 0,
            percentage: apiMatch.song2?.percentage || 0,
            leading: (apiMatch.song2?.votes || 0) > (apiMatch.song1?.votes || 0)
        }
    };
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
        
        // Load music videos data for thumbnails
        let musicVideos = [];
        try {
            const response = await fetch('/data/music-videos.json');
            musicVideos = await response.json();
        } catch (error) {
            console.warn('⚠️ Could not load music videos data:', error);
        }
        
        // Render activities with thumbnails
        container.innerHTML = activities.map(activity => {
            const avatarUrl = getAvatarUrl(activity.avatar);
            const timeAgo = getTimeAgo(activity.timestamp);
            const action = `voted for`;
            
            // Find thumbnail for the song
            const songVideo = musicVideos.find(v => v.id === activity.songId);
            const thumbnailUrl = songVideo?.videoId 
                ? `https://img.youtube.com/vi/${songVideo.videoId}/mqdefault.jpg`
                : null;
            
            return `
                <div class="activity-item-mini" onclick="window.location.href='/vote?match=${activity.matchId}'">
                    <img src="${avatarUrl}" alt="${activity.username}" class="activity-avatar-mini">
                    <div class="activity-info-mini">
                        <div class="activity-username">${activity.username}</div>
                        <div class="activity-action">${action} ${truncate(activity.songTitle, 18)}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                    ${thumbnailUrl ? `
                        <img src="${thumbnailUrl}" 
                             alt="${activity.songTitle}" 
                             class="activity-song-thumbnail"
                             loading="lazy">
                    ` : ''}
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
    console.log('🔧 Setting up sidebar interactions...');
    
    // Make entire profile card clickable
    const profileCard = document.querySelector('.sidebar-profile-card');
    if (profileCard) {
        profileCard.style.cursor = 'pointer';
        profileCard.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        
        profileCard.addEventListener('click', (e) => {
            // Don't trigger if clicking on a button or link inside
            if (e.target.closest('button, a, .sidebar-actions')) return;
            
            window.location.href = '/profile.html';
        });
        
        profileCard.addEventListener('mouseenter', () => {
            profileCard.style.transform = 'translateY(-2px)';
            profileCard.style.boxShadow = '0 6px 16px rgba(200, 170, 110, 0.15)';
        });
        
        profileCard.addEventListener('mouseleave', () => {
            profileCard.style.transform = 'translateY(0)';
            profileCard.style.boxShadow = '';
        });
        
        console.log('✅ Profile card now clickable');
    }
    
    // Wait for notification center to be ready
    setTimeout(() => {
        // Notifications button
const notifBtn = document.getElementById('sidebarNotifications');
        if (notifBtn) {
            notifBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent card click
                console.log('🔔 Notifications clicked');
                
                if (window.openNotificationPanel) {
                    window.openNotificationPanel();
                } else {
                    console.warn('⚠️ Notification panel not ready yet');
                }
            });
            console.log('✅ Notifications button handler attached');
        }
        
        // Messages button - opens notifications and switches to messages tab
        const msgBtn = document.getElementById('sidebarMessages');
        if (msgBtn) {
            msgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent card click
                console.log('💬 Messages clicked');
                
                if (window.openNotificationPanel) {
                    window.openNotificationPanel();
                    
                    // Switch to messages tab after panel opens
                    setTimeout(() => {
                        const messagesTab = document.querySelector('[data-tab="messages"]');
                        if (messagesTab) {
                            messagesTab.click();
                        }
                    }, 150);
                } else {
                    console.warn('⚠️ Notification panel not ready yet');
                }
            });
            console.log('✅ Messages button handler attached');
        }
    }, 500); // Wait 500ms for notification center to initialize
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