// ========================================
// MY VOTES PAGE - LEAGUE MUSIC TOURNAMENT
// ========================================

import { getAllMatches, getMatch } from './api-client.js';
import { db } from './firebase-config.js';
// Add these imports at the top of my-votes.js
import { checkAchievements, getCategoryInfo } from './achievement-tracker.js';
import { getAchievementsByCategory } from './achievements.js';

// ========================================
// NORMALIZE TIMESTAMP HELPER
// ========================================
function normalizeTimestamp(timestamp) {
    if (!timestamp) {
        console.warn('⚠️ Vote has no timestamp');
        return null; // Don't fake it!
    }
    
    // If it's already an ISO string, return it
    if (typeof timestamp === 'string' && timestamp.includes('T')) {
        return timestamp;
    }
    
    // If it's a Unix milliseconds number, convert to ISO
    if (typeof timestamp === 'number' || !isNaN(Number(timestamp))) {
        const ms = Number(timestamp);
        
        // Safety check: Reject obviously invalid timestamps
        const year2020 = 1577836800000; // Jan 1, 2020
        const year2030 = 1893456000000; // Jan 1, 2030
        
        if (ms < year2020 || ms > year2030) {
            console.warn(`⚠️ Invalid timestamp: ${ms}`);
            return null;
        }
        
        return new Date(ms).toISOString();
    }
    
    // Try parsing as date
    try {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    } catch (e) {
        console.warn('⚠️ Could not parse timestamp:', timestamp);
    }
    
    return null;
}

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
    await checkUpcomingMatches(); // ✅ Add this

    
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

// Add filter function:
function filterByTournament() {
    const selectedTournament = document.getElementById('tournament-select').value;
    
    let filteredVotes = selectedTournament === 'all' 
        ? allVotes 
        : allVotes.filter(v => v.match.tournament === selectedTournament);
    
    displayVotes(filteredVotes);
    updateStats(filteredVotes);
}

// ========================================
// LOAD VOTE HISTORY
// ========================================

// ========================================
// LOAD VOTE HISTORY (OPTIMIZED)
// ========================================

async function loadVoteHistory() {
    try {
        console.log('📥 Loading vote history for user:', userId);
        
        // ✅ FETCH FROM FIREBASE (source of truth)
        const { db } = await import('./firebase-config.js');
        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const votesQuery = query(collection(db, 'votes'), where('userId', '==', userId));
        const votesSnapshot = await getDocs(votesQuery);
        
        if (votesSnapshot.empty) {
            console.log('📭 No votes found in Firebase');
            showNoVotesState();
            return;
        }
        
        console.log(`✅ Found ${votesSnapshot.size} votes in Firebase`);
        
        // Convert Firebase votes to the format expected by the rest of the code
        const userVotes = {};
        votesSnapshot.forEach(doc => {
            const voteData = doc.data();
            userVotes[voteData.matchId] = {
                songId: voteData.choice, // 'song1' or 'song2'
                timestamp: voteData.timestamp,
                matchId: voteData.matchId
            };
        });
        
        // ✅ Also sync to localStorage for offline access
        localStorage.setItem('userVotes', JSON.stringify(userVotes));
        
        const voteIds = Object.keys(userVotes);
        
        console.log(`✅ Processing ${voteIds.length} votes`);
        
        // ✅ Get ALL matches from edge cache (single call)
        const allMatches = await getAllMatches();
        
        // Create a map for quick lookup
        const matchMap = new Map();
        allMatches.forEach(match => {
            matchMap.set(match.matchId, match);
        });
        
        // Build vote history from Firebase votes + cached matches
        const votePromises = voteIds.map(async (matchId) => {
            const voteData = userVotes[matchId];
            const matchData = matchMap.get(matchId);
            
            if (!matchData) {
                console.warn('⚠️ Match not found in cache:', matchId);
                return null;
            }
            
            // Determine if this was an underdog pick or mainstream pick
            const votedForSong = voteData.songId; // 'song1' or 'song2'
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
                voteType = 'underdog';
            } else if (votedSongPercentage > 60) {
                voteType = 'mainstream';
            } else {
                voteType = 'closeCall';
            }
            
            const isCompleted = matchData.status === 'completed';
            const status = isCompleted ? 'completed' : 'live';
            
            // Get the song data
            const votedSong = votedForSong === 'song1' ? matchData.song1 : matchData.song2;
            const opponentSong = votedForSong === 'song1' ? matchData.song2 : matchData.song1;
            
            // Determine song journey status
            let songStatus = 'active';
            if (isCompleted && matchData.winnerId) {
                const votedSongId = votedSong.id;
                songStatus = matchData.winnerId === votedSongId ? 'advanced' : 'eliminated';
            }
            
            return {
                id: matchId,
                matchId: matchId,
                choice: votedForSong,
                timestamp: normalizeTimestamp(voteData.timestamp),
                round: matchData.round || 1,
                votedForSeed: votedSong.seed,
                votedForName: votedSong.shortTitle || votedSong.title,
                votedForVideoId: votedSong.videoId,
                votedForArtist: votedSong.artist,
                opponentName: opponentSong.shortTitle || opponentSong.title,
                opponentSeed: opponentSong.seed,
                match: matchData,
                voteType: voteType,
                votedSongPercentage: votedSongPercentage,
                status: status,
                isCompleted: isCompleted,
                songStatus: songStatus
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

        await // Check for newly unlocked achievements
await checkAchievements(allVotes);

// Load and display all achievements
await loadAchievements();
        
        // Hide loading state
        document.getElementById('loadingState').style.display = 'none';
        
    } catch (error) {
        console.error('❌ Error loading vote history:', error);
        document.getElementById('loadingState').innerHTML = `
            <div class="no-votes-icon">⚠️</div>
            <h3>Error Loading History</h3>
            <p>Could not load your vote history. Please try refreshing the page.</p>
        `;
    }
}

// ========================================
// UPDATE STATS
// ========================================

// ========================================
// UPDATE STATS (COMBINED HERO SECTION)
// ========================================

// ========================================
// UPDATE STATS (COMBINED HERO SECTION)
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
    
    // Calculate voting streak
    const votingStreak = calculateVotingStreak();
    
    // Journey stats
    const journeyStats = calculateJourneyStats();
    const supportImpact = calculateSupportImpact();
    const tournamentCoverage = calculateTournamentCoverage();
    
    // Vote influence
    const voteInfluence = calculateVoteInfluence();
    
    // Taste profile
    const tasteProfile = getTasteProfile(majorityAlignment, totalVotes, underdogPicks);
    
    // Favorite songs
    const favoriteSongs = getSongPreferences();
    
    // ✅ UPDATE COMBINED HERO SECTION (with null checks)
    if (totalVotes > 0) {
        // Check if hero section exists
        const heroSection = document.getElementById('statsHeroSection');
        if (!heroSection) {
            console.error('❌ statsHeroSection element not found in DOM');
            return;
        }
        
        // Update profile badge (with null checks)
        const profileIcon = document.getElementById('heroProfileIcon');
        const profileTitle = document.getElementById('heroProfileTitle');
        const profileDescription = document.getElementById('heroProfileDescription');
        
if (profileIcon) profileIcon.innerHTML = tasteProfile.icon;
        if (profileTitle) profileTitle.textContent = tasteProfile.title;
        if (profileDescription) profileDescription.textContent = tasteProfile.description;
        
        // Update all stat values (with null checks)
        const totalVotesEl = document.getElementById('heroTotalVotes');
        const underdogPicksEl = document.getElementById('heroUnderdogPicks');
        const mainstreamPicksEl = document.getElementById('heroMainstreamPicks');
        const votingStreakEl = document.getElementById('heroVotingStreak');
        const songsAliveEl = document.getElementById('heroSongsAlive');
        const songsAdvancedEl = document.getElementById('heroSongsAdvanced');
        const furthestRoundEl = document.getElementById('heroFurthestRound');
        const closeCallsEl = document.getElementById('heroCloseCalls');
        const roundsParticipatedEl = document.getElementById('heroRoundsParticipated');
        const voteInfluenceEl = document.getElementById('heroVoteInfluence');
        
        if (totalVotesEl) totalVotesEl.textContent = totalVotes;
        if (underdogPicksEl) underdogPicksEl.textContent = underdogPicks;
        if (mainstreamPicksEl) mainstreamPicksEl.textContent = mainstreamPicks;
        if (votingStreakEl) votingStreakEl.textContent = votingStreak;
        if (songsAliveEl) songsAliveEl.textContent = journeyStats.songsStillAlive;
        if (songsAdvancedEl) songsAdvancedEl.textContent = journeyStats.songsAdvanced;
        if (furthestRoundEl) furthestRoundEl.textContent = getRoundName(journeyStats.furthestRound);
        if (closeCallsEl) closeCallsEl.textContent = supportImpact.closeCalls;
        if (roundsParticipatedEl) roundsParticipatedEl.textContent = supportImpact.roundsParticipated;
        if (voteInfluenceEl) voteInfluenceEl.textContent = voteInfluence;
        
        // Show hero section
        heroSection.style.display = 'block';
        
        // Show filters section
        const filtersSection = document.getElementById('filtersSection');
        if (filtersSection) filtersSection.style.display = 'block';
    }
    
    // Update filter counts (with null checks)
    const countAll = document.getElementById('countAll');
    const countUnderdog = document.getElementById('countUnderdog');
    const countMainstream = document.getElementById('countMainstream');
    const countLive = document.getElementById('countLive');
    
    if (countAll) countAll.textContent = totalVotes;
    if (countUnderdog) countUnderdog.textContent = underdogPicks;
    if (countMainstream) countMainstream.textContent = mainstreamPicks;
    if (countLive) countLive.textContent = liveVotes.length;
    
    // Display favorite songs
    displayFavoriteSongs(favoriteSongs);
    
    // Display song journeys
    displaySongJourneys();
    
    // Display tournament coverage
    displayTournamentCoverage(tournamentCoverage);
    
    console.log('📊 Stats updated successfully');
}


async function loadAchievements() {
    const { getUnlockedAchievementsFromFirebase } = await import('./achievement-tracker.js');
    
    console.log('🏆 Loading achievements from Firebase...');
    
    // Get unlocked achievements from Firebase
    const unlockedAchievements = await getUnlockedAchievementsFromFirebase();
    
    console.log(`✅ Loaded ${unlockedAchievements.length} unlocked achievements`);
    
    const achievementsGrid = document.getElementById('achievementsGrid');
    if (!achievementsGrid) return;
    
    achievementsGrid.innerHTML = '';
    
    // Group achievements by category
    const groupedAchievements = {};
    
    Object.values(ACHIEVEMENTS).forEach(achievement => {
        const category = achievement.category || 'general';
        if (!groupedAchievements[category]) {
            groupedAchievements[category] = [];
        }
        groupedAchievements[category].push(achievement);
    });
    
    // Display each category
    Object.entries(groupedAchievements).forEach(([category, achievements]) => {
        const categoryInfo = ACHIEVEMENT_CATEGORIES[category];
        const categoryName = categoryInfo?.name || category;
        
        const categorySection = document.createElement('div');
        categorySection.className = 'achievement-category';
        categorySection.innerHTML = `<h3 class="category-title">${categoryName}</h3>`;
        
        const categoryGrid = document.createElement('div');
        categoryGrid.className = 'category-grid';
        
        achievements.forEach(achievement => {
            const isUnlocked = unlockedAchievements.includes(achievement.id);
            
            const achievementCard = document.createElement('div');
            achievementCard.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'} rarity-${achievement.rarity}`;
            
            achievementCard.innerHTML = `
                <div class="achievement-icon">${isUnlocked ? achievement.icon : '🔒'}</div>
                <div class="achievement-info">
                    <div class="achievement-title">${isUnlocked ? achievement.name : '???'}</div>
                    <div class="achievement-description">${isUnlocked ? achievement.description : 'Hidden achievement'}</div>
                    ${achievement.xp ? `<div class="achievement-xp">+${achievement.xp} XP</div>` : ''}
                </div>
            `;
            
            categoryGrid.appendChild(achievementCard);
        });
        
        categorySection.appendChild(categoryGrid);
        achievementsGrid.appendChild(categorySection);
    });
    
    // Update achievements section header with count
    const achievementsSection = document.getElementById('achievementsSection');
    if (achievementsSection) {
        const totalAchievements = Object.keys(ACHIEVEMENTS).length;
        const sectionHeader = achievementsSection.querySelector('.section-header h2');
        if (sectionHeader) {
            sectionHeader.textContent = `Achievements (${unlockedAchievements.length}/${totalAchievements})`;
        }
    }
}


    
function createAchievementCategory(categoryId, categoryInfo, achievements) {
    // ✅ Only show unlocked count (not total, since locked are hidden)
    const unlockedAchievements = achievements.filter(a => a.isUnlocked);
    
    // ✅ Don't render category if no unlocked achievements
    if (unlockedAchievements.length === 0) {
        return '';
    }
    
    return `
        <div class="achievement-category" data-category="${categoryId}">
            <div class="category-header">
                <span class="category-icon" style="color: ${categoryInfo.color};">
                    ${categoryInfo.icon}
                </span>
                <h3 class="category-name">${categoryInfo.name}</h3>
                <span class="category-count">
                    ${unlockedAchievements.length} Unlocked
                </span>
            </div>
            
            <div class="achievement-grid">
                ${unlockedAchievements.map(ach => createAchievementCard(ach)).join('')}
            </div>
        </div>
    `;
}

/**
 * Create individual achievement card
 */
function createAchievementCard(achievement) {
    // ✅ We only render unlocked achievements now, so this is always unlocked
    const tierClass = achievement.tier || 'bronze';
    const rarityClass = achievement.rarity || 'common';
    
    return `
        <div class="achievement-card unlocked ${tierClass} ${rarityClass}">
            <div class="achievement-card-inner">
                <div class="achievement-icon-container">
                    <div class="achievement-icon">
                        ${achievement.icon}
                    </div>
                    <div class="achievement-shine"></div>
                </div>
                
                <div class="achievement-info">
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-description">${achievement.description}</div>
                    
                    ${achievement.progress ? `
                        <div class="achievement-progress-container">
                            <div class="achievement-progress-bar">
                                <div class="achievement-progress-fill" style="width: 100%"></div>
                            </div>
                            <div class="achievement-progress-text">COMPLETED ✓</div>
                        </div>
                    ` : ''}
                    
                    <div class="achievement-footer">
                        <span class="achievement-xp">+${achievement.xp} XP</span>
                        <span class="achievement-rarity ${rarityClass}">${achievement.rarity}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
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
// CHECK FOR UPCOMING MATCHES (USER'S SONGS)
// ========================================

async function checkUpcomingMatches() {
    if (allVotes.length === 0) return;
    
    // Get unique songs user has voted for
    const votedSongIds = new Set(allVotes.map(v => {
        return v.choice === 'song1' ? v.match.song1.id : v.match.song2.id;
    }));
    
 // ✅ NEW: Get matches from edge cache
const allMatches = await getAllMatches();
const upcomingMatches = [];

allMatches
    .filter(match => match.status === 'upcoming')
    .forEach(match => {
        const hasSong1 = votedSongIds.has(match.song1?.id);
        const hasSong2 = votedSongIds.has(match.song2?.id);
        
  if (hasSong1 || hasSong2) {
            upcomingMatches.push({
                id: match.matchId,
                ...match,
                userSong: hasSong1 ? match.song1 : match.song2
            });
        }
    });
    
    if (upcomingMatches.length === 0) return;
    
    // Sort by date (soonest first)
    upcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    displayUpcomingReminders(upcomingMatches);
}

function displayUpcomingReminders(matches) {
    const container = document.getElementById('upcomingRemindersSection');
    if (!container) return;
    
    const topMatches = matches.slice(0, 3); // Show top 3
    
    container.innerHTML = `
        <div class="reminders-header">
            <h3 class="reminders-title"><i class="fa-solid fa-bell"></i> Your Songs Coming Up</h3>
            <p class="reminders-subtitle">Songs you've supported have upcoming matches</p>
        </div>
        <div class="reminders-list">
            ${topMatches.map(match => {
                const timeUntil = getTimeUntilMatch(match.date);
                return `
                    <div class="reminder-card">
                        <img 
                            src="https://img.youtube.com/vi/${match.userSong.videoId}/mqdefault.jpg" 
                            alt="${match.userSong.shortTitle}"
                            class="reminder-thumbnail">
                        <div class="reminder-info">
                            <div class="reminder-song">${match.userSong.shortTitle}</div>
                            <div class="reminder-opponent">vs ${match.song1.id === match.userSong.id ? match.song2.shortTitle : match.song1.shortTitle}</div>
                            <div class="reminder-time"><i class="fa-solid fa-clock"></i> ${timeUntil}</div>
                        </div>
                        <a href="/vote.html?match=${match.id}" class="reminder-action">
                            Set Reminder →
                        </a>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.style.display = 'block';
}

function getTimeUntilMatch(dateString) {
    const matchDate = new Date(dateString);
    const now = new Date();
    const diff = matchDate - now;
    
    if (diff < 0) return 'Starting soon';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h`;
    return 'Starting soon';
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
    const medals = [
        '<i class="fa-solid fa-medal" style="color: #FFD700;"></i>', // Gold
        '<i class="fa-solid fa-medal" style="color: #C0C0C0;"></i>', // Silver
        '<i class="fa-solid fa-medal" style="color: #CD7F32;"></i>'  // Bronze
    ];
    
    container.innerHTML = `
        <div class="favorite-songs-header">
            <h3 class="favorite-songs-title"><i class="fa-solid fa-music"></i> Your Most Supported Songs</h3>
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
                        ${song.count >= 3 ? '<i class="fa-solid fa-star"></i> Superfan' : song.count >= 2 ? '<i class="fa-solid fa-heart"></i> Fan' : '✓ Supporter'}
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
            <h3 class="journeys-title"><i class="fa-solid fa-trophy"></i> Song Journeys</h3>
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
        'active': { icon: '<i class="fa-solid fa-music"></i>', label: 'Still Active', class: 'active' },
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

function displayJourneyMap() {
    const container = document.getElementById('journeyMapSection');
    if (!container) return;
    
    const journeyStats = calculateJourneyStats();
    const songs = journeyStats.allSongs;
    
    if (songs.length === 0) return;
    
    // Group songs by their highest round reached
    const byRound = songs.reduce((acc, song) => {
        const round = song.highestRound;
        if (!acc[round]) acc[round] = [];
        acc[round].push(song);
        return acc;
    }, {});
    
    const rounds = Object.keys(byRound).sort((a, b) => b - a); // Highest first
    
    container.innerHTML = `
        <div class="journey-map-header">
            <h3 class="map-title">🗺️ Your Tournament Journey</h3>
            <p class="map-subtitle">Visual map of how far your songs have traveled</p>
        </div>
        <div class="journey-map">
            ${rounds.map(round => `
                <div class="map-round">
                    <div class="map-round-label">${getRoundName(parseInt(round))}</div>
                    <div class="map-songs">
                        ${byRound[round].slice(0, 5).map(song => `
                            <div class="map-song ${song.status}">
                                <img src="https://img.youtube.com/vi/${song.videoId}/default.jpg" 
                                     alt="${song.name}"
                                     class="map-song-thumb">
                                <div class="map-song-name">${song.name}</div>
                                <div class="map-song-status">
                                    ${song.status === 'advanced' ? '✓' : song.status === 'eliminated' ? '✗' : '○'}
                                </div>
                            </div>
                        `).join('')}
                        ${byRound[round].length > 5 ? `<div class="map-more">+${byRound[round].length - 5} more</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.style.display = 'block';
}

function calculateVoteInfluence() {
    // Find matches where margin of victory was <= 5%
    const influentialVotes = allVotes.filter(v => {
        if (!v.isCompleted) return false;
        
        const song1Votes = v.match.song1.votes || 0;
        const song2Votes = v.match.song2.votes || 0;
        const total = song1Votes + song2Votes;
        
        if (total === 0) return false;
        
        const margin = Math.abs(song1Votes - song2Votes);
        const marginPercentage = (margin / total) * 100;
        
        return marginPercentage <= 5; // Within 5% margin
    });
    
    return influentialVotes.length;
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
            <h3 class="coverage-title"><i class="fa-solid fa-chart-column"></i> Tournament Participation</h3>
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
            icon: '<i class="fa-solid fa-music"></i>',
            title: 'New Voter',
            description: 'Just getting started - vote more to unlock your taste profile!'
        };
    }
    
    // Prioritize underdog picks for profile
    const underdogPercentage = Math.round((underdogPicks / totalVotes) * 100);
    
    if (underdogPercentage >= 40) {
        return {
            icon: '<i class="fa-solid fa-mask"></i>',
            title: 'Rebel Voter',
            description: `You champion the underdog ${underdogPercentage}% of the time!`
        };
    } else if (majorityAlignment >= 70) {
        return {
            icon: '<i class="fa-solid fa-bullseye"></i>',
            title: 'Mainstream Maven',
            description: `Your taste aligns with the crowd ${majorityAlignment}% of the time`
        };
    } else if (majorityAlignment >= 55) {
        return {
            icon: '<i class="fa-solid fa-scale-balanced"></i>',
            title: 'Balanced Critic',
            description: 'You have your own taste but appreciate popular picks too'
        };
    } else if (underdogPercentage >= 25) {
        return {
            icon: '<i class="fa-solid fa-guitar"></i>',
            title: 'Independent Voter',
            description: 'You march to the beat of your own drum'
        };
    } else {
        return {
            icon: '<i class="fa-solid fa-music"></i>',
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
            title: '<i class="fa-solid fa-star"></i> Champion Supporter',
            description: `${journeyStats.songsStillAlive} songs you voted for are still competing!`
        };
    } else if (votingStreak >= 7) {
        badgeData = {
            title: '<i class="fa-solid fa-fire"></i> Week Warrior',
            description: `${votingStreak} days voting streak! You're incredibly dedicated!`
        };
    } else if (journeyStats.furthestRound >= 5) {
        badgeData = {
            title: '<i class="fa-solid fa-trophy"></i> Deep Run Supporter',
            description: `You've voted in matches all the way to ${getRoundName(journeyStats.furthestRound)}!`
        };
    } else if (underdogPicks >= 10) {
        badgeData = {
            title: '<i class="fa-solid fa-mask"></i> Underdog Champion',
            description: `You've voted for the underdog ${underdogPicks} times! True rebel!`
        };
    } else if (journeyStats.songsStillAlive >= 5) {
        badgeData = {
            title: '<i class="fa-solid fa-music"></i> Song Champion',
            description: `${journeyStats.songsStillAlive} of your picks are still in the tournament!`
        };
    } else if (votingStreak >= 5) {
        badgeData = {
            title: '<i class="fa-solid fa-fire"></i> Hot Streak',
            description: `${votingStreak} days of voting in a row!`
        };
    } else if (totalVotes >= 30) {
        badgeData = {
            title: '<i class="fa-solid fa-square-poll-vertical"></i> Super Voter',
            description: `${totalVotes} votes cast! You're incredibly active!`
        };
    } else if (favoriteArtist && favoriteArtist.count >= 5) {
        badgeData = {
            title: `<i class="fa-solid fa-guitar"></i> ${favoriteArtist.artist} Superfan`,
            description: `You've voted for ${favoriteArtist.artist} ${favoriteArtist.count} times!`
        };
    } else if (underdogPicks >= 5) {
        badgeData = {
            title: '<i class="fa-solid fa-mask"></i> Underdog Supporter',
            description: `${underdogPicks} underdog picks! You support the underdogs!`
        };
    } else if (totalVotes >= 20) {
        badgeData = {
            title: '<i class="fa-solid fa-music"></i> Dedicated Fan',
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
        title.innerHTML = badgeData.title; // ✅ Changed to innerHTML
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
        'underdog': '<i class="fa-solid fa-mask"></i>',
        'mainstream': '<i class="fa-solid fa-bullseye"></i>',
        'closeCall': '<i class="fa-solid fa-scale-balanced"></i>'
    }[vote.voteType] || '<i class="fa-solid fa-square-poll-vertical"></i>';
    
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
        class="vote-thumbnail ${vote.choice === 'song1' ? 'your-pick' : ''}"
        loading="lazy">
    
    <div class="vote-details">
        <div class="vote-round">${tournamentName} • ${roundName}</div>
        <h3 class="vote-title">
            ${song1.shortTitle} 
            ${vote.choice === 'song1' ? '<span class="your-vote-inline">✓</span>' : ''}
            <span style="color: rgba(255,255,255,0.4);">vs</span> 
            ${song2.shortTitle}
            ${vote.choice === 'song2' ? '<span class="your-vote-inline">✓</span>' : ''}
        </h3>
        <p class="vote-choice">
            You voted for: <strong>${votedSong.shortTitle}</strong> 
            <span class="your-vote-badge-inline">✓ Your Pick</span>
        </p>
    </div>
</div>
            
          <div class="vote-result">
    ${!vote.isCompleted && match.endTime ? (() => {
        const timeLeft = getTimeRemaining(match.endTime);
        return `
            <div class="vote-countdown ${timeLeft.isUrgent ? 'urgent' : ''}">
                ${timeLeft.isUrgent ? '🚨' : '⏰'} ${timeLeft.display}
            </div>
        `;
    })() : ''}
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
    // ✅ Handle missing timestamps
    if (!date) {
        return 'Unknown time';
    }
    
    const now = new Date();
    const voteDate = new Date(date);
    
    // Check for invalid dates
    if (isNaN(voteDate.getTime())) {
        return 'Unknown time';
    }
    
    const seconds = Math.floor((now - voteDate) / 1000);
    
    // ✅ Handle future dates (bad data)
    if (seconds < 0) {
        console.warn('⚠️ Vote timestamp is in the future:', date);
        return 'Just now';
    }
    
    // Less than 1 minute
    if (seconds < 60) {
        return 'Just now';
    }
    
    // Less than 1 hour (show minutes)
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Less than 24 hours (show hours)
    if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // Less than 7 days (show days)
    if (seconds < 604800) {
        const days = Math.floor(seconds / 86400);
        return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    
    // More than 7 days (show actual date)
    return voteDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function getTimeRemaining(endTime) {
    const now = new Date().getTime();
    const end = new Date(endTime).getTime();
    const remaining = end - now;
    
    if (remaining <= 0) {
        return { display: 'Voting closed', isUrgent: false };
    }
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return { display: `${hours}h ${minutes}m left`, isUrgent: false };
    } else if (minutes > 30) {
        return { display: `${minutes}m left`, isUrgent: false };
    } else {
        return { display: `${minutes}m left!`, isUrgent: true };
    }
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
    console.log('📭 No votes found - showing empty state');
    
    // Hide loading state
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
    
    // Show no votes state
    const noVotesState = document.getElementById('noVotesState');
    if (noVotesState) noVotesState.style.display = 'block';
    
    // Hide votes grid (correct ID)
    const votesGrid = document.getElementById('votesGrid');
    if (votesGrid) votesGrid.style.display = 'none';
    
    // Hide stats sections (correct ID)
    const statsHeroSection = document.getElementById('statsHeroSection');
    if (statsHeroSection) statsHeroSection.style.display = 'none';
    
    const statsOverview = document.getElementById('statsOverview');
    if (statsOverview) statsOverview.style.display = 'none';
    
    const filtersSection = document.getElementById('filtersSection');
    if (filtersSection) filtersSection.style.display = 'none';
    
    const achievementsSection = document.getElementById('achievementsSection');
    if (achievementsSection) achievementsSection.style.display = 'none';
    
    // Also try votes-list for backwards compatibility
    const votesList = document.getElementById('votes-list');
    if (votesList) votesList.style.display = 'none';
    
    // Hide section header
    const sectionHeader = document.querySelector('.votes-section .section-header');
    if (sectionHeader) sectionHeader.style.display = 'none';
}

// ========================================
// SHARE STATS (UPDATED WITH IMAGE GENERATION)
// ========================================

async function shareStats() {
    const totalVotes = allVotes.length;
    const underdogPicks = allVotes.filter(v => v.voteType === 'underdog').length;
    const mainstreamPicks = allVotes.filter(v => v.voteType === 'mainstream').length;
    
    const majorityAlignment = totalVotes > 0 
        ? Math.round((mainstreamPicks / totalVotes) * 100) 
        : 0;
    
    const tasteProfile = getTasteProfile(majorityAlignment, totalVotes, underdogPicks);
    const journeyStats = calculateJourneyStats();
    const votingStreak = calculateVotingStreak();
    const supportImpact = calculateSupportImpact();
    const favoriteSongs = getSongPreferences();
    const favoriteSong = favoriteSongs[0];
    
    // Prepare stats data for image generation
    const statsData = {
        totalVotes: totalVotes,
        underdogPicks: underdogPicks,
        mainstreamPicks: mainstreamPicks,
        songsStillAlive: journeyStats.songsStillAlive,
        votingStreak: votingStreak,
        roundsParticipated: supportImpact.roundsParticipated,
        tasteProfile: {
            icon: tasteProfile.icon,
            title: tasteProfile.title,
            description: tasteProfile.description
        },
        favoriteSong: favoriteSong ? {
            name: favoriteSong.name,
            thumbnailUrl: `https://img.youtube.com/vi/${favoriteSong.videoId}/mqdefault.jpg`,
            voteCount: favoriteSong.count
        } : null
    };
    
    console.log('📊 Preparing stats for sharing:', statsData);
    
    // Call the image generator
    if (window.generateAndShareStats) {
        await window.generateAndShareStats(statsData);
    } else {
        console.error('❌ Stats image generator not loaded');
        showNotification('Stats image generator not available. Please refresh the page.', 'error');
    }
}

window.shareStats = shareStats;

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