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
// INITIALIZE PAGE
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎭 Activity page loaded');
    
    // Load music data first
    await loadMusicData();
    
    // Load activity feed
    await loadActivityFeed();
    
    // Setup filter buttons
    setupFilters();
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
    
    const filteredActivities = activities.filter(activity => {
        if (currentFilter === 'all') return true;
        // Add more filter logic if needed
        return true;
    });
    
    if (filteredActivities.length === 0) {
        container.innerHTML = '<p class="no-results">No activity found</p>';
        return;
    }
    
    const html = filteredActivities
        .map(activity => renderVoteCard(activity))
        .join('');
    
    container.innerHTML = html;
}

// ========================================
// RENDER VOTE CARD
// ========================================

function renderVoteCard(activity) {
    const thumbnailUrl = getYoutubeThumbnail(activity.songId);
    const songTitle = getSongTitle(activity.songId, activity.songTitle);
    const tournamentName = formatTournamentName(activity.tournamentId);
    const matchName = activity.matchTitle || `Match ${activity.matchId}`;
    
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
                <div class="song-title">${songTitle}</div>
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
// HELPER FUNCTIONS
// ========================================

function formatTournamentName(tournamentId) {
    const names = {
        '2025-worlds-anthems': '2025 Worlds Anthems',
        '2024-worlds-anthems': '2024 Worlds Anthems'
    };
    return names[tournamentId] || tournamentId;
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
// FILTER LOGIC
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
// UPDATE STATS
// ========================================

function updateStats() {
    // For now, just show total activity
    document.getElementById('revealed-count').textContent = allActivities.length;
    document.getElementById('locked-count').textContent = 0;
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