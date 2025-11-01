// ========================================
// IMPORTS
// ========================================
import { getBookForSong } from './bookMappings.js';
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// ========================================
// HOMEPAGE FUNCTIONALITY - LEAGUE MUSIC TOURNAMENT
// ========================================

// Vote state tracking
let currentMatch = null;
let voteState = {
    leftVotes: 0,
    rightVotes: 0,
    totalVotes: 0,
    userVote: null
};

// Music videos data
let musicVideos = [];

// ========================================
// INITIALIZE ON PAGE LOAD
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 League Music Tournament loaded');
    
    await loadMusicVideos();
        await loadTournamentInfo(); // ← ADD THIS LINE

    await loadFeaturedMatch();
    await loadLiveMatches();
    await loadRecentResults();
    await updateHeroStats();
    
    hideChampionsSection();
    initializeScrollAnimations();
        checkNotificationStatus(); // ← ADD THIS LINE

});

// ========================================
// LOAD MUSIC VIDEOS DATA
// ========================================

async function loadMusicVideos() {
    try {
        const response = await fetch('/data/music-videos.json');
        musicVideos = await response.json();
        console.log('✅ Music videos loaded:', musicVideos.length);
    } catch (error) {
        console.error('❌ Error loading music videos:', error);
    }
}

// ========================================
// UPDATE HERO STATS
// ========================================

async function updateHeroStats() {
    try {
        // Get total videos count
        const totalVideosEl = document.getElementById('totalVideos');
        if (totalVideosEl) {
            totalVideosEl.textContent = musicVideos.length;
        }
        
        // Get total votes and live matches from Firebase
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const allMatchesSnapshot = await getDocs(matchesRef);
        
        let totalVotes = 0;
        let activeMatches = 0;
        
        allMatchesSnapshot.forEach(doc => {
            const data = doc.data();
            totalVotes += (data.totalVotes || 0);
            if (data.status === 'live') activeMatches++;
        });
        
        // Update DOM
        const totalVotesEl = document.getElementById('totalVotes');
        const matchesLeftEl = document.getElementById('matchesLeft');
        
        if (totalVotesEl) {
            totalVotesEl.textContent = totalVotes.toLocaleString();
        }
        
        if (matchesLeftEl) {
            matchesLeftEl.textContent = activeMatches;
        }
        
        console.log('✅ Hero stats updated:', { totalVotes, activeMatches });
        
    } catch (error) {
        console.error('❌ Error updating hero stats:', error);
    }
}

// ========================================
// LOAD TOURNAMENT INFO (BADGE)
// ========================================

// ========================================
// LOAD TOURNAMENT INFO (BADGE)
// ========================================

async function loadTournamentInfo() {
    try {
        // Get current round from active matches
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const activeMatchesQuery = query(matchesRef, where('status', '==', 'live'));
        const activeMatchesSnapshot = await getDocs(activeMatchesQuery);
        
        let currentRound = 1;
        if (!activeMatchesSnapshot.empty) {
            // Get the round number from the first active match
            currentRound = activeMatchesSnapshot.docs[0].data().round || 1;
        }
        
        // Update tournament badge elements
        const tournamentNameEl = document.getElementById('tournamentName');
        const tournamentStatusEl = document.getElementById('tournamentStatus');
        
        if (tournamentNameEl) {
            tournamentNameEl.textContent = 'Music Tournament';
        }
        
        if (tournamentStatusEl) {
            tournamentStatusEl.textContent = `Round ${currentRound}`;
        }
        
        console.log('✅ Tournament info loaded - Round:', currentRound);
        
    } catch (error) {
        console.error('❌ Error loading tournament info:', error);
        // Fallback values
        const tournamentNameEl = document.getElementById('tournamentName');
        const tournamentStatusEl = document.getElementById('tournamentStatus');
        if (tournamentNameEl) tournamentNameEl.textContent = 'Music Tournament';
        if (tournamentStatusEl) tournamentStatusEl.textContent = 'Round 1';
    }
}


// ========================================
// LOAD FEATURED MATCH (MOST VOTED)
// ========================================

async function loadFeaturedMatch() {
    try {
        console.log('🔍 Searching for live matches...');
        
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const liveQuery = query(
            matchesRef,
            where('status', '==', 'live')
        );
        
        const querySnapshot = await getDocs(liveQuery);
        
        if (querySnapshot.empty) {
            console.log('❌ No live matches found');
            hideFeaturedSection();
            return;
        }
        
        // Get all live matches and sort by votes (most voted = featured)
        let liveMatches = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        liveMatches.sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0));
        
        currentMatch = liveMatches[0]; // Most voted = featured
        
        console.log(`✅ Featured match (most voted): ${currentMatch.totalVotes} votes`);
        
        // Display using full competitor layout from vote page
        await displayFeaturedMatch();
        
        // Check if user already voted
        checkExistingVote();
        
    } catch (error) {
        console.error('❌ Error loading featured match:', error);
        hideFeaturedSection();
    }
}

function hideFeaturedSection() {
    const section = document.querySelector('.featured-matchup');
    if (section) section.style.display = 'none';
}

// ========================================
// DISPLAY FEATURED MATCH
// ========================================

function displayFeaturedMatch() {
    if (!currentMatch) return;
    
    const song1 = currentMatch.song1;
    const song2 = currentMatch.song2;
    
    if (!song1 || !song2) {
        console.error('❌ Songs not found in match data');
        return;
    }
    
    // Update vote counts
    voteState.leftVotes = song1.votes || 0;
    voteState.rightVotes = song2.votes || 0;
    voteState.totalVotes = currentMatch.totalVotes || 0;
    
    // Update subtitle
    const subtitle = document.querySelector('.featured-matchup .section-subtitle');
    if (subtitle) {
        subtitle.textContent = `${voteState.totalVotes.toLocaleString()} votes • 🔴 Live Now`;
    }
    
    // Render full competitor layout (reusing vote page structure)
    const grid = document.querySelector('.competitors-grid');
    if (!grid) return;
    
    grid.innerHTML = `
        <!-- Left Competitor -->
        <div class="competitor-column" data-side="left">
            <div class="competitor-header">
                <span class="seed-badge">Seed #${song1.seed}</span>
                <h3 class="competitor-name">${song1.shortTitle || song1.title}</h3>
                <p class="competitor-source">${song1.artist}</p>
            </div>
            
            <div class="video-container">
                <div class="video-wrapper">
                    <iframe 
                        src="https://www.youtube.com/embed/${song1.videoId}?enablejsapi=1" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                </div>
            </div>
            
            <div class="vote-section">
                <div class="vote-percentage">
                    <span class="percentage-number">${calculatePercentage(voteState.leftVotes)}%</span>
                </div>
                <button class="vote-btn" onclick="vote('left')" data-song-id="${song1.id}">
                    <span class="vote-icon">✓</span>
                    <span class="vote-text">Vote for This</span>
                </button>
                <p class="vote-count">${voteState.leftVotes.toLocaleString()} votes</p>
            </div>
        </div>
        
        <!-- VS Divider -->
        <div class="vs-divider">
            <div class="vs-circle">
                <span class="vs-text">VS</span>
            </div>
        </div>
        
        <!-- Right Competitor -->
        <div class="competitor-column" data-side="right">
            <div class="competitor-header">
                <span class="seed-badge">Seed #${song2.seed}</span>
                <h3 class="competitor-name">${song2.shortTitle || song2.title}</h3>
                <p class="competitor-source">${song2.artist}</p>
            </div>
            
            <div class="video-container">
                <div class="video-wrapper">
                    <iframe 
                        src="https://www.youtube.com/embed/${song2.videoId}?enablejsapi=1" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                </div>
            </div>
            
            <div class="vote-section">
                <div class="vote-percentage">
                    <span class="percentage-number">${calculatePercentage(voteState.rightVotes)}%</span>
                </div>
                <button class="vote-btn" onclick="vote('right')" data-song-id="${song2.id}">
                    <span class="vote-icon">✓</span>
                    <span class="vote-text">Vote for This</span>
                </button>
                <p class="vote-count">${voteState.rightVotes.toLocaleString()} votes</p>
            </div>
        </div>
    `;
    
    // Highlight leading competitor
    updateLeadingVisuals();
}

function calculatePercentage(votes) {
    if (voteState.totalVotes === 0) return 50;
    return Math.round((votes / voteState.totalVotes) * 100);
}

function updateLeadingVisuals() {
    const leftCol = document.querySelector('.competitor-column[data-side="left"]');
    const rightCol = document.querySelector('.competitor-column[data-side="right"]');
    
    if (!leftCol || !rightCol) return;
    
    leftCol.removeAttribute('data-leading');
    rightCol.removeAttribute('data-leading');
    
    if (voteState.leftVotes > voteState.rightVotes) {
        leftCol.setAttribute('data-leading', 'true');
    } else if (voteState.rightVotes > voteState.leftVotes) {
        rightCol.setAttribute('data-leading', 'true');
    }
}

// ========================================
// LOAD LIVE MATCHES (MATCH CARDS GRID)
// ========================================

async function loadLiveMatches() {
    try {
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const liveQuery = query(
            matchesRef,
            where('status', '==', 'live')
        );
        
        const querySnapshot = await getDocs(liveQuery);
        
        if (querySnapshot.empty) {
            hideLiveMatchesSection();
            return;
        }
        
        // Get all live matches except featured
        let liveMatches = querySnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(match => match.id !== currentMatch?.id);
        
        if (liveMatches.length === 0) {
            hideLiveMatchesSection();
            return;
        }
        
        console.log(`✅ Found ${liveMatches.length} other live match(es)`);
        displayLiveMatchesGrid(liveMatches);
        
    } catch (error) {
        console.error('❌ Error loading live matches:', error);
    }
}

function displayLiveMatchesGrid(matches) {
    const grid = document.getElementById('liveMatchesGrid');
    if (!grid) return;
    
    grid.innerHTML = matches.map(match => createMatchCard(match, 'live')).join('');
}

function hideLiveMatchesSection() {
    const section = document.querySelector('.live-matches-section');
    if (section) section.style.display = 'none';
}

// ========================================
// LOAD RECENT RESULTS (MATCH CARDS GRID)
// ========================================

async function loadRecentResults() {
    try {
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const completedQuery = query(
            matchesRef,
            where('status', '==', 'completed'),
            limit(8)
        );
        
        const querySnapshot = await getDocs(completedQuery);
        
        if (querySnapshot.empty) {
            showNoResultsMessage();
            return;
        }
        
        let results = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Sort by end date (newest first)
        results.sort((a, b) => {
            const dateA = new Date(a.endDate);
            const dateB = new Date(b.endDate);
            return dateB - dateA;
        });
        
        console.log(`✅ Loaded ${results.length} recent results`);
        displayRecentResultsGrid(results);
        
    } catch (error) {
        console.error('❌ Error loading recent results:', error);
    }
}

function displayRecentResultsGrid(matches) {
    const grid = document.getElementById('recentResultsGrid');
    if (!grid) return;
    
    grid.innerHTML = matches.map(match => createMatchCard(match, 'completed')).join('');
}

function showNoResultsMessage() {
    const grid = document.getElementById('recentResultsGrid');
    if (!grid) return;
    
    grid.innerHTML = `
      <div class="no-results">
    <div class="no-results-icon">⏳</div>
    <h3 class="no-results-title">No Results Yet</h3>
    <p class="no-results-text">
        The tournament hasn't started or matches are still in progress.<br>
        Results will appear here as winners are decided. Check back soon! 🏆
    </p>
</div>
    `;
}

// ========================================
// CREATE MATCH CARD (REUSABLE)
// ========================================
// ========================================
// CREATE MATCH CARD (REUSABLE)
// ========================================

function createMatchCard(match, status) {
    const song1 = match.song1;
    const song2 = match.song2;
    const totalVotes = match.totalVotes || 0;
    
    const song1Percentage = totalVotes > 0 ? Math.round((song1.votes / totalVotes) * 100) : 50;
    const song2Percentage = totalVotes > 0 ? Math.round((song2.votes / totalVotes) * 100) : 50;
    
    const isLive = status === 'live';
    const isCompleted = status === 'completed';
    const winner = match.winnerId;
    
    const song1IsWinner = isCompleted && winner === song1.id;
    const song2IsWinner = isCompleted && winner === song2.id;
    const song1IsLeading = isLive && song1.votes > song2.votes;
    const song2IsLeading = isLive && song2.votes > song1.votes;
    
    return `
        <div class="match-card ${status}">
         <div class="match-header">
    <span class="match-tournament">All Music Championship 2025</span>
    <span class="match-round">Round ${match.round}</span>
    ${isLive ? '<span class="live-badge">● LIVE</span>' : ''}
    ${isCompleted ? '<span class="finished-badge">Finished</span>' : ''}
</div>
            
            <div class="match-competitors">
                <div class="competitor ${song1IsWinner ? 'winner' : ''} ${song1IsLeading ? 'leading' : ''}">
                    <img src="https://img.youtube.com/vi/${song1.videoId}/mqdefault.jpg" 
                         alt="${song1.title}" 
                         class="competitor-thumbnail">
                    <span class="competitor-rank">#${song1.seed}</span>
                    <div class="competitor-details">
                        <h4 class="competitor-title">${song1.shortTitle || song1.title}</h4>
                        <p class="competitor-source">${song1.artist}</p>
                    </div>
                    <div class="competitor-result">
                        <span class="vote-percentage">${song1Percentage}%</span>
                        ${song1IsLeading ? '<span class="leading-badge">Leading</span>' : ''}
                    </div>
                </div>
                
                <div class="vs-divider">VS</div>
                
                <div class="competitor ${song2IsWinner ? 'winner' : ''} ${song2IsLeading ? 'leading' : ''}">
                    <img src="https://img.youtube.com/vi/${song2.videoId}/mqdefault.jpg" 
                         alt="${song2.title}" 
                         class="competitor-thumbnail">
                    <span class="competitor-rank">#${song2.seed}</span>
                    <div class="competitor-details">
                        <h4 class="competitor-title">${song2.shortTitle || song2.title}</h4>
                        <p class="competitor-source">${song2.artist}</p>
                    </div>
                    <div class="competitor-result">
                        <span class="vote-percentage">${song2Percentage}%</span>
                        ${song2IsLeading ? '<span class="leading-badge">Leading</span>' : ''}
                    </div>
                </div>
            </div>
            
            <div class="match-footer">
                <div class="match-stats">
                    <span class="stat">${totalVotes.toLocaleString()} total votes</span>
                </div>
                ${isLive ? `<a href="/vote.html?id=${match.id}" class="vote-now-btn">Vote Now</a>` : ''}
                ${isCompleted ? `<a href="/vote.html?id=${match.id}" class="view-details-btn">View Results</a>` : ''}
            </div>
        </div>
    `;
}

// ========================================
// CHECK EXISTING VOTE
// ========================================

function checkExistingVote() {
    if (!currentMatch) return;
    
    const savedVote = localStorage.getItem(`vote_${currentMatch.id}`);
    if (savedVote) {
        voteState.userVote = savedVote;
        markButtonAsVoted(savedVote);
        console.log('✅ Found existing vote:', savedVote);
    }
}

// ========================================
// VOTING SYSTEM
// ========================================

async function vote(side) {
    const button = event.currentTarget;
    
    if (!currentMatch) {
        showNotification('No active match to vote on', 'error');
        return;
    }
    
    // Prevent double voting
    if (button.classList.contains('loading')) {
        return;
    }
    
    // Check if changing vote
    if (voteState.userVote) {
        if (voteState.userVote === side) {
            showNotification('You already voted for this music video!', 'info');
            return;
        }
        showNotification('You can only vote once per match', 'info');
        return;
    }
    
    // Add loading state
    button.classList.add('loading');
    button.disabled = true;
    
    try {
        // Update vote counts
        if (side === 'left') {
            voteState.leftVotes++;
        } else {
            voteState.rightVotes++;
        }
        voteState.totalVotes++;
        voteState.userVote = side;
        
        // Save to localStorage
        localStorage.setItem(`vote_${currentMatch.id}`, side);
        
        // Update display
        updateVoteDisplay();
        markButtonAsVoted(side);
        updateLeadingVisuals();
        
        // Success state
        button.classList.remove('loading');
        button.classList.add('success');
        
        // Show confirmation
        showVoteConfirmation(side);
        
        // Show book recommendation
        const songId = side === 'left' ? currentMatch.song1.id : currentMatch.song2.id;
        showBookRecommendation(songId);
        
    } catch (error) {
        console.error('Error casting vote:', error);
        button.classList.remove('loading');
        showNotification('Error casting vote', 'error');
    }
}

// Make vote function available globally
window.vote = vote;

// Update vote display
function updateVoteDisplay() {
    // Update percentages in vote sections
    const leftPercentage = document.querySelector('.competitor-column[data-side="left"] .percentage-number');
    const rightPercentage = document.querySelector('.competitor-column[data-side="right"] .percentage-number');
    
    if (leftPercentage) leftPercentage.textContent = `${calculatePercentage(voteState.leftVotes)}%`;
    if (rightPercentage) rightPercentage.textContent = `${calculatePercentage(voteState.rightVotes)}%`;
    
    // Update vote counts
    const leftCount = document.querySelector('.competitor-column[data-side="left"] .vote-count');
    const rightCount = document.querySelector('.competitor-column[data-side="right"] .vote-count');
    
    if (leftCount) leftCount.textContent = `${voteState.leftVotes.toLocaleString()} votes`;
    if (rightCount) rightCount.textContent = `${voteState.rightVotes.toLocaleString()} votes`;
    
    // Update subtitle
    const subtitle = document.querySelector('.featured-matchup .section-subtitle');
    if (subtitle) {
        subtitle.textContent = `${voteState.totalVotes.toLocaleString()} votes • 🔴 Live Now`;
    }
}

// Mark button as voted
function markButtonAsVoted(side) {
    const leftButton = document.querySelector('.competitor-column[data-side="left"] .vote-btn');
    const rightButton = document.querySelector('.competitor-column[data-side="right"] .vote-btn');
    
    if (!leftButton || !rightButton) return;
    
    // Mark voted button
    const votedButton = side === 'left' ? leftButton : rightButton;
    votedButton.classList.add('voted');
    votedButton.innerHTML = `
        <span class="vote-text">Your Vote</span>
    `;
    votedButton.disabled = false; // Keep clickable for "already voted" message
}

// Show vote confirmation
function showVoteConfirmation(side) {
    const song = side === 'left' ? currentMatch.song1 : currentMatch.song2;
    const songName = song.shortTitle || song.title;
    
    const notification = document.createElement('div');
    notification.className = 'vote-notification';
    notification.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span>Vote recorded for <strong>${songName}</strong>!</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95));
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-family: 'Lora', serif;
        font-size: 0.95rem;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(200, 170, 110, 0.4);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ========================================
// BOOK RECOMMENDATION MODAL
// ========================================

function showBookRecommendation(songId) {
    const songData = musicVideos.find(v => v.id === songId);
    
    if (!songData) {
        console.log('❌ Song not found:', songId);
        return;
    }
    
    if (!songData.recommendedBook) {
        console.log('📚 No book recommendation for:', songData.title);
        return;
    }
    
    const book = getBookForSong(songData);
    
    if (!book) {
        console.log('❌ Book not found in database for:', songData.recommendedBook);
        return;
    }
    
    console.log('📚 Showing book recommendation:', book.title);
    
    const modal = document.getElementById('bookModal');
    const modalBody = document.getElementById('bookModalBody');
    
    if (!modal || !modalBody) {
        console.error('❌ Book modal elements not found');
        return;
    }
    
    // Build HTML
    modalBody.innerHTML = `
        <div class="book-recommendation">
            <div class="book-header">
                <span class="book-icon">📚</span>
                <h3>Explore the Lore</h3>
            </div>
            
            <div class="book-content">
                <div class="book-cover-section">
                    <img src="${book.coverImage}" 
                         alt="${book.title}" 
                         class="book-cover">
                </div>
                
                <div class="book-details">
                    <h4 class="book-title">${book.title}</h4>
                    <p class="book-author">by ${book.author}</p>
                    
                    <p class="book-description">${book.description}</p>
                    
                    <div class="book-features">
                        ${book.features.map(feature => `
                            <div class="feature-item">
                                <span class="feature-icon">✓</span>
                                <span>${feature}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <a href="${book.amazonLink}" 
                       target="_blank" 
                       rel="noopener noreferrer nofollow"
                       class="book-cta"
                       onclick="trackBookClick('${songData.slug}', 'homepage-featured')">
                        View on Amazon →
                    </a>
                    
                    <p class="book-disclaimer">
                        As an Amazon Associate, we earn from qualifying purchases
                    </p>
                </div>
            </div>
        </div>
    `;
    
    // Show modal after delay
    setTimeout(() => {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }, 1500);
}

function closeBookModal() {
    const modal = document.getElementById('bookModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Make function available globally
window.closeBookModal = closeBookModal;

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('bookModal');
    if (event.target === modal) {
        closeBookModal();
    }
}

// Close with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeBookModal();
    }
});

// Track book clicks
window.trackBookClick = function(songSlug, location) {
    console.log(`📊 Book clicked: ${songSlug} from ${location}`);
};

// ========================================
// HIDE CHAMPIONS SECTION
// ========================================

function hideChampionsSection() {
    const championsSection = document.querySelector('.champions');
    if (championsSection) {
        championsSection.style.display = 'none';
        console.log('✅ Hall of Champions hidden (no champions yet)');
    }
}

// ========================================
// VIDEO PLAYER
// ========================================

function playVideo(momentId) {
    const videoWrapper = event.currentTarget.closest('.video-wrapper');
    const thumbnail = videoWrapper.querySelector('.video-thumbnail');
    const playButton = videoWrapper.querySelector('.play-button');
    
    const thumbnailSrc = thumbnail.src;
    const videoIdMatch = thumbnailSrc.match(/vi\/([^\/]+)\//);
    
    if (!videoIdMatch) {
        console.error('Could not extract video ID');
        return;
    }
    
    const videoId = videoIdMatch[1];
    
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    
    thumbnail.style.display = 'none';
    playButton.style.display = 'none';
    videoWrapper.appendChild(iframe);
}

// Make function globally available
window.playVideo = playVideo;

// ========================================
// BROWSER NOTIFICATIONS
// ========================================

async function enableNotifications() {
    const button = document.getElementById('enable-notifications');
    const statusText = button.querySelector('.notification-status');
    
    // Check if browser supports notifications
    if (!("Notification" in window)) {
        showNotification('Your browser doesn\'t support notifications', 'error');
        return;
    }
    
    // Check current permission
    if (Notification.permission === "granted") {
        showNotification('Notifications are already enabled!', 'info');
        updateNotificationButton('enabled');
        return;
    }
    
    if (Notification.permission === "denied") {
        showNotification('Notifications are blocked. Please enable them in browser settings.', 'error');
        return;
    }
    
    // Request permission
    button.disabled = true;
    statusText.textContent = 'Requesting permission...';
    
    try {
        const permission = await Notification.requestPermission();
        
        if (permission === "granted") {
            // Success!
            new Notification("🎉 Notifications Enabled!", {
                body: "You'll be notified when new matches go live",
                icon: "/favicon/favicon-32x32.png",
                badge: "/favicon/favicon-32x32.png"
            });
            
            // Save preference
            localStorage.setItem('notificationsEnabled', 'true');
            localStorage.setItem('notificationsEnabledDate', new Date().toISOString());
            
            showNotification('Notifications enabled successfully!', 'success');
            updateNotificationButton('enabled');
            
            console.log('✅ Notifications enabled');
            
        } else {
            showNotification('Notification permission denied', 'error');
            button.disabled = false;
            statusText.textContent = 'Enable Notifications';
        }
        
    } catch (error) {
        console.error('Error requesting notification permission:', error);
        showNotification('Error enabling notifications', 'error');
        button.disabled = false;
        statusText.textContent = 'Enable Notifications';
    }
}

function updateNotificationButton(state) {
    const button = document.getElementById('enable-notifications');
    const statusText = button.querySelector('.notification-status');
    
    if (state === 'enabled') {
        button.classList.add('notifications-enabled');
        button.disabled = true;
        statusText.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Notifications Enabled
        `;
    }
}

// Check notification status on page load
function checkNotificationStatus() {
    if (Notification.permission === "granted") {
        updateNotificationButton('enabled');
    }
}

// Make functions globally available
window.enableNotifications = enableNotifications;

// ========================================
// NOTIFICATION HELPER
// ========================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const bgColor = {
        'success': 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))',
        'error': 'linear-gradient(135deg, rgba(220, 50, 50, 0.95), rgba(200, 30, 30, 0.95))',
        'info': 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))',
        }[type] || 'linear-gradient(135deg, rgba(200, 170, 110, 0.95), rgba(180, 150, 90, 0.95))';
    
    notification.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-family: 'Lora', serif;
        font-size: 0.95rem;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ========================================
// SCROLL ANIMATIONS
// ========================================

function initializeScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe all sections
    document.querySelectorAll('.featured-matchup, .live-matches-section, .recent-results-section, .matches-cta').forEach(section => {
        observer.observe(section);
    });
}

// ========================================
// ADD ANIMATION STYLES
// ========================================

// Add this CSS dynamically if not already in stylesheet
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .featured-matchup,
    .live-matches-section,
    .recent-results-section,
    .matches-cta {
        opacity: 0;
        transform: translateY(30px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }
    
    .featured-matchup.animate-in,
    .live-matches-section.animate-in,
    .recent-results-section.animate-in,
    .matches-cta.animate-in {
        opacity: 1;
        transform: translateY(0);
    }
    
    /* No Results Message */
    .no-results {
        text-align: center;
        padding: 5rem 2rem;
        grid-column: 1 / -1;
    }
    
    .no-results-icon {
        font-size: 4rem;
        margin-bottom: 1.5rem;
        opacity: 0.5;
    }
    
    .no-results-title {
        font-family: 'Cinzel', serif;
        font-size: 1.8rem;
        font-weight: 700;
        color: #C8AA6E;
        margin-bottom: 0.75rem;
        letter-spacing: 0.02em;
    }
    
    .no-results-text {
        font-family: 'Lora', serif;
        font-size: 1.1rem;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.7;
    }
`;
document.head.appendChild(style);

// ========================================
// CONSOLE BRANDING
// ========================================

console.log(
    '%c🎵 League Music Tournament %c- Powered by the Lore',
    'color: #C8AA6E; font-size: 20px; font-weight: bold; font-family: Cinzel, serif;',
    'color: #888; font-size: 14px; font-family: Lora, serif;'
);

// ========================================
// ERROR HANDLING
// ========================================

window.addEventListener('error', (event) => {
    console.error('❌ Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled promise rejection:', event.reason);
});