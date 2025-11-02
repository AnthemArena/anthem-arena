// ========================================
// MY VOTES PAGE - LEAGUE MUSIC TOURNAMENT
// ========================================

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// State
let userId = null;
let allVotes = [];
let currentFilter = 'all';

// ========================================
// INITIALIZE
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🗳️ My Votes page loaded');
    
    // Get user ID
    userId = await getUserId();
    console.log('👤 User ID:', userId);
    
    // Load vote history
    await loadVoteHistory();
    
    // Setup filters
    setupFilters();
});

// ========================================
// GET USER ID
// ========================================

async function getUserId() {
    // Check localStorage first
    const stored = localStorage.getItem('tournamentUserId');
    if (stored) {
        console.log('🆔 Using stored user ID');
        return stored;
    }
    
    console.log('🆔 Generating new user ID...');
    
    // Get IP address
    let ipAddress = 'unknown';
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ipAddress = data.ip;
    } catch (error) {
        console.warn('⚠️ Could not get IP address');
    }
    
    // Generate browser fingerprint
    const fingerprint = generateBrowserFingerprint();
    
    // Combine and hash
    const combined = `${ipAddress}_${fingerprint}_salt2025`;
    const newUserId = btoa(combined).substring(0, 32);
    
    // Store it
    localStorage.setItem('tournamentUserId', newUserId);
    
    return newUserId;
}

function generateBrowserFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.language,
        navigator.platform,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        !!window.sessionStorage,
        !!window.localStorage,
        navigator.hardwareConcurrency || 0
    ].join('|');
    
    return btoa(components).substring(0, 16);
}

// ========================================
// LOAD VOTE HISTORY
// ========================================

async function loadVoteHistory() {
    try {
        console.log('📥 Loading vote history for user:', userId);
        
        // Query votes collection for this user
        const votesRef = collection(db, 'votes');
        const userVotesQuery = query(
            votesRef,
            where('userId', '==', userId)
        );
        
        const votesSnapshot = await getDocs(userVotesQuery);
        
        if (votesSnapshot.empty) {
            showNoVotesState();
            return;
        }
        
        console.log(`✅ Found ${votesSnapshot.size} votes`);
        
        // Get all vote data with match details
        const votePromises = votesSnapshot.docs.map(async (voteDoc) => {
            const voteData = voteDoc.data();
            
            // Get match details
            const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, voteData.matchId);
            const matchDoc = await getDoc(matchRef);
            
            if (!matchDoc.exists()) {
                console.warn('⚠️ Match not found:', voteData.matchId);
                return null;
            }
            
            const matchData = matchDoc.data();
            
            // Determine if this was an underdog pick or mainstream pick
            const votedForSong = voteData.choice; // 'song1' or 'song2'
            const song1Votes = matchData.song1.votes || 0;
            const song2Votes = matchData.song2.votes || 0;
            const totalMatchVotes = song1Votes + song2Votes;
            
            const votedSongVotes = votedForSong === 'song1' ? song1Votes : song2Votes;
            const votedSongPercentage = totalMatchVotes > 0 
                ? Math.round((votedSongVotes / totalMatchVotes) * 100) 
                : 50;
            
            // Categorize vote type
            let voteType = 'balanced';
            if (votedSongPercentage < 40) {
                voteType = 'underdog'; // Voted for the less popular song
            } else if (votedSongPercentage > 60) {
                voteType = 'mainstream'; // Voted for the more popular song
            } else {
                voteType = 'closeCall'; // Close match (40-60%)
            }
            
            const isCompleted = matchData.status === 'completed';
            const status = isCompleted ? 'completed' : 'live';
            
            // Get the song data for the one they voted for
            const votedSong = votedForSong === 'song1' ? matchData.song1 : matchData.song2;
            const opponentSong = votedForSong === 'song1' ? matchData.song2 : matchData.song1;
            
            // Determine song journey status (non-competitive)
            let songStatus = 'active'; // Default for ongoing matches
            if (isCompleted && matchData.winnerId) {
                const votedSongId = votedSong.id;
                songStatus = matchData.winnerId === votedSongId ? 'advanced' : 'eliminated';
            }
            
            return {
                id: voteDoc.id,
                matchId: voteData.matchId,
                choice: votedForSong,
                timestamp: voteData.timestamp,
                round: voteData.round || 1,
                votedForSeed: voteData.votedForSeed,
                votedForName: voteData.votedForName,
                votedForVideoId: votedSong.videoId,
                votedForArtist: votedSong.artist,
                opponentName: opponentSong.shortTitle,
                opponentSeed: opponentSong.seed,
                match: matchData,
                voteType: voteType,
                votedSongPercentage: votedSongPercentage,
                status: status,
                isCompleted: isCompleted,
                songStatus: songStatus // 'active', 'advanced', 'eliminated'
            };
        });
        
        allVotes = (await Promise.all(votePromises)).filter(v => v !== null);
        
        // Sort by timestamp (newest first)
        allVotes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        console.log('✅ Vote history loaded:', allVotes.length);
        
        // Update stats
        updateStats();
        
        // Display votes
        displayVotes();
        
        // Hide loading state
        document.getElementById('loadingState').style.display = 'none';
        
    } catch (error) {
        console.error('❌ Error loading vote history:', error);
        document.getElementById('loadingState').innerHTML = `
            <div class="no-votes-icon">⚠️</div>
            <h3>Error Loading History</h3>
            <p>Could not load your vote history. Please try again later.</p>
        `;
    }
}

// ========================================
// UPDATE STATS
// ========================================

function updateStats() {
    const totalVotes = allVotes.length;
    const completedVotes = allVotes.filter(v => v.isCompleted);
    const liveVotes = allVotes.filter(v => !v.isCompleted);
    
    // Categorize votes
    const underdogPicks = allVotes.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = allVotes.filter(v => v.voteType === 'mainstream').length;
    const closeCallPicks = allVotes.filter(v => v.voteType === 'closeCall').length;
    
    // Calculate majority alignment (for taste profile)
    const majorityAlignment = totalVotes > 0 
        ? Math.round((mainstreamPicks / totalVotes) * 100) 
        : 0;
    
    // Calculate voting streak (consecutive days)
    const votingStreak = calculateVotingStreak();
    
    // Get artist preferences
    const artistPreferences = getArtistPreferences();
    const favoriteArtist = artistPreferences[0];
    
    // Get song preferences
    const favoriteSongs = getSongPreferences();
    
    // 🎯 NON-COMPETITIVE STATS
    const journeyStats = calculateJourneyStats();
    const supportImpact = calculateSupportImpact();
    const tournamentCoverage = calculateTournamentCoverage();
    
    // ✅ SHOW STATS SECTIONS (they're hidden by default)
    document.getElementById('statsOverview').style.display = 'block';
    document.getElementById('filtersSection').style.display = 'block';
    
    // Update DOM - Basic Stats
    document.getElementById('totalVotes').textContent = totalVotes;
    document.getElementById('underdogPicks').textContent = underdogPicks;
    document.getElementById('mainstreamPicks').textContent = mainstreamPicks;
    document.getElementById('votingStreak').textContent = votingStreak;
    
    // Update DOM - Journey Stats
    document.getElementById('songsStillAlive').textContent = journeyStats.songsStillAlive;
    document.getElementById('songsAdvanced').textContent = journeyStats.songsAdvanced;
    document.getElementById('furthestRound').textContent = getRoundName(journeyStats.furthestRound);
    
    // Update DOM - Impact Stats
    document.getElementById('closeCalls').textContent = supportImpact.closeCalls;
    document.getElementById('roundsParticipated').textContent = supportImpact.roundsParticipated;
    
    // Update filter counts
    document.getElementById('countAll').textContent = totalVotes;
    document.getElementById('countUnderdog').textContent = underdogPicks;
    document.getElementById('countMainstream').textContent = mainstreamPicks;
    document.getElementById('countLive').textContent = liveVotes.length;
    
    // Determine taste profile
    const tasteProfile = getTasteProfile(majorityAlignment, totalVotes, underdogPicks);
    
    // Show achievement badge
    showAchievementBadge(tasteProfile, totalVotes, underdogPicks, mainstreamPicks, votingStreak, favoriteArtist, journeyStats);
    
    // Display favorite songs
    displayFavoriteSongs(favoriteSongs);
    
    // Display song journeys
    displaySongJourneys();
    
    // Display tournament coverage
    displayTournamentCoverage(tournamentCoverage);
    
    console.log('📊 Stats:', { 
        totalVotes, 
        underdogPicks,
        mainstreamPicks,
        closeCallPicks,
        majorityAlignment, 
        votingStreak,
        tasteProfile,
        favoriteArtist,
        favoriteSongs,
        journeyStats,
        supportImpact,
        tournamentCoverage
    });
}

// ========================================
// 🎯 JOURNEY STATS (NON-COMPETITIVE)
// ========================================

function calculateJourneyStats() {
    const uniqueSongs = new Map();
    
    allVotes.forEach(vote => {
        const songId = vote.votedForSong === 'song1' ? vote.match.song1.id : vote.match.song2.id;
        const songName = vote.votedForName;
        
        if (!uniqueSongs.has(songId)) {
            uniqueSongs.set(songId, {
                id: songId,
                name: songName,
                seed: vote.votedForSeed,
                videoId: vote.votedForVideoId,
                artist: vote.votedForArtist,
                rounds: [],
                highestRound: 0,
                status: 'active' // 'active', 'advanced', 'eliminated'
            });
        }
        
        const song = uniqueSongs.get(songId);
        song.rounds.push({
            round: vote.round,
            matchId: vote.matchId,
            opponent: vote.opponentName,
            result: vote.songStatus,
            percentage: vote.votedSongPercentage,
            timestamp: vote.timestamp
        });
        
        song.highestRound = Math.max(song.highestRound, vote.round);
        
        // Update overall status (most recent decisive result)
        if (vote.songStatus === 'eliminated') {
            song.status = 'eliminated';
        } else if (vote.songStatus === 'advanced' && song.status !== 'eliminated') {
            song.status = 'advanced';
        }
    });
    
    const songs = Array.from(uniqueSongs.values());
    
    // Calculate stats
    const songsStillAlive = songs.filter(s => s.status === 'active' || s.status === 'advanced').length;
    const songsAdvanced = songs.filter(s => s.status === 'advanced').length;
    const songsEliminated = songs.filter(s => s.status === 'eliminated').length;
    const furthestRound = Math.max(...allVotes.map(v => v.round), 1);
    
    return {
        songsStillAlive,
        songsAdvanced,
        songsEliminated,
        furthestRound,
        allSongs: songs
    };
}

// ========================================
// 🎯 SUPPORT IMPACT (NON-COMPETITIVE)
// ========================================

function calculateSupportImpact() {
    // Close calls where vote really mattered (45-55%)
    const closeCalls = allVotes.filter(v => {
        const percentage = v.votedSongPercentage;
        return percentage >= 45 && percentage <= 55;
    }).length;
    
    // Underdog rallies (voted underdog but they got >35%)
    const underdogRallies = allVotes.filter(v => {
        return v.voteType === 'underdog' && v.votedSongPercentage > 35;
    }).length;
    
    // Rounds participated in
    const roundsParticipated = new Set(allVotes.map(v => v.round)).size;
    
    // Unique matchups voted in
    const uniqueMatchups = new Set(allVotes.map(v => v.matchId)).size;
    
    return {
        closeCalls,
        underdogRallies,
        roundsParticipated,
        uniqueMatchups
    };
}

// ========================================
// 🎯 TOURNAMENT COVERAGE
// ========================================

function calculateTournamentCoverage() {
    const totalMatchesByRound = {
        1: 29, // Round 1
        2: 16, // Round 2
        3: 8,  // Round 3 (Sweet 16)
        4: 4,  // Quarterfinals
        5: 2,  // Semifinals
        6: 1   // Finals
    };
    
    const votedByRound = allVotes.reduce((acc, vote) => {
        acc[vote.round] = (acc[vote.round] || 0) + 1;
        return acc;
    }, {});
    
    const coverage = Object.entries(totalMatchesByRound).map(([round, total]) => {
        const voted = votedByRound[round] || 0;
        return {
            round: parseInt(round),
            roundName: getRoundName(parseInt(round)),
            voted: voted,
            total: total,
            percentage: total > 0 ? Math.round((voted / total) * 100) : 0
        };
    });
    
    // Calculate overall participation
    const totalPossibleVotes = Object.values(totalMatchesByRound).reduce((a, b) => a + b, 0);
    const totalActualVotes = Object.values(votedByRound).reduce((a, b) => a + b, 0);
    const overallParticipation = Math.round((totalActualVotes / totalPossibleVotes) * 100);
    
    return {
        byRound: coverage,
        overallParticipation
    };
}

// ========================================
// CALCULATE VOTING STREAK
// ========================================

function calculateVotingStreak() {
    if (allVotes.length === 0) return 0;
    
    // Get unique voting days
    const votingDays = [...new Set(allVotes.map(v => {
        const date = new Date(v.timestamp);
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }))].sort().reverse();
    
    if (votingDays.length === 0) return 0;
    
    // Check for consecutive days
    let streak = 1;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    
    // If no vote today, check if voted yesterday
    let checkDate = votingDays[0] === todayStr ? new Date() : new Date(Date.now() - 86400000);
    
    for (let i = 0; i < votingDays.length - 1; i++) {
        const currentDay = new Date(votingDays[i]);
        const nextDay = new Date(votingDays[i + 1]);
        
        const dayDiff = Math.floor((currentDay - nextDay) / 86400000);
        
        if (dayDiff === 1) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

// ========================================
// GET ARTIST PREFERENCES
// ========================================

function getArtistPreferences() {
    const artistCounts = {};
    
    allVotes.forEach(vote => {
        const artist = vote.votedForArtist || 'Unknown';
        artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    });
    
    // Sort by count
    return Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([artist, count]) => ({ artist, count }));
}

// ========================================
// GET SONG PREFERENCES
// ========================================

function getSongPreferences() {
    const songCounts = {};
    
    allVotes.forEach(vote => {
        const songName = vote.votedForName;
        const songSeed = vote.votedForSeed;
        const videoId = vote.votedForVideoId;
        const artist = vote.votedForArtist;
        
        if (!songCounts[songName]) {
            songCounts[songName] = {
                name: songName,
                seed: songSeed,
                videoId: videoId,
                artist: artist,
                count: 0,
                matches: []
            };
        }
        
        songCounts[songName].count++;
        songCounts[songName].matches.push({
            matchId: vote.matchId,
            round: vote.round,
            timestamp: vote.timestamp
        });
    });
    
    // Sort by count, then by seed
    return Object.values(songCounts)
        .sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count; // Most votes first
            }
            return a.seed - b.seed; // Then by seed
        })
        .slice(0, 5);  // Top 5
}

// ========================================
// DISPLAY FAVORITE SONGS
// ========================================

function displayFavoriteSongs(songs) {
    const container = document.getElementById('favoriteSongsSection');
    
    if (!container) {
        console.warn('⚠️ Favorite songs container not found');
        return;
    }
    
    if (songs.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    // Medal emojis for top 3
    const medals = ['🥇', '🥈', '🥉'];
    
    container.innerHTML = `
        <div class="favorite-songs-header">
            <h3 class="favorite-songs-title">🎵 Your Most Supported Songs</h3>
            <p class="favorite-songs-subtitle">Songs you've voted for the most across all matches</p>
        </div>
        <div class="favorite-songs-list">
            ${songs.map((song, index) => `
                <div class="favorite-song-item">
                    <div class="song-rank">
                        ${index < 3 ? medals[index] : `<span class="rank-number">${index + 1}</span>`}
                    </div>
                    <img 
                        src="https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg" 
                        alt="${song.name}"
                        class="song-thumbnail"
                        loading="lazy">
                    <div class="song-info">
                        <div class="song-name">${song.name}</div>
                        <div class="song-meta">
                            <span class="song-artist">${song.artist}</span>
                            <span class="song-separator">•</span>
                            <span class="song-seed">Seed #${song.seed}</span>
                            <span class="song-separator">•</span>
                            <span class="song-votes">${song.count} ${song.count === 1 ? 'vote' : 'votes'}</span>
                        </div>
                    </div>
                    <div class="song-badge ${song.count >= 3 ? 'superfan' : song.count >= 2 ? 'fan' : 'supporter'}">
                        ${song.count >= 3 ? '⭐ Superfan' : song.count >= 2 ? '💙 Fan' : '✓ Supporter'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.style.display = 'block';
}

// ========================================
// 🎯 DISPLAY SONG JOURNEYS
// ========================================

function displaySongJourneys() {
    const container = document.getElementById('songJourneysSection');
    
    if (!container) {
        console.warn('⚠️ Song journeys container not found');
        return;
    }
    
    const journeyStats = calculateJourneyStats();
    const songs = journeyStats.allSongs;
    
    if (songs.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    // Sort by highest round reached, then by seed
    songs.sort((a, b) => {
        if (b.highestRound !== a.highestRound) {
            return b.highestRound - a.highestRound;
        }
        return a.seed - b.seed;
    });
    
    // Take top 10
    const topSongs = songs.slice(0, 10);
    
    container.innerHTML = `
        <div class="song-journeys-header">
            <h3 class="journeys-title">🏆 Song Journeys</h3>
            <p class="journeys-subtitle">Track how far your favorite songs have gone</p>
        </div>
        <div class="journeys-list">
            ${topSongs.map(song => createSongJourneyCard(song)).join('')}
        </div>
    `;
    
    container.style.display = 'block';
}

function createSongJourneyCard(song) {
    // Sort rounds chronologically
    const rounds = song.rounds.sort((a, b) => a.round - b.round);
    
    // Status display
    const statusConfig = {
        'active': { icon: '🎵', label: 'Still Active', class: 'active' },
        'advanced': { icon: '✓', label: 'Advanced', class: 'advanced' },
        'eliminated': { icon: '○', label: 'Eliminated', class: 'eliminated' }
    };
    
    const status = statusConfig[song.status] || statusConfig['active'];
    
    // Generate round badges
    const roundBadges = rounds.map(r => {
        const resultClass = r.result === 'advanced' ? 'won' : r.result === 'eliminated' ? 'lost' : 'pending';
        const resultIcon = r.result === 'advanced' ? '✓' : r.result === 'eliminated' ? '✗' : '○';
        
        return `
            <div class="round-badge ${resultClass}" title="${r.opponent} - ${r.percentage}%">
                <span class="round-label">R${r.round}</span>
                <span class="round-result">${resultIcon}</span>
            </div>
        `;
    }).join('');
    
    // Journey summary
    const lastRound = rounds[rounds.length - 1];
    const journeySummary = song.status === 'eliminated' 
        ? `Eliminated in ${getRoundName(song.highestRound)}`
        : song.status === 'advanced'
        ? `Advanced to ${getRoundName(song.highestRound + 1)}`
        : `Currently in ${getRoundName(song.highestRound)}`;
    
    return `
        <div class="song-journey-card ${status.class}">
            <div class="journey-song-info">
                <img 
                    src="https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg" 
                    alt="${song.name}"
                    class="journey-thumbnail"
                    loading="lazy">
                <div class="journey-details">
                    <div class="journey-song-name">${song.name}</div>
                    <div class="journey-song-meta">
                        <span>${song.artist}</span>
                        <span class="separator">•</span>
                        <span>Seed #${song.seed}</span>
                        <span class="separator">•</span>
                        <span>${rounds.length} ${rounds.length === 1 ? 'match' : 'matches'}</span>
                    </div>
                </div>
            </div>
            
            <div class="journey-path">
                <div class="journey-rounds">
                    ${roundBadges}
                </div>
                <div class="journey-status ${status.class}">
                    <span class="status-icon">${status.icon}</span>
                    <span class="status-text">${journeySummary}</span>
                </div>
            </div>
        </div>
    `;
}

// ========================================
// 🎯 DISPLAY TOURNAMENT COVERAGE
// ========================================

function displayTournamentCoverage(coverage) {
    const container = document.getElementById('tournamentCoverageSection');
    
    if (!container) {
        console.warn('⚠️ Tournament coverage container not found');
        return;
    }
    
    if (coverage.byRound.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.innerHTML = `
        <div class="coverage-header">
            <h3 class="coverage-title">📊 Tournament Participation</h3>
            <p class="coverage-subtitle">Your engagement across all rounds</p>
        </div>
        
        <div class="coverage-overall">
            <div class="overall-stat">
                <span class="overall-percentage">${coverage.overallParticipation}%</span>
                <span class="overall-label">Overall Participation</span>
            </div>
        </div>
        
        <div class="coverage-breakdown">
            ${coverage.byRound.map(round => `
                <div class="round-coverage">
                    <div class="round-header">
                        <span class="round-name">${round.roundName}</span>
                        <span class="round-stats">${round.voted}/${round.total}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${round.percentage}%"></div>
                    </div>
                    <div class="round-percentage">${round.percentage}%</div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.style.display = 'block';
}

// ========================================
// GET TASTE PROFILE
// ========================================

function getTasteProfile(majorityAlignment, totalVotes, underdogPicks) {
    if (totalVotes < 5) {
        return {
            icon: '🎵',
            title: 'New Voter',
            description: 'Just getting started - vote more to unlock your taste profile!'
        };
    }
    
    // Prioritize underdog picks for profile
    const underdogPercentage = Math.round((underdogPicks / totalVotes) * 100);
    
    if (underdogPercentage >= 40) {
        return {
            icon: '🎭',
            title: 'Rebel Voter',
            description: `You champion the underdog ${underdogPercentage}% of the time!`
        };
    } else if (majorityAlignment >= 70) {
        return {
            icon: '🎯',
            title: 'Mainstream Maven',
            description: `Your taste aligns with the crowd ${majorityAlignment}% of the time`
        };
    } else if (majorityAlignment >= 55) {
        return {
            icon: '⚖️',
            title: 'Balanced Critic',
            description: 'You have your own taste but appreciate popular picks too'
        };
    } else if (underdogPercentage >= 25) {
        return {
            icon: '🎸',
            title: 'Independent Voter',
            description: 'You march to the beat of your own drum'
        };
    } else {
        return {
            icon: '🎵',
            title: 'Music Enthusiast',
            description: 'You appreciate all kinds of League music'
        };
    }
}

// ========================================
// SHOW ACHIEVEMENT BADGE
// ========================================

function showAchievementBadge(tasteProfile, totalVotes, underdogPicks, mainstreamPicks, votingStreak, favoriteArtist, journeyStats) {
    const badge = document.getElementById('achievementBadge');
    const title = document.getElementById('badgeTitle');
    const description = document.getElementById('badgeDescription');
    
    // Determine primary badge to show (non-competitive focus)
    let badgeData = null;
    
    // Priority: Journey achievements > Participation > Taste profile
    if (journeyStats.songsStillAlive >= 10) {
        badgeData = {
            title: '🌟 Champion Supporter',
            description: `${journeyStats.songsStillAlive} songs you voted for are still competing!`
        };
    } else if (votingStreak >= 7) {
        badgeData = {
            title: '🔥 Week Warrior',
            description: `${votingStreak} days voting streak! You're incredibly dedicated!`
        };
    } else if (journeyStats.furthestRound >= 5) {
        badgeData = {
            title: '🏆 Deep Run Supporter',
            description: `You've voted in matches all the way to ${getRoundName(journeyStats.furthestRound)}!`
        };
    } else if (underdogPicks >= 10) {
        badgeData = {
            title: '🎭 Underdog Champion',
            description: `You've voted for the underdog ${underdogPicks} times! True rebel!`
        };
    } else if (journeyStats.songsStillAlive >= 5) {
        badgeData = {
            title: '🎵 Song Champion',
            description: `${journeyStats.songsStillAlive} of your picks are still in the tournament!`
        };
    } else if (votingStreak >= 5) {
        badgeData = {
            title: '🔥 Hot Streak',
            description: `${votingStreak} days of voting in a row!`
        };
    } else if (totalVotes >= 30) {
        badgeData = {
            title: '🗳️ Super Voter',
            description: `${totalVotes} votes cast! You're incredibly active!`
        };
    } else if (favoriteArtist && favoriteArtist.count >= 5) {
        badgeData = {
            title: `🎸 ${favoriteArtist.artist} Superfan`,
            description: `You've voted for ${favoriteArtist.artist} ${favoriteArtist.count} times!`
        };
    } else if (underdogPicks >= 5) {
        badgeData = {
            title: '🎭 Underdog Supporter',
            description: `${underdogPicks} underdog picks! You support the underdogs!`
        };
    } else if (totalVotes >= 20) {
        badgeData = {
            title: '🎵 Dedicated Fan',
            description: `${totalVotes} votes and counting!`
        };
    } else if (totalVotes >= 10) {
        badgeData = {
            title: `${tasteProfile.icon} ${tasteProfile.title}`,
            description: tasteProfile.description
        };
    } else if (totalVotes >= 5) {
        badgeData = {
            title: '🎵 Music Enthusiast',
            description: `${totalVotes} votes cast - keep going!`
        };
    }
    
    if (badgeData) {
        title.textContent = badgeData.title;
        description.textContent = badgeData.description;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// ========================================
// DISPLAY VOTES
// ========================================

function displayVotes() {
    const grid = document.getElementById('votesGrid');
    
    // Filter votes based on current filter
    let filteredVotes = allVotes;
    if (currentFilter === 'underdog') {
        filteredVotes = allVotes.filter(v => v.voteType === 'underdog');
    } else if (currentFilter === 'mainstream') {
        filteredVotes = allVotes.filter(v => v.voteType === 'mainstream');
    } else if (currentFilter === 'live') {
        filteredVotes = allVotes.filter(v => !v.isCompleted);
    }
    
    if (filteredVotes.length === 0) {
        grid.innerHTML = `
            <div class="no-votes-state">
                <div class="no-votes-icon">🔍</div>
                <h3>No ${currentFilter} votes found</h3>
                <p>Try a different filter</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredVotes.map(vote => createVoteCard(vote)).join('');
}

// ========================================
// CREATE VOTE CARD
// ========================================

function createVoteCard(vote) {
    const match = vote.match;
    const song1 = match.song1;
    const song2 = match.song2;
    
    // Determine which song user voted for
    const votedSong = vote.choice === 'song1' ? song1 : song2;
    const opponentSong = vote.choice === 'song1' ? song2 : song1;
    
    // Status icon based on vote type
    const statusIcon = {
        'underdog': '🎭',
        'mainstream': '🎯',
        'closeCall': '⚖️'
    }[vote.voteType] || '🗳️';
    
    // Vote type label
    const voteTypeLabel = {
        'underdog': 'Underdog Pick',
        'mainstream': 'Mainstream Pick',
        'closeCall': 'Close Call'
    }[vote.voteType] || 'Your Vote';
    
    // Current percentage
    const percentage = vote.votedSongPercentage;
    
    // Format timestamp
    const timestamp = new Date(vote.timestamp);
    const timeAgo = getTimeAgo(timestamp);
    
    // Get round name
    const roundName = getRoundName(vote.round);
    
    // Get tournament name
    const tournamentName = match.tournamentName || 'Anthem Arena Championship S1';
    
    // Determine card class
    const cardClass = vote.voteType;
    const statusClass = vote.isCompleted ? 'completed' : 'live';
    
    // Song journey indicator (non-competitive)
    let journeyIndicator = '';
    if (vote.songStatus === 'advanced') {
        journeyIndicator = '<div class="journey-indicator advanced">✓ Advanced</div>';
    } else if (vote.songStatus === 'eliminated') {
        journeyIndicator = '<div class="journey-indicator eliminated">Eliminated</div>';
    } else {
        journeyIndicator = '<div class="journey-indicator active">● Active</div>';
    }
    
    return `
        <div class="vote-card ${cardClass} ${statusClass}" data-type="${vote.voteType}">
            <div class="vote-status">${statusIcon}</div>
            
            <div class="vote-matchup">
                <img 
                    src="https://img.youtube.com/vi/${votedSong.videoId}/mqdefault.jpg" 
                    alt="${votedSong.shortTitle}" 
                    class="vote-thumbnail"
                    loading="lazy">
                
                <div class="vote-details">
                    <div class="vote-round">${tournamentName} • ${roundName}</div>
                    <h3 class="vote-title">
                        ${song1.shortTitle} <span style="color: rgba(255,255,255,0.4);">vs</span> ${song2.shortTitle}
                    </h3>
                    <p class="vote-choice">
                        You voted for: <strong>${votedSong.shortTitle}</strong>
                    </p>
                    <div class="vote-timestamp">${timeAgo}</div>
                </div>
            </div>
            
            <div class="vote-result">
                ${journeyIndicator}
                <div class="vote-percentage">${percentage}%</div>
                <div class="vote-type-label">${voteTypeLabel}</div>
                <div class="vote-status-label">${vote.isCompleted ? 'Completed' : 'Live'}</div>
                <a href="/vote.html?id=${vote.matchId}" class="view-match-btn">View Match →</a>
            </div>
        </div>
    `;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getRoundName(roundNumber) {
    const roundNames = {
        1: 'Round 1',
        2: 'Round 2',
        3: 'Round 3 (Sweet 16)',
        4: 'Quarterfinals',
        5: 'Semifinals',
        6: 'Finals'
    };
    return roundNames[roundNumber] || `Round ${roundNumber}`;
}

function getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ========================================
// SETUP FILTERS
// ========================================

function setupFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            filterButtons.forEach(b => b.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active');
            
            // Update filter
            currentFilter = btn.dataset.filter;
            
            // Re-display votes
            displayVotes();
            
            console.log('🔍 Filter changed to:', currentFilter);
        });
    });
}

// ========================================
// SHOW NO VOTES STATE
// ========================================

function showNoVotesState() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('noVotesState').style.display = 'block';
    
    // Keep stats hidden (they're hidden by default now)
    document.getElementById('statsOverview').style.display = 'none';
    document.getElementById('filtersSection').style.display = 'none';
    
    // Hide section header (share button, etc.)
    const sectionHeader = document.querySelector('.votes-section .section-header');
    if (sectionHeader) sectionHeader.style.display = 'none';
    
    console.log('📭 No votes found - showing empty state');
}

// ========================================
// SHARE STATS
// ========================================

function shareStats() {
    const totalVotes = allVotes.length;
    const underdogPicks = allVotes.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = allVotes.filter(v => v.voteType === 'mainstream').length;
    
    const majorityAlignment = totalVotes > 0 
        ? Math.round((mainstreamPicks / totalVotes) * 100) 
        : 0;
    
    const tasteProfile = getTasteProfile(majorityAlignment, totalVotes, underdogPicks);
    const journeyStats = calculateJourneyStats();
    const artistPreferences = getArtistPreferences();
    const favoriteArtist = artistPreferences[0];
    const favoriteSongs = getSongPreferences();
    const favoriteSong = favoriteSongs[0];
    
    // Generate share text (non-competitive framing)
    let shareText = `🎵 My Anthem Arena Championship Profile:\n\n` +
        `🗳️ ${totalVotes} votes cast\n` +
        `${tasteProfile.icon} ${tasteProfile.title}\n`;
    
    if (journeyStats.songsStillAlive > 0) {
        shareText += `✓ ${journeyStats.songsStillAlive} songs still competing\n`;
    }
    
    if (underdogPicks > 0) {
        shareText += `🎭 ${underdogPicks} underdog picks\n`;
    }
    
    if (favoriteSong) {
        shareText += `🎵 Most supported: ${favoriteSong.name}\n`;
    }
    
    if (favoriteArtist) {
        shareText += `🎸 Favorite artist: ${favoriteArtist.artist}\n`;
    }
    
    shareText += `\nVote for your favorite League music videos!`;
    
    // Update share preview
    document.getElementById('sharePreview').innerHTML = shareText.replace(/\n/g, '<br>');
    
    // Store for sharing
    window.currentShareText = shareText;
    
    // Show modal
    document.getElementById('shareModal').style.display = 'flex';
}

window.shareStats = shareStats;

function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
}

window.closeShareModal = closeShareModal;

// ========================================
// SHARE FUNCTIONS
// ========================================

function shareToTwitter() {
    const text = encodeURIComponent(window.currentShareText);
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

window.shareToTwitter = shareToTwitter;

function shareToFacebook() {
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
}

window.shareToFacebook = shareToFacebook;

function copyShareText() {
    navigator.clipboard.writeText(window.currentShareText).then(() => {
        showNotification('Stats copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Failed to copy', 'error');
    });
}

window.copyShareText = copyShareText;

// ========================================
// NOTIFICATION
// ========================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const colors = {
        success: '#00c896',
        error: '#ff4444',
        info: '#4a9eff'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${colors[type]};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        font-family: 'Lora', serif;
        font-weight: 600;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

console.log('✅ My Votes page initialized');