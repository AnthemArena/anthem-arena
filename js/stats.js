// ========================================
// STATS PAGE - LEAGUE MUSIC TOURNAMENT
// Main stats page controller
// ========================================

import { getAllMatches } from './api-client.js';
import { db } from './firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    getTournamentOverview, 
    getAllTimeSongRankings, 
    getUpsets,
    getSeedPerformance
} from './stats-queries.js';

/**
 * Show loading spinner with custom message
 */
function showLoadingSpinner(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const spinnerText = document.getElementById('spinner-text');
    
    if (overlay && spinnerText) {
        spinnerText.textContent = message;
        overlay.style.display = 'flex';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Hide loading spinner
 */
function hideLoadingSpinner() {
    const overlay = document.getElementById('loading-overlay');
    
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    }
}


const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// State
let allSongsData = [];
let tournamentOverview = null;
let songRankings = [];
let upsets = [];
let participationStats = null;
let seedPerformance = null;

// ========================================
// MAKE FUNCTIONS GLOBAL (MUST BE EARLY!)
// ========================================

// These need to be accessible from onclick handlers in HTML
window.showSongDetail = async function(seedNumber) {
    try {
        console.log('📊 Loading details for seed:', seedNumber);
        
        // Find song in rankings
        const song = songRankings.find(s => s.seed === seedNumber);
        if (!song) {
            console.error('Song not found in rankings');
            alert('Song not found!');
            return;
        }
        
        console.log('✅ Found song:', song.name);
        
 // ✅ NEW: Get all matches from edge cache
const allMatches = await getAllMatches();

console.log('📥 Total matches in database:', allMatches.length);
        
        const songMatches = [];
        
    allMatches.forEach(match => {
            
            // Check if this song is in the match
            const isSong1 = match.song1?.seed === seedNumber;
            const isSong2 = match.song2?.seed === seedNumber;
            
            if (isSong1 || isSong2) {
                console.log('✅ Found match:', match.matchId, match.status);
                const opponent = isSong1 ? match.song2 : match.song1;
                const songData = isSong1 ? match.song1 : match.song2;
                const isWinner = match.winnerId === songData.id;
                
                songMatches.push({
                    matchId: match.matchId,
                    round: match.round,
                    status: match.status,
                    opponent: opponent.shortTitle,
                    opponentSeed: opponent.seed,
                    votes: songData.votes || 0,
                    opponentVotes: opponent.votes || 0,
                    totalVotes: match.totalVotes || 0,
                    isWinner: isWinner,
                    date: match.date
                });
            }
        });
        
        console.log('🎯 Total matches found for this song:', songMatches.length);
        
        // Sort by round
        songMatches.sort((a, b) => a.round - b.round);
        
        // Render modal
        renderSongDetailModal(song, songMatches);
        
        // Show modal
        const modal = document.getElementById('songDetailModal');
        if (!modal) {
            console.error('❌ Modal element not found!');
            alert('Modal not found in HTML!');
            return;
        }
        
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        console.log('✅ Modal should be visible now');
        
    } catch (error) {
        console.error('❌ Error loading song details:', error);
        alert('Error: ' + error.message);
    }
};

window.closeSongDetail = function() {
    document.getElementById('songDetailModal').style.display = 'none';
    document.body.style.overflow = '';
};

// ========================================
// INITIALIZE
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // ✅ FIXED: Show spinner with correct message
    showLoadingSpinner('Loading statistics...');
    
    console.log('📊 Stats page loaded');
    
    try {
        // Load JSON data first (for YouTube stats)
        await loadSongData();
        
        // Load all stats from Firebase
        await loadAllStats();
        
        // Render stats sections
        renderAllStats();
        
        // Setup tab navigation
        setupTabs();
        
        console.log('✅ Stats page ready');
        
        // ✅ FIXED: Hide spinner before starting auto-refresh
        hideLoadingSpinner();
        
        // Start auto-refresh after data loads
        setTimeout(() => {
            startAutoRefresh();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error loading stats:', error);
        
        // ✅ FIXED: Hide spinner on error
        hideLoadingSpinner();
        
        // Show error message
        const overviewTab = document.getElementById('overview-stats');
        if (overviewTab) {
            overviewTab.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Error Loading Statistics</h3>
                    <p>Could not load tournament data. Please try refreshing the page.</p>
                    <button onclick="location.reload()" class="btn-retry">Retry</button>
                </div>
            `;
        }
    }
});

// ========================================
// LOAD SONG DATA FROM JSON
// ========================================

async function loadSongData() {
    try {
        const response = await fetch('/data/music-videos.json');
        allSongsData = await response.json();
        console.log('✅ Loaded song data:', allSongsData.length, 'songs');
    } catch (error) {
        console.error('❌ Error loading song data:', error);
    }
}

// ========================================
// LOAD ALL STATS
// ========================================

// ========================================
// LOAD ALL STATS
// ========================================

async function loadAllStats() {
    try {
        console.log('📥 Loading all stats...');
        
        // ✅ OPTIMIZED: Load stats in parallel (removed getParticipationStats)
        [
            tournamentOverview,
            songRankings,
            upsets,
            seedPerformance
        ] = await Promise.all([
            getTournamentOverview(ACTIVE_TOURNAMENT),
            getAllTimeSongRankings(ACTIVE_TOURNAMENT),
            getUpsets(ACTIVE_TOURNAMENT),
            getSeedPerformance(ACTIVE_TOURNAMENT)
        ]);
        
        // ✅ Set participationStats to null (we'll derive from tournamentOverview)
        participationStats = null;
        
        // Merge YouTube data into song rankings
        songRankings = songRankings.map(song => {
            const jsonData = allSongsData.find(s => s.seed === song.seed);
            return {
                ...song,
                views: jsonData?.views || 0,
                likes: jsonData?.likes || 0,
                videoId: jsonData?.videoId || ''
            };
        });
        
        console.log('✅ All stats loaded');
        console.log('Tournament Overview:', tournamentOverview);
        console.log('Song Rankings:', songRankings.length);
        console.log('Upsets:', upsets.length);
        console.log('Participation: Derived from overview (no direct Firebase query)');
        console.log('Seed Performance:', seedPerformance);
        
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}

// ========================================
// RENDER ALL STATS
// ========================================

function renderAllStats() {
    renderTournamentOverview();
    renderSongRankings();
    renderUpsets();
    renderParticipationStats();
    renderSeedPerformance();
    renderRecords();
}

// ========================================
// RENDER TOURNAMENT OVERVIEW
// ========================================

function renderTournamentOverview() {
    if (!tournamentOverview) return;
    
    const container = document.getElementById('overview-stats');
    if (!container) return;
    
    const { totalVotes, completedMatches, liveMatches, upcomingMatches, totalMatches } = tournamentOverview;
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card highlight">
                <div class="stat-icon">🗳️</div>
                <div class="stat-value">${totalVotes.toLocaleString()}</div>
                <div class="stat-label">Total Votes Cast</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-value">${completedMatches}</div>
                <div class="stat-label">Completed Matches</div>
                <div class="stat-sublabel">of ${totalMatches} total</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">🔴</div>
                <div class="stat-value">${liveMatches}</div>
                <div class="stat-label">Live Matches</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">⏰</div>
                <div class="stat-value">${upcomingMatches}</div>
                <div class="stat-label">Upcoming Matches</div>
            </div>
        </div>
        
        ${tournamentOverview.highestVoteMatch ? `
            <div class="featured-stat">
                <h3 class="featured-stat-title">🔥 Most Voted Match</h3>
                <div class="featured-stat-content">
                    <div class="featured-matchup">
                        <span class="song-name">${tournamentOverview.highestVoteMatch.song1}</span>
                        <span class="vs">vs</span>
                        <span class="song-name">${tournamentOverview.highestVoteMatch.song2}</span>
                    </div>
                    <div class="featured-votes">
                        ${tournamentOverview.highestVoteMatch.totalVotes.toLocaleString()} total votes
                    </div>
                    <div class="featured-breakdown">
                        ${tournamentOverview.highestVoteMatch.song1Votes.toLocaleString()} - ${tournamentOverview.highestVoteMatch.song2Votes.toLocaleString()}
                    </div>
                </div>
            </div>
        ` : ''}
        
        ${tournamentOverview.closestMatch ? `
            <div class="featured-stat">
                <h3 class="featured-stat-title">⚖️ Closest Match</h3>
                <div class="featured-stat-content">
                    <div class="featured-matchup">
                        <span class="song-name">${tournamentOverview.closestMatch.song1}</span>
                        <span class="vs">vs</span>
                        <span class="song-name">${tournamentOverview.closestMatch.song2}</span>
                    </div>
                    <div class="featured-votes">
                        ${tournamentOverview.closestMatch.song1Percent.toFixed(1)}% - ${tournamentOverview.closestMatch.song2Percent.toFixed(1)}%
                    </div>
                    <div class="featured-breakdown">
                        Separated by just ${tournamentOverview.closestMatch.voteDiff} ${tournamentOverview.closestMatch.voteDiff === 1 ? 'vote' : 'votes'}!
                    </div>
                </div>
            </div>
        ` : ''}
        
        ${tournamentOverview.biggestBlowout ? `
            <div class="featured-stat">
                <h3 class="featured-stat-title">💥 Biggest Blowout</h3>
                <div class="featured-stat-content">
                    <div class="featured-matchup">
                        <span class="song-name winner">${tournamentOverview.biggestBlowout.winner}</span>
                        <span class="vs">demolished</span>
                        <span class="song-name loser">${tournamentOverview.biggestBlowout.loser}</span>
                    </div>
                    <div class="featured-votes">
                        ${tournamentOverview.biggestBlowout.winnerPercent.toFixed(1)}% - ${tournamentOverview.biggestBlowout.loserPercent.toFixed(1)}%
                    </div>
                </div>
            </div>
        ` : ''}
    `;
}

// ========================================
// RENDER SONG RANKINGS
// ========================================

function renderSongRankings() {
    const container = document.getElementById('song-rankings');
    if (!container || !songRankings.length) return;
    
    container.innerHTML = `
        <div class="rankings-controls">
            <div class="sort-buttons">
                <button class="sort-btn active" data-sort="votes">Most Votes</button>
                <button class="sort-btn" data-sort="winRate">Best Win Rate</button>
                <button class="sort-btn" data-sort="youtube">YouTube Views</button>
            </div>
        </div>
        
        <div class="rankings-table">
            <div class="rankings-header">
                <div class="rank-col">#</div>
                <div class="song-col">Song</div>
                <div class="stats-col">Tournament Record</div>
                <div class="votes-col">Total Votes</div>
                <div class="youtube-col">YouTube Stats</div>
            </div>
            
            <div class="rankings-body" id="rankings-list">
                ${renderRankingsList(songRankings, 'votes')}
            </div>
        </div>
    `;
    
    // Setup sort buttons
    const sortButtons = document.querySelectorAll('.sort-btn');
    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            sortButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const sortBy = btn.dataset.sort;
            const sorted = sortRankings(songRankings, sortBy);
            
            document.getElementById('rankings-list').innerHTML = renderRankingsList(sorted, sortBy);
        });
    });
}

function sortRankings(rankings, sortBy) {
    const sorted = [...rankings];
    
    switch(sortBy) {
        case 'votes':
            sorted.sort((a, b) => b.totalVotes - a.totalVotes);
            break;
        case 'winRate':
            sorted.sort((a, b) => {
                if (b.winRate === a.winRate) {
                    return b.matchesPlayed - a.matchesPlayed;
                }
                return b.winRate - a.winRate;
            });
            break;
        case 'youtube':
            sorted.sort((a, b) => b.views - a.views);
            break;
    }
    
    return sorted;
}

function renderRankingsList(rankings, sortBy) {
    return rankings.map((song, index) => `
        <div class="ranking-row ${index < 3 ? 'top-tier' : ''} clickable" 
             onclick="showSongDetail(${song.seed})"
             style="cursor: pointer;">
            <div class="rank-col">
                <span class="rank-number ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}">
                    ${index + 1}
                </span>
            </div>
            
            <div class="song-col">
                <div class="song-info">
                    <img 
                        src="https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg" 
                        alt="${song.name}"
                        class="song-thumbnail"
                        loading="lazy">
                    <div class="song-details">
                        <div class="song-name">${song.name}</div>
                        <div class="song-artist">${song.artist}</div>
                        <div class="song-seed">Seed #${song.seed}</div>
                    </div>
                </div>
            </div>
            
            <div class="stats-col">
                <div class="record-display">
                    <span class="record">${song.winRecord}</span>
                    <span class="win-rate ${song.winRate >= 70 ? 'excellent' : song.winRate >= 50 ? 'good' : 'poor'}">
                        ${song.winRate}% win rate
                    </span>
                </div>
            </div>
            
            <div class="votes-col">
                <div class="votes-display">
                    ${song.totalVotes.toLocaleString()}
                </div>
            </div>
            
            <div class="youtube-col">
                <div class="youtube-stats">
                    <div class="yt-stat">
                        <span class="yt-icon">👁️</span>
                        <span class="yt-value">${formatNumber(song.views)}</span>
                    </div>
                    <div class="yt-stat">
                        <span class="yt-icon">👍</span>
                        <span class="yt-value">${formatNumber(song.likes)}</span>
                    </div>
                </div>
            </div>
            
            <div class="click-indicator">
                <i class="fas fa-chevron-right"></i>
            </div>
        </div>
    `).join('');
}

// ========================================
// RENDER SONG DETAIL MODAL
// ========================================

async function renderSongDetailModal(song, matches) {
    const header = document.getElementById('songDetailHeader');
    const body = document.getElementById('songDetailBody');
    
    // ✅ NEW: Load historical data
    const allTimeStats = await getSongAllTimeStats(song.seed);
    const currentForm = await getCurrentTournamentForm(song.seed);
    
    // Header (same as before but add all-time stats)
    header.innerHTML = `
        <div class="song-detail-info">
            <img 
                src="https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg" 
                alt="${song.name}"
                class="song-detail-thumbnail">
            <div class="song-detail-meta">
                <h2 class="song-detail-title">${song.name}</h2>
                <p class="song-detail-artist">${song.artist}</p>
                <div class="song-detail-stats">
                    <span class="stat-badge">Seed #${song.seed}</span>
                    <span class="stat-badge">${song.winRecord} Current</span>
                    ${allTimeStats ? `
                        <span class="stat-badge highlight">
                            ${allTimeStats.record} All-Time
                        </span>
                        ${allTimeStats.championships > 0 ? `
                            <span class="stat-badge champion">
                                ${allTimeStats.championships}x Champion 🏆
                            </span>
                        ` : ''}
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    // Body - Add tournament history section
    let bodyHTML = '';
    
    // ✅ NEW: All-Time Stats Section
    if (allTimeStats && allTimeStats.tournamentHistory.length > 0) {
        bodyHTML += `
            <div class="song-history-section">
                <h3 class="section-title">📚 Tournament History</h3>
                <div class="tournament-history">
                    ${allTimeStats.tournamentHistory.map(t => `
                        <div class="history-item">
                            <span class="history-year">${t.year}</span>
                            <span class="history-tournament">${t.tournament}</span>
                            <span class="history-record">${t.record}</span>
                            <span class="history-finish ${t.finish.includes('Champion') ? 'champion' : ''}">
                                ${t.finish}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // ✅ NEW: Current Form Section
    if (currentForm) {
        bodyHTML += `
            <div class="current-form-section">
                <h3 class="section-title">📈 Current Tournament Form</h3>
                <div class="form-stats">
                    <div class="form-stat">
                        <span class="form-label">Record</span>
                        <span class="form-value">${currentForm.currentRecord}</span>
                    </div>
                    <div class="form-stat">
                        <span class="form-label">Avg Vote Share</span>
                        <span class="form-value">${currentForm.avgVoteShare}%</span>
                    </div>
                    <div class="form-stat">
                        <span class="form-label">Momentum</span>
                        <span class="form-value">${currentForm.momentum}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Existing match history (keep your current code)
    bodyHTML += '<div class="song-matches">';
    
    const completedMatches = matches.filter(m => m.status === 'completed');
    const liveMatches = matches.filter(m => m.status === 'live');
    
    if (liveMatches.length > 0) {
        bodyHTML += `
            <div class="matches-section">
                <h3 class="section-title">🔴 Live Now</h3>
                ${liveMatches.map(match => renderMatchRow(song, match)).join('')}
            </div>
        `;
    }
    
    if (completedMatches.length > 0) {
        bodyHTML += `
            <div class="matches-section">
                <h3 class="section-title">✅ Current Tournament Matches</h3>
                ${completedMatches.map(match => renderMatchRow(song, match)).join('')}
            </div>
        `;
    }
    
    bodyHTML += '</div>';
    
    body.innerHTML = bodyHTML;
}

// ========================================
// RENDER MATCH ROW
// ========================================

function renderMatchRow(song, match) {
    const percentage = match.totalVotes > 0 
        ? Math.round((match.votes / match.totalVotes) * 100) 
        : 50;
    
    const resultClass = match.status === 'completed' 
        ? (match.isWinner ? 'won' : 'lost')
        : '';
    
    const resultIcon = match.status === 'completed'
        ? (match.isWinner ? '✅' : '❌')
        : (match.status === 'live' ? '🔴' : '⏰');
    
    return `
        <div class="match-row ${resultClass}" onclick="window.location.href='/vote.html?match=${match.matchId}'">
            <div class="match-round">${getRoundName(match.round)}</div>
            <div class="match-opponent">
                <span class="vs-label">vs</span>
                <span class="opponent-name">#${match.opponentSeed} ${match.opponent}</span>
            </div>
            <div class="match-result">
                ${match.status === 'completed' ? `
                    <span class="result-icon">${resultIcon}</span>
                    <span class="result-score">${match.votes}-${match.opponentVotes}</span>
                    <span class="result-percentage">(${percentage}%)</span>
                ` : match.status === 'live' ? `
                    <span class="live-badge">🔴 Live</span>
                    <span class="result-percentage">${percentage}%</span>
                ` : `
                    <span class="upcoming-badge">⏰ Upcoming</span>
                `}
            </div>
        </div>
    `;
}

// ========================================
// RENDER UPSETS
// ========================================

function renderUpsets() {
    const container = document.getElementById('upsets-list');
    if (!container) return;
    
    if (upsets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✅</div>
                <h3>No Upsets Yet!</h3>
                <p>All higher seeds have won so far. Chalk prevails!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="upsets-grid">
            ${upsets.map((upset, index) => `
                <div class="upset-card ${index === 0 ? 'biggest-upset' : ''}">
                    ${index === 0 ? '<div class="upset-badge">🔥 BIGGEST UPSET</div>' : ''}
                    
                    <div class="upset-header">
                        <span class="round-badge">${getRoundName(upset.round)}</span>
                        <span class="seed-diff">-${upset.seedDiff} seed upset</span>
                    </div>
                    
                    <div class="upset-matchup">
                        <div class="upset-winner">
                            <div class="seed-badge winner">#${upset.winnerSeed}</div>
                            <div class="song-name">${upset.winner}</div>
                            <div class="vote-percent winner">${upset.winnerPercent}%</div>
                        </div>
                        
                        <div class="upset-vs">defeated</div>
                        
                        <div class="upset-loser">
                            <div class="seed-badge loser">#${upset.loserSeed}</div>
                            <div class="song-name">${upset.loser}</div>
                            <div class="vote-percent loser">${upset.loserPercent}%</div>
                        </div>
                    </div>
                    
                    <div class="upset-stats">
                        ${upset.totalVotes.toLocaleString()} votes • ${upset.voteDiff} vote margin
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ========================================
// RENDER PARTICIPATION STATS
// ========================================

// ========================================
// RENDER PARTICIPATION STATS
// ========================================

function renderParticipationStats() {
    if (!tournamentOverview) return;
    
    const container = document.getElementById('participation-stats');
    if (!container) return;
    
    const { totalVotes, completedMatches, liveMatches, upcomingMatches, totalMatches } = tournamentOverview;
    
    // ✅ Calculate average votes per match
    const avgVotesPerMatch = completedMatches > 0 
        ? Math.round(totalVotes / completedMatches) 
        : 0;
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card highlight">
                <div class="stat-icon">🗳️</div>
                <div class="stat-value">${totalVotes.toLocaleString()}</div>
                <div class="stat-label">Total Votes Cast</div>
                <div class="stat-sublabel">Across all matches</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-value">${completedMatches}</div>
                <div class="stat-label">Completed Matches</div>
                <div class="stat-sublabel">of ${totalMatches} total</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <div class="stat-value">${avgVotesPerMatch}</div>
                <div class="stat-label">Avg Votes Per Match</div>
                <div class="stat-sublabel">From completed matches</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">🔴</div>
                <div class="stat-value">${liveMatches}</div>
                <div class="stat-label">Live Matches</div>
                <div class="stat-sublabel">Vote now!</div>
            </div>
        </div>
        
        <div class="participation-insights">
            <h3 class="chart-title">📈 Tournament Progress</h3>
            <div class="progress-stats">
                <div class="progress-stat">
                    <span class="progress-label">Tournament Completion</span>
                    <div class="progress-bar-wrapper">
                        <div class="progress-bar-fill" style="width: ${Math.round((completedMatches / totalMatches) * 100)}%"></div>
                        <span class="progress-percent">${Math.round((completedMatches / totalMatches) * 100)}%</span>
                    </div>
                </div>
                
                ${tournamentOverview.highestVoteMatch ? `
                    <div class="participation-highlight">
                        <span class="highlight-icon">🔥</span>
                        <div class="highlight-text">
                            <strong>Most Popular Match:</strong>
                            ${tournamentOverview.highestVoteMatch.song1} vs ${tournamentOverview.highestVoteMatch.song2}
                            (${tournamentOverview.highestVoteMatch.totalVotes.toLocaleString()} votes)
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <p style="text-align: center; color: #999; margin-top: 2rem; font-size: 0.9rem;">
            Real-time stats powered by edge cache • Updates every 30 seconds
        </p>
    `;
}



// ========================================
// RENDER SEED PERFORMANCE
// ========================================

function renderSeedPerformance() {
    if (!seedPerformance) return;
    
    const container = document.getElementById('seed-performance');
    if (!container) return;
    
    const ranges = ['1-10', '11-20', '21-40', '41-64'];
    
    container.innerHTML = `
        <div class="seed-performance-grid">
            ${ranges.map(range => {
                const data = seedPerformance[range];
                const total = data.wins + data.losses;
                
                return `
                    <div class="seed-card">
                        <div class="seed-range">Seeds ${range}</div>
                        <div class="seed-record">${data.wins}-${data.losses}</div>
                        <div class="seed-winrate ${data.winRate >= 70 ? 'excellent' : data.winRate >= 50 ? 'good' : 'poor'}">
                            ${data.winRate}% win rate
                        </div>
                        <div class="seed-total">${total} matches</div>
                        
                        <div class="seed-bar">
                            <div class="seed-bar-fill" style="width: ${data.winRate}%"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="seed-insights">
            <h3>💡 Insights</h3>
            <ul class="insights-list">
                ${generateSeedInsights(seedPerformance)}
            </ul>
        </div>
    `;
}

function generateSeedInsights(seedPerformance) {
    const insights = [];
    
    // Top seeds dominance
    const topSeedsWinRate = seedPerformance['1-10'].winRate;
    if (topSeedsWinRate >= 80) {
        insights.push(`<li>🏆 Top 10 seeds are dominating with a ${topSeedsWinRate}% win rate!</li>`);
    } else if (topSeedsWinRate < 60) {
        insights.push(`<li>🚨 Chaos! Top 10 seeds only winning ${topSeedsWinRate}% of matches!</li>`);
    }
    
    // Underdog performance
    const lowSeedsWinRate = seedPerformance['41-64'].winRate;
    if (lowSeedsWinRate >= 20) {
        insights.push(`<li>🎭 Dark horses are alive! Seeds 41-64 winning ${lowSeedsWinRate}% of matches!</li>`);
    }
    
    // Mid-seeds
    const midSeedsWinRate = seedPerformance['11-20'].winRate;
    if (midSeedsWinRate >= 55) {
        insights.push(`<li>⚔️ Seeds 11-20 are competitive with a ${midSeedsWinRate}% win rate!</li>`);
    }
    
    if (insights.length === 0) {
        insights.push(`<li>📊 Tournament is progressing as expected based on seeding</li>`);
    }
    
    return insights.join('');
}

// ========================================
// RENDER RECORDS
// ========================================

function renderRecords() {
    const container = document.getElementById('tournament-records');
    if (!container || !tournamentOverview) return;
    
    container.innerHTML = `
        <div class="records-grid">
            ${tournamentOverview.highestVoteMatch ? `
                <div class="record-card">
                    <div class="record-icon">🔥</div>
                    <div class="record-title">Most Votes (Single Match)</div>
                    <div class="record-value">${tournamentOverview.highestVoteMatch.totalVotes.toLocaleString()}</div>
                    <div class="record-detail">
                        ${tournamentOverview.highestVoteMatch.song1} vs ${tournamentOverview.highestVoteMatch.song2}
                    </div>
                </div>
            ` : ''}
            
            ${tournamentOverview.closestMatch ? `
                <div class="record-card">
                    <div class="record-icon">⚖️</div>
                    <div class="record-title">Closest Match</div>
                    <div class="record-value">${tournamentOverview.closestMatch.voteDiff} votes</div>
                    <div class="record-detail">
                        ${tournamentOverview.closestMatch.song1} vs ${tournamentOverview.closestMatch.song2}
                    </div>
                </div>
            ` : ''}
            
            ${tournamentOverview.biggestBlowout ? `
                <div class="record-card">
                    <div class="record-icon">💥</div>
                    <div class="record-title">Biggest Blowout</div>
                    <div class="record-value">${tournamentOverview.biggestBlowout.winnerPercent.toFixed(1)}%</div>
                    <div class="record-detail">
                        ${tournamentOverview.biggestBlowout.winner} demolished ${tournamentOverview.biggestBlowout.loser}
                    </div>
                </div>
            ` : ''}
            
            ${upsets.length > 0 ? `
                <div class="record-card">
                    <div class="record-icon">🎭</div>
                    <div class="record-title">Biggest Upset</div>
<div class="record-value">-${upsets[0].seedDiff} seed upset</div>
                    <div class="record-detail">
                        #${upsets[0].winnerSeed} ${upsets[0].winner} beat #${upsets[0].loserSeed} ${upsets[0].loser}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// ========================================
// TAB NAVIGATION
// ========================================

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            
            // Remove active from all
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getRoundName(roundNumber) {
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

function formatNumber(num) {
    if (!num) return 'N/A';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function formatHour(hour) {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
}

console.log('✅ Stats.js loaded');

// ========================================
// HEAD-TO-HEAD COMPARISON (ENHANCED)
// ========================================

window.showHeadToHead = function() {
    const modal = document.getElementById('headToHeadModal');
    if (!modal) {
        console.error('Head-to-head modal not found');
        return;
    }
    
    // Populate song selectors
    const selector1 = document.getElementById('h2h-song1');
    const selector2 = document.getElementById('h2h-song2');
    
    const options = songRankings
        .sort((a, b) => a.seed - b.seed)
        .map(song => `<option value="${song.seed}">#${song.seed} ${song.name}</option>`)
        .join('');
    
    selector1.innerHTML = '<option value="">Select first song...</option>' + options;
    selector2.innerHTML = '<option value="">Select second song...</option>' + options;
    
    // Reset results
    document.getElementById('h2hResults').style.display = 'none';
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

window.compareHeadToHead = async function() {
    const seed1 = parseInt(document.getElementById('h2h-song1').value);
    const seed2 = parseInt(document.getElementById('h2h-song2').value);
    
    if (!seed1 || !seed2) {
        alert('Please select both songs!');
        return;
    }
    
    if (seed1 === seed2) {
        alert('Please select different songs!');
        return;
    }
    
    const song1 = songRankings.find(s => s.seed === seed1);
    const song2 = songRankings.find(s => s.seed === seed2);
    
    // Show loading state
    const container = document.getElementById('h2hResults');
    container.innerHTML = `
        <div class="h2h-loading">
            <div class="loading-spinner"></div>
            <p>Loading cross-tournament history...</p>
        </div>
    `;
    container.style.display = 'block';
    
    // ✅ NEW: Get cross-tournament H2H history
    const h2hHistory = await getCrossTournamentH2H(seed1, seed2);
    
    // Get current tournament matchup (if exists)
    const allMatches = await getAllMatches();
    let currentMatchup = null;
    
    allMatches.forEach(match => {
        const hasBoth = (match.song1?.seed === seed1 && match.song2?.seed === seed2) ||
                       (match.song1?.seed === seed2 && match.song2?.seed === seed1);
        
        if (hasBoth && match.status === 'completed') {
            const song1Data = match.song1.seed === seed1 ? match.song1 : match.song2;
            const song2Data = match.song1.seed === seed2 ? match.song1 : match.song2;
            
            currentMatchup = {
                round: match.round,
                song1Votes: song1Data.votes,
                song2Votes: song2Data.votes,
                totalVotes: match.totalVotes,
                winner: match.winnerId === 'song1' ? song1Data.shortTitle : song2Data.shortTitle
            };
        }
    });
    
    renderHeadToHeadComparison(song1, song2, currentMatchup, h2hHistory);
};

function renderHeadToHeadComparison(song1, song2, currentMatchup, h2hHistory) {
    const container = document.getElementById('h2hResults');
    
    // Determine overall H2H leader
    let h2hLeader = null;
    if (h2hHistory.hasHistory) {
        if (h2hHistory.song1Wins > h2hHistory.song2Wins) {
            h2hLeader = song1.name;
        } else if (h2hHistory.song2Wins > h2hHistory.song1Wins) {
            h2hLeader = song2.name;
        }
    }
    
    container.innerHTML = `
        <div class="h2h-comparison">
            <!-- Song 1 -->
            <div class="h2h-song ${h2hLeader === song1.name ? 'h2h-winner' : ''}">
                <img src="https://img.youtube.com/vi/${song1.videoId}/mqdefault.jpg" 
                     alt="${song1.name}"
                     class="h2h-thumbnail">
                <h3 class="h2h-name">${song1.name}</h3>
                <p class="h2h-artist">${song1.artist}</p>
                
                <div class="h2h-stats">
                    <div class="h2h-stat">
                        <span class="h2h-label">Seed</span>
                        <span class="h2h-value">#${song1.seed}</span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">Record</span>
                        <span class="h2h-value">${song1.winRecord}</span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">Win Rate</span>
                        <span class="h2h-value ${song1.winRate >= 70 ? 'excellent' : song1.winRate >= 50 ? 'good' : 'poor'}">
                            ${song1.winRate}%
                        </span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">Total Votes</span>
                        <span class="h2h-value">${song1.totalVotes.toLocaleString()}</span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">YouTube Views</span>
                        <span class="h2h-value">${formatNumber(song1.views)}</span>
                    </div>
                    ${h2hHistory.hasHistory ? `
                        <div class="h2h-stat h2h-record">
                            <span class="h2h-label">vs ${song2.name}</span>
                            <span class="h2h-value highlight">${h2hHistory.song1Wins}-${h2hHistory.song2Wins}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- VS Divider -->
            <div class="h2h-divider">
                ${h2hHistory.hasHistory ? `
                    <div class="h2h-matchup-history">
                        <div class="h2h-history-header">
                            <span class="h2h-history-icon">📚</span>
                            <h4>All-Time Matchup History</h4>
                        </div>
                        
                        <div class="h2h-overall-record">
                            <div class="h2h-record-badge ${h2hLeader === song1.name ? 'leading' : ''}">
                                ${song1.name}: ${h2hHistory.song1Wins}
                            </div>
                            <span class="h2h-record-divider">-</span>
                            <div class="h2h-record-badge ${h2hLeader === song2.name ? 'leading' : ''}">
                                ${song2.name}: ${h2hHistory.song2Wins}
                            </div>
                        </div>
                        
                        ${h2hLeader ? `
                            <p class="h2h-leader-text">
                                <strong>${h2hLeader}</strong> leads the all-time series
                            </p>
                        ` : `
                            <p class="h2h-leader-text">
                                Series tied at ${h2hHistory.song1Wins}-${h2hHistory.song2Wins}
                            </p>
                        `}
                        
                        <!-- Match History List -->
                        <div class="h2h-match-list">
                            <h5>Previous Meetings</h5>
                            ${h2hHistory.matches.map(match => `
                                <div class="h2h-match-item">
                                    <div class="h2h-match-header">
                                        <span class="h2h-match-tournament">${match.tournament}</span>
                                        <span class="h2h-match-round">${getRoundName(match.round)}</span>
                                    </div>
                                    <div class="h2h-match-score">
                                        <span class="${match.winnerName === song1.name ? 'winner' : ''}">
                                            ${match.song1Name}: ${match.song1Votes}
                                        </span>
                                        <span class="score-divider">-</span>
                                        <span class="${match.winnerName === song2.name ? 'winner' : ''}">
                                            ${match.song2Name}: ${match.song2Votes}
                                        </span>
                                    </div>
                                    <div class="h2h-match-winner">
                                        Winner: <strong>${match.winnerName}</strong>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        ${currentMatchup ? `
                            <div class="h2h-current-badge">
                                <span class="badge-icon">🔥</span>
                                Current Tournament: ${getRoundName(currentMatchup.round)}
                            </div>
                        ` : ''}
                    </div>
                ` : `
                    <div class="h2h-no-history">
                        <span class="h2h-vs">VS</span>
                        <div class="h2h-no-history-text">
                            <p class="h2h-never-met">🆕 First-Ever Matchup!</p>
                            <p class="h2h-never-met-sub">
                                These songs have never faced each other in tournament history
                            </p>
                        </div>
                        ${currentMatchup ? `
                            <div class="h2h-current-result">
                                <div class="h2h-current-label">Current Tournament Result</div>
                                <div class="h2h-current-round">${getRoundName(currentMatchup.round)}</div>
                                <div class="h2h-current-score">
                                    ${currentMatchup.song1Votes} - ${currentMatchup.song2Votes}
                                </div>
                                <div class="h2h-current-winner">
                                    Winner: <strong>${currentMatchup.winner}</strong>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `}
            </div>
            
            <!-- Song 2 -->
            <div class="h2h-song ${h2hLeader === song2.name ? 'h2h-winner' : ''}">
                <img src="https://img.youtube.com/vi/${song2.videoId}/mqdefault.jpg" 
                     alt="${song2.name}"
                     class="h2h-thumbnail">
                <h3 class="h2h-name">${song2.name}</h3>
                <p class="h2h-artist">${song2.artist}</p>
                
                <div class="h2h-stats">
                    <div class="h2h-stat">
                        <span class="h2h-label">Seed</span>
                        <span class="h2h-value">#${song2.seed}</span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">Record</span>
                        <span class="h2h-value">${song2.winRecord}</span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">Win Rate</span>
                        <span class="h2h-value ${song2.winRate >= 70 ? 'excellent' : song2.winRate >= 50 ? 'good' : 'poor'}">
                            ${song2.winRate}%
                        </span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">Total Votes</span>
                        <span class="h2h-value">${song2.totalVotes.toLocaleString()}</span>
                    </div>
                    <div class="h2h-stat">
                        <span class="h2h-label">YouTube Views</span>
                        <span class="h2h-value">${formatNumber(song2.views)}</span>
                    </div>
                    ${h2hHistory.hasHistory ? `
                        <div class="h2h-stat h2h-record">
                            <span class="h2h-label">vs ${song1.name}</span>
                            <span class="h2h-value highlight">${h2hHistory.song2Wins}-${h2hHistory.song1Wins}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
        
        <!-- Comparison Chart -->
        <div class="h2h-chart">
            <h4>Statistical Comparison</h4>
            ${renderComparisonBars(song1, song2)}
        </div>
    `;
    
    container.style.display = 'block';
}

function renderComparisonBars(song1, song2) {
    const comparisons = [
        { label: 'Total Votes', song1: song1.totalVotes, song2: song2.totalVotes },
        { label: 'Win Rate (%)', song1: song1.winRate, song2: song2.winRate },
        { label: 'YouTube Views', song1: song1.views, song2: song2.views },
        { label: 'YouTube Likes', song1: song1.likes, song2: song2.likes }
    ];
    
    return comparisons.map(comp => {
        const max = Math.max(comp.song1, comp.song2);
        const song1Percent = max > 0 ? (comp.song1 / max) * 100 : 50;
        const song2Percent = max > 0 ? (comp.song2 / max) * 100 : 50;
        
        const song1Better = comp.song1 > comp.song2;
        
        return `
            <div class="comparison-bar-container">
                <div class="comparison-label">${comp.label}</div>
                <div class="comparison-bars">
                    <div class="comparison-bar song1 ${song1Better ? 'winning' : ''}">
                        <div class="comparison-fill" style="width: ${song1Percent}%"></div>
                        <span class="comparison-value">${comp.label.includes('Rate') ? comp.song1 + '%' : formatNumber(comp.song1)}</span>
                    </div>
                    <div class="comparison-bar song2 ${!song1Better ? 'winning' : ''}">
                        <div class="comparison-fill" style="width: ${song2Percent}%"></div>
                        <span class="comparison-value">${comp.label.includes('Rate') ? comp.song2 + '%' : formatNumber(comp.song2)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.closeHeadToHead = function() {

    document.getElementById('headToHeadModal').style.display = 'none';
    document.body.style.overflow = '';
};


// ========================================
// REAL-TIME AUTO-REFRESH
// ========================================

let refreshInterval = null;
let lastRefreshTime = null;
let isRefreshing = false;

/**
 * Start auto-refresh if there are live matches
 */
async function startAutoRefresh() {
    // Check if there are any live matches
    const hasLiveMatches = tournamentOverview?.liveMatches > 0;
    
    if (!hasLiveMatches) {
        console.log('ℹ️ No live matches - auto-refresh disabled');
        hideRefreshIndicator();
        return;
    }
    
    console.log('🔄 Starting auto-refresh (live matches detected)');
    showRefreshIndicator();
    
    // Clear any existing interval
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // Refresh every 30 seconds
    refreshInterval = setInterval(async () => {
        if (!isRefreshing) {
            await refreshStats();
        }
    }, 30000); // 30 seconds
    
    // Update "last refreshed" timer every second
    setInterval(updateRefreshTimer, 1000);
}

/**
 * Refresh stats data
 */
async function refreshStats() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    console.log('🔄 Refreshing stats...');
    
    try {
        // Get current active tab
        const activeTab = document.querySelector('.tab-pane.active');
        const tabId = activeTab?.id;
        
        // Reload data based on active tab
        if (tabId === 'overview') {
            await loadOverviewTab();
        } else if (tabId === 'rankings') {
            await loadRankingsTab();
        } else if (tabId === 'upsets') {
            await loadUpsetsTab();
        } else if (tabId === 'participation') {
            await loadParticipationTab();
        }
        
        lastRefreshTime = new Date();
        console.log('✅ Stats refreshed');
        
        // Flash the refresh indicator
        flashRefreshIndicator();
        
    } catch (error) {
        console.error('❌ Error refreshing stats:', error);
    } finally {
        isRefreshing = false;
    }
}

/**
 * Show auto-refresh indicator
 */
function showRefreshIndicator() {
    const indicator = document.getElementById('autoRefreshIndicator');
    if (indicator) {
        indicator.style.display = 'flex';
        lastRefreshTime = new Date();
    }
}

/**
 * Hide auto-refresh indicator
 */
function hideRefreshIndicator() {
    const indicator = document.getElementById('autoRefreshIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

/**
 * Flash refresh indicator when data updates
 */
function flashRefreshIndicator() {
    const icon = document.querySelector('.refresh-icon i');
    if (icon) {
        icon.classList.add('spinning');
        setTimeout(() => {
            icon.classList.remove('spinning');
        }, 1000);
    }
}

/**
 * Update "last refreshed" timer
 */
function updateRefreshTimer() {
    if (!lastRefreshTime) return;
    
    const timerEl = document.querySelector('.refresh-timer');
    if (!timerEl) return;
    
    const now = new Date();
    const diff = Math.floor((now - lastRefreshTime) / 1000); // seconds
    
    let timeText;
    if (diff < 10) {
        timeText = 'Updated just now';
    } else if (diff < 60) {
        timeText = `Updated ${diff}s ago`;
    } else if (diff < 3600) {
        const mins = Math.floor(diff / 60);
        timeText = `Updated ${mins}m ago`;
    } else {
        const hours = Math.floor(diff / 3600);
        timeText = `Updated ${hours}h ago`;
    }
    
    timerEl.textContent = timeText;
}

/**
 * Stop auto-refresh (call when leaving page)
 */
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    hideRefreshIndicator();
}

// Start auto-refresh when page loads
window.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for initial data to load
    setTimeout(() => {
        startAutoRefresh();
    }, 2000);
});

// Stop auto-refresh when leaving page
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});

// Also start auto-refresh after initial load completes
// (Add this to your existing DOMContentLoaded handler)