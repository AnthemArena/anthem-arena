// ========================================
// IMPORTS
// ========================================
import { getBookForSong } from './bookMappings.js';
import { getAllMatches } from './api-client.js';
import './youtube-playlist.js';
import { db } from './firebase-config.js';
import { collection, getDocs, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ========================================
// GLOBAL STATE
// ========================================
let musicVideos = {};
let countdownInterval = null;

// ========================================
// LOAD MUSIC VIDEO DATA
// ========================================
async function loadMusicVideos() {
    try {
        const response = await fetch('musicVideos.json');
        if (!response.ok) throw new Error('Failed to load music videos');
        musicVideos = await response.json();
        console.log('✅ Music videos loaded:', Object.keys(musicVideos).length);
    } catch (error) {
        console.error('❌ Error loading music videos:', error);
        musicVideos = {};
    }
}

// ========================================
// GET SONG INFO
// ========================================
function getSongInfo(songTitle) {
    if (!songTitle) return null;
    
    // Direct match
    if (musicVideos[songTitle]) {
        return { title: songTitle, ...musicVideos[songTitle] };
    }
    
    // Case-insensitive match
    const normalizedTitle = songTitle.toLowerCase().trim();
    const matchedKey = Object.keys(musicVideos).find(
        key => key.toLowerCase().trim() === normalizedTitle
    );
    
    if (matchedKey) {
        return { title: matchedKey, ...musicVideos[matchedKey] };
    }
    
    return null;
}

// ========================================
// LOAD TOURNAMENT INFO
// ========================================
async function loadTournamentInfo(allMatches) {
    try {
        // Get tournament metadata from first match
        if (allMatches.length > 0) {
            const firstMatch = allMatches[0];
            const tournamentName = firstMatch.tournament || '2025 Worlds Anthems Championship';
            const tournamentDescription = 'The ultimate showdown of League music begins! Vote for your favorites.';
            
            // Determine current round
            const liveMatches = allMatches.filter(m => m.status === 'live');
            const currentRound = liveMatches.length > 0 ? liveMatches[0].round : 'Finals';
            
            // Update DOM
            document.getElementById('tournamentName').textContent = tournamentName;
            document.getElementById('tournamentDescription').textContent = tournamentDescription;
            document.getElementById('tournamentRound').textContent = currentRound;
            
            // Update status indicator
            const statusEl = document.getElementById('tournamentStatus');
            if (liveMatches.length > 0) {
                statusEl.innerHTML = '<span class="status-dot"></span>LIVE';
                statusEl.className = 'status-indicator live';
            } else {
                statusEl.innerHTML = 'COMPLETED';
                statusEl.className = 'status-indicator completed';
            }
            
            console.log('✅ Tournament info loaded:', tournamentName);
        }
    } catch (error) {
        console.error('❌ Error loading tournament info:', error);
    }
}

// ========================================
// LOAD FEATURED MATCH
// ========================================
async function loadFeaturedMatch(allMatches) {
    try {
        const container = document.getElementById('featuredMatchContainer');
        if (!container) return;
        
        // Get live matches
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        if (liveMatches.length === 0) {
            container.innerHTML = `
                <div class="no-matches">
                    <i class="fa-solid fa-calendar-xmark"></i>
                    <p>No live matches at the moment. Check back soon!</p>
                    <a href="bracket.html" class="btn-secondary">View Bracket</a>
                </div>
            `;
            return;
        }
        
        // Pick featured match (highest vote count or random)
        const featuredMatch = liveMatches.sort((a, b) => 
            (b.totalVotes || 0) - (a.totalVotes || 0)
        )[0];
        
        // Render match card
        container.innerHTML = renderMatchCard(featuredMatch, true);
        
        console.log('✅ Featured match loaded:', featuredMatch.id);
        
    } catch (error) {
        console.error('❌ Error loading featured match:', error);
    }
}

// ========================================
// LOAD YOUR ACTIVE VOTES
// ========================================
async function loadYourActiveVotes(allMatches) {
    try {
        const section = document.getElementById('yourVotesSection');
        const container = document.getElementById('yourVotesGrid');
        
        if (!section || !container) return;
        
        // Get user votes from localStorage
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        
        // Filter to only live matches where user has voted
        const yourActiveVotes = allMatches.filter(match => 
            match.status === 'live' && userVotes[match.id]
        );
        
        if (yourActiveVotes.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        // Show section
        section.style.display = 'block';
        
        // Render vote cards
        container.innerHTML = yourActiveVotes
            .slice(0, 6) // Limit to 6
            .map(match => renderMatchCard(match, false))
            .join('');
        
        console.log('✅ Your active votes loaded:', yourActiveVotes.length);
        
    } catch (error) {
        console.error('❌ Error loading your active votes:', error);
    }
}

// ========================================
// LOAD COMMUNITY PULSE (NEW!)
// ========================================
async function loadCommunityPulse() {
    try {
        console.log('🔄 Loading community pulse...');
        
        // Load recent activity
        await loadRecentActivity();
        
        // Load live stats
        await loadLiveStats();
        
        // Load feed preview
        await loadFeedPreview();
        
        console.log('✅ Community pulse loaded');
        
    } catch (error) {
        console.error('❌ Error loading community pulse:', error);
    }
}

// ========================================
// LOAD RECENT ACTIVITY
// ========================================
async function loadRecentActivity() {
    try {
        const container = document.getElementById('recentActivityPreview');
        if (!container) return;
        
        // Import getActivityFeed
        const { getActivityFeed } = await import('./api-client.js');
        const recentActivity = await getActivityFeed(5);
        
        if (!recentActivity || recentActivity.length === 0) {
            container.innerHTML = '<p class="no-activity">No recent activity</p>';
            return;
        }
        
        container.innerHTML = recentActivity.map(activity => {
            const avatar = getAvatarUrl(activity.avatar);
            const timeAgo = getTimeAgo(activity.timestamp);
            
            return `
                <div class="activity-item">
                    <img src="${avatar}" alt="${activity.username}" class="activity-avatar">
                    <div class="activity-details">
                        <span class="activity-user">${escapeHtml(activity.username)}</span>
                        <span class="activity-action">voted for</span>
                        <span class="activity-song">${escapeHtml(activity.songTitle || 'Unknown Song')}</span>
                    </div>
                    <span class="activity-time">${timeAgo}</span>
                </div>
            `;
        }).join('');
        
        console.log('✅ Recent activity loaded:', recentActivity.length);
        
    } catch (error) {
        console.error('❌ Error loading recent activity:', error);
        const container = document.getElementById('recentActivityPreview');
        if (container) {
            container.innerHTML = '<p class="no-activity">Unable to load activity</p>';
        }
    }
}

// ========================================
// LOAD LIVE STATS
// ========================================
async function loadLiveStats() {
    try {
        // Get all matches
        const allMatches = await getAllMatches();
        
        // Calculate active voters (unique users in last hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const { getActivityFeed } = await import('./api-client.js');
        const recentActivity = await getActivityFeed(100);
        
        const uniqueVoters = new Set(
            recentActivity
                .filter(a => a.timestamp > oneHourAgo)
                .map(a => a.userId)
        ).size;
        
        // Calculate today's votes
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const todayVotes = recentActivity
            .filter(a => a.timestamp > todayStart)
            .length;
        
        // Find hottest match
        const liveMatches = allMatches.filter(m => m.status === 'live');
        const hottestMatch = liveMatches.sort((a, b) => 
            (b.totalVotes || 0) - (a.totalVotes || 0)
        )[0];
        
        // Update UI
        document.getElementById('liveVotersCount').textContent = uniqueVoters || '0';
        document.getElementById('todayVotesCount').textContent = todayVotes.toLocaleString() || '0';
        document.getElementById('hottestMatchVotes').textContent = hottestMatch ? (hottestMatch.totalVotes || 0) : '0';
        
        console.log('✅ Live stats updated:', { 
            uniqueVoters, 
            todayVotes, 
            hottestMatch: hottestMatch?.totalVotes 
        });
        
    } catch (error) {
        console.error('❌ Error loading live stats:', error);
        // Set fallback values
        document.getElementById('liveVotersCount').textContent = '—';
        document.getElementById('todayVotesCount').textContent = '—';
        document.getElementById('hottestMatchVotes').textContent = '—';
    }
}

// ========================================
// LOAD FEED PREVIEW
// ========================================
async function loadFeedPreview() {
    try {
        const container = document.getElementById('feedPostsPreview');
        if (!container) return;
        
        // Query Firestore for recent posts
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('timestamp', 'desc'), limit(3));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="no-posts">No posts yet. Be the first!</p>';
            return;
        }
        
        const posts = [];
        snapshot.forEach(doc => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        
        container.innerHTML = posts.map(post => {
            const avatar = getAvatarUrl(post.avatar);
            const timeAgo = getTimeAgo(post.timestamp);
            const content = post.content || post.text || '';
            const truncated = truncateText(content, 80);
            
            return `
                <div class="feed-post-preview">
                    <img src="${avatar}" alt="${post.username}" class="post-avatar">
                    <div class="post-content">
                        <span class="post-user">${escapeHtml(post.username || 'Anonymous')}</span>
                        <p class="post-text">${escapeHtml(truncated)}</p>
                    </div>
                    <span class="post-time">${timeAgo}</span>
                </div>
            `;
        }).join('');
        
        console.log('✅ Feed preview loaded:', posts.length);
        
    } catch (error) {
        console.error('❌ Error loading feed preview:', error);
        const container = document.getElementById('feedPostsPreview');
        if (container) {
            container.innerHTML = '<p class="no-posts">Unable to load feed</p>';
        }
    }
}

// ========================================
// LOAD PROFILE WIDGET (NEW!)
// ========================================
async function loadProfileWidget() {
    try {
        const username = localStorage.getItem('username') || 'Guest';
        const avatarJson = localStorage.getItem('avatar');
        
        let avatar;
        try {
            avatar = JSON.parse(avatarJson);
        } catch {
            avatar = { type: 'emoji', value: '🎵' };
        }
        
        // Get XP and rank
        const { getUserXPFromStorage, getUserRank } = await import('./rank-system.js');
        const xp = getUserXPFromStorage();
        const rank = getUserRank(xp);
        
        // Get vote count
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const voteCount = Object.keys(userVotes).length;
        
        // Get achievements
        const achievements = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
        
        // Update widget
        document.getElementById('profileWidgetUsername').textContent = username;
        
        const rankTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
        document.getElementById('profileWidgetRank').textContent = `Level ${rank.currentLevel.level} - ${rankTitle}`;
        
        document.getElementById('profileWidgetVotes').textContent = voteCount;
        document.getElementById('profileWidgetXP').textContent = xp.toLocaleString();
        document.getElementById('profileWidgetAchievements').textContent = achievements.length;
        
        // Set avatar
        const avatarEl = document.getElementById('profileWidgetAvatar');
        if (avatar.type === 'url') {
            avatarEl.src = avatar.value;
        } else {
            avatarEl.src = createEmojiAvatar(avatar.value);
        }
        
        // Champion pack name
        const championPack = window.championLoader?.getCurrentPack();
        if (championPack) {
            document.getElementById('championPackName').textContent = `${championPack.emoji || '📢'} ${championPack.name}`;
        } else {
            document.getElementById('championPackName').textContent = '📢 Default Announcer';
        }
        
        console.log('✅ Profile widget loaded:', { username, voteCount, xp, achievements: achievements.length });
        
    } catch (error) {
        console.error('❌ Error loading profile widget:', error);
    }
}

// ========================================
// LOAD LIVE MATCHES
// ========================================
async function loadLiveMatches(allMatches) {
    try {
        const container = document.getElementById('liveMatchesGrid');
        if (!container) return;
        
        // Get live matches
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        if (liveMatches.length === 0) {
            container.innerHTML = `
                <div class="no-matches">
                    <i class="fa-solid fa-calendar-xmark"></i>
                    <p>No live matches at the moment</p>
                </div>
            `;
            return;
        }
        
        // Sort by total votes (most active first)
        const sortedMatches = liveMatches
            .sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0))
            .slice(0, 4); // Show top 4
        
        container.innerHTML = sortedMatches
            .map(match => renderMatchCard(match, false))
            .join('');
        
        console.log('✅ Live matches loaded:', sortedMatches.length);
        
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
    }
}

// ========================================
// LOAD RECENT RESULTS
// ========================================
async function loadRecentResults(allMatches) {
    try {
        const container = document.getElementById('recentResultsGrid');
        if (!container) return;
        
        // Get completed matches
        const completedMatches = allMatches.filter(m => m.status === 'completed');
        
        if (completedMatches.length === 0) {
            container.innerHTML = `
                <div class="no-matches">
                    <i class="fa-solid fa-hourglass-half"></i>
                    <p>No results yet. Be patient!</p>
                </div>
            `;
            return;
        }
        
        // Sort by close time (most recent first)
        const sortedResults = completedMatches
            .sort((a, b) => (b.closeTime || 0) - (a.closeTime || 0))
            .slice(0, 6); // Show 6 most recent
        
        container.innerHTML = sortedResults
            .map(match => renderResultCard(match))
            .join('');
        
        console.log('✅ Recent results loaded:', sortedResults.length);
        
    } catch (error) {
        console.error('❌ Error loading recent results:', error);
    }
}

// ========================================
// LOAD NEXT MATCH COUNTDOWN
// ========================================
async function loadNextMatchCountdown(allMatches) {
    try {
        const section = document.getElementById('countdownSection');
        if (!section) return;
        
        // Find upcoming matches
        const upcomingMatches = allMatches.filter(m => 
            m.status === 'upcoming' && m.openTime
        );
        
        if (upcomingMatches.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        // Get soonest upcoming match
        const nextMatch = upcomingMatches.sort((a, b) => 
            a.openTime - b.openTime
        )[0];
        
        // Show section
        section.style.display = 'block';
        
        // Update description
        const descEl = document.getElementById('countdownDescription');
        if (descEl) {
            descEl.textContent = `${nextMatch.song1} vs ${nextMatch.song2} opens soon!`;
        }
        
        // Start countdown
        startCountdown(nextMatch.openTime);
        
        console.log('✅ Countdown started for:', nextMatch.id);
        
    } catch (error) {
        console.error('❌ Error loading countdown:', error);
    }
}

// ========================================
// START COUNTDOWN
// ========================================
function startCountdown(targetTime) {
    // Clear existing interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    function updateCountdown() {
        const now = Date.now();
        const diff = targetTime - now;
        
        if (diff <= 0) {
            clearInterval(countdownInterval);
            document.getElementById('countdownSection').style.display = 'none';
            return;
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        document.getElementById('countdownDays').textContent = String(days).padStart(2, '0');
        document.getElementById('countdownHours').textContent = String(hours).padStart(2, '0');
        document.getElementById('countdownMinutes').textContent = String(minutes).padStart(2, '0');
        document.getElementById('countdownSeconds').textContent = String(seconds).padStart(2, '0');
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// ========================================
// UPDATE HERO STATS
// ========================================
async function updateHeroStats(allMatches) {
    try {
        // Total songs
        const uniqueSongs = new Set();
        allMatches.forEach(match => {
            if (match.song1) uniqueSongs.add(match.song1);
            if (match.song2) uniqueSongs.add(match.song2);
        });
        document.getElementById('heroTotalSongs').textContent = uniqueSongs.size;
        
        // Total votes
        const totalVotes = allMatches.reduce((sum, match) => 
            sum + (match.totalVotes || 0), 0
        );
        document.getElementById('heroTotalVotes').textContent = totalVotes.toLocaleString();
        
        // Active matches
        const liveMatches = allMatches.filter(m => m.status === 'live');
        document.getElementById('heroActiveMatches').textContent = liveMatches.length;
        
        console.log('✅ Hero stats updated:', { 
            songs: uniqueSongs.size, 
            votes: totalVotes, 
            liveMatches: liveMatches.length 
        });
        
    } catch (error) {
        console.error('❌ Error updating hero stats:', error);
    }
}

// ========================================
// RENDER MATCH CARD
// ========================================
function renderMatchCard(match, isFeatured = false) {
    const song1Info = getSongInfo(match.song1);
    const song2Info = getSongInfo(match.song2);
    
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const userVote = userVotes[match.id];
    
    const totalVotes = match.totalVotes || 0;
    const song1Votes = match.song1Votes || 0;
    const song2Votes = match.song2Votes || 0;
    
    const song1Pct = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
    const song2Pct = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50;
    
    const cardClass = isFeatured ? 'match-card featured' : 'match-card';
    
    return `
        <div class="${cardClass}" data-match-id="${match.id}">
            <div class="match-header">
                <span class="match-round">${match.round || 'Round 1'}</span>
                ${userVote ? '<span class="voted-badge">✓ Voted</span>' : ''}
            </div>
            
            <div class="match-songs">
                <div class="song-option ${userVote === match.song1 ? 'voted' : ''}" 
                     onclick="window.location.href='match.html?id=${match.id}'">
                    <div class="song-thumbnail">
                        <img src="https://img.youtube.com/vi/${song1Info?.videoId || 'default'}/mqdefault.jpg" 
                             alt="${match.song1}"
                             onerror="this.src='assets/default-thumbnail.jpg'">
                    </div>
                    <div class="song-info">
                        <h3 class="song-title">${match.song1}</h3>
                        <div class="song-votes">
                            <div class="vote-bar">
                                <div class="vote-fill" style="width: ${song1Pct}%"></div>
                            </div>
                            <span class="vote-count">${song1Votes} votes (${song1Pct}%)</span>
                        </div>
                    </div>
                </div>
                
                <div class="vs-divider">
                    <span>VS</span>
                </div>
                
                <div class="song-option ${userVote === match.song2 ? 'voted' : ''}"
                     onclick="window.location.href='match.html?id=${match.id}'">
                    <div class="song-thumbnail">
                        <img src="https://img.youtube.com/vi/${song2Info?.videoId || 'default'}/mqdefault.jpg" 
                             alt="${match.song2}"
                             onerror="this.src='assets/default-thumbnail.jpg'">
                    </div>
                    <div class="song-info">
                        <h3 class="song-title">${match.song2}</h3>
                        <div class="song-votes">
                            <div class="vote-bar">
                                <div class="vote-fill" style="width: ${song2Pct}%"></div>
                            </div>
                            <span class="vote-count">${song2Votes} votes (${song2Pct}%)</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="match-footer">
                <span class="match-total-votes">${totalVotes} total votes</span>
                <a href="match.html?id=${match.id}" class="btn-vote">
                    ${userVote ? 'View Match' : 'Vote Now'} →
                </a>
            </div>
        </div>
    `;
}

// ========================================
// RENDER RESULT CARD
// ========================================
function renderResultCard(match) {
    const song1Info = getSongInfo(match.song1);
    const song2Info = getSongInfo(match.song2);
    
    const totalVotes = match.totalVotes || 0;
    const song1Votes = match.song1Votes || 0;
    const song2Votes = match.song2Votes || 0;
    
    const winner = song1Votes > song2Votes ? match.song1 : match.song2;
    const winnerInfo = song1Votes > song2Votes ? song1Info : song2Info;
    const loser = song1Votes > song2Votes ? match.song2 : match.song1;
    const loserInfo = song1Votes > song2Votes ? song2Info : song1Info;
    const winnerVotes = Math.max(song1Votes, song2Votes);
    const loserVotes = Math.min(song1Votes, song2Votes);
    
    return `
        <div class="result-card">
            <div class="result-header">
                <span class="result-round">${match.round || 'Round 1'}</span>
                <span class="result-status">✓ Completed</span>
            </div>
            
            <div class="result-winner">
                <div class="winner-thumbnail">
                    <img src="https://img.youtube.com/vi/${winnerInfo?.videoId || 'default'}/mqdefault.jpg" 
                         alt="${winner}"
                         onerror="this.src='assets/default-thumbnail.jpg'">
                    <div class="winner-badge">🏆 WINNER</div>
                </div>
                <h3 class="winner-title">${winner}</h3>
                <span class="winner-votes">${winnerVotes} votes</span>
            </div>
            
            <div class="result-divider">defeated</div>
            
            <div class="result-loser">
                <div class="loser-thumbnail">
                    <img src="https://img.youtube.com/vi/${loserInfo?.videoId || 'default'}/mqdefault.jpg" 
                         alt="${loser}"
                         onerror="this.src='assets/default-thumbnail.jpg'">
                </div>
                <h4 class="loser-title">${loser}</h4>
                <span class="loser-votes">${loserVotes} votes</span>
            </div>
            
            <a href="match.html?id=${match.id}" class="btn-view-result">
                View Details →
            </a>
        </div>
    `;
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function getAvatarUrl(avatar) {
    if (!avatar) return createEmojiAvatar('🎵');
    if (avatar.type === 'url') return avatar.value;
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

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// LOADING STATES
// ========================================
function showHomepageLoading() {
    const loading = document.getElementById('homepageLoading');
    if (loading) loading.style.display = 'flex';
}

function hideHomepageLoading() {
    const loading = document.getElementById('homepageLoading');
    if (loading) loading.style.display = 'none';
}

function showHomepageSections() {
    const content = document.getElementById('homepageContent');
    if (content) content.style.display = 'block';
}

function showHomepageError(error) {
    const content = document.getElementById('homepageContent');
    if (content) {
        content.innerHTML = `
            <div class="error-state">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <h2>Unable to Load Tournament</h2>
                <p>${error.message}</p>
                <button class="btn-primary" onclick="location.reload()">
                    Retry
                </button>
            </div>
        `;
        content.style.display = 'block';
    }
}

// ========================================
// HIDE CHAMPIONS SECTION (Legacy)
// ========================================
function hideChampionsSection() {
    // Legacy function - can be removed if not used elsewhere
    console.log('ℹ️ Champions section hidden');
}

// ========================================
// INITIALIZE
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.time('⏱️ Total Homepage Load');
    console.log('🎵 League Music Tournament Homepage Loaded');
    
    try {
        showHomepageLoading();
        // Load music video data first
        await loadMusicVideos();
        
        // Get all matches
        const allMatches = await getAllMatches();
        console.log('📊 Total matches loaded:', allMatches.length);
        
        // Load all sections
        await loadTournamentInfo(allMatches);
        await loadFeaturedMatch(allMatches);
        await loadYourActiveVotes(allMatches);
        
        // 🆕 NEW SECTIONS
        await loadCommunityPulse();
        await loadProfileWidget();
        
        await loadLiveMatches(allMatches);
        await loadRecentResults(allMatches);
        await loadNextMatchCountdown(allMatches);
        await updateHeroStats(allMatches);
        
        // Clean up and show content
        hideChampionsSection();
        hideHomepageLoading();
        showHomepageSections();
        
        console.timeEnd('⏱️ Total Homepage Load');
        console.log('✅ Homepage fully loaded');
        
    } catch (error) {
        console.error('❌ Critical error loading homepage:', error);
        hideHomepageLoading();
        showHomepageError(error);
    }
});

// ========================================
// CLEANUP ON PAGE UNLOAD
// ========================================
window.addEventListener('beforeunload', () => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});

// ========================================
// EXPOSE GLOBAL FUNCTIONS
// ========================================
window.reloadHomepage = async () => {
    console.log('🔄 Reloading homepage...');
    showHomepageLoading();
    
    try {
        const allMatches = await getAllMatches();
        await loadTournamentInfo(allMatches);
        await loadFeaturedMatch(allMatches);
        await loadYourActiveVotes(allMatches);
        await loadCommunityPulse();
        await loadProfileWidget();
        await loadLiveMatches(allMatches);
        await loadRecentResults(allMatches);
        await loadNextMatchCountdown(allMatches);
        await updateHeroStats(allMatches);
        
        hideHomepageLoading();
        console.log('✅ Homepage reloaded');
    } catch (error) {
        console.error('❌ Error reloading homepage:', error);
        hideHomepageLoading();
    }
};

// Export for testing
export { 
    loadMusicVideos, 
    getSongInfo, 
    loadTournamentInfo,
    loadFeaturedMatch,
    loadYourActiveVotes,
    loadCommunityPulse,
    loadProfileWidget,
    loadLiveMatches,
    loadRecentResults,
    loadNextMatchCountdown,
    updateHeroStats
};