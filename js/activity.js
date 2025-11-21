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
        
        // Create multiple lookup maps for flexibility
        data.forEach(song => {
            // Map by numeric ID
            musicData[song.id] = song;
            
            // Map by seed
            if (song.seed) {
                musicData[song.seed] = song;
            }
            
            // ✅ NEW: Map by YouTube video ID (this is what activity.songId contains!)
            if (song.videoId) {
                musicData[song.videoId] = song;
            }
        });
        
        console.log(`✅ Loaded ${data.length} songs for thumbnails`);
        console.log('📋 Sample video IDs mapped:', Object.keys(musicData).filter(k => k.includes('-') || k.length > 15).slice(0, 3));
    } catch (error) {
        console.error('❌ Error loading music data:', error);
    }
}

/**
 * Render avatar (emoji or champion image)
 */
function renderAvatar(avatar) {
    // Handle old emoji-only format (legacy string)
    if (typeof avatar === 'string') {
        return avatar;
    }
    
    // ✅ NEW: Handle champion avatar format
    if (avatar && avatar.type === 'champion' && avatar.imageUrl) {
        return `<img src="${avatar.imageUrl}" alt="${avatar.championId}" class="champion-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <span class="avatar-fallback" style="display: none;">🎵</span>`;
    }
    
    // Handle old URL format (if any exist)
    if (avatar && avatar.type === 'url' && avatar.value) {
        return `<img src="${avatar.value}" alt="Avatar" class="champion-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <span class="avatar-fallback" style="display: none;">🎵</span>`;
    }
    
    // Handle emoji format
    if (avatar && avatar.type === 'emoji' && avatar.value) {
        return avatar.value;
    }
    
    // Default fallback to music note
    return '🎵';
}
/**
 * Get YouTube thumbnail URL from song data
 */
/**
 * Get YouTube thumbnail URL from song data
 */
function getYoutubeThumbnail(songId) {
    // ✅ Look up by videoId (which is what songId actually contains)
    const song = musicData[songId];
    
    if (!song) {
        console.warn(`⚠️ No song found for ID: ${songId}`);
    }
    
    if (song && song.videoId) {
        // Use maxresdefault for best quality, fallback to hqdefault
        return `https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg`;
    }
    
    // If songId IS the videoId already, use it directly
    if (songId && songId.length === 11) {
        console.log(`📺 Using songId directly as videoId: ${songId}`);
        return `https://img.youtube.com/vi/${songId}/mqdefault.jpg`;
    }
    
    // Fallback placeholder
    console.warn(`❌ No thumbnail available for songId: ${songId}`);
    return 'https://via.placeholder.com/640x360/0a0a0a/C8AA6E?text=🎵';
}

/**
 * Get song title from music data (fallback if activity doesn't have it)
 */
function getSongTitle(songId, fallbackTitle) {
    const song = musicData[songId];
    
    if (!song && fallbackTitle) {
        console.log(`📝 Using fallback title for ${songId}: ${fallbackTitle}`);
    }
    
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

// ========================================
// RENDER VOTE CARD - Include full match context with "vs"
// ========================================

function renderVoteCard(activity) {
    // The voted song's ID and title
    const votedSongId = activity.songId;
    const votedSongTitle = getSongTitle(activity.songId, activity.songTitle);
    const thumbnailUrl = getYoutubeThumbnail(votedSongId);
    const tournamentName = formatTournamentName(activity.tournamentId);
    
    // Parse match title to get both songs
    const matchTitle = activity.matchTitle || '';
    const songs = matchTitle.split(' vs ');
    const song1 = songs[0]?.trim() || 'Song 1';
    const song2 = songs[1]?.trim() || 'Song 2';
    
    // ✅ USE THE DATABASE FIELD AS SOURCE OF TRUTH
    const votedForSong1 = activity.choice === 'song1';
    
    // DEBUG
    console.log('=== Vote Card Debug ===');
    console.log('Choice from DB:', activity.choice);
    console.log('Voted for Song 1?', votedForSong1);
    console.log('Song 1:', song1, votedForSong1 ? '← VOTED' : '');
    console.log('Song 2:', song2, !votedForSong1 ? '← VOTED' : '');
    console.log('======================\n');
    
    return `
        <div class="vote-card">
            <div class="vote-thumbnail">
                <img src="${thumbnailUrl}" alt="${votedSongTitle}" loading="lazy" />
            </div>
            
        <div class="vote-user">
    <a href="/profile.html?user=${encodeURIComponent(activity.username || 'Anonymous')}" class="user-avatar-link">
        <div class="user-avatar">
            ${renderAvatar(activity.avatar)}
        </div>
    </a>
    <div class="user-info">
        <a href="/profile.html?user=${encodeURIComponent(activity.username || 'Anonymous')}" class="username-link">
            <div class="username">${activity.username || 'Anonymous'}</div>
        </a>
        <div class="vote-time">${getTimeAgo(activity.timestamp)}</div>
    </div>
</div>
            
            <div class="vote-song">
                <div class="song-title">
                    <span class="${votedForSong1 ? 'voted-song' : 'not-voted-song'}">${song1}</span>
                    <span class="vs-separator">vs</span>
                    <span class="${!votedForSong1 ? 'voted-song' : 'not-voted-song'}">${song2}</span>
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