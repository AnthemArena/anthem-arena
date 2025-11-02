// ========================================
// MATCHES PAGE FUNCTIONALITY - LEAGUE MUSIC TOURNAMENT
// ========================================

// Import Firebase
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
    sort: 'date-desc'
};
// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    console.log('League Music Tournament matches page loaded successfully');
    
    // Load matches from Firebase
    await loadMatchesFromFirebase();
    
    // Load tournament stats
    await loadTournamentStats();
    
    if (allMatches.length > 0) {
        displayMatches(allMatches);
        updateResultsCount(allMatches.length);
    } else {
        showNoMatches();
    }
    
 
});

// Load matches from Firebase
async function loadMatchesFromFirebase() {
    try {
        console.log('📥 Loading matches from Firebase...');
        
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        if (snapshot.empty) {
            console.error('❌ No matches found in Firebase');
            console.log('💡 Run init-matches.html to create matches');
            allMatches = [];
            return;
        }
        
        console.log(`✅ Loaded ${snapshot.size} matches from Firebase`);
        
        // Convert Firebase docs to match array
        allMatches = [];
        
        snapshot.forEach(doc => {
            const match = doc.data();
            
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
            
            allMatches.push({
                id: match.matchId,
                tournament: 'Anthems Arena Championship', // ✅ Updated tournament name
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

// Sort matches array
// Sort matches array
function sortMatchesArray(matches, sortType) {
    const sorted = [...matches];

    switch (sortType) {
        case 'date-desc':
            // ✅ Newest/Urgent First
            return sorted.sort((a, b) => {
                // Priority 1: Live matches first
                if (a.status === 'live' && b.status !== 'live') return -1;
                if (b.status === 'live' && a.status !== 'live') return 1;
                
                // Priority 2: Both live - sort by most votes
                if (a.status === 'live' && b.status === 'live') {
                    return b.totalVotes - a.totalVotes;
                }
                
                // Priority 3: Upcoming matches - sort by start date (soonest first)
                if (a.status === 'upcoming' && b.status === 'upcoming') {
                    const dateA = a.date ? new Date(a.date) : new Date('2099-12-31');
                    const dateB = b.date ? new Date(b.date) : new Date('2099-12-31');
                    return dateA - dateB; // Soonest first
                }
                
                // Priority 4: Upcoming before completed
                if (a.status === 'upcoming' && b.status === 'completed') return -1;
                if (b.status === 'upcoming' && a.status === 'completed') return 1;
                
                // Priority 5: Completed matches - newest first
                if (a.status === 'completed' && b.status === 'completed') {
                    const dateA = a.date ? new Date(a.date) : new Date(0);
                    const dateB = b.date ? new Date(b.date) : new Date(0);
                    return dateB - dateA; // Newest first
                }
                
                return 0;
            });
            
        case 'date-asc':
            // ✅ Oldest/Completed First
            return sorted.sort((a, b) => {
                // Priority 1: Completed matches first (oldest first)
                if (a.status === 'completed' && b.status !== 'completed') return -1;
                if (b.status === 'completed' && a.status !== 'completed') return 1;
                
                // Priority 2: Both completed - sort by oldest first
                if (a.status === 'completed' && b.status === 'completed') {
                    const dateA = a.date ? new Date(a.date) : new Date(0);
                    const dateB = b.date ? new Date(b.date) : new Date(0);
                    return dateA - dateB; // Oldest first
                }
                
                // Priority 3: Upcoming matches - sort by start date (earliest first)
                if (a.status === 'upcoming' && b.status === 'upcoming') {
                    const dateA = a.date ? new Date(a.date) : new Date('2099-12-31');
                    const dateB = b.date ? new Date(b.date) : new Date('2099-12-31');
                    return dateA - dateB; // Earliest first
                }
                
                // Priority 4: Live matches last (by fewest votes)
                if (a.status === 'live' && b.status === 'live') {
                    return a.totalVotes - b.totalVotes; // Fewest votes first
                }
                
                // Priority 5: Completed before upcoming before live
                if (a.status === 'completed' && b.status === 'upcoming') return -1;
                if (b.status === 'completed' && a.status === 'upcoming') return 1;
                if (a.status === 'upcoming' && b.status === 'live') return -1;
                if (b.status === 'upcoming' && a.status === 'live') return 1;
                
                return 0;
            });
            
        case 'votes-desc':
            return sorted.sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0));
            
        case 'close':
            return sorted.sort((a, b) => {
                const diffA = Math.abs((a.competitor1.percentage || 50) - (a.competitor2.percentage || 50));
                const diffB = Math.abs((b.competitor1.percentage || 50) - (b.competitor2.percentage || 50));
                return diffA - diffB;
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
    if (sortFilter) sortFilter.value = 'date-desc';

    currentFilters = {
        search: '',
        tournament: 'all',
        round: 'all',
        status: 'all',
        sort: 'date-desc'
    };

    displayMatches(allMatches);
    updateResultsCount(allMatches.length);
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

// Vote now (redirect to voting page)
function voteNow(matchId) {
    console.log('Vote on match:', matchId);
    showNotification('Redirecting to voting page...', 'info');
    
    setTimeout(() => {
        window.location.href = `vote.html?match=${matchId}`;
    }, 500);
}

// Remind me (set notification for upcoming match)
function remindMe(matchId) {
    console.log('Set reminder for match:', matchId);
    showNotification('Reminder set! We\'ll notify you when voting opens.', 'success');
}

// Show match details (navigate to vote page)
function showMatchDetails(matchId) {
    console.log('Show details for match:', matchId);
    
    showNotification('Loading match details...', 'info');
    
    // Navigate to vote page after brief delay
    setTimeout(() => {
        window.location.href = `vote.html?match=${matchId}`;
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
// EXPORT FUNCTIONS
// ========================================

window.filterMatches = filterMatches;
window.sortMatches = sortMatches;
window.clearFilters = clearFilters;
window.loadMoreMatches = loadMoreMatches;
window.voteNow = voteNow;
window.showMatchDetails = showMatchDetails;

console.log('✅ Matches.js initialized - Firebase integration active');