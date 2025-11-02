// ========================================
// STATS PAGE - LEAGUE MUSIC TOURNAMENT
// Main stats page controller
// ========================================

import { db } from './firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    getTournamentOverview, 
    getAllTimeSongRankings, 
    getUpsets,
    getParticipationStats,
    getSeedPerformance
} from './stats-queries.js';

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
        
        // Get all matches for this song
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        console.log('📥 Total matches in database:', snapshot.size);
        
        const songMatches = [];
        
        snapshot.forEach(doc => {
            const match = doc.data();
            
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
    console.log('📊 Stats page loaded');
    
    // Load JSON data first (for YouTube stats)
    await loadSongData();
    
    // Load all stats from Firebase
    await loadAllStats();
    
    // Render stats sections
    renderAllStats();
    
    // Setup tab navigation
    setupTabs();
    
    console.log('✅ Stats page ready');
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

async function loadAllStats() {
    try {
        console.log('📥 Loading all stats...');
        
        // Load all stats in parallel
        [
            tournamentOverview,
            songRankings,
            upsets,
            participationStats,
            seedPerformance
        ] = await Promise.all([
            getTournamentOverview(ACTIVE_TOURNAMENT),
            getAllTimeSongRankings(ACTIVE_TOURNAMENT),
            getUpsets(ACTIVE_TOURNAMENT),
            getParticipationStats(),
            getSeedPerformance(ACTIVE_TOURNAMENT)
        ]);
        
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
        console.log('Participation:', participationStats);
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

function renderSongDetailModal(song, matches) {
    const header = document.getElementById('songDetailHeader');
    const body = document.getElementById('songDetailBody');
    
    // Header
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
                    <span class="stat-badge">${song.winRecord} Record</span>
                    <span class="stat-badge ${song.winRate >= 70 ? 'excellent' : song.winRate >= 50 ? 'good' : 'poor'}">
                        ${song.winRate}% Win Rate
                    </span>
                    <span class="stat-badge">${song.totalVotes.toLocaleString()} Total Votes</span>
                </div>
            </div>
        </div>
    `;
    
    // Body - Match History
    const completedMatches = matches.filter(m => m.status === 'completed');
    const liveMatches = matches.filter(m => m.status === 'live');
    const upcomingMatches = matches.filter(m => m.status === 'upcoming');
    
    let matchesHTML = '<div class="song-matches">';
    
    // Live Matches
    if (liveMatches.length > 0) {
        matchesHTML += `
            <div class="matches-section">
                <h3 class="section-title">🔴 Live Now</h3>
                ${liveMatches.map(match => renderMatchRow(song, match)).join('')}
            </div>
        `;
    }
    
    // Upcoming Matches
    if (upcomingMatches.length > 0) {
        matchesHTML += `
            <div class="matches-section">
                <h3 class="section-title">📅 Upcoming</h3>
                ${upcomingMatches.map(match => renderMatchRow(song, match)).join('')}
            </div>
        `;
    }
    
    // Completed Matches
    if (completedMatches.length > 0) {
        matchesHTML += `
            <div class="matches-section">
                <h3 class="section-title">✅ Match History</h3>
                ${completedMatches.map(match => renderMatchRow(song, match)).join('')}
            </div>
        `;
    }
    
    if (matches.length === 0) {
        matchesHTML += `
            <div class="no-matches">
                <p>No matches yet for this song</p>
            </div>
        `;
    }
    
    matchesHTML += '</div>';
    
    body.innerHTML = matchesHTML;
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

function renderParticipationStats() {
    if (!participationStats) return;
    
    const container = document.getElementById('participation-stats');
    if (!container) return;
    
    const { totalVotes, uniqueVoters, averageVotesPerUser, peakHour, votingHours } = participationStats;
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div class="stat-value">${uniqueVoters.toLocaleString()}</div>
                <div class="stat-label">Unique Voters</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <div class="stat-value">${averageVotesPerUser}</div>
                <div class="stat-label">Avg Votes Per User</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">⏰</div>
                <div class="stat-value">${formatHour(peakHour)}</div>
                <div class="stat-label">Peak Voting Hour</div>
            </div>
        </div>
        
        <div class="voting-chart">
            <h3 class="chart-title">Votes by Hour</h3>
            <div class="hour-chart">
                ${renderHourChart(votingHours)}
            </div>
        </div>
    `;
}

function renderHourChart(votingHours) {
    const maxVotes = Math.max(...Object.values(votingHours));
    
    let html = '<div class="hour-bars">';
    
    for (let hour = 0; hour < 24; hour++) {
        const votes = votingHours[hour] || 0;
        const heightPercent = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
        
        html += `
            <div class="hour-bar-wrapper" title="${formatHour(hour)}: ${votes} votes">
                <div class="hour-bar" style="height: ${heightPercent}%"></div>
                <div class="hour-label">${hour}</div>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
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