// ========================================
// ACTIVITY FEED PAGE
// ========================================

import { getActivityFeed } from './api-client.js';

let allActivities = [];
let currentFilter = 'all';
let musicData = {}; // Cache for music video data

/**
 * Load music data on page init
 */
async function loadMusicData() {
    try {
        const response = await fetch('/data/music-videos.json');
        const data = await response.json();
        
        // Create a lookup map: songId -> video data
        data.forEach(song => {
            musicData[song.id] = song;
            // Also map by seed if songId is stored as seed
            if (song.seed) {
                musicData[song.seed] = song;
            }
        });
        
        console.log(`✅ Loaded ${data.length} songs for thumbnails`);
    } catch (error) {
        console.error('❌ Error loading music data:', error);
    }
}

/**
 * Render avatar (emoji or champion image)
 */
function renderAvatar(avatar) {
    // Handle old emoji-only format
    if (typeof avatar === 'string') {
        return avatar;
    }
    
    // Handle new format {type: 'emoji'|'url', value: '...'}
    if (avatar && avatar.type === 'url') {
        return `<img src="${avatar.value}" alt="Avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <span class="avatar-fallback" style="display: none;">👤</span>`;
    }
    
    // Default to emoji
    return avatar?.value || '🎵';
}

/**
 * Get YouTube thumbnail URL from song data
 */
function getYoutubeThumbnail(songId) {
    const song = musicData[songId];
    
    if (song && song.videoId) {
        // Use maxresdefault for best quality, fallback to hqdefault
        return `https://img.youtube.com/vi/${song.videoId}/maxresdefault.jpg`;
    }
    
    // Fallback placeholder
    return 'https://via.placeholder.com/640x360/0a0a0a/C8AA6E?text=🎵';
}

/**
 * Get song title from music data (fallback if activity doesn't have it)
 */
function getSongTitle(songId, fallbackTitle) {
    const song = musicData[songId];
    return song?.shortTitle || song?.title || fallbackTitle || 'Unknown Song';
}

// ========================================
// INITIALIZE PAGE - Load tournaments first
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎭 Activity page loaded');
    
    // Show loading
    document.getElementById('loading-overlay').style.display = 'flex';
    
    // Load data in parallel
    await Promise.all([
        loadMusicData(),
        loadTournamentNames()
    ]);
    
    // Load activity feed
    await loadActivityFeed();
    
    // Setup filter buttons
    setupFilters();
    
    // Hide loading
    document.getElementById('loading-overlay').style.display = 'none';
});

// ========================================
// LOAD ACTIVITY FEED
// ========================================

async function loadActivityFeed() {
    try {
        console.log('📥 Loading activity feed...');
        
        // Fetch from edge-cached API
        allActivities = await getActivityFeed(100);
        
        if (allActivities.length === 0) {
            document.getElementById('no-activity').style.display = 'flex';
            return;
        }
        
        // Render feed
        renderActivityFeed(allActivities);
        
        // Update stats
        updateStats();
        
        console.log(`✅ Loaded ${allActivities.length} activity items`);
        
    } catch (error) {
        console.error('❌ Error loading activity:', error);
        showError('Could not load activity feed');
    }
}

// ========================================
// RENDER ACTIVITY FEED
// ========================================

function renderActivityFeed(activities) {
    const container = document.getElementById('activity-feed');
    
    // Get current user ID for "my votes" filter
    const currentUserId = localStorage.getItem('userId');
    
    const filteredActivities = activities.filter(activity => {
        if (currentFilter === 'all') return true;
        if (currentFilter === 'my-votes') return activity.userId === currentUserId;
        return true;
    });
    
    if (filteredActivities.length === 0) {
        container.innerHTML = '<p class="no-results">No activity found for this filter</p>';
        return;
    }
    
    const html = filteredActivities
        .map(activity => renderVoteCard(activity))
        .join('');
    
    container.innerHTML = html;
}


// ========================================
// RENDER VOTE CARD - Include full match context with "vs"
// ========================================

function renderVoteCard(activity) {
    const thumbnailUrl = getYoutubeThumbnail(activity.songId);
    const songTitle = getSongTitle(activity.songId, activity.songTitle);
    const tournamentName = formatTournamentName(activity.tournamentId);
    
    // Parse match title to get both songs
    const matchTitle = activity.matchTitle || '';
    const songs = matchTitle.split(' vs ');
    const song1 = songs[0] || 'Song 1';
    const song2 = songs[1] || 'Song 2';
    
    // Check which song was voted for and highlight it
    const votedSong = activity.songTitle || songTitle;
    const isVotedForSong1 = song1.includes(votedSong) || votedSong.includes(song1);
    
    return `
        <div class="vote-card">
            <div class="vote-thumbnail">
                <img src="${thumbnailUrl}" alt="${songTitle}" loading="lazy" />
            </div>
            
            <div class="vote-user">
                <div class="user-avatar">
                    ${renderAvatar(activity.avatar)}
                </div>
                <div class="user-info">
                    <div class="username">${activity.username || 'Anonymous'}</div>
                    <div class="vote-time">${getTimeAgo(activity.timestamp)}</div>
                </div>
            </div>
            
            <div class="vote-song">
                <div class="song-title">
                    <span class="${isVotedForSong1 ? 'voted-song' : ''}">${song1}</span>
                    <span class="vs-separator">vs</span>
                    <span class="${!isVotedForSong1 ? 'voted-song' : ''}">${song2}</span>
                </div>
            </div>
            
            <div class="match-info">
                <span class="match-badge">Round ${activity.round}</span>
                <span class="tournament-name">${tournamentName}</span>
            </div>
            
            <div class="vote-action">
                <a href="/vote.html?id=${activity.matchId}" class="view-match-btn">
                    <span>View Match</span>
                    <span>→</span>
                </a>
            </div>
        </div>
    `;
}


// ========================================
// FORMAT TOURNAMENT NAME - Fetch from Firebase
// ========================================

let tournamentCache = {};

async function loadTournamentNames() {
    try {
        const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const tournamentsSnapshot = await getDocs(collection(window.db, 'tournaments'));
        
        tournamentsSnapshot.forEach(doc => {
            const data = doc.data();
            tournamentCache[data.id] = data.name;
        });
        
        console.log(`✅ Loaded ${Object.keys(tournamentCache).length} tournament names`);
    } catch (error) {
        console.error('❌ Error loading tournament names:', error);
    }
}

function formatTournamentName(tournamentId) {
    return tournamentCache[tournamentId] || tournamentId;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
}

// ========================================
// FILTER LOGIC - Add "My Votes" filter
// ========================================

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update filter
            currentFilter = btn.dataset.filter;
            
            // Re-render
            renderActivityFeed(allActivities);
        });
    });
}

// ========================================
// UPDATE STATS - Show total votes and unique voters
// ========================================

function updateStats() {
    // Total votes
    document.getElementById('revealed-count').textContent = allActivities.length;
    
    // Unique voters (count unique userIds)
    const uniqueVoters = new Set(allActivities.map(a => a.userId)).size;
    document.getElementById('locked-count').textContent = uniqueVoters;
}

// ========================================
// ERROR HANDLING
// ========================================

function showError(message) {
    const container = document.getElementById('activity-feed');
    container.innerHTML = `
        <div class="error-message">
            <span class="error-icon">⚠️</span>
            <p>${message}</p>
            <button onclick="location.reload()" class="btn-primary">Retry</button>
        </div>
    `;
}

console.log('✅ Activity.js loaded');