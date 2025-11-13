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
        
        // Display matches (sorting handled in displayMatchGrid)
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
// GET VOTE MARGIN
// ========================================
function getVoteMargin(match) {
    const totalVotes = match.totalVotes || 0;
    if (totalVotes === 0) return 50;
    
    const song1Votes = match.song1?.votes || 0;
    const song1Pct = (song1Votes / totalVotes) * 100;
    
    return Math.abs(50 - song1Pct);
}

// ========================================
// GET DYNAMIC VOTE CTA
// ========================================
function getVoteCTA(match, totalVotes) {
    const margin = getVoteMargin(match);
    const isNailBiter = margin < 5 && totalVotes > 10;
    
    if (isNailBiter) {
        return `🔥 ${totalVotes.toLocaleString()} votes • Tap to break the tie`;
    } else if (totalVotes > 200) {
        return `${totalVotes.toLocaleString()} votes • Tap to vote`;
    } else if (totalVotes < 20) {
        return `${totalVotes} votes • Be an early voter`;
    } else {
        return `${totalVotes.toLocaleString()} votes • Tap to vote`;
    }
}

// ========================================
// DISPLAY MATCH GRID (SORTED BY VOTED STATUS)
// ========================================
function displayMatchGrid() {
    const grid = document.getElementById('socialGrid');
    const votedSection = document.getElementById('votedSection');
    const votedGrid = document.getElementById('votedGrid');
    const votedCount = document.getElementById('votedCount');
    
    if (!grid) return;
    
    grid.innerHTML = '';
    if (votedGrid) votedGrid.innerHTML = '';
    
    // Separate matches by voting status
    const unvotedMatches = [];
    const votedMatches = [];
    
    allLiveMatches.forEach(match => {
        if (hasUserVoted(match.matchId)) {
            votedMatches.push(match);
        } else {
            unvotedMatches.push(match);
        }
    });
    
    // Sort unvoted by engagement (nail-biters first, then by votes)
    unvotedMatches.sort((a, b) => {
        const marginA = getVoteMargin(a);
        const marginB = getVoteMargin(b);
        
        const isNailBiterA = marginA < 5;
        const isNailBiterB = marginB < 5;
        
        if (isNailBiterA && !isNailBiterB) return -1;
        if (!isNailBiterA && isNailBiterB) return 1;
        
        return (b.totalVotes || 0) - (a.totalVotes || 0);
    });
    
    // Display unvoted matches (main grid)
    unvotedMatches.forEach((match, index) => {
        const card = createMatchCard(match, index, false);
        grid.appendChild(card);
    });
    
    // Display voted matches in separate section (if any)
    if (votedMatches.length > 0 && votedSection && votedGrid && votedCount) {
        votedSection.style.display = 'block';
        votedCount.textContent = votedMatches.length;
        
        votedMatches.forEach((match, index) => {
            const card = createMatchCard(match, index, true);
            votedGrid.appendChild(card);
        });
    } else if (votedSection) {
        votedSection.style.display = 'none';
    }
    
    // UPDATE PROGRESS BAR (NEW)
    updateProgressBar(votedMatches.length, allLiveMatches.length);
    
    console.log(`✅ Displayed ${unvotedMatches.length} unvoted, ${votedMatches.length} voted`);
}

// ========================================
// UPDATE PROGRESS BAR (NEW)
// ========================================
function updateProgressBar(votedCount, totalCount) {
    const progressFill = document.getElementById('progressFill');
    const votedProgress = document.getElementById('votedProgress');
    const totalProgress = document.getElementById('totalProgress');
    const progressText = document.querySelector('.progress-text');
    
    if (!progressFill || !votedProgress || !totalProgress) return;
    
    const percentage = totalCount > 0 ? (votedCount / totalCount) * 100 : 0;
    
    // Update DOM
    progressFill.style.width = `${percentage}%`;
    votedProgress.textContent = votedCount;
    totalProgress.textContent = totalCount;
    
    // Milestone messages
    let milestone = '';
    if (percentage === 100) {
        progressFill.classList.add('complete');
        milestone = ' 🎉 Complete!';
    } else if (percentage >= 75) {
        milestone = ' 🔥 Almost there!';
    } else if (percentage >= 50) {
        milestone = ' 💪 Halfway done!';
    } else if (percentage >= 25) {
        milestone = ' 👍 Keep going!';
    }
    
    // Update text with milestone
    if (progressText && milestone) {
        progressText.innerHTML = `
            <span id="votedProgress">${votedCount}</span> / 
            <span id="totalProgress">${totalCount}</span> matches voted
            <span style="color: #C8AA6E; font-weight: 700;">${milestone}</span>
        `;
    }
}

// ========================================
// SHOW COMPLETION MESSAGE (OPTIONAL)
// ========================================
// ========================================
// SHOW COMPLETION MESSAGE (ENHANCED)
// ========================================
function showCompletionMessage() {
    const progressText = document.querySelector('.progress-text');
    const grid = document.getElementById('socialGrid');
    
    if (!progressText) return;
    
    // Update progress text
    progressText.innerHTML = `<span style="color: #4CAF50;">🎉 All matches voted! Nice work!</span>`;
    
    // Add completion banner to grid
    if (grid && grid.children.length > 0) {
        const banner = document.createElement('div');
        banner.className = 'completion-banner';
        banner.innerHTML = `
            <div class="completion-content">
                <h3>🎉 You've Voted on All Live Matches!</h3>
                <p>Check out these pages while waiting for new matchups:</p>
                <div class="completion-links">
                    <a href="/my-votes.html">View Your Votes</a>
                    <a href="/brackets.html">See Bracket</a>
                    <a href="/stats.html">View Stats</a>
                </div>
            </div>
        `;
        grid.insertBefore(banner, grid.firstChild);
    }
}

// ========================================
// CREATE MATCH CARD
// ========================================
function createMatchCard(match, index, isVoted) {
    const userVotedSongId = isVoted ? getUserVotedSongId(match.matchId) : null;
    
    const totalVotes = match.totalVotes || 0;
    const margin = getVoteMargin(match);
    const isNailBiter = margin < 5 && totalVotes > 10;
    const isTrending = totalVotes > 100;
    
    const card = document.createElement('div');
    card.className = `social-match-card ${isVoted ? 'voted' : ''}`;
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
        ${!isVoted && isNailBiter ? '<div class="nail-biter-badge">🚨 NAIL-BITER</div>' : ''}
        ${!isVoted && !isNailBiter && isTrending ? '<div class="trending-badge">🔥 TRENDING</div>' : ''}
        
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
            <span class="stat-icon">${isVoted ? '✓' : '🔥'}</span>
            <span>
                ${isVoted 
                    ? 'Tap to see results' 
                    : getVoteCTA(match, totalVotes)
                }
            </span>
        </div>
    `;
    
    // Add click handler
    card.addEventListener('click', () => {
        handleCardClick(match.matchId, index, isVoted);
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
// TOGGLE VOTED SECTION
// ========================================
function toggleVotedSection() {
    const votedGrid = document.getElementById('votedGrid');
    const toggleBtn = document.getElementById('votedToggle');
    
    if (!votedGrid || !toggleBtn) return;
    
    if (votedGrid.style.display === 'none') {
        votedGrid.style.display = 'grid';
        toggleBtn.textContent = '▼';
    } else {
        votedGrid.style.display = 'none';
        toggleBtn.textContent = '▶';
    }
}

// Make toggle available globally
window.toggleVotedSection = toggleVotedSection;

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
    const votedSection = document.getElementById('votedSection');
    
    if (mainContent) mainContent.style.display = 'block';
    if (noMatches) noMatches.style.display = 'block';
    if (socialGrid) socialGrid.style.display = 'none';
    if (landingFooter) landingFooter.style.display = 'none';
    if (votedSection) votedSection.style.display = 'none';
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