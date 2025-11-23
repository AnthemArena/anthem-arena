// ========================================
// IMPORTS
// ========================================
import { getAllMatches } from './api-client.js';

// ========================================
// STATE
// ========================================
let allLiveMatches = [];

// ========================================
// ROUND COUNTDOWN CONFIGURATION
// ========================================
const ROUND_CONFIG = {
    roundName: "ROUND 2",
    roundDescription: "Single Elimination • 16 Matches",
    endDate: new Date('2025-11-24T19:00:00Z')
};

// ========================================
// LIVE ACTIVITY TICKER (using edge cache)
// ========================================
let currentActivityIndex = 0;
let activityData = [];
let tickerRotationInterval = null;

async function initializeActivityTicker() {
    const countdownBanner = document.querySelector('.countdown-banner');
    
    if (!countdownBanner) {
        console.log('⚠️ Countdown banner not found, ticker not initialized');
        return;
    }
    
    // Create ticker element
    const ticker = document.createElement('div');
    ticker.className = 'activity-ticker';
    ticker.innerHTML = `
        <div class="ticker-content">
            <i class="fa-solid fa-circle-dot pulse"></i>
            <span id="tickerText">Loading community activity...</span>
            <button id="refreshActivity" class="refresh-btn" title="Refresh activity">
                <i class="fa-solid fa-arrows-rotate"></i>
            </button>
        </div>
    `;
    
    countdownBanner.insertAdjacentElement('afterend', ticker);
    
    // Load activity from edge cache
    await loadActivityData();
    
    // Rotate through different activities every 8 seconds
    rotateActivityDisplay();
    tickerRotationInterval = setInterval(rotateActivityDisplay, 8000);
    
    // Add refresh button handler
    const refreshBtn = document.getElementById('refreshActivity');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            refreshBtn.classList.add('spinning');
            await loadActivityData(true); // Force refresh
            refreshBtn.classList.remove('spinning');
        });
    }
}

async function loadActivityData(forceRefresh = false) {
    try {
        // Use edge cache endpoint with optional cache bypass
        const url = forceRefresh 
            ? '/api/activity?limit=10&_refresh=true' 
            : '/api/activity?limit=10';
        
        console.log(`📥 Fetching activity from: ${url}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch activity: ${response.status}`);
        }
        
        activityData = await response.json();
        currentActivityIndex = 0;
        
        console.log(`✅ Loaded ${activityData.length} activities (Cache: ${response.headers.get('X-Cache') || 'unknown'})`);
        
        if (activityData.length > 0) {
            displayActivityInTicker(activityData[0]);
        } else {
            const tickerText = document.getElementById('tickerText');
            if (tickerText) {
                tickerText.innerHTML = `Be the first to vote! <a href="/vote.html" style="color: #C8AA6E;">Start voting now</a>`;
            }
        }
    } catch (error) {
        console.error('❌ Error loading activity:', error);
        const tickerText = document.getElementById('tickerText');
        if (tickerText) {
            tickerText.innerHTML = `Unable to load activity. <a href="/vote.html" style="color: #C8AA6E;">Start voting</a>`;
        }
    }
}

function rotateActivityDisplay() {
    if (activityData.length === 0) return;
    
    currentActivityIndex = (currentActivityIndex + 1) % activityData.length;
    displayActivityInTicker(activityData[currentActivityIndex]);
}

function displayActivityInTicker(activity) {
    const tickerText = document.getElementById('tickerText');
    if (!tickerText) return;
    
    const username = activity.username || 'Someone';
    const timeAgo = getTimeAgo(activity.timestamp);
    const songName = activity.votedForName || activity.songTitle || 'a song';
    
    tickerText.innerHTML = `
        <strong>${username}</strong> voted for 
        <span class="highlight">${songName}</span> 
        <span class="time-ago">${timeAgo}</span>
    `;
}

// ========================================
// MINI ACTIVITY FEED (using edge cache)
// ========================================
async function displayMiniActivityFeed() {
    const container = document.querySelector('.social-container');
    const unvotedSection = document.querySelector('#unvotedSection');
    
    if (!container || !unvotedSection) {
        console.log('⚠️ Container or unvoted section not found');
        return;
    }
    
    const feedSection = document.createElement('div');
    feedSection.className = 'mini-activity-feed';
    feedSection.innerHTML = `
        <div class="feed-header">
            <div class="header-left">
                <h3><i class="fa-solid fa-fire"></i> Community Activity</h3>
                <span class="cache-indicator" id="cacheIndicator">Live updates</span>
            </div>
            <a href="/activity.html" class="see-all">See All <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div id="miniFeedContent" class="feed-content">
            <div class="loading-spinner">Loading...</div>
        </div>
    `;
    
    container.insertBefore(feedSection, unvotedSection);
    
    // Load activity feed
    await loadMiniFeed();
}

async function loadMiniFeed() {
    const feedContent = document.getElementById('miniFeedContent');
    const cacheIndicator = document.getElementById('cacheIndicator');
    
    if (!feedContent) return;
    
    try {
        // Fetch from edge cache (30 second cache)
        const response = await fetch('/api/activity?limit=6');
        
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }
        
        const activities = await response.json();
        
        // Update cache indicator
        if (cacheIndicator) {
            const cacheStatus = response.headers.get('X-Cache');
            cacheIndicator.textContent = cacheStatus === 'HIT' ? 'Cached (fresh)' : 'Just updated';
        }
        
        if (activities.length === 0) {
            feedContent.innerHTML = `
                <div class="empty-feed">
                    <i class="fa-solid fa-users"></i>
                    <p>No votes yet! Be the first to participate.</p>
                    <a href="/vote.html" class="start-voting-btn">Start Voting</a>
                </div>
            `;
            return;
        }
        
        feedContent.innerHTML = activities.map((activity, index) => {
            const username = activity.username || 'Anonymous';
            const timeAgo = getTimeAgo(activity.timestamp);
            const thumbnail = `https://img.youtube.com/vi/${activity.songId}/default.jpg`;
            const songName = activity.votedForName || activity.songTitle || 'Unknown';
            
            return `
                <div class="mini-activity-card" style="animation-delay: ${index * 0.1}s">
                    <img src="${thumbnail}" alt="${songName}" class="mini-thumbnail" loading="lazy">
                    <div class="mini-info">
                        <div class="mini-user">${username}</div>
                        <div class="mini-song">${songName}</div>
                    </div>
                    <div class="mini-time">${timeAgo}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error loading mini feed:', error);
        feedContent.innerHTML = `
            <div class="empty-feed">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <p>Unable to load activity right now.</p>
            </div>
        `;
    }
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return 'recently';
}

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Social Landing Page loaded');
    
    // Track page view
    trackPageView();
    
    // Display countdown timer
    displayRoundCountdown();
    
    // ✅ Initialize dismissible social banner
    initializeSocialBanner();
    
    // ✅ Initialize activity ticker (waits for countdown banner)
    await initializeActivityTicker();
    
    try {
        await loadLiveMatches();
        
        // ✅ Add mini activity feed after matches load
        await displayMiniActivityFeed();
        
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
        showErrorState();
    }
});

// ========================================
// CLEANUP
// ========================================
window.addEventListener('beforeunload', () => {
    if (tickerRotationInterval) {
        clearInterval(tickerRotationInterval);
    }
});

// ... (rest of your existing code - social banner, countdown, matches, etc.)

// ========================================
// SOCIAL BANNER MANAGEMENT
// ========================================

/**
 * Initialize the social promo banner with dismiss functionality
 */
function initializeSocialBanner() {
    const banner = document.querySelector('.social-promo-banner');
    
    if (!banner) {
        console.log('ℹ️ Social banner not found in DOM');
        return;
    }
    
    // Check if user dismissed it before
    const isDismissed = localStorage.getItem('socialBannerDismissed');
    const dismissedTime = localStorage.getItem('socialBannerDismissedTime');
    
    // Show banner again after 7 days
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (isDismissed === 'true' && dismissedTime) {
        const timeSinceDismissed = Date.now() - parseInt(dismissedTime);
        
        if (timeSinceDismissed < SEVEN_DAYS) {
            banner.style.display = 'none';
            console.log('📴 Social banner hidden (dismissed by user)');
            return;
        } else {
            // Reset after 7 days
            localStorage.removeItem('socialBannerDismissed');
            localStorage.removeItem('socialBannerDismissedTime');
            console.log('🔄 Social banner reset (7 days passed)');
        }
    }
    
    // Create dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'banner-dismiss';
    dismissBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    dismissBtn.setAttribute('aria-label', 'Dismiss banner');
    dismissBtn.title = 'Dismiss';
    
    // Add dismiss handler
    dismissBtn.addEventListener('click', (e) => {
        e.preventDefault();
        dismissSocialBanner(banner);
    });
    
    // Insert dismiss button into banner
    banner.appendChild(dismissBtn);
    
    console.log('✅ Social banner initialized with dismiss button');
}

/**
 * Dismiss the social banner with animation
 * @param {HTMLElement} banner - The banner element
 */
function dismissSocialBanner(banner) {
    // Animate out
    banner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-20px)';
    
    setTimeout(() => {
        banner.style.display = 'none';
        
        // Save dismissal to localStorage
        localStorage.setItem('socialBannerDismissed', 'true');
        localStorage.setItem('socialBannerDismissedTime', Date.now().toString());
        
        console.log('📴 Social banner dismissed by user');
    }, 300);
}

/**
 * Reset social banner visibility (for testing or admin)
 */
function resetSocialBanner() {
    localStorage.removeItem('socialBannerDismissed');
    localStorage.removeItem('socialBannerDismissedTime');
    console.log('🔄 Social banner reset - will show on next page load');
    location.reload();
}

// Make reset function available globally (for console debugging)
window.resetSocialBanner = resetSocialBanner;

// ========================================
// DISPLAY COUNTDOWN BANNER
// ========================================
function displayRoundCountdown() {
    const container = document.querySelector('.social-container');
    if (!container) return;
    
    const banner = document.createElement('div');
    banner.className = 'countdown-banner';
    banner.innerHTML = `
        <div class="countdown-content">
            <i class="fa-solid fa-trophy"></i> <strong>${ROUND_CONFIG.roundName} NOW LIVE!</strong> • ${ROUND_CONFIG.roundDescription} • Ends in <span id="countdownTimer">...</span>
        </div>
    `;
    
    container.insertBefore(banner, container.firstChild);
    
    // Start countdown
    updateCountdown();
    setInterval(updateCountdown, 1000); // Update every second
}

// ========================================
// UPDATE COUNTDOWN TIMER
// ========================================
function updateCountdown() {
    const countdownEl = document.getElementById('countdownTimer');
    if (!countdownEl) return;

    // Set the target time to exactly 7 days from NOW
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    targetDate.setHours(0, 0, 0, 0); // optional: reset to midnight, remove if you want exact 7×24h

    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
        countdownEl.textContent = '0d 0h 0m';
        countdownEl.parentElement.innerHTML = `<i class="fa-solid fa-champagne-glasses"></i> <strong>Round Ended!</strong> • Check back soon for the next one!`;
        clearInterval(countdownInterval); // optional: stop the timer completely
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000); // optional: add seconds for more precision

    // Choose one of the formats below:
    countdownEl.textContent = `${days}d ${hours}h ${minutes}m`;
    // countdownEl.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`; // with seconds
}

// Run immediately and then every second
updateCountdown();
const countdownInterval = setInterval(updateCountdown, 1000);

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
    
    // Sort unvoted by matchId (chronological order)
    unvotedMatches.sort((a, b) => {
        return (a.matchId || '').localeCompare(b.matchId || '');
    });
    
    // Display unvoted matches (main grid)
    unvotedMatches.forEach((match, index) => {
        const card = createMatchCard(match, index, false);
        grid.appendChild(card);
    });
    
    // Update unvoted header
    updateUnvotedHeader(unvotedMatches.length);
    
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
    
    // Update progress bar
    updateProgressBar(votedMatches.length, allLiveMatches.length);
    
    console.log(`✅ Displayed ${unvotedMatches.length} unvoted, ${votedMatches.length} voted`);
}

// ========================================
// UPDATE UNVOTED HEADER (DYNAMIC)
// ========================================
function updateUnvotedHeader(unvotedCount) {
    const headerText = document.querySelector('.unvoted-header .header-text');
    const headerIcon = document.querySelector('.unvoted-header .header-icon');
    
    if (!headerText || !headerIcon) return;
    
    if (unvotedCount === 0) {
        headerIcon.innerHTML = '<i class="fa-solid fa-check-circle"></i>';
        headerText.innerHTML = `All Caught Up! Check back for new matches.`;
    } else if (unvotedCount === 1) {
        headerIcon.innerHTML = '<i class="fa-solid fa-bolt"></i>';
        headerText.innerHTML = `<span id="unvotedCount">1</span> Match Needs Your Vote!`;
    } else if (unvotedCount <= 3) {
        headerIcon.innerHTML = '<i class="fa-solid fa-fire"></i>';
        headerText.innerHTML = `Almost Done! <span id="unvotedCount">${unvotedCount}</span> Matches Left`;
    } else if (unvotedCount <= 8) {
        headerIcon.innerHTML = '<i class="fa-solid fa-check-to-slot"></i>';
        headerText.innerHTML = `<span id="unvotedCount">${unvotedCount}</span> Matches Need Your Vote!`;
    } else {
        headerIcon.innerHTML = '<i class="fa-solid fa-music"></i>';
        headerText.innerHTML = `<span id="unvotedCount">${unvotedCount}</span> Live Matches — Start Voting!`;
    }
}

// ========================================
// UPDATE PROGRESS BAR
// ========================================
async function updateProgressBar(votedCount, totalCount) {
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
    
    // Add milestone message
    let milestone = '';
    if (percentage === 100) {
        progressFill.classList.add('complete');
        milestone = ' <i class="fa-solid fa-trophy"></i> All matches voted!';
        showCompletionMessage();
    } else if (percentage >= 75) {
        milestone = ' <i class="fa-solid fa-fire"></i> Almost there!';
    } else if (percentage >= 50) {
        milestone = ' <i class="fa-solid fa-dumbbell"></i> Halfway done!';
    }
    
    // Update text with milestone
    if (progressText && milestone) {
        progressText.innerHTML = `
            <span id="votedProgress">${votedCount}</span> / 
            <span id="totalProgress">${totalCount}</span> matches voted
            ${milestone}
        `;
    }
}

// ========================================
// SHOW COMPLETION MESSAGE
// ========================================
function showCompletionMessage() {
    const grid = document.getElementById('socialGrid');
    
    if (grid && grid.children.length === 0) {
        const banner = document.createElement('div');
        banner.className = 'completion-banner';
        banner.innerHTML = `
            <div class="completion-content">
                <h3><i class="fa-solid fa-trophy"></i> You've Voted on All Round 2 Matches!</h3>
                <p>Check out these pages while waiting for new matchups:</p>
                <div class="completion-links">
                    <a href="/my-votes.html">View Your Progress</a>
                    <a href="/brackets.html">See Bracket</a>
                    <a href="/stats.html">View Stats</a>
                </div>
            </div>
        `;
        grid.appendChild(banner);
    }
}

// ========================================
// CREATE MATCH CARD
// ========================================
function createMatchCard(match, index, isVoted) {
    const userVotedSongId = isVoted ? getUserVotedSongId(match.matchId) : null;
    
    const card = document.createElement('div');
    card.className = `social-match-card ${isVoted ? 'voted' : ''}`;
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
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
            <span>${isVoted ? '<i class="fa-solid fa-check"></i> You Voted • Tap to see results' : '<i class="fa-solid fa-square-poll-vertical"></i> Watch & Vote'}</span>
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