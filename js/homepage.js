// ========================================
// IMPORTS
// ========================================
import { getBookForSong } from './bookMappings.js';
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, updateDoc, increment, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createMatchCard } from './match-card-renderer.js';

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
    console.time('⏱️ Total Homepage Load');
    console.log('🎵 League Music Tournament loaded');
    
    try {
        // ✅ Show loading state
        showHomepageLoading();
        
        console.time('⏱️ Music Videos');
        await loadMusicVideos();
        console.timeEnd('⏱️ Music Videos');
        
        console.time('⏱️ Tournament Info');
        await loadTournamentInfo();
        console.timeEnd('⏱️ Tournament Info');
        
        console.time('⏱️ Featured Match');
        await loadFeaturedMatch();
        console.timeEnd('⏱️ Featured Match');
        
        console.time('⏱️ Live Matches');
        await loadLiveMatches();
        console.timeEnd('⏱️ Live Matches');
        
        console.time('⏱️ Recent Results');
        await loadRecentResults();
        console.timeEnd('⏱️ Recent Results');
        
        console.time('⏱️ Upcoming Matches');
        await loadUpcomingMatches();
        console.timeEnd('⏱️ Upcoming Matches');
        
        console.time('⏱️ Hero Stats');
        await updateHeroStats();
        console.timeEnd('⏱️ Hero Stats');
        
        hideChampionsSection();
        initializeScrollAnimations();
        
        // ✅ Hide loading, show homepage with stagger animation
        hideHomepageLoading();
        showHomepageSections();
        
        console.timeEnd('⏱️ Total Homepage Load');
        
    } catch (error) {
        console.error('❌ Error loading homepage:', error);
        hideHomepageLoading();
        showHomepageError(error);
    }
});

function showHomepageError(error) {
    const heroSection = document.getElementById('heroSection');
    if (heroSection) {
        heroSection.style.display = 'block';
        heroSection.innerHTML = `
            <div class="container">
                <div style="text-align: center; padding: 5rem 2rem;">
                    <div style="font-size: 5rem; margin-bottom: 1.5rem; opacity: 0.5;">⚠️</div>
                    <h2 style="font-family: 'Cinzel', serif; font-size: 2rem; color: #C8AA6E; margin-bottom: 1rem;">
                        Error Loading Tournament
                    </h2>
                    <p style="font-family: 'Lora', serif; font-size: 1.1rem; color: rgba(255, 255, 255, 0.6); margin-bottom: 2rem;">
                        Could not load tournament data. Please try refreshing the page.
                    </p>
                    <p style="font-size: 0.9rem; color: rgba(255, 255, 255, 0.5);">
                        Error: ${error.message}
                    </p>
                    <button onclick="location.reload()" style="margin-top: 2rem; padding: 1rem 2rem; background: linear-gradient(135deg, #C8AA6E, #b49a5e); border: none; color: #1a1a2e; font-family: 'Lora', serif; font-size: 1rem; font-weight: 600; border-radius: 8px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }
}

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
// LOAD TOURNAMENT INFO (DYNAMIC BADGE)
// ========================================

async function loadTournamentInfo() {
    try {
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        
        // Get live matches
        const liveQuery = query(matchesRef, where('status', '==', 'live'));
        const liveSnapshot = await getDocs(liveQuery);
        
        // Get upcoming matches (sorted by date)
        const upcomingQuery = query(
            matchesRef, 
            where('status', '==', 'upcoming')
        );
        const upcomingSnapshot = await getDocs(upcomingQuery);
        
        const tournamentNameEl = document.getElementById('tournamentName');
        const tournamentStatusEl = document.getElementById('tournamentStatus');
        const badgeIcon = document.querySelector('.tournament-badge .badge-icon');
        
        if (!tournamentNameEl || !tournamentStatusEl) return;
        
        // SCENARIO 1: Live matches exist
        if (!liveSnapshot.empty) {
            const liveCount = liveSnapshot.size;
            
            // Find actual live matches (skip TBD)
            const actualLiveMatches = [];
            liveSnapshot.forEach(doc => {
                const match = doc.data();
                const isTBD = !match.song1?.id || !match.song2?.id ||
                             String(match.song1.id).includes('TBD') ||
                             String(match.song2.id).includes('TBD');
                if (!isTBD) {
                    actualLiveMatches.push(match);
                }
            });
            
            if (actualLiveMatches.length === 1) {
                const liveMatch = actualLiveMatches[0];
                const song1 = liveMatch.song1.shortTitle || liveMatch.song1.title;
                const song2 = liveMatch.song2.shortTitle || liveMatch.song2.title;
                
                badgeIcon.textContent = '🔴';
                tournamentNameEl.textContent = 'Live Now';
                tournamentStatusEl.textContent = `${song1} vs ${song2}`;
                tournamentStatusEl.style.maxWidth = '400px';
                tournamentStatusEl.style.overflow = 'hidden';
                tournamentStatusEl.style.textOverflow = 'ellipsis';
                tournamentStatusEl.style.whiteSpace = 'nowrap';
                
                console.log(`✅ Tournament badge: ${song1} vs ${song2}`);
                return;
            } else if (actualLiveMatches.length > 1) {
                const currentRound = actualLiveMatches[0].round || 1;
                
                badgeIcon.textContent = '🔴';
                tournamentNameEl.textContent = 'Live Now';
                tournamentStatusEl.textContent = `${actualLiveMatches.length} matches • ${getRoundDisplayName(currentRound)}`;
                
                console.log(`✅ Tournament badge: ${actualLiveMatches.length} live matches`);
                return;
            }
        }
        
        // SCENARIO 2: No live matches - show next upcoming match
        if (!upcomingSnapshot.empty) {
            // Find non-TBD upcoming matches and sort by date
            const validUpcomingMatches = [];
            
            upcomingSnapshot.forEach(doc => {
                const match = doc.data();
                
                // Skip TBD matches
                const isTBD = !match.song1?.id || !match.song2?.id ||
                             String(match.song1.id).includes('TBD') ||
                             String(match.song2.id).includes('TBD');
                
                if (!isTBD && match.date) {
                    validUpcomingMatches.push(match);
                }
            });
            
            if (validUpcomingMatches.length > 0) {
                // Sort by date (earliest first)
                validUpcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                const nextMatch = validUpcomingMatches[0];
                const song1 = nextMatch.song1.shortTitle || nextMatch.song1.title;
                const song2 = nextMatch.song2.shortTitle || nextMatch.song2.title;
                const roundName = getRoundDisplayName(nextMatch.round);
                const timeUntil = getTimeUntilMatch(nextMatch.date);
                
                badgeIcon.textContent = '⏰';
                tournamentNameEl.textContent = `${song1} vs ${song2}`;
                tournamentStatusEl.textContent = `${roundName} • Starts ${timeUntil}`;
                tournamentStatusEl.style.maxWidth = '500px';
                tournamentStatusEl.style.overflow = 'hidden';
                tournamentStatusEl.style.textOverflow = 'ellipsis';
                tournamentStatusEl.style.whiteSpace = 'nowrap';
                
                console.log(`✅ Tournament badge: Next match - ${song1} vs ${song2}`);
                return;
            }
        }
        
        // SCENARIO 3: Fallback - show generic info
        badgeIcon.textContent = '🎵';
        tournamentNameEl.textContent = 'Music Tournament';
        tournamentStatusEl.textContent = 'Season 1';
        
        console.log('✅ Tournament badge: Fallback');
        
    } catch (error) {
        console.error('❌ Error loading tournament info:', error);
        
        // Fallback on error
        const tournamentNameEl = document.getElementById('tournamentName');
        const tournamentStatusEl = document.getElementById('tournamentStatus');
        if (tournamentNameEl) tournamentNameEl.textContent = 'Music Tournament';
        if (tournamentStatusEl) tournamentStatusEl.textContent = 'Season 1';
    }
}

// Helper: Get display-friendly round name
function getRoundDisplayName(roundNumber) {
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

// Helper: Get time until match (you might already have this)
function getTimeUntilMatch(dateString) {
    if (!dateString) return 'soon';
    
    const matchDate = new Date(dateString);
    const now = new Date();
    const diff = matchDate - now;
    
    if (diff < 0) return 'soon';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    if (minutes > 0) return `in ${minutes}m`;
    return 'soon';
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
        
        let liveMatches = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        liveMatches.sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0));
        
        currentMatch = liveMatches[0];
        
        console.log(`✅ Featured match (most voted): ${currentMatch.totalVotes} votes`);
        
        // Display match
        await displayFeaturedMatch();
        
        // ❌ REMOVE THIS LINE:
        // checkExistingVote();
        
   
        
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
// REAL-TIME VOTE POLLING
// ========================================



// ========================================
// DISPLAY FEATURED MATCH
// ========================================

// ========================================
// DISPLAY FEATURED MATCH (VIEW-ONLY)
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

    // Add countdown timer if exists
    if (currentMatch.endTime) {
        const countdownContainer = document.createElement('p');
        countdownContainer.className = 'featured-countdown';
        countdownContainer.id = 'featured-countdown';
        countdownContainer.style.cssText = `
            text-align: center;
            font-size: 1rem;
            font-weight: 600;
            margin: 1rem 0 2rem 0;
            color: #ffaa00;
        `;
        
        const titleSection = document.querySelector('.featured-matchup .section-header');
        if (titleSection) {
            titleSection.appendChild(countdownContainer);
            setTimeout(() => {
                startFeaturedCountdown(currentMatch.endTime);
            }, 100);
        }
    }

    // Render competitor layout (VIEW-ONLY - no voting buttons)
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
                <p class="vote-count">${voteState.rightVotes.toLocaleString()} votes</p>
            </div>
        </div>
    `;
    
   // AFTER:
// ✅ ADD "VOTE NOW" CTA BUTTON BELOW GRID
const ctaButton = document.createElement('div');
ctaButton.className = 'featured-cta';
ctaButton.innerHTML = `
    <a href="vote?match=${currentMatch.id}" class="vote-now-btn">
        🎵 Cast Your Vote
    </a>
`;
    ctaButton.style.cssText = `
        text-align: center;
        margin-top: 2rem;
        padding: 2rem 0;
    `;
    
    grid.parentElement.appendChild(ctaButton);
    
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
// LOADING STATE HELPERS
// ========================================

function showHomepageLoading() {
    const loadingState = document.getElementById('homepageLoadingState');
    if (loadingState) {
        loadingState.style.display = 'block';
    }
    
    // Hide all content sections
    hideHomepageSections();
    
    console.log('⏳ Showing homepage loading state');
}

function hideHomepageLoading() {
    const loadingState = document.getElementById('homepageLoadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    
    console.log('✅ Hiding homepage loading state');
}

function showHomepageSections() {
    const sections = [
        { id: 'heroSection', stagger: 1 },
        { id: 'musicVideosSection', stagger: 2 },
        { id: 'featuredMatchSection', stagger: 3 },
        { id: 'liveMatchesSection', stagger: 4 },
        { id: 'upcomingMatchesSection', stagger: 5 },
        { id: 'recentResultsSection', stagger: 6 }
    ];
    
    sections.forEach(({ id, stagger }) => {
        const section = document.getElementById(id);
        if (section) {
            section.style.display = 'block';
            section.classList.add('homepage-fade-in', `stagger-${stagger}`);
        }
    });
    
    console.log('✅ Homepage sections visible with stagger animation');
}

function hideHomepageSections() {
    const sectionIds = [
        'heroSection',
        'musicVideosSection',
        'featuredMatchSection',
        'liveMatchesSection',
        'upcomingMatchesSection',
        'recentResultsSection'
    ];
    
    sectionIds.forEach(id => {
        const section = document.getElementById(id);
        if (section) {
            section.style.display = 'none';
            section.classList.remove('homepage-fade-in');
        }
    });
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
    
    // Convert Firebase format to display format
    const convertedMatches = matches.map(m => convertFirebaseMatchToDisplayFormat(m));
    grid.innerHTML = convertedMatches.map(match => createMatchCard(match)).join('');
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
    
    // Convert Firebase format to display format
    const convertedMatches = matches.map(m => convertFirebaseMatchToDisplayFormat(m));
    grid.innerHTML = convertedMatches.map(match => createMatchCard(match)).join('');
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
// CONVERT FIREBASE MATCH TO DISPLAY FORMAT
// ========================================

function convertFirebaseMatchToDisplayFormat(firebaseMatch) {
    const totalVotes = firebaseMatch.totalVotes || 0;
    const song1Votes = firebaseMatch.song1?.votes || 0;
    const song2Votes = firebaseMatch.song2?.votes || 0;
    
    const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
    const song2Percentage = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50;
    
    return {
        id: firebaseMatch.matchId || firebaseMatch.id,
        tournament: 'Anthems Arena Championship',
        round: getRoundName(firebaseMatch.round),
        status: firebaseMatch.status || 'upcoming',
        date: firebaseMatch.date || '2025-11-01',
        totalVotes: totalVotes,
        timeLeft: firebaseMatch.status === 'live' ? 'Voting Open' : 'Not Started',
        competitor1: {
            seed: firebaseMatch.song1.seed,
            name: firebaseMatch.song1.shortTitle || firebaseMatch.song1.title,
            source: `${firebaseMatch.song1.artist} • ${firebaseMatch.song1.year || '2025'}`,
            videoId: firebaseMatch.song1.videoId,
            votes: song1Votes,
            percentage: song1Percentage,
            winner: firebaseMatch.winnerId === firebaseMatch.song1.id,
            leading: song1Votes > song2Votes && totalVotes > 0
        },
        competitor2: {
            seed: firebaseMatch.song2.seed,
            name: firebaseMatch.song2.shortTitle || firebaseMatch.song2.title,
            source: `${firebaseMatch.song2.artist} • ${firebaseMatch.song2.year || '2025'}`,
            videoId: firebaseMatch.song2.videoId,
            votes: song2Votes,
            percentage: song2Percentage,
            winner: firebaseMatch.winnerId === firebaseMatch.song2.id,
            leading: song2Votes > song1Votes && totalVotes > 0
        }
    };
}



// Helper: Generate unique user ID
function generateUserId() {
    const userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now();
    localStorage.setItem('userId', userId);
    return userId;
}



// ✅ ADD THIS HERE:
// ========================================
// VOTE NOW NAVIGATION
// ========================================

// AFTER:
window.voteNow = function(matchId) {
    if (!matchId) {
        console.error('❌ voteNow: No match ID provided');
        showNotification('Unable to load match. Please try again.', 'error');
        return;
    }
    
    console.log(`✅ Navigating to vote page for match: ${matchId}`);
    window.location.href = `vote?match=${matchId}`;
};

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




async function loadUpcomingMatches() {
    try {
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        
        // ✅ Get ALL upcoming matches (no limit yet)
        const upcomingQuery = query(
            matchesRef,
            where('status', '==', 'upcoming'),
            orderBy('date', 'asc')
        );
        
        const snapshot = await getDocs(upcomingQuery);
        
        if (snapshot.empty) {
            hideUpcomingSection();
            return;
        }
        
        const upcomingMatches = [];
        
        snapshot.forEach(doc => {
            const match = doc.data();
            
            // Skip TBD matches
            const song1IsTBD = !match.song1?.id || 
                              match.song1.id === 'TBD' || 
                              String(match.song1.id).includes('TBD');

            const song2IsTBD = !match.song2?.id || 
                              match.song2.id === 'TBD' || 
                              String(match.song2.id).includes('TBD');
            
            if (song1IsTBD || song2IsTBD) {
                return; // Skip
            }
            
            // Only add non-TBD matches
            upcomingMatches.push({
                id: match.matchId,
                tournament: 'Anthems Arena Championship',
                round: getRoundName(match.round),
                status: 'upcoming',
                date: match.date || '2025-11-01',
                totalVotes: 0,
                timeLeft: 'Not Started',
                competitor1: {
                    seed: match.song1.seed,
                    name: match.song1.shortTitle,
                    source: `${match.song1.artist} • ${match.song1.year}`,
                    videoId: match.song1.videoId,
                    votes: 0,
                    percentage: 50,
                    winner: false,
                    leading: false
                },
                competitor2: {
                    seed: match.song2.seed,
                    name: match.song2.shortTitle,
                    source: `${match.song2.artist} • ${match.song2.year}`,
                    videoId: match.song2.videoId,
                    votes: 0,
                    percentage: 50,
                    winner: false,
                    leading: false
                }
            });
        });
        
        console.log(`🔍 Found ${upcomingMatches.length} non-TBD upcoming matches`);
        
        if (upcomingMatches.length === 0) {
            hideUpcomingSection();
            return;
        }
        
        // Already sorted by Firestore, just limit to 4
        const limitedMatches = upcomingMatches.slice(0, 6);
        
        console.log(`✅ Displaying ${limitedMatches.length} upcoming matches`);
        limitedMatches.forEach((m, i) => {
            console.log(`${i + 1}. ${m.competitor1.name} vs ${m.competitor2.name} | ${m.date}`);
        });
        
        displayUpcomingMatches(limitedMatches);
        
    } catch (error) {
        console.error('❌ Error loading upcoming matches:', error);
    }
}

function displayUpcomingMatches(matches) {
    const grid = document.getElementById('upcomingMatchesGrid');
    if (!grid) return;
    
    // ✨ USE THE SAME createMatchCard FUNCTION!
    grid.innerHTML = matches.map(match => createMatchCard(match)).join('');
}

function hideUpcomingSection() {
    const section = document.querySelector('.upcoming-matches-section');
    if (section) section.style.display = 'none';
}

function getRoundName(roundNumber) {
    const roundNames = {
        1: 'round-1',
        2: 'round-2',
        3: 'round-3',
        4: 'quarterfinals',
        5: 'semifinals',
        6: 'finals'
    };
    return roundNames[roundNumber] || `round-${roundNumber}`;
}

// ========================================
// BOOK LINK TRACKING
// ========================================

window.trackBookClick = function(songSlug, location) {
    console.log(`📊 Book clicked: ${songSlug} from ${location}`);
    
    // Optional: Send to analytics
    if (typeof gtag !== 'undefined') {
        gtag('event', 'book_click', {
            song: songSlug,
            location: location
        });
    }
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
// FEATURED MATCH COUNTDOWN
// ========================================

function startFeaturedCountdown(endTime) {
    const elem = document.getElementById('featured-countdown');
    if (!elem) return;
    
    const endTimestamp = new Date(endTime).getTime();
    
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const remaining = endTimestamp - now;
        
        if (remaining <= 0) {
            clearInterval(interval);
            elem.textContent = '⏱️ Voting Closed';
            elem.style.color = '#999';
                elem.classList.remove('urgent'); // ✅ Remove animation

            return;
        }
        
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        
        if (hours > 0) {
            elem.textContent = `⏰ ${hours}h ${minutes}m left to vote`;
            elem.style.color = '#667eea';
        } else if (minutes > 30) {
            elem.textContent = `⏰ ${minutes}m ${seconds}s left to vote`;
            elem.style.color = '#ffaa00';
      } else {
    elem.textContent = `🚨 ${minutes}m ${seconds}s left to vote!`;
    elem.style.color = '#ff4444';
    elem.style.fontWeight = 'bold';
    elem.classList.add('urgent'); // ✅ Add pulsing animation
}
    }, 1000);
}

// ========================================
// ERROR HANDLING
// ========================================

window.addEventListener('error', (event) => {
    console.error('❌ Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled promise rejection:', event.reason);
});