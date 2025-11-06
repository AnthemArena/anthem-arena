// ========================================
// MATCHES PAGE FUNCTIONALITY - LEAGUE MUSIC TOURNAMENT
// ========================================

// Import API Client (uses Netlify Edge cache)
import { getAllMatches } from './api-client.js';

// Keep Firebase for stats only
import { db } from './firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createMatchCard } from './match-card-renderer.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';


// 🔒 PREVENT DUPLICATE LOADING
if (window.matchesLoaded) {
    console.log('⚠️ Matches already loaded, skipping...');
} else {
    window.matchesLoaded = true;
}


// Matches will be loaded from Firebase
let allMatches = [];

// Current filter state
let currentFilters = {
    search: '',
    tournament: 'all',
    round: 'all',
    status: 'all',
    sort: 'recent' // ← Changed from 'date-desc'
};
document.addEventListener('DOMContentLoaded', async () => {
    console.log('League Music Tournament matches page loaded successfully');
    
    try {
        // ✅ Show loading state
        showMatchesLoading();
        
        // Load matches from Firebase
        await loadMatchesFromFirebase();
        
        // Load tournament stats
        await loadTournamentStats();
        
        // Populate filter dropdowns with actual data
        populateTournamentFilter();
        populateRoundFilter();
        
        // Setup filter event listeners
        setupFilterListeners();
        
        // Apply initial filtering and sorting
        if (allMatches.length > 0) {
            filterMatches();
        } else {
            showNoMatches();
        }
        
        // ✅ Hide loading, show matches
        hideMatchesLoading();
        showMatchesSections();
        
    } catch (error) {
        console.error('❌ Error initializing matches page:', error);
        hideMatchesLoading();
        showMatchesError(error);
    }
});

// Setup filter event listeners
function setupFilterListeners() {
    const searchInput = document.getElementById('search-input');
    const tournamentFilter = document.getElementById('tournament-filter');
    const roundFilter = document.getElementById('round-filter');
    const statusFilter = document.getElementById('status-filter');
    const sortFilter = document.getElementById('sort-filter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterMatches);
    }
    
    if (tournamentFilter) {
        tournamentFilter.addEventListener('change', () => {
            console.log('🔍 Tournament filter changed to:', tournamentFilter.value);
            filterMatches();
        });
    }
    
    if (roundFilter) {
        roundFilter.addEventListener('change', () => {
            console.log('🔍 Round filter changed to:', roundFilter.value);
            filterMatches();
        });
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            console.log('🔍 Status filter changed to:', statusFilter.value);
            filterMatches();
        });
    }
    
    if (sortFilter) {
        sortFilter.addEventListener('change', () => {
            console.log('🔍 Sort changed to:', sortFilter.value);
            sortMatches();
        });
    }
}

// Load matches from Firebase
async function loadMatchesFromFirebase() {
    try {
        console.log('📥 Loading matches from edge cache...');
        
        // ✅ NEW: Use edge-cached API
        const firebaseMatches = await getAllMatches();

        console.log(`📊 Total matches found: ${firebaseMatches.length}`);

        if (!firebaseMatches || firebaseMatches.length === 0) {
            console.error('❌ No matches found');
            console.log('💡 Run init-matches.html to create matches');
            allMatches = [];
            return;
        }
        
        console.log(`✅ Loaded ${firebaseMatches.length} matches from edge cache`);
        
        // Convert to match array
        allMatches = [];
        
        firebaseMatches.forEach(match => {
            // Note: 'match' is already the data object, no need for doc.data()
            
            // 🔍 DEBUG: Log tournament value
            console.log('🔍 Match tournament value:', match.tournament || 'UNDEFINED');
            
            // ✨ FILTER OUT TBD MATCHES
            const song1IsTBD = !match.song1 || 
                              match.song1.id === 'TBD' || 
                              !match.song1.id || 
                              typeof match.song1.id === 'string' && match.song1.id.includes('TBD');
            
            const song2IsTBD = !match.song2 || 
                              match.song2.id === 'TBD' || 
                              !match.song2.id || 
                              typeof match.song2.id === 'string' && match.song2.id.includes('TBD');
            
            // Skip matches with TBD competitors
            if (song1IsTBD || song2IsTBD) {
                console.log(`⏭️ Skipping TBD match: ${match.matchId}`);
                return; // Skip this match
            }
            
            // ✨ FIX ROUND NAMES
            const roundName = getRoundName(match.round);
            
            // Calculate percentages
            const totalVotes = match.totalVotes || 0;
            const song1Votes = match.song1.votes || 0;
            const song2Votes = match.song2.votes || 0;
            
            const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
            const song2Percentage = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50;
            
            // 🔧 NORMALIZE TOURNAMENT NAME
            // Use whatever is in Firebase, or default to "Anthem Arena Championship S1"
            const tournamentName = match.tournament || 'Anthem Arena Championship S1';
            
            allMatches.push({
                id: match.matchId,
                tournament: tournamentName, // ✅ Use normalized tournament name
                round: roundName, // ✅ Use correct round name
                status: match.status || 'upcoming',
                date: match.date || '2025-11-01',
                totalVotes: totalVotes,
                timeLeft: match.status === 'live' ? 'Voting Open' : 'Not Started',
                competitor1: {
                    seed: match.song1.seed,
                    name: match.song1.shortTitle,
                    source: `${match.song1.artist} • ${match.song1.year}`,
                    videoId: match.song1.videoId,
                    votes: song1Votes,
                    percentage: song1Percentage,
                    winner: match.winnerId === match.song1.id,
                    leading: song1Votes > song2Votes && totalVotes > 0
                },
                competitor2: {
                    seed: match.song2.seed,
                    name: match.song2.shortTitle,
                    source: `${match.song2.artist} • ${match.song2.year}`,
                    videoId: match.song2.videoId,
                    votes: song2Votes,
                    percentage: song2Percentage,
                    winner: match.winnerId === match.song2.id,
                    leading: song2Votes > song1Votes && totalVotes > 0
                }
            });
        });
        
        console.log(`✅ Processed ${allMatches.length} matches with confirmed competitors`);
        
        // 🔍 DEBUG: Log unique tournament names
        const uniqueTournaments = [...new Set(allMatches.map(m => m.tournament))];
        console.log('🔍 Unique tournament names in matches:', uniqueTournaments);
        
        // Export to global database for modal/vote pages
        exportToGlobalDatabase();
        
    } catch (error) {
        console.error('❌ Error loading from Firebase:', error);
        allMatches = [];
    }
}

// ✨ ADD THIS HELPER FUNCTION
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
// POPULATE FILTER DROPDOWNS
// ========================================

// Populate tournament filter dropdown
function populateTournamentFilter() {
    const tournamentFilter = document.getElementById('tournament-filter');
    if (!tournamentFilter) return;
    
    // Get unique tournaments from matches (after normalization)
    const tournaments = [...new Set(allMatches.map(m => m.tournament))];
    
    console.log('📋 Available tournaments after normalization:', tournaments);
    
    // Clear existing options (except "All")
    tournamentFilter.innerHTML = '<option value="all">All Tournaments</option>';
    
    // Add tournament options
    tournaments.forEach(tournament => {
        if (tournament) {
            const option = document.createElement('option');
            option.value = tournament;
            option.textContent = tournament;
            tournamentFilter.appendChild(option);
        }
    });
}

// Populate round filter dropdown
function populateRoundFilter() {
    const roundFilter = document.getElementById('round-filter');
    if (!roundFilter) return;
    
    // Get unique rounds from matches
    const rounds = [...new Set(allMatches.map(m => m.round))];
    
    // Sort rounds in proper order
    const roundOrder = ['round-1', 'round-2', 'round-3', 'quarterfinals', 'semifinals', 'finals'];
    rounds.sort((a, b) => {
        const indexA = roundOrder.indexOf(a);
        const indexB = roundOrder.indexOf(b);
        return indexA - indexB;
    });
    
    console.log('📋 Available rounds:', rounds);
    
    // Clear existing options (except "All")
    roundFilter.innerHTML = '<option value="all">All Rounds</option>';
    
    // Add round options with friendly names
    rounds.forEach(round => {
        if (round) {
            const option = document.createElement('option');
            option.value = round;
            option.textContent = formatRoundNameForDisplay(round);
            roundFilter.appendChild(option);
        }
    });
}

// Format round name for display
function formatRoundNameForDisplay(round) {
    const roundNames = {
        'round-1': 'Round 1',
        'round-2': 'Round 2',
        'round-3': 'Round 3',
        'quarterfinals': 'Quarterfinals',
        'semifinals': 'Semifinals',
        'finals': 'Finals'
    };
    return roundNames[round] || round;
}

// Export to global database
function exportToGlobalDatabase() {
    if (typeof window.matchDatabase === 'undefined') {
        window.matchDatabase = {};
    }
    
    allMatches.forEach(match => {
        window.matchDatabase[match.id] = match;
    });
    
    console.log(`✅ Exported ${allMatches.length} matches to global database`);
}

// ========================================
// LOAD TOURNAMENT STATS
// ========================================
async function loadTournamentStats() {
    try {
        console.log('📊 Loading tournament stats from Firebase...');
        
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        let totalMatches = 0;
        let totalVotes = 0;
        let uniqueSongs = new Set();
        
        snapshot.forEach(doc => {
            const match = doc.data();


    // Only count completed matches
    if (match.status === 'completed') {
        totalMatches++;
    }            
            // Add vote counts (from all matches)
    const song1Votes = match.song1?.votes || 0;
    const song2Votes = match.song2?.votes || 0;
    totalVotes += song1Votes + song2Votes;
            
            // Track unique songs (only if they're real, not TBD)
            if (match.song1?.id && match.song1.id !== 'TBD') {
                uniqueSongs.add(match.song1.id);
            }
            if (match.song2?.id && match.song2.id !== 'TBD') {
                uniqueSongs.add(match.song2.id);
            }
        });
        
        // Update the DOM
        updateStatDisplay('total-matches', totalMatches);
        updateStatDisplay('total-votes', totalVotes.toLocaleString());
        updateStatDisplay('unique-videos', uniqueSongs.size);
        
        console.log('✅ Tournament stats loaded:', {
            totalMatches,
            totalVotes,
            uniqueSongs: uniqueSongs.size
        });
        
    } catch (error) {
        console.error('❌ Error loading tournament stats:', error);
    }
}

// Helper function to update stat displays
function updateStatDisplay(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// Show "no matches" state
function showNoMatches() {
    const grid = document.getElementById('matches-grid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">📋</div>
            <h3 class="no-results-title">No Matches Available</h3>
            <p class="no-results-text">Initialize the tournament to create matches</p>
            <a href="init-matches.html" class="clear-filters-btn" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: var(--gold); color: #0a0a0a; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Initialize Tournament
            </a>
        </div>
    `;
    updateResultsCount(0);
}

// Filter matches based on current filters
function filterMatches() {
    const searchInput = document.getElementById('search-input');
    const tournamentFilter = document.getElementById('tournament-filter');
    const roundFilter = document.getElementById('round-filter');
    const statusFilter = document.getElementById('status-filter');
    
    if (!searchInput || !tournamentFilter || !roundFilter || !statusFilter) {
        console.warn('⚠️ Filter elements not found');
        return;
    }
    
    const searchValue = searchInput.value.toLowerCase();
    const tournamentValue = tournamentFilter.value;
    const roundValue = roundFilter.value;
    const statusValue = statusFilter.value;

    currentFilters.search = searchValue;
    currentFilters.tournament = tournamentValue;
    currentFilters.round = roundValue;
    currentFilters.status = statusValue;

    let filteredMatches = allMatches.filter(match => {
        // Search filter
        const searchMatch = searchValue === '' || 
            match.competitor1.name.toLowerCase().includes(searchValue) ||
            match.competitor2.name.toLowerCase().includes(searchValue) ||
            match.competitor1.source.toLowerCase().includes(searchValue) ||
            match.competitor2.source.toLowerCase().includes(searchValue);

        // Tournament filter
        const tournamentMatch = tournamentValue === 'all' || match.tournament === tournamentValue;

        // Round filter
        const roundMatch = roundValue === 'all' || match.round === roundValue;

        // Status filter
        const statusMatch = statusValue === 'all' || match.status === statusValue;

        return searchMatch && tournamentMatch && roundMatch && statusMatch;
    });

    // Apply sorting
    filteredMatches = sortMatchesArray(filteredMatches, currentFilters.sort);

    displayMatches(filteredMatches);
    updateResultsCount(filteredMatches.length);

    // Show empty state if no results
    if (filteredMatches.length === 0) {
        showNoResults();
    }
}

// Sort matches
function sortMatches() {
    const sortFilter = document.getElementById('sort-filter');
    if (!sortFilter) return;
    
    const sortValue = sortFilter.value;
    currentFilters.sort = sortValue;
    filterMatches();
}

function sortMatchesArray(matches, sortType) {
    const sorted = [...matches];

    switch (sortType) {
 case 'recent':
    // Most Recent — Context-aware based on status
    const result = sorted.sort((a, b) => {
        // Priority 1: Status order (Live → Completed → Upcoming)
        const statusOrder = { 'live': 1, 'completed': 2, 'upcoming': 3 };
        const statusDiff = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4);
        if (statusDiff !== 0) return statusDiff;
        
        // Priority 2: Within same status
        if (a.status === 'completed' || a.status === 'live') {
            // For completed/live: Most recent = newest date first
            return new Date(b.date) - new Date(a.date);
        } else if (a.status === 'upcoming') {
            // For upcoming: Most recent = soonest date first
            return new Date(a.date) - new Date(b.date);
        }
        
        return 0;
    });
    
    // 🔍 DEBUG: Log sorted results
    console.log('🔍 SORTED MATCHES (first 10):');
    result.slice(0, 10).forEach((m, i) => {
        const date = new Date(m.date);
        const now = new Date();
        const hoursAway = Math.ceil((date - now) / (1000 * 60 * 60));
        const daysAway = Math.floor(hoursAway / 24);
        console.log(`${i + 1}. ${m.matchId} | Date: ${m.date} | ${daysAway}d ${hoursAway % 24}h away`);
    });
    
    return result;
            
        case 'votes-desc':
            return sorted.sort((a, b) => {
                const votesA = a.totalVotes || 0;
                const votesB = b.totalVotes || 0;
                return votesB - votesA || a.competitor1.name.localeCompare(b.competitor1.name);
            });
            
        case 'close':
            return sorted.sort((a, b) => {
                const diffA = Math.abs((a.competitor1.percentage || 50) - (a.competitor2.percentage || 50));
                const diffB = Math.abs((b.competitor1.percentage || 50) - (b.competitor2.percentage || 50));
                return diffA - diffB || (b.totalVotes || 0) - (a.totalVotes || 0);
            });
            
        default:
            return sorted;
    }
}
// Clear all filters
function clearFilters() {
    const searchInput = document.getElementById('search-input');
    const tournamentFilter = document.getElementById('tournament-filter');
    const roundFilter = document.getElementById('round-filter');
    const statusFilter = document.getElementById('status-filter');
    const sortFilter = document.getElementById('sort-filter');
    
    if (searchInput) searchInput.value = '';
    if (tournamentFilter) tournamentFilter.value = 'all';
    if (roundFilter) roundFilter.value = 'all';
    if (statusFilter) statusFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'recent';

    currentFilters = {
        search: '',
        tournament: 'all',
        round: 'all',
        status: 'all',
        sort: 'recent'
    };

    // ✅ FIXED: Use filterMatches() instead of displayMatches()
    filterMatches(); // ← This applies sorting!
}

// Display matches in grid
function displayMatches(matches) {
    const grid = document.getElementById('matches-grid');
    
    if (!grid) {
        console.error('❌ matches-grid element not found');
        return;
    }
    
    if (matches.length === 0) {
        showNoResults();
        return;
    }

    grid.innerHTML = matches.map(match => createMatchCard(match)).join('');
    updateLoadMoreButton(matches);

}







// Update results count
function updateResultsCount(count) {
    const resultsCount = document.getElementById('results-count');
    if (resultsCount) {
        resultsCount.textContent = `Showing ${count} ${count === 1 ? 'match' : 'matches'}`;
    }
}

// Show no results state
function showNoResults() {
    const grid = document.getElementById('matches-grid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">🔍</div>
            <h3 class="no-results-title">No Matches Found</h3>
            <p class="no-results-text">Try adjusting your filters or search terms</p>
            <button class="clear-filters-btn" onclick="clearFilters()">Clear All Filters</button>
        </div>
    `;
    
    const loadMoreContainer = document.querySelector('.load-more-container');
    if (loadMoreContainer) {
        loadMoreContainer.style.display = 'none';
    }
}

// Load more matches (pagination)
function loadMoreMatches() {
    showNotification('All matches loaded', 'info');
}

// AFTER:
function voteNow(matchId) {
    console.log('Vote on match:', matchId);
    showNotification('Redirecting to voting page...', 'info');
    
    setTimeout(() => {
        window.location.href = `vote?match=${matchId}`;
    }, 500);
}

// Remind me (set notification for upcoming match)
function remindMe(matchId) {
    console.log('Set reminder for match:', matchId);
    showNotification('Reminder set! We\'ll notify you when voting opens.', 'success');
}

// AFTER:
function showMatchDetails(matchId) {
    console.log('Show details for match:', matchId);
    
    showNotification('Loading match details...', 'info');
    
    // Navigate to vote page after brief delay
    setTimeout(() => {
        window.location.href = `vote?match=${matchId}`;
    }, 500);
}

// Update load more button visibility
function updateLoadMoreButton(matches) {
    const loadMoreContainer = document.querySelector('.load-more-container');
    
    if (!loadMoreContainer) return;
    
    if (matches.length >= allMatches.length) {
        loadMoreContainer.style.display = 'none';
    } else {
        loadMoreContainer.style.display = 'flex';
    }
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.textContent = message;
    
    const colors = {
        success: '#00c896',
        error: '#ff4444',
        info: '#4a9eff',
        warning: '#ffaa00'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        font-weight: 500;
        max-width: 400px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ========================================
// LOADING STATE HELPERS
// ========================================

function showMatchesLoading() {
    const loadingState = document.getElementById('matchesLoadingState');
    if (loadingState) {
        loadingState.style.display = 'block';
    }
    
    // Hide main sections while loading
    hideMatchesSections();
    
    console.log('⏳ Showing matches loading state');
}

function hideMatchesLoading() {
    const loadingState = document.getElementById('matchesLoadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    
    console.log('✅ Hiding matches loading state');
}

function showMatchesSections() {
    const sections = [
        'filtersSection',
        'matchesSection'
    ];
    
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'block';
            section.classList.add('matches-fade-in');
        }
    });
    
    console.log('✅ Matches sections visible');
}

function hideMatchesSections() {
    const sections = [
        'filtersSection',
        'matchesSection'
    ];
    
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'none';
            section.classList.remove('matches-fade-in');
        }
    });
}

function showMatchesError(error) {
    const matchesSection = document.getElementById('matchesSection');
    if (matchesSection) {
        matchesSection.style.display = 'block';
        matchesSection.innerHTML = `
            <div class="container">
                <div class="no-results">
                    <div class="no-results-icon">⚠️</div>
                    <h3 class="no-results-title">Error Loading Matches</h3>
                    <p class="no-results-text">Could not load matches. Please try refreshing the page.</p>
                    <p style="font-size: 0.9rem; color: rgba(255, 255, 255, 0.5); margin-top: 0.5rem;">
                        Error: ${error.message}
                    </p>
                    <button onclick="location.reload()" class="clear-filters-btn" style="margin-top: 1rem;">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

window.filterMatches = filterMatches;
window.sortMatches = sortMatches;
window.clearFilters = clearFilters;
window.loadMoreMatches = loadMoreMatches;
window.voteNow = voteNow;
window.showMatchDetails = showMatchDetails;

console.log('✅ Matches.js initialized - Firebase integration active');