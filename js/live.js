// ========================================
// IMPORTS
// ========================================
import { getAllMatches } from './api-client.js';

// ========================================
// STATE
// ========================================
let allLiveMatches = [];

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Social Landing Page loaded');
    
    // Track page view
    trackPageView();
    
    try {
        await loadLiveMatches();
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
        showErrorState();
    }
});

// ========================================
// LOAD LIVE MATCHES
// ========================================
async function loadLiveMatches() {
    try {
        console.log('📥 Fetching all matches...');
        
        const allMatches = await getAllMatches();
        
        // Filter for live matches only (exclude TBD)
        allLiveMatches = allMatches.filter(match => {
            if (match.status !== 'live') return false;
            
            const isTBD = !match.song1?.id || !match.song2?.id ||
                         String(match.song1.id).includes('TBD') ||
                         String(match.song2.id).includes('TBD');
            
            return !isTBD;
        });
        
        console.log(`✅ Found ${allLiveMatches.length} live matches`);
        
        if (allLiveMatches.length === 0) {
            showNoMatches();
            return;
        }
        
        // Sort by engagement (most votes first, then by close margins)
        sortMatchesByEngagement();
        
        // Display matches
        displayMatchGrid();
        
        // Show main content
        hideLoading();
        showMainContent();
        
    } catch (error) {
        console.error('❌ Error in loadLiveMatches:', error);
        throw error;
    }
}

// ========================================
// SORT MATCHES BY ENGAGEMENT
// ========================================
function sortMatchesByEngagement() {
    allLiveMatches.sort((a, b) => {
        // Priority 1: Nail-biters (close margins) go first
        const marginA = getVoteMargin(a);
        const marginB = getVoteMargin(b);
        
        const isNailBiterA = marginA < 5;
        const isNailBiterB = marginB < 5;
        
        if (isNailBiterA && !isNailBiterB) return -1;
        if (!isNailBiterA && isNailBiterB) return 1;
        
        // Priority 2: Most votes
        return (b.totalVotes || 0) - (a.totalVotes || 0);
    });
}

function getVoteMargin(match) {
    const totalVotes = match.totalVotes || 0;
    if (totalVotes === 0) return 50;
    
    const song1Votes = match.song1?.votes || 0;
    const song1Pct = (song1Votes / totalVotes) * 100;
    
    return Math.abs(50 - song1Pct);
}

// ========================================
// DISPLAY MATCH GRID
// ========================================
function displayMatchGrid() {
    const grid = document.getElementById('socialGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    allLiveMatches.forEach((match, index) => {
        const card = createMatchCard(match, index);
        grid.appendChild(card);
    });
    
    console.log('✅ Match grid rendered');
}

// ========================================
// CREATE MATCH CARD
// ========================================
function createMatchCard(match, index) {
    const hasVoted = hasUserVoted(match.matchId);
    const userVotedSongId = hasVoted ? getUserVotedSongId(match.matchId) : null;
    
    const totalVotes = match.totalVotes || 0;
    const margin = getVoteMargin(match);
    const isNailBiter = margin < 5 && totalVotes > 10;
    const isTrending = totalVotes > 100;
    
    const card = document.createElement('div');
    card.className = `social-match-card ${hasVoted ? 'voted' : ''}`;
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
        ${isNailBiter ? '<div class="nail-biter-badge">🚨 NAIL-BITER</div>' : ''}
        ${!isNailBiter && isTrending && !hasVoted ? '<div class="trending-badge">🔥 TRENDING</div>' : ''}
        
        <div class="social-thumbnails">
            <img src="https://img.youtube.com/vi/${match.song1.videoId}/mqdefault.jpg" 
                 alt="${match.song1.shortTitle || match.song1.title}"
                 class="${userVotedSongId === 'song1' ? 'user-pick' : ''}"
                 loading="lazy">
            
            <div class="social-vs">VS</div>
            
            <img src="https://img.youtube.com/vi/${match.song2.videoId}/mqdefault.jpg"
                 alt="${match.song2.shortTitle || match.song2.title}"
                 class="${userVotedSongId === 'song2' ? 'user-pick' : ''}"
                 loading="lazy">
        </div>
        
        <div class="social-info">
            <div class="song-details">
                <h3>${match.song1.shortTitle || match.song1.title}</h3>
                <p>${match.song1.artist} • ${match.song1.year || '2025'}</p>
            </div>
            
            <div class="vs-divider">vs</div>
            
            <div class="song-details">
                <h3>${match.song2.shortTitle || match.song2.title}</h3>
                <p>${match.song2.artist} • ${match.song2.year || '2025'}</p>
            </div>
        </div>
        
        <div class="social-stats">
            <span class="stat-icon">${hasVoted ? '✓' : '🔥'}</span>
            <span>${hasVoted ? 'You voted' : `${totalVotes.toLocaleString()} votes`}</span>
        </div>
    `;
    
    // Add click handler
    card.addEventListener('click', () => {
        handleCardClick(match.matchId, index, hasVoted);
    });
    
    return card;
}

// ========================================
// HANDLE CARD CLICK
// ========================================
function handleCardClick(matchId, position, hasVoted) {
    console.log(`🎯 Match clicked: ${matchId} (position ${position + 1})`);
    
    // Track click
    trackMatchClick(matchId, position, hasVoted);
    
    // Navigate to vote page
    window.location.href = `vote?match=${matchId}`;
}

// ========================================
// VOTE TRACKING HELPERS
// ========================================
function hasUserVoted(matchId) {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    return !!userVotes[matchId];
}

function getUserVotedSongId(matchId) {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    return userVotes[matchId]?.songId || null;
}

// ========================================
// UI STATE HELPERS
// ========================================
function hideLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }
}

function showMainContent() {
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
        mainContent.style.display = 'block';
    }
}

function showNoMatches() {
    hideLoading();
    
    const mainContent = document.getElementById('mainContent');
    const noMatches = document.getElementById('noMatches');
    const socialGrid = document.getElementById('socialGrid');
    const landingFooter = document.querySelector('.landing-footer');
    
    if (mainContent) mainContent.style.display = 'block';
    if (noMatches) noMatches.style.display = 'block';
    if (socialGrid) socialGrid.style.display = 'none';
    if (landingFooter) landingFooter.style.display = 'none';
}

function showErrorState() {
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'flex';
}

// ========================================
// ANALYTICS TRACKING
// ========================================
function trackPageView() {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source') || 'direct';
    
    console.log(`📊 Page view from: ${source}`);
    
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            page_title: 'Social Landing',
            page_location: window.location.href,
            source: source
        });
    }
}

function trackMatchClick(matchId, position, hasVoted) {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source') || 'direct';
    
    if (typeof gtag !== 'undefined') {
        gtag('event', 'social_landing_click', {
            match_id: matchId,
            position: position + 1,
            source: source,
            has_voted: hasVoted
        });
    }
}

// ========================================
// CONSOLE BRANDING
// ========================================
console.log(
    '%c🎵 Anthems Arena %c- Social Landing',
    'color: #C8AA6E; font-size: 20px; font-weight: bold; font-family: Cinzel, serif;',
    'color: #888; font-size: 14px; font-family: Lora, serif;'
);