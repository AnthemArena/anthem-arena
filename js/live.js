// ========================================
// IMPORTS
// ========================================
import { getAllMatches } from './api-client.js';

// ========================================
// STATE
// ========================================
let allLiveMatches = [];
const FOUNDING_MEMBER_GOAL = 1000;

// ========================================
// ROUND COUNTDOWN CONFIGURATION
// ========================================
const ROUND_CONFIG = {
    roundName: "ROUND 1",
    endDate: new Date(Date.now() + (2 * 24 * 60 * 60 * 1000) + (10 * 60 * 60 * 1000)) // 2 days 10 hours from now
    // TO UPDATE FOR R2: Change to new Date('2024-11-20T23:59:59Z') with your actual end date
};

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Social Landing Page loaded');
    
    // Track page view
    trackPageView();
    
    // ✅ Load founding member data and display banner
    await displayFoundingMemberBanner();
    
    // ✅ Display countdown timer
    displayRoundCountdown();
    
    // ✅ Initialize sticky banner (mobile)
    initializeStickyBanner();
    
    try {
        await loadLiveMatches();
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
        showErrorState();
    }
});

// ========================================
// ✅ NEW: FOUNDING MEMBER BANNER
// ========================================
async function displayFoundingMemberBanner() {
    try {
        const { getTotalVotes } = await import('./api-client.js');
        const totalVotesData = await getTotalVotes();
        const currentVotes = totalVotesData.totalVotes || 0;
        const milestoneReached = totalVotesData.milestoneReached || false;
        
        // Don't show banner if milestone already reached
        if (milestoneReached) {
            console.log('✅ Founding Member milestone already reached');
            return;
        }
        
        const spotsRemaining = FOUNDING_MEMBER_GOAL - currentVotes;
        const progressPercent = Math.round((currentVotes / FOUNDING_MEMBER_GOAL) * 100);
        
        // Check if user has already voted (and thus is eligible)
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const hasVoted = Object.keys(userVotes).length > 0;
        
        const container = document.querySelector('.social-container');
        if (!container) return;
        
        const banner = document.createElement('div');
        banner.className = 'founding-member-banner';
        banner.innerHTML = `
            <div class="founding-content">
                <div class="founding-header">
                    <span class="crown-icon">👑</span>
                    <h2>Become a Founding Member</h2>
                </div>
                <p class="founding-description">
                    ${hasVoted 
                        ? '<strong style="color: #4CAF50;">✅ Founding Member Secured!</strong> You voted before we hit 1,000 total votes.' 
                        : `Vote in <strong>any match</strong> before we hit <strong>1,000 total votes</strong> to earn permanent Founding Member status!`
                    }
                </p>
                <div class="founding-progress">
                    <div class="progress-bar-founding">
                        <div class="progress-fill-founding" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="progress-text-founding">
                        <strong>${currentVotes.toLocaleString()}</strong> / 1,000 votes cast
                        <span class="remaining">• <strong>${spotsRemaining.toLocaleString()}</strong> spots remaining!</span>
                    </div>
                </div>
            </div>
        `;
        
        // Insert after countdown banner (if it exists)
        const countdown = container.querySelector('.countdown-banner');
        if (countdown && countdown.nextSibling) {
            container.insertBefore(banner, countdown.nextSibling);
        } else {
            container.insertBefore(banner, container.firstChild);
        }
        
        console.log(`✅ Founding Member banner displayed: ${currentVotes}/${FOUNDING_MEMBER_GOAL} votes`);
        
    } catch (error) {
        console.error('⚠️ Error loading founding member data:', error);
        // Don't block page if this fails
    }
}

// ========================================
// ✅ NEW: STICKY MOBILE BANNER
// ========================================
function initializeStickyBanner() {
    const stickyBanner = document.getElementById('stickyBanner');
    if (!stickyBanner) return;
    
    // Show sticky banner on scroll (mobile only)
    let lastScrollTop = 0;
    
    window.addEventListener('scroll', async () => {
        if (window.innerWidth > 768) return; // Desktop - don't show
        
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Show after scrolling past hero section
        if (scrollTop > 300) {
            stickyBanner.style.display = 'flex';
            
            // Update text dynamically
            try {
                const { getTotalVotes } = await import('./api-client.js');
                const totalVotesData = await getTotalVotes();
                const currentVotes = totalVotesData.totalVotes || 0;
                const milestoneReached = totalVotesData.milestoneReached || false;
                
                const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
                const hasVoted = Object.keys(userVotes).length > 0;
                
                const stickyText = document.getElementById('stickyText');
                if (stickyText) {
                    if (milestoneReached) {
                        stickyText.innerHTML = `🎉 Founding Members closed at 1,000 votes!`;
                    } else if (hasVoted) {
                        stickyText.innerHTML = `<strong>${currentVotes}/1,000</strong> • Founding Member secured! ✅`;
                    } else {
                        stickyText.innerHTML = `<strong>${currentVotes}/1,000</strong> votes • Vote to become Founding Member!`;
                    }
                }
            } catch (error) {
                console.warn('⚠️ Sticky banner update failed:', error);
            }
        } else {
            stickyBanner.style.display = 'none';
        }
        
        lastScrollTop = scrollTop;
    });
}

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
            🚨 <strong>${ROUND_CONFIG.roundName} ENDS IN <span id="countdownTimer">...</span></strong>
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
    
    const now = new Date();
    const diff = ROUND_CONFIG.endDate - now;
    
    if (diff <= 0) {
        countdownEl.textContent = '0d 0h 0m';
        countdownEl.parentElement.innerHTML = '🎉 <strong>ROUND ENDED!</strong> • Check back soon for Round 2!';
        return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    countdownEl.textContent = `${days}d ${hours}h ${minutes}m`;
}

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
    
    // ✅ UPDATE UNVOTED HEADER
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
    
    // UPDATE PROGRESS BAR
    updateProgressBar(votedMatches.length, allLiveMatches.length);
    
    console.log(`✅ Displayed ${unvotedMatches.length} unvoted, ${votedMatches.length} voted`);
}

// ========================================
// ✅ NEW: UPDATE UNVOTED HEADER (DYNAMIC)
// ========================================
function updateUnvotedHeader(unvotedCount) {
    const headerText = document.querySelector('.unvoted-header .header-text');
    const headerIcon = document.querySelector('.unvoted-header .header-icon');
    
    if (!headerText || !headerIcon) return;
    
    if (unvotedCount === 0) {
        headerIcon.textContent = '🎉';
        headerText.innerHTML = `All Caught Up! Check back for new matches.`;
    } else if (unvotedCount === 1) {
        headerIcon.textContent = '⚡';
        headerText.innerHTML = `<span id="unvotedCount">1</span> Match Needs Your Vote!`;
    } else if (unvotedCount <= 3) {
        headerIcon.textContent = '🔥';
        headerText.innerHTML = `Almost Done! <span id="unvotedCount">${unvotedCount}</span> Matches Left`;
    } else if (unvotedCount <= 6) {
        headerIcon.textContent = '🗳️';
        headerText.innerHTML = `<span id="unvotedCount">${unvotedCount}</span> Matches Need Your Vote!`;
    } else {
        headerIcon.textContent = '🎵';
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
    
    // ✅ Add milestone message
    let milestone = '';
    if (percentage === 100) {
        progressFill.classList.add('complete');
        milestone = ' 🎉 All matches voted!';
        showCompletionMessage();
    } else if (percentage >= 75) {
        milestone = ' 🔥 Almost there!';
    } else if (percentage >= 50) {
        milestone = ' 💪 Halfway done!';
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
                <h3>🎉 You've Voted on All Live Matches!</h3>
                <p>Check out these pages while waiting for new matchups:</p>
                <div class="completion-links">
                    <a href="/my-votes.html">View Your Votes</a>
                    <a href="/brackets.html">See Bracket</a>
                    <a href="/stats.html">View Stats</a>
                </div>
            </div>
        `;
        grid.appendChild(banner);
    }
}

// ========================================
// CREATE MATCH CARD (NO VOTE COUNTS)
// ========================================
function createMatchCard(match, index, isVoted) {
    const userVotedSongId = isVoted ? getUserVotedSongId(match.matchId) : null;
    
    const card = document.createElement('div');
    card.className = `social-match-card ${isVoted ? 'voted' : ''}`;
    card.style.animationDelay = `${index * 0.1}s`;
    
    // ✅ Show Founding Member prompt on unvoted cards (only if user hasn't voted anywhere)
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const hasVotedAnywhere = Object.keys(userVotes).length > 0;
    
    const foundingPrompt = !isVoted && !hasVotedAnywhere ? `
        <div class="founding-prompt">
            👑 Vote to become Founding Member
        </div>
    ` : '';
    
    card.innerHTML = `
        ${foundingPrompt}
        
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
            <span>${isVoted ? '✅ You Voted • Tap to see results' : '🗳️ Watch & Vote'}</span>
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