    // ========================================
    // VOTE PAGE FUNCTIONALITY - LEAGUE MUSIC TOURNAMENT
    // ========================================
// ========================================
// IMPORTS
// ========================================

// API Client (uses Netlify Edge cache for reads)
import { getMatch, submitVote as submitVoteToAPI, getAllMatches } from './api-client.js';

// Firebase
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Features & Systems
import { getAllTournamentStats } from './music-gallery.js';
import { getBookForSong } from './bookMappings.js';
import { calculateVoteXP, addXP, getUserRank } from './rank-system.js';
import { updateNavRank } from './navigation.js';
import { createMatchCard } from './match-card-renderer.js';
import { checkAchievements, showAchievementUnlock } from './achievement-tracker.js';

// ========================================
// VOTING STREAK TRACKER
// ========================================

function updateVotingStreak() {
    const today = new Date().toDateString();
    const lastVoteDate = localStorage.getItem('lastVoteDate');
    const currentStreak = parseInt(localStorage.getItem('votingStreak') || '0');
    
    if (lastVoteDate === today) {
        // Already voted today, keep streak
        return;
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    
    if (lastVoteDate === yesterdayStr) {
        // Consecutive day - increment streak
        localStorage.setItem('votingStreak', (currentStreak + 1).toString());
        console.log(`🔥 Voting streak: ${currentStreak + 1} days`);
    } else if (!lastVoteDate || currentStreak === 0) {
        // First vote or starting new streak
        localStorage.setItem('votingStreak', '1');
        console.log('🔥 Voting streak started: 1 day');
    } else {
        // Streak broken - reset to 1
        console.log(`❌ Streak broken after ${currentStreak} days. Starting fresh.`);
        localStorage.setItem('votingStreak', '1');
    }
    
    localStorage.setItem('lastVoteDate', today);
}


// ========================================
// COUNTDOWN TIMER HELPER
// ========================================

function getTimeRemaining(endDate) {
    if (!endDate) return null;
    
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;
    
    if (diff <= 0) {
        return {
            text: '⏱️ Voting Closed',
            color: '#999',
            urgent: false,
            expired: true
        };
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    // Critical (< 1 hour)
    if (days === 0 && hours === 0) {
        return {
            text: `🚨 ${minutes}m left to vote!`,
            color: '#ff4444',
            urgent: true,
            expired: false
        };
    }
    
    // Urgent (< 6 hours)
    if (days === 0 && hours < 6) {
        return {
            text: `🔥 ${hours}h ${minutes}m left`,
            color: '#ff4444',
            urgent: true,
            expired: false
        };
    }
    
    // Moderate (< 24 hours)
    if (days === 0) {
        return {
            text: `⏰ ${hours}h ${minutes}m left`,
            color: '#ffaa00',
            urgent: false,
            expired: false
        };
    }
    
    // Calm (1+ days)
    return {
        text: `⏰ ${days}d ${hours}h left`,
        color: '#667eea',
        urgent: false,
        expired: false
    };
}


    // ✅ ADD THIS LINE:
    const ACTIVE_TOURNAMENT = '2025-worlds-anthems';


    // Current match data
    let currentMatch = null;
    let hasVoted = false;
    let userId = null; // ⭐ NEW: Store user ID globally
    // ========================================
    // LOAD SONG DATA FROM JSON
    // ========================================

    let allSongsData = [];

    /**
     * Load all song data from JSON file
     */
    async function loadSongData() {
        try {
            console.log('📥 Loading song data from JSON...');
            const response = await fetch('/data/music-videos.json');
            allSongsData = await response.json();
            console.log('✅ Loaded song data:', allSongsData.length, 'songs');
            return allSongsData;
        } catch (error) {
            console.error('❌ Error loading song data:', error);
            return [];
        }
    }

    /**
     * Get embedAllowed status from JSON data
     * @param {string} videoId - YouTube video ID
     * @returns {boolean} - True if embedding is allowed
     */
    function isEmbedAllowed(videoId) {
        const song = allSongsData.find(s => s.videoId === videoId);
        
        if (!song) {
            console.warn(`⚠️ Song not found for videoId: ${videoId}, defaulting to allowed`);
            return true; // Default to allowed if not found
        }
        
        const allowed = song.embedAllowed !== false;
        console.log(`🎵 Video ${videoId} (${song.shortTitle}): embedAllowed =`, allowed);
        return allowed;
    }

    // ========================================
    // PAGE INITIALIZATION
    // ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Vote page loaded');
    
    // ⭐ NEW: Get user ID first
    userId = await getUserId();
    console.log('👤 User ID:', userId);
    
    
    // Get match ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('id') || urlParams.get('match');   
        if (!matchId) {
            showNotification('No match specified', 'error');
            console.error('❌ No match ID in URL');
            return;
        }
        
        console.log('📍 Loading match:', matchId);
        
        // Load match data
        loadMatchData(matchId);
    });

    // ========================================
    // ⭐ NEW: USER IDENTIFICATION SYSTEM
    // ========================================

    /**
     * Get or generate a unique user identifier
     * Combines IP address + browser fingerprint for better security
     */
    async function getUserId() {
        // Check localStorage first
        const stored = localStorage.getItem('tournamentUserId');
        if (stored) {
            console.log('🆔 Using stored user ID:', stored);
            return stored;
        }
        
        console.log('🆔 Generating new user ID...');
        
        // Get IP address
        let ipAddress = 'unknown';
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            ipAddress = data.ip;
            console.log('📍 IP Address:', ipAddress);
        } catch (error) {
            console.warn('⚠️ Could not get IP address:', error);
        }
        
        // Generate browser fingerprint
        const fingerprint = generateBrowserFingerprint();
        console.log('🔐 Browser fingerprint:', fingerprint);
        
        // Combine IP + fingerprint and hash it
        const combined = `${ipAddress}_${fingerprint}_salt2025`;
        const userId = btoa(combined).substring(0, 32);
        
        // Store it
        localStorage.setItem('tournamentUserId', userId);
        
        console.log('✅ Generated user ID:', userId);
        return userId;
    }

    /**
     * Generate a browser fingerprint from device characteristics
     */
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
        
        // Simple hash
        return btoa(components).substring(0, 16);
    }

    // ========================================
    // LOAD COMPETITOR DATA (JSON + FIREBASE)
    // ========================================
    // ========================================
    // LOAD COMPETITOR DATA (JSON + FIREBASE)
    // ========================================
    async function getCompetitorData(songId) {
        try {
            // Make sure song data is loaded
            if (allSongsData.length === 0) {
                const response = await fetch('/data/music-videos.json');
                allSongsData = await response.json();
            }
            
            // Find the song in the loaded data
            const songData = allSongsData.find(v => v.id === songId);
            
            if (!songData) {
                console.warn(`⚠️ No JSON data found for song ID: ${songId}`);
                // Return minimal data so the page doesn't break
                return {
                    id: songId,
                    stats: { championships: 0 },
                    accolade: 'competitor',
                    liveStats: {
                        wins: 0,
                        losses: 0,
                        winRecord: "0-0",
                        winRate: "0%",
                        totalMatches: 0
                    }
                };
            }
            
            // Get live tournament stats from Firebase (shared with gallery)
            const tournamentStats = await getAllTournamentStats();
            const liveStats = tournamentStats[songId] || {
                wins: 0,
                losses: 0,
                winRecord: "0-0",
                winRate: "0%",
                totalMatches: 0
            };
            
            console.log(`✅ Loaded data for ${songData.shortTitle}: ${liveStats.winRecord}`);
            
            return {
                ...songData,
                liveStats
            };
            
        } catch (error) {
            console.error('❌ Error loading competitor data:', error);
            return null;
        }
    }
    // ========================================
    // UPDATE COMPETITOR DISPLAY WITH STATS
    // ========================================
    async function updateCompetitorInfo(match) {
        try {
            console.log('🎯 Starting updateCompetitorInfo...');
            
            // Load full data for both competitors
            const [comp1Data, comp2Data, h2hRecord] = await Promise.all([
                getCompetitorData(match.competitor1.seed),
                getCompetitorData(match.competitor2.seed),
            ]);
            
            console.log('H2H Record:', h2hRecord);
            
            if (!comp1Data || !comp2Data) {
                console.error('❌ Could not load competitor data');
                return;
            }
            
            // Get elements
            const comp1Desc = document.getElementById('competitor1-description');
            const comp1Meta = document.getElementById('competitor1-meta');
            const comp2Desc = document.getElementById('competitor2-description');
            const comp2Meta = document.getElementById('competitor2-meta');
            
            // Update with H2H data
            updateCompetitorDescription(comp1Data, match.competitor1, match.round, comp1Desc, h2hRecord);
            updateCompetitorMeta(comp1Data, match.competitor1, comp1Meta);
            
            updateCompetitorDescription(comp2Data, match.competitor2, match.round, comp2Desc, h2hRecord);
            updateCompetitorMeta(comp2Data, match.competitor2, comp2Meta);
            
            console.log('✅ Competitor info updated with H2H stats');
        } catch (error) {
            console.error('❌ Error updating competitor info:', error);
        }
    }

    // ========================================
    // GENERATE DYNAMIC DESCRIPTIONS
    // ========================================
    function updateCompetitorDescription(songData, competitor, currentRound, descriptionElement, h2hRecord) {
        if (!descriptionElement) return;
        
        const artist = competitor.source.split('•')[0]?.trim() || 'Unknown Artist';
        const name = competitor.name;
        const championships = songData.stats?.championships || 0;
        const liveStats = songData.liveStats;
        
        let description = '';
        
        // Check for head-to-head history first
        if (h2hRecord && h2hRecord.hasHistory) {
            const isComp1 = competitor.id === 'song1';
            const wins = isComp1 ? h2hRecord.song1Wins : h2hRecord.song2Wins;
            const losses = isComp1 ? h2hRecord.song2Wins : h2hRecord.song1Wins;
            
            description = `"${name}" by ${artist} has a ${wins}-${losses} record in previous matchups. Overall tournament record: ${liveStats.winRecord} (${liveStats.winRate} win rate).`;
        }
        // Tournament debut (no matches played)
        else if (liveStats.totalMatches === 0) {
            description = `"${name}" by ${artist} makes their tournament debut.`;
        }
        // Multi-time champion
        else if (championships >= 2) {
            description = `${championships}x Champion "${name}" by ${artist} has a ${liveStats.winRecord} all-time record.`;
        }
        // Single champion
        else if (championships === 1) {
            description = `Defending champion "${name}" by ${artist} has a ${liveStats.winRecord} all-time record.`;
        }
        // Former finalist
        else if (songData.accolade === 'contender') {
            description = `Former finalist "${name}" by ${artist} has a ${liveStats.winRecord} tournament record.`;
        }
        // Everyone else
        else {
            description = `"${name}" by ${artist} has a ${liveStats.winRecord} tournament record with a ${liveStats.winRate} win rate.`;
        }
        
        descriptionElement.textContent = description;
    }

    // ========================================
    // UPDATE META STATS DISPLAY
    // ========================================
    // ========================================
    // UPDATE META STATS DISPLAY
    // ========================================
    function updateCompetitorMeta(songData, competitor, metaElement) {
        if (!metaElement) return;
        
        const artist = competitor.source.split('•')[0]?.trim();
        const year = competitor.source.split('•')[1]?.trim();
        const liveStats = songData.liveStats;
        
        let metaHTML = '';
        
        // Always show basic info
        metaHTML += `
            <div class="meta-row basic-info">
                <span class="meta-item seed">
                    <i class="fas fa-trophy"></i>
                    <span class="meta-label">Seed</span>
                    <span class="meta-value">#${competitor.seed}</span>
                </span>
                <span class="meta-item year">
                    <i class="far fa-calendar"></i>
                    <span class="meta-label">Released</span>
                    <span class="meta-value">${year}</span>
                </span>
                <span class="meta-item artist">
                    <i class="fas fa-microphone"></i>
                    <span class="meta-label">Artist</span>
                    <span class="meta-value">${artist}</span>
                </span>
            </div>
        `;
        
        // Show tournament stats if they have matches played
        if (liveStats.totalMatches > 0) {
            const accolades = [];
            
            // Add championship badges
            if (songData.stats?.championships >= 2) {
                accolades.push(`
                    <span class="meta-item accolade champion">
                        <i class="fas fa-crown"></i>
                        <span class="meta-value">${songData.stats.championships}x Champion</span>
                    </span>
                `);
            } else if (songData.stats?.championships === 1) {
                accolades.push(`
                    <span class="meta-item accolade champion">
                        <i class="fas fa-crown"></i>
                        <span class="meta-value">Champion</span>
                    </span>
                `);
            }
            
            // Add finalist badge
            if (songData.accolade === 'contender' && songData.stats?.championships === 0) {
                accolades.push(`
                    <span class="meta-item accolade finalist">
                        <i class="fas fa-medal"></i>
                        <span class="meta-value">Finalist</span>
                    </span>
                `);
            }
            
            metaHTML += `
                <div class="meta-row tournament-stats">
                    <span class="meta-item record">
                        <i class="fas fa-swords"></i>
                        <span class="meta-label">Record</span>
                        <span class="meta-value">${liveStats.winRecord}</span>
                    </span>
                    <span class="meta-item winrate ${liveStats.wins > liveStats.losses ? 'winning' : ''}">
                        <i class="fas fa-fire"></i>
                        <span class="meta-label">Win Rate</span>
                        <span class="meta-value">${liveStats.winRate}</span>
                    </span>
                    ${accolades.join('')}
                </div>
            `;
        } else {
            // Tournament debut
            metaHTML += `
                <div class="meta-row tournament-stats">
                    <span class="meta-item debut">
                        <i class="fas fa-star"></i>
                        <span class="meta-value">Tournament Debut</span>
                    </span>
                </div>
            `;
        }
        
        metaElement.innerHTML = metaHTML;
    }


    // ========================================
    // LOAD MATCH DATA FROM FIREBASE
    // ========================================

    async function loadMatchData(matchId) {
    try {
        console.log('📥 Loading match data from edge cache...');

        // ⭐ Load song data from JSON first
        if (allSongsData.length === 0) {
            await loadSongData();
        }
        
        // ✅ NEW: Get match from edge-cached API
        const matchData = await getMatch(matchId);
        
        if (!matchData) {
            console.error('❌ Match not found:', matchId);
            showNotification('Match not found', 'error');
            return;
        }
        
        console.log('✅ Match data loaded from edge cache:', matchData);
            
            // Convert Firebase format to page format
          // ---- REPLACEMENT (paste over the old block) ----
currentMatch = {
    id: matchData.id || matchData.matchId,
    round: matchData.round || 1,
    status: matchData.status,
    totalVotes: matchData.totalVotes || 0,
        endDate: matchData.endDate || null,  // ✅ Make sure this line exists!


    competitor1: {
        id: 'song1',
        seed: matchData.song1?.seed ?? matchData.competitor1?.seed,
        name: matchData.song1?.shortTitle ?? matchData.competitor1?.shortTitle,
        source: `${matchData.song1?.artist ?? matchData.competitor1?.artist} • ${matchData.song1?.year ?? matchData.competitor1?.year}`,
        videoId: matchData.song1?.videoId ?? matchData.competitor1?.videoId,
        votes: matchData.song1?.votes ?? 0,  // ✅ FIX: Read from song1
        percentage: matchData.song1?.percentage ?? 50  // ✅ FIX: Use edge-calculated percentage
    },
    competitor2: {
        id: 'song2',
        seed: matchData.song2?.seed ?? matchData.competitor2?.seed,
        name: matchData.song2?.shortTitle ?? matchData.competitor2?.shortTitle,
        source: `${matchData.song2?.artist ?? matchData.competitor2?.artist} • ${matchData.song2?.year ?? matchData.competitor2?.year}`,
        videoId: matchData.song2?.videoId ?? matchData.competitor2?.videoId,
        votes: matchData.song2?.votes ?? 0,  // ✅ FIX: Read from song2
        percentage: matchData.song2?.percentage ?? 50  // ✅ FIX: Use edge-calculated percentage
    }
};

// Calculate percentages if not provided by edge
if (currentMatch.totalVotes > 0 && !matchData.song1?.percentage) {
    currentMatch.competitor1.percentage = Math.round((currentMatch.competitor1.votes / currentMatch.totalVotes) * 100);
    currentMatch.competitor2.percentage = Math.round((currentMatch.competitor2.votes / currentMatch.totalVotes) * 100);
}
            
         // ⭐ Check if user already voted (using new system)
await checkVoteStatus();

// Update page content
await updatePageContent();

// ✅ NEW: Update vote counts UI AFTER page content is set
if (hasVoted) {
    updateVoteCountsUI();
    console.log('✅ Vote counts refreshed after page update');
}

// ✨ Add dynamic stats and descriptions
await updateCompetitorInfo(currentMatch);

// Initialize YouTube players
            initializeYouTubePlayers();

            // ✅ NEW: Load other live matches (always, not just after voting)
await loadOtherLiveMatches();

            // ========================================
            // ✨ NEW: START REAL-TIME UPDATES
            // ========================================
        // ✨ Real-time updates will start AFTER user votes (not before)
            
        } catch (error) {
            console.error('❌ Error loading match:', error);
            showNotification('Error loading match data', 'error');
        }
    }

/**
// LOAD OTHER LIVE MATCHES
// ========================================

/**
 * Fetch and display other live matches (excluding current match)
 */
async function loadOtherLiveMatches() {
    try {
        console.log('📥 Loading other live matches...');
        
        // ✅ Wrap in try-catch and provide fallback
        let allMatches = [];
        try {
            allMatches = await getAllMatches();
        } catch (apiError) {
            console.error('⚠️ API call failed:', apiError);
            document.getElementById('other-matches-section').style.display = 'none';
            return;
        }
        
        // ✅ Safety check
        if (!allMatches || !Array.isArray(allMatches)) {
            console.warn('⚠️ No matches returned from API');
            document.getElementById('other-matches-section').style.display = 'none';
            return;
        }
        
        // Filter: only live matches, exclude current match
        const otherLiveMatches = allMatches.filter(match => 
            match.status === 'live' && 
            match.id !== currentMatch.id
        );
        
        console.log(`✅ Found ${otherLiveMatches.length} other live matches`);
        
        if (otherLiveMatches.length === 0) {
            document.getElementById('other-matches-section').style.display = 'none';
            return;
        }
        
        // Check which matches user has voted on
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        
        // ✅ Transform match data (matches.js pattern)
        const enhancedMatches = otherLiveMatches.map(match => {
            const userVote = userVotes[match.id];
            const hasVoted = !!userVote;
            const userVotedSongId = hasVoted ? userVote.songId : null;
            
            // Calculate vote percentages
            const totalVotes = match.totalVotes || 0;
            const song1Votes = match.song1?.votes || 0;
            const song2Votes = match.song2?.votes || 0;
            
            const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
            const song2Percentage = totalVotes > 0 ? 100 - song1Percentage : 50;
            
            return {
                id: match.matchId || match.id,
                tournament: match.tournament || '2025-worlds-anthems',
                round: match.round || 'round-1',
                status: match.status || 'live',
                date: match.date || new Date().toISOString(),
                    endDate: match.endDate || null,  // ✅ ADD THIS LINE

                totalVotes: totalVotes,
                timeLeft: 'Voting Open',
                hasVoted: hasVoted,
                competitor1: {
                    seed: match.song1?.seed || 1,
                    name: match.song1?.shortTitle || match.song1?.title || 'Unknown Song',
                    source: `${match.song1?.artist || 'Unknown'} • ${match.song1?.year || '2024'}`,
                    videoId: match.song1?.videoId || '',
                    votes: song1Votes,
                    percentage: song1Percentage,
                    winner: false,
                    leading: userVotedSongId === 'song1',
                    userVoted: hasVoted && userVote.songId === 'song1'
                },
                competitor2: {
                    seed: match.song2?.seed || 2,
                    name: match.song2?.shortTitle || match.song2?.title || 'Unknown Song',
                    source: `${match.song2?.artist || 'Unknown'} • ${match.song2?.year || '2024'}`,
                    videoId: match.song2?.videoId || '',
                    votes: song2Votes,
                    percentage: song2Percentage,
                    winner: false,
                    leading: userVotedSongId === 'song2',
                    userVoted: hasVoted && userVote.songId === 'song2'
                }
            };
        });
        
        // ✅ Render match cards as DOM elements
        const grid = document.getElementById('other-matches-grid');
        grid.innerHTML = ''; // Clear first

        enhancedMatches.forEach(match => {
            const card = createMatchCard(match);
            grid.appendChild(card);
        });

        // Show the section
        document.getElementById('other-matches-section').style.display = 'block';
        
        console.log('✅ Other matches rendered');
        
    } catch (error) {
        console.error('❌ Error loading other matches:', error);
        document.getElementById('other-matches-section').style.display = 'none';
    }
}
    // ========================================
    // ⭐ UPDATED: CHECK VOTE STATUS (FIREBASE)
    // ========================================

async function checkVoteStatus() {
    try {
        // Check Firebase votes collection
        const voteId = `${currentMatch.id}_${userId}`;
        const voteRef = doc(db, 'votes', voteId);
        const voteDoc = await getDoc(voteRef);
        
        if (voteDoc.exists()) {
            hasVoted = true;
            const voteData = voteDoc.data();
            console.log('✅ User already voted:', voteData.choice);
            
            // Store in localStorage
            localStorage.setItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`, voteData.choice);

            // ✅ NEW: Also save in userVotes format
saveVoteForOtherPages(currentMatch.id, voteData.choice);

            
            // ✅ NEW: Update UI with current vote counts FIRST
            updateVoteCountsUI();
            
            // Then disable voting and show stats
            disableVoting(voteData.choice);

            // ✅ ADD THIS: Load other matches since user already voted
await loadOtherLiveMatches();
            
        } else {
            // Double-check localStorage as backup
            const localVote = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`);
            if (localVote) {
                hasVoted = true;
                console.log('✅ Found vote in localStorage:', localVote);
                
                // ✅ NEW: Update UI here too
                updateVoteCountsUI();
                
                disableVoting(localVote);
            }
        }
    } catch (error) {
        console.error('⚠️ Error checking vote status:', error);
        // Fallback to localStorage only
        const localVote = localStorage.getItem(`vote_${currentMatch.id}`);
        if (localVote) {
            hasVoted = true;
            
            // ✅ NEW: Update UI here too
            updateVoteCountsUI();
            
            disableVoting(localVote);
        }
    }
}

    /**
     * ⭐ UPDATED: Disable voting UI after user has voted
     */
    function disableVoting(votedFor) {
        const voteButtons = document.querySelectorAll('.vote-btn');
        
        voteButtons.forEach(btn => {
            const isVotedButton = btn.dataset.competitor === votedFor;
            
            // Disable all buttons
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';
            
            if (isVotedButton) {
                // Button they voted for - show as selected
                btn.style.opacity = '1';
                btn.classList.add('voted');
                
                // Change button text
                const textSpan = btn.querySelector('.vote-text');
                if (textSpan) {
                    textSpan.textContent = ' You Voted For This';
                }
                
                // Change icon color
                const iconSpan = btn.querySelector('.vote-icon');
                if (iconSpan) {
                    iconSpan.style.filter = 'brightness(1.2)';
                }
                
            } else {
                // Button they didn't vote for - dim it
                btn.style.opacity = '0.4';
                
                // Change button text
                const textSpan = btn.querySelector('.vote-text');
                if (textSpan) {
                    textSpan.textContent = 'Not Selected';
                }
            }
        });
        
        // Show indicator banner at top
        const songName = votedFor === 'song1' 
            ? currentMatch.competitor1.name 
            : currentMatch.competitor2.name;
        
        const indicator = document.createElement('div');
        indicator.className = 'voted-indicator';
        indicator.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
                <div style="font-size: 1.5rem;">✅</div>
                <div>
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">Vote Recorded</div>
                    <div style="opacity: 0.9;">You voted for <strong>${songName}</strong></div>
                </div>
            </div>
        `;
        indicator.style.cssText = `
            background: linear-gradient(135deg, rgba(0, 200, 150, 0.15), rgba(0, 180, 130, 0.15));
            border: 2px solid #00c896;
            color: #00c896;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            margin: 0 0 2rem 0;
            animation: slideDown 0.3s ease;
        `;
        
        // Insert at top of voting arena
        const arena = document.querySelector('.voting-arena .container-wide');
        if (arena) {
            arena.insertBefore(indicator, arena.firstChild);
        }

        // ✅ ADD THIS AT THE END:
        // Reveal vote statistics now that user has voted
        document.querySelectorAll('.vote-stats').forEach(el => {
            el.classList.add('revealed');
            el.classList.remove('hidden');
        });
        
        console.log('📊 Vote statistics revealed');
    }
    // ========================================
    // UPDATE PAGE CONTENT
    // ========================================

    async function updatePageContent() {
        console.log('📝 Updating page content...');
        console.log('🔍 Current match data:', currentMatch);
        
        
        // Update breadcrumb
        const breadcrumbRound = document.getElementById('breadcrumb-round');
        if (breadcrumbRound) {
            const roundNumber = currentMatch.round || 1;
            const roundName = getRoundName(roundNumber);
            console.log('🎯 Round number:', roundNumber, '→', roundName);
            breadcrumbRound.textContent = roundName;
        }
        
        // Update match title
        const matchTitle = document.getElementById('match-title');
        if (matchTitle) {
            matchTitle.textContent = `${currentMatch.competitor1.name} vs ${currentMatch.competitor2.name}`;
        }
        
        // Update tournament badge
        const tournamentBadge = document.getElementById('tournament-badge');
        if (tournamentBadge) {
            const roundName = getRoundName(currentMatch.round || 1);
            tournamentBadge.innerHTML = `🏆 Anthem Arena Championship - ${roundName}`;
        }
        
       // Update time remaining with countdown support
const timeRemaining = document.getElementById('time-remaining');
if (timeRemaining) {
    if (currentMatch.status === 'completed') {
        timeRemaining.innerHTML = '✅ Voting Closed';
        timeRemaining.style.color = '#999';
    } else if (currentMatch.status === 'upcoming') {
        timeRemaining.innerHTML = '⏰ Coming Soon';
        timeRemaining.style.color = '#ffaa00';
    } else if (currentMatch.status === 'live') {
        // ✅ Check for endDate to show countdown
        if (currentMatch.endDate) {
            const timer = getTimeRemaining(currentMatch.endDate);
            
            if (timer && !timer.expired) {
                timeRemaining.innerHTML = timer.text;
                timeRemaining.style.color = timer.color;
                timeRemaining.style.fontWeight = '600';
                
                if (timer.urgent) {
                    timeRemaining.classList.add('urgent');
                }
            } else if (timer && timer.expired) {
                timeRemaining.innerHTML = '⏱️ Voting Closed';
                timeRemaining.style.color = '#999';
            } else {
                // Fallback
                timeRemaining.innerHTML = '🔴 LIVE NOW';
                timeRemaining.style.color = '#ff4444';
            }
        } else {
            // No endDate available, show generic live status
            timeRemaining.innerHTML = '🔴 LIVE NOW';
            timeRemaining.style.color = '#ff4444';
        }
    } else {
        timeRemaining.innerHTML = '⏰ Vote Now';
        timeRemaining.style.color = '#ffaa00';
    }
}
        
        // Update total votes
        const totalVotesEl = document.getElementById('total-votes');
        if (totalVotesEl) {
            totalVotesEl.innerHTML = `📊 ${currentMatch.totalVotes.toLocaleString()} votes cast`;
        }
        
        // ========================================
        // UPDATE COMPETITOR 1 - BASIC INFO
        // ========================================
        
        const comp1Seed = document.getElementById('competitor1-seed');
        const comp1Name = document.getElementById('competitor1-name');
        const comp1Source = document.getElementById('competitor1-source');
        const comp1Percentage = document.getElementById('competitor1-percentage');
        const comp1Votes = document.getElementById('competitor1-votes');
        const comp1Video = document.getElementById('competitor1-video');
        
        if (comp1Seed) comp1Seed.textContent = `#${currentMatch.competitor1.seed} Seed`;
        if (comp1Name) comp1Name.textContent = currentMatch.competitor1.name;
        if (comp1Source) comp1Source.textContent = currentMatch.competitor1.source;
        if (comp1Percentage) comp1Percentage.textContent = `${currentMatch.competitor1.percentage}`;
        if (comp1Votes) comp1Votes.textContent = `${currentMatch.competitor1.votes.toLocaleString()} votes`;
        if (comp1Video) comp1Video.src = `https://www.youtube.com/embed/${currentMatch.competitor1.videoId}?enablejsapi=1&rel=0&modestbranding=1`;
        
        // Check embedAllowed from JSON data
        if (!isEmbedAllowed(currentMatch.competitor1.videoId)) {
            console.log('🚫 Competitor 1 cannot be embedded, showing thumbnail');
            showThumbnailForCompetitor(1, currentMatch.competitor1.videoId);
        }
        
        // ========================================
        // UPDATE COMPETITOR 2 - BASIC INFO
        // ========================================
        
        const comp2Seed = document.getElementById('competitor2-seed');
        const comp2Name = document.getElementById('competitor2-name');
        const comp2Source = document.getElementById('competitor2-source');
        const comp2Percentage = document.getElementById('competitor2-percentage');
        const comp2Votes = document.getElementById('competitor2-votes');
        const comp2Video = document.getElementById('competitor2-video');
        
        if (comp2Seed) comp2Seed.textContent = `#${currentMatch.competitor2.seed} Seed`;
        if (comp2Name) comp2Name.textContent = currentMatch.competitor2.name;
        if (comp2Source) comp2Source.textContent = currentMatch.competitor2.source;
        if (comp2Percentage) comp2Percentage.textContent = `${currentMatch.competitor2.percentage}`;
        if (comp2Votes) comp2Votes.textContent = `${currentMatch.competitor2.votes.toLocaleString()} votes`;
        if (comp2Video) comp2Video.src = `https://www.youtube.com/embed/${currentMatch.competitor2.videoId}?enablejsapi=1&rel=0&modestbranding=1`;
        
        // Check embedAllowed from JSON data
        if (!isEmbedAllowed(currentMatch.competitor2.videoId)) {
            console.log('🚫 Competitor 2 cannot be embedded, showing thumbnail');
            showThumbnailForCompetitor(2, currentMatch.competitor2.videoId);
        }

    
        
        
        // ========================================
        // UPDATE PAGE TITLE
        // ========================================
        
        document.title = `Vote: ${currentMatch.competitor1.name} vs ${currentMatch.competitor2.name} | League Music Tournament`;
        
        console.log('✅ Page content updated (stats will be added by updateCompetitorInfo)');
    }

    // ========================================
    // HELPER FUNCTION: GET ROUND NAME
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

    function showMatchStatus() {
        // ✅ ONLY show AFTER voting (reversed logic)
        if (!hasVoted) return;
        
        const comp1Votes = currentMatch.competitor1.votes;
        const comp2Votes = currentMatch.competitor2.votes;
        const totalVotes = currentMatch.totalVotes;
        
        // Don't show if no votes yet
        if (totalVotes === 0) return;
        
        const comp1Pct = currentMatch.competitor1.percentage;
        const comp2Pct = currentMatch.competitor2.percentage;
        const diff = Math.abs(comp1Votes - comp2Votes);
        
        let message = '';
        let icon = '';
        let color = '';
        
        // Determine message based on vote spread
        if (Math.abs(comp1Pct - comp2Pct) <= 5) {
            // CLOSE RACE
            message = `🔥 <strong>Too close to call!</strong> Separated by just ${diff} ${diff === 1 ? 'vote' : 'votes'}!`;
            color = '#ffaa00'; // Yellow
        } else if (Math.abs(comp1Pct - comp2Pct) <= 15) {
            // COMPETITIVE
            const leader = comp1Pct > comp2Pct ? currentMatch.competitor1.name : currentMatch.competitor2.name;
            message = `⚔️ <strong>${leader}</strong> leading by ${diff} ${diff === 1 ? 'vote' : 'votes'}. Your vote matters!`;
            color = '#4a9eff'; // Blue
        } else {
            // BLOWOUT
            const leader = comp1Pct > comp2Pct ? currentMatch.competitor1.name : currentMatch.competitor2.name;
            const loser = comp1Pct < comp2Pct ? currentMatch.competitor1.name : currentMatch.competitor2.name;
            message = `🚨 <strong>${leader}</strong> dominating ${comp1Pct}-${comp2Pct}! Can <strong>${loser}</strong> make a comeback?`;
            color = '#ff4444'; // Red
        }
        
        const banner = document.createElement('div');
        banner.className = 'match-status-banner';
        banner.innerHTML = `
            <div class="status-content">
                ${message}
                <span class="vote-cta">Vote now to impact the race! →</span>
            </div>
        `;
        banner.style.cssText = `
            background: linear-gradient(135deg, ${color}15, ${color}25);
            border: 2px solid ${color};
            color: ${color};
            border-radius: 12px;
            padding: 1rem 1.5rem;
            margin-bottom: 2rem;
            animation: slideDown 0.4s ease;
        `;
        
        const arena = document.querySelector('.voting-arena .container-wide');
        if (arena) {
            arena.insertBefore(banner, arena.firstChild);
        }
    }

    // ========================================
    // ✨ NEW: SHOW VOTE URGENCY INDICATORS
    // ========================================

    function updateVoteUrgency() {
            if (!hasVoted) return; // ✅ Don't show urgency until after voting

        if (currentMatch.totalVotes === 0) return;
        
        const comp1Pct = currentMatch.competitor1.percentage;
        const comp2Pct = currentMatch.competitor2.percentage;
        const voteDiff = Math.abs(currentMatch.competitor1.votes - currentMatch.competitor2.votes);
        
        // Determine if it's a close race
        const isClose = Math.abs(comp1Pct - comp2Pct) <= 5;
        
        // Determine who's losing
        const loser = comp1Pct < comp2Pct ? currentMatch.competitor1 : currentMatch.competitor2;
        const loserSide = comp1Pct < comp2Pct ? 1 : 2;
        
        // Add urgency banner if close
        if (isClose && currentMatch.status === 'live' && !hasVoted) {
            showUrgencyBanner(loser, voteDiff, loserSide);
        }
        
        // Add visual indicators to vote cards
        updateVoteCardUrgency(comp1Pct, comp2Pct, voteDiff);
        // ✨ ADD THIS:
        showMatchStatus();
    }

    // ========================================
    // SHOW URGENCY BANNER
    // ========================================

    function showUrgencyBanner(losingSong, voteDiff, loserSide) {
        // Remove existing banner
        const existing = document.querySelector('.urgency-banner');
        if (existing) existing.remove();
        
        const banner = document.createElement('div');
        banner.className = 'urgency-banner';
        banner.innerHTML = `
            <div class="urgency-content">
                <span class="urgency-icon">⚠️</span>
                <div class="urgency-text">
                    <strong>${losingSong.name}</strong> is being eliminated!
                    <span class="vote-diff">Trailing by ${voteDiff.toLocaleString()} votes</span>
                </div>
                <button class="urgency-cta" onclick="scrollToVoteButton(${loserSide})">
                    Save Now →
                </button>
            </div>
        `;
        
        // Insert at top of voting arena
        const arena = document.querySelector('.voting-arena .container-wide');
        if (arena) {
            arena.insertBefore(banner, arena.firstChild);
        }
    }

    // ========================================
    // UPDATE VOTE CARDS WITH URGENCY
    // ========================================

    function updateVoteCardUrgency(comp1Pct, comp2Pct, voteDiff) {
        const card1 = document.querySelector('[data-competitor="song1"]')?.closest('.competitor-card');
        const card2 = document.querySelector('[data-competitor="song2"]')?.closest('.competitor-card');
        
        if (!card1 || !card2) return;
        
        // Reset classes
        card1.classList.remove('losing', 'winning', 'tied');
        card2.classList.remove('losing', 'winning', 'tied');
        
        if (Math.abs(comp1Pct - comp2Pct) <= 2) {
            // Too close to call
            card1.classList.add('tied');
            card2.classList.add('tied');
        } else if (comp1Pct < comp2Pct) {
            card1.classList.add('losing');
            card2.classList.add('winning');
            
            // Add "SAVE THIS SONG" text to losing card
            if (!hasVoted && currentMatch.status === 'live') {
                addSavePrompt(card1, voteDiff);
            }
        } else {
            card1.classList.add('winning');
            card2.classList.add('losing');
            
            if (!hasVoted && currentMatch.status === 'live') {
                addSavePrompt(card2, voteDiff);
            }
        }
    }

    // ========================================
    // ADD "SAVE" PROMPT TO LOSING CARD
    // ========================================

    function addSavePrompt(card, voteDiff) {
        // Remove existing prompt
        const existing = card.querySelector('.save-prompt');
        if (existing) existing.remove();
        
        const prompt = document.createElement('div');
        prompt.className = 'save-prompt';
        prompt.innerHTML = `
            <span class="save-icon">🚨</span>
            <span class="save-text">Being Eliminated!</span>
            <span class="save-diff">${voteDiff.toLocaleString()} votes behind</span>
        `;
        
        // Insert before vote button
        const voteBtn = card.querySelector('.vote-btn');
        if (voteBtn && voteBtn.parentNode) {
            voteBtn.parentNode.insertBefore(prompt, voteBtn);
        }
    }

    // ========================================
    // SCROLL TO VOTE BUTTON HELPER
    // ========================================

    window.scrollToVoteButton = function(competitorNumber) {
        const button = document.querySelector(`[data-competitor="song${competitorNumber}"]`);
        if (button) {
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Pulse animation
            button.style.animation = 'pulse 0.6s ease-in-out 3';
        }
    };

    // ========================================
    // INITIALIZE YOUTUBE PLAYERS
    // ========================================

    function initializeYouTubePlayers() {
        console.log('🎬 YouTube players initialized');
        // Videos will auto-initialize via iframe src
    }

// ========================================
// ⭐ UPDATED: SUBMIT VOTE TO FIREBASE WITH XP
// ========================================

async function submitVote(songId) {
    // Prevent double voting
    if (hasVoted) {
        showNotification('You have already voted in this match!', 'error');
        return;
    }
    
    // Check if match is live
    if (currentMatch.status !== 'live') {
        showNotification('Voting is not open for this match', 'error');
        return;
    }
    
    // Disable voting buttons immediately
    hasVoted = true;
    const voteButtons = document.querySelectorAll('.vote-btn');
    voteButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    });
    
    try {
        // Show loading state
        showNotification('Submitting your vote...', 'info');
        
        // Determine which song was voted for (song1 or song2)
        const votedForSong1 = songId === 'song1';
        
        console.log('🗳️ Voting for:', votedForSong1 ? 'Song 1' : 'Song 2');
        console.log('👤 User ID:', userId);
        
        // ⭐ NEW: Create vote record in Firebase
        const voteId = `${currentMatch.id}_${userId}`;
        const voteRef = doc(db, 'votes', voteId);
        
        // Check if vote already exists (extra safety)
        const existingVote = await getDoc(voteRef);
        if (existingVote.exists()) {
            console.warn('⚠️ Vote already exists!');
            showNotification('You have already voted in this match!', 'error');
            disableVoting(existingVote.data().choice);
            return;
        }
        
        await setDoc(voteRef, {
            tournament: ACTIVE_TOURNAMENT,
            matchId: currentMatch.id,
            userId: userId,
            choice: songId,
            timestamp: new Date().toISOString(),
            round: currentMatch.round,
            // Store song details for analytics
            votedForSeed: votedForSong1 ? currentMatch.competitor1.seed : currentMatch.competitor2.seed,
            votedForName: votedForSong1 ? currentMatch.competitor1.name : currentMatch.competitor2.name
        });
        
        console.log('✅ Vote record created in Firebase');
        
        // ✅ NEW: Use API client to submit vote (updates match counts)
        await submitVoteToAPI(currentMatch.id, songId);
        console.log('✅ Vote submitted via API client');
        
        // Save vote locally as backup
        localStorage.setItem(`vote_${ACTIVE_TOURNAMENT}_${currentMatch.id}`, songId);
        
        // ✅ NEW: Also save in userVotes format for homepage/matches pages
        saveVoteForOtherPages(currentMatch.id, songId);
        
        // ========================================
        // ✅ NEW: CALCULATE AND AWARD XP
        // ========================================
        const xpData = calculateVoteXP({
            isUnderdog: checkIfUnderdog(votedForSong1),
            isCloseMatch: checkIfCloseMatch(),
            isFirstVoteInMatch: checkIfFirstVoter()
        });
        
        const newTotalXP = addXP(xpData.totalXP);
        const rank = getUserRank(newTotalXP);

        // ✅ Track voting streak
updateVotingStreak();

            // ✅ NEW: Check for achievement unlocks
        await checkForAchievementUnlocks();
        
        console.log(`✨ Earned ${xpData.totalXP} XP! New total: ${newTotalXP} XP (Level ${rank.currentLevel.level})`);
        
        // Update nav display immediately
        updateNavRank();
        
        // ✅ Get full song data for modal BEFORE reload (we need the song info)
        const songSeed = votedForSong1 ? currentMatch.competitor1.seed : currentMatch.competitor2.seed;
        const songName = votedForSong1 ? currentMatch.competitor1.name : currentMatch.competitor2.name;
        const songData = allSongsData.find(s => s.seed === songSeed);
        
      // Reload with cache bypass to get fresh vote count
        await reloadMatchData(true);
        
        // Show success notification
        showNotification(`✅ Vote cast for "${songName}"!`, 'success');
        
        // Show voted indicator
        disableVoting(songId);

                // Update UI with fresh vote count
        updateVoteCountsUI();

        // Show modal with correct numbers
        showPostVoteModal(songName, songData, xpData, rank);

        // Load other live matches
        await loadOtherLiveMatches();

       

        console.log('✅ Vote submitted successfully!');
        
    } catch (error) {
        console.error('❌ Error submitting vote:', error);
        showNotification('Error submitting vote. Please try again.', 'error');
        
        // Re-enable voting on error
        hasVoted = false;
        const voteButtons = document.querySelectorAll('.vote-btn');
        voteButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }
}


// ========================================
// ✅ NEW: ACHIEVEMENT CHECK AFTER VOTING
// ========================================

// ========================================
// ✅ IMPROVED: ACHIEVEMENT CHECK AFTER VOTING
// ========================================

async function checkForAchievementUnlocks() {
    try {
        console.log('🏆 Checking for achievement unlocks...');
        
        // Get user's complete vote history from localStorage
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        const voteIds = Object.keys(userVotes);
        
        if (voteIds.length === 0) return;
        
        // ✅ FIX: Get match data to properly categorize votes
        const allMatches = await getAllMatches();
        const matchMap = new Map(allMatches.map(m => [m.id || m.matchId, m]));
        
        // Build proper vote history with match context
        const allVotes = voteIds.map(matchId => {
            const voteData = userVotes[matchId];
            const matchData = matchMap.get(matchId);
            
            if (!matchData) {
                return {
                    matchId,
                    timestamp: voteData.timestamp || new Date().toISOString(),
                    voteType: 'balanced',
                    round: 1,
                    votedForSeed: null,
                    votedForName: null,
                    choice: voteData.songId,
                    match: {}
                };
            }
            
            // Determine vote type based on match data
            const votedForSong = voteData.songId === 'song1' ? matchData.song1 : matchData.song2;
            const opponentSong = voteData.songId === 'song1' ? matchData.song2 : matchData.song1;
            
            const song1Votes = matchData.song1?.votes || 0;
            const song2Votes = matchData.song2?.votes || 0;
            const totalMatchVotes = song1Votes + song2Votes;
            
            const votedSongVotes = voteData.songId === 'song1' ? song1Votes : song2Votes;
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
            
            return {
                matchId,
                timestamp: voteData.timestamp || new Date().toISOString(),
                voteType,
                round: matchData.round || 1,
                votedForSeed: votedForSong?.seed,
                votedForName: votedForSong?.shortTitle || votedForSong?.title,
                choice: voteData.songId,
                match: matchData
            };
        });
        
        // Check achievements with proper data
        const { newlyUnlocked } = checkAchievements(allVotes);
        
        // Show notifications for newly unlocked achievements
        if (newlyUnlocked.length > 0) {
            console.log(`🎉 ${newlyUnlocked.length} achievement(s) unlocked!`);
            
            // Stagger notifications by 2 seconds each
            newlyUnlocked.forEach((achievement, index) => {
                setTimeout(() => {
                    showAchievementUnlock(achievement);
                }, index * 2000);
            });
            
            // Update navigation rank (achievements award XP)
            if (window.updateNavRank) {
                window.updateNavRank();
            }
        }
        
    } catch (error) {
        console.error('⚠️ Error checking achievements:', error);
    }
}
/**
 * ✅ NEW: Save vote to userVotes format for homepage/matches pages
 */
/**
 * ✅ FIXED: Save vote to userVotes format for homepage/matches pages
 * Now includes songTitle and opponentTitle for alert messages
 */
function saveVoteForOtherPages(matchId, songId) {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    
    const votedSong = songId === 'song1' ? currentMatch.competitor1 : currentMatch.competitor2;
    const opponentSong = songId === 'song1' ? currentMatch.competitor2 : currentMatch.competitor1;
    
    // ✅ Calculate voteType at time of voting
    const votedSongPercentage = currentMatch.totalVotes > 0
        ? Math.round((votedSong.votes / currentMatch.totalVotes) * 100)
        : 50;
    
    let voteType = 'balanced';
    if (votedSongPercentage < 40) {
        voteType = 'underdog';
    } else if (votedSongPercentage > 60) {
        voteType = 'mainstream';
    } else {
        voteType = 'closeCall';
    }
    
    userVotes[matchId] = {
        songId: songId,
        songTitle: votedSong.name,
        opponentTitle: opponentSong.name,
        timestamp: Date.now(),
        voteType: voteType,  // ✅ NEW
        round: currentMatch.round,  // ✅ NEW
        totalVotesAtTime: currentMatch.totalVotes  // ✅ NEW (for early voter tracking)
    };
    
    localStorage.setItem('userVotes', JSON.stringify(userVotes));
}

// ========================================
// ✅ NEW: XP CALCULATION HELPERS
// ========================================

/**
 * Check if user voted for the underdog (lower-seeded song)
 */
function checkIfUnderdog(votedForSong1) {
    const votedSeed = votedForSong1 ? currentMatch.competitor1.seed : currentMatch.competitor2.seed;
    const opponentSeed = votedForSong1 ? currentMatch.competitor2.seed : currentMatch.competitor1.seed;
    return votedSeed > opponentSeed; // Higher seed number = underdog
}

/**
 * Check if the match is close (within 5 votes)
 */
function checkIfCloseMatch() {
    const voteDiff = Math.abs(currentMatch.competitor1.votes - currentMatch.competitor2.votes);
    return voteDiff <= 5;
}

/**
 * Check if user is among first 10 voters
 */
function checkIfFirstVoter() {
    return currentMatch.totalVotes <= 10;
}

    // ========================================
    // RELOAD MATCH DATA
    // ========================================
 async function reloadMatchData(bypassCache = false) {
    try {
        console.log(`🔄 Reloading match data${bypassCache ? ' (BYPASSING CACHE)' : ''}...`);
        
        const matchData = await getMatch(currentMatch.id, bypassCache);
            
        if (matchData) {
            console.log('📥 Received match data:', {
                totalVotes: matchData.totalVotes,
                song1Votes: matchData.song1?.votes,  // ✅ Check song1
                song2Votes: matchData.song2?.votes   // ✅ Check song2
            });
            
            // ✅ FIX: Read from song1/song2, not competitor1/competitor2
            currentMatch.competitor1.votes = matchData.song1?.votes ?? 0;
            currentMatch.competitor2.votes = matchData.song2?.votes ?? 0;
            currentMatch.totalVotes = matchData.totalVotes ?? 0;

            // Recalculate percentages
            if (currentMatch.totalVotes > 0) {
                currentMatch.competitor1.percentage = Math.round(currentMatch.competitor1.votes / currentMatch.totalVotes * 100);
                currentMatch.competitor2.percentage = Math.round(currentMatch.competitor2.votes / currentMatch.totalVotes * 100);
            } else {
                currentMatch.competitor1.percentage = 50;
                currentMatch.competitor2.percentage = 50;
            }
            
            // Update UI with new counts
            updateVoteCountsUI();
            
            console.log('✅ Match data reloaded:', {
                totalVotes: currentMatch.totalVotes,
                percentages: `${currentMatch.competitor1.percentage}% - ${currentMatch.competitor2.percentage}%`
            });
        } else {
            console.warn('⚠️ No match data returned from getMatch()');
        }
    } catch (error) {
        console.error('⚠️ Error reloading match data:', error);
    }
}

// ========================================
    // UPDATE VOTE COUNTS UI
    // ========================================
// ========================================
// UPDATE VOTE COUNTS UI
// ========================================
function updateVoteCountsUI() {
    // Safety check
    if (!currentMatch || !currentMatch.competitor1 || !currentMatch.competitor2) {
        console.error('Cannot update UI: currentMatch not ready:', currentMatch);
        return;
    }

    // Recalculate percentages cleanly (NO double-100 hack!)
    const total = currentMatch.totalVotes || 0;
    const comp1Votes = currentMatch.competitor1.votes || 0;
    const comp2Votes = currentMatch.competitor2.votes || 0;

    const comp1Percent = total > 0 ? Math.round((comp1Votes / total) * 100) : 50;
    const comp2Percent = total > 0 ? Math.round((comp2Votes / total) * 100) : 50;

    // Update currentMatch percentages for consistency
    currentMatch.competitor1.percentage = comp1Percent;
    currentMatch.competitor2.percentage = comp2Percent;

    console.log('Updating UI with:', {
        song1: `${comp1Percent}% (${comp1Votes} vote${comp1Votes === 1 ? '' : 's'})`,
        song2: `${comp2Percent}% (${comp2Votes} vote${comp2Votes === 1 ? '' : 's'})`,
        total: total
    });

    // DOM elements
    const comp1Percentage = document.getElementById('competitor1-percentage');
    const comp1VotesEl = document.getElementById('competitor1-votes');
    const comp2Percentage = document.getElementById('competitor2-percentage');
    const comp2VotesEl = document.getElementById('competitor2-votes');
    const totalVotesEl = document.getElementById('total-votes');

    console.log('DOM Elements found:', {
        comp1Percentage: !!comp1Percentage,
        comp1VotesEl: !!comp1VotesEl,
        comp2Percentage: !!comp2Percentage,
        comp2VotesEl: !!comp2VotesEl,
        totalVotesEl: !!totalVotesEl
    });

    // Update Competitor 1
    if (comp1Percentage) {
        comp1Percentage.textContent = comp1Percent;
        console.log('Set comp1 percentage to:', comp1Percent);
    } else {
        console.error('Element not found: competitor1-percentage');
    }

    if (comp1VotesEl) {
        comp1VotesEl.textContent = `${comp1Votes.toLocaleString()} vote${comp1Votes === 1 ? '' : 's'}`;
        console.log('Set comp1 votes to:', comp1Votes);
    } else {
        console.error('Element not found: competitor1-votes');
    }

    // Update Competitor 2
    if (comp2Percentage) {
        comp2Percentage.textContent = comp2Percent;
        console.log('Set comp2 percentage to:', comp2Percent);
    } else {
        console.error('Element not found: competitor2-percentage');
    }

    if (comp2VotesEl) {
        comp2VotesEl.textContent = `${comp2Votes.toLocaleString()} vote${comp2Votes === 1 ? '' : 's'}`;
        console.log('Set comp2 votes to:', comp2Votes);
    } else {
        console.error('Element not found: competitor2-votes');
    }

    // Update total
    if (totalVotesEl) {
        totalVotesEl.innerHTML = `Total: ${total.toLocaleString()} vote${total === 1 ? '' : 's'} cast`;
        console.log('Set total votes to:', total);
    } else {
        console.error('Element not found: total-votes');
    }

    console.log('UI updated with current vote counts');
}

    // ========================================
    // NOTIFICATION SYSTEM
    // ========================================

    // ========================================
// NOTIFICATION SYSTEM (Standardized)
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
    // THUMBNAIL FALLBACK FOR NON-EMBEDDABLE VIDEOS
    // ========================================

    /**
     * Show thumbnail instead of iframe for videos that can't be embedded
     * @param {number} competitorNum - 1 or 2
     * @param {string} videoId - YouTube video ID
     */
    function showThumbnailForCompetitor(competitorNum, videoId) {
        const wrapper = document.getElementById(`competitor${competitorNum}-wrapper`);
        const fallback = document.getElementById(`competitor${competitorNum}-youtube-fallback`);
        const thumbnail = document.getElementById(`competitor${competitorNum}-thumbnail`);
        
        if (!wrapper || !fallback || !thumbnail) {
            console.warn(`Could not find thumbnail elements for competitor ${competitorNum}`);
            return;
        }
        
        // Set thumbnail image
        thumbnail.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        
        // Fallback to medium quality if max doesn't exist
        thumbnail.onerror = () => {
            thumbnail.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        };
        
        // Set YouTube link
        fallback.href = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Show thumbnail, hide iframe
        wrapper.classList.add('show-thumbnail');
        fallback.classList.add('active');
        fallback.style.display = 'block';
        
        console.log(`📺 Showing thumbnail for competitor ${competitorNum} (video: ${videoId})`);
    }

    /**
     * Manual override for testing - call from console
     */
    window.forceVideoThumbnail = function(competitorNumber) {
        if (!currentMatch) {
            console.error('No current match loaded');
            return;
        }
        
        const videoId = competitorNumber === 1 
            ? currentMatch.competitor1.videoId 
            : currentMatch.competitor2.videoId;
        
        showThumbnailForCompetitor(competitorNumber, videoId);
    };


 // ========================================
// POST-VOTE MODAL WITH BOOK RECOMMENDATIONS
// ========================================

/**
 * Show post-vote modal with book recommendation
 * @param {string} songName - Name of the song voted for
 * @param {object} songData - Full song data from JSON
 */
// ========================================
// POST-VOTE MODAL WITH BOOK RECOMMENDATIONS & XP
// ========================================

/**
 * Show post-vote modal with book recommendation and XP earned
 * @param {string} songName - Name of the song voted for
 * @param {object} songData - Full song data from JSON
 * @param {object} xpData - XP earned data from calculateVoteXP
 * @param {object} rank - User's rank data from getUserRank
 */
function showPostVoteModal(songName, songData, xpData, rank) {
    const book = songData ? getBookForSong(songData) : null;
    
    // ✨ Calculate voting situation
    const votedFor = songData.seed === currentMatch.competitor1.seed ? 'song1' : 'song2';
    const userVotes = votedFor === 'song1' ? currentMatch.competitor1.votes : currentMatch.competitor2.votes;
    const opponentVotes = votedFor === 'song1' ? currentMatch.competitor2.votes : currentMatch.competitor1.votes;
    const userPct = votedFor === 'song1' ? currentMatch.competitor1.percentage : currentMatch.competitor2.percentage;
    const opponentPct = votedFor === 'song1' ? currentMatch.competitor2.percentage : currentMatch.competitor1.percentage;
    const opponentName = votedFor === 'song1' ? currentMatch.competitor2.name : currentMatch.competitor1.name;
    const voteDiff = Math.abs(userVotes - opponentVotes);
    const totalVotes = currentMatch.totalVotes;
    const pctDiff = Math.abs(userPct - opponentPct);
    
    // ========================================
    // DETERMINE VOTING SITUATION
    // ========================================
    let situationType = '';
    let modalIcon = '';
    let modalTitle = '';
    let successMessage = '';
    let shareMessage = '';
    let shareContext = '';
    
    // Early voting (< 5 votes total)
    if (totalVotes < 5) {
        situationType = 'early';
        modalIcon = '🌟';
        modalTitle = 'Early Voter!';
        successMessage = `
            <p class="modal-message early">
                You voted for <strong>"${songName}"</strong><br>
                <span class="stakes-text">Only ${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'} so far — this match needs more voters!</span>
            </p>
        `;
        shareContext = 'early';
        shareMessage = `
            <div class="share-cta urgent">
                <div class="share-header">
                    <span class="share-icon">🚀</span>
                    <strong>Be a Pioneer!</strong>
                </div>
                <p class="share-text">
                    This match just started! Help shape the results from the beginning.
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'early')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'early')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    }
    // Perfect tie
    else if (voteDiff === 0) {
        situationType = 'tied';
        modalIcon = '⚖️';
        modalTitle = 'Perfect Tie!';
        successMessage = `
            <p class="modal-message special">
                You just broke the deadlock!<br>
                <span class="stakes-text">"${songName}" and "${opponentName}" were exactly ${userVotes}-${opponentVotes}</span>
            </p>
        `;
        shareContext = 'tied';
        shareMessage = `
            <div class="share-cta extreme">
                <div class="share-header">
                    <span class="share-icon">⚖️</span>
                    <strong>This is INSANE!</strong>
                </div>
                <p class="share-text">
                    These songs were PERFECTLY TIED! Every single vote decides the winner.
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'tied')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'tied')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    }
    // Nail-biter (within 2 votes)
    else if (voteDiff <= 2) {
        situationType = 'nailbiter';
        modalIcon = '🔥';
        modalTitle = 'Nail-Biter!';
        successMessage = `
            <p class="modal-message special">
                You voted for <strong>"${songName}"</strong><br>
                <span class="stakes-text">Only ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'} separate these songs!</span>
            </p>
        `;
        shareContext = 'nailbiter';
        shareMessage = `
            <div class="share-cta extreme">
                <div class="share-header">
                    <span class="share-icon">🔥</span>
                    <strong>TOO CLOSE TO CALL!</strong>
                </div>
                <p class="share-text">
                    Just ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'} separate these songs. Your vote could decide everything!
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'nailbiter')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'nailbiter')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    }
    // Losing but salvageable (behind by 3-5 votes)
    else if (userPct < opponentPct && voteDiff <= 5) {
        situationType = 'losing-close';
        modalIcon = '⚔️';
        modalTitle = 'Fighting for It!';
        successMessage = `
            <p class="modal-message special">
                You're fighting for <strong>"${songName}"</strong>!<br>
                <span class="stakes-text">Behind by just ${voteDiff} votes (${userPct}% vs ${opponentPct}%)</span>
            </p>
        `;
        shareContext = 'losing-close';
        shareMessage = `
            <div class="share-cta urgent">
                <div class="share-header">
                    <span class="share-icon">⚔️</span>
                    <strong>Comeback Time!</strong>
                </div>
                <p class="share-text">
                    "${songName}" is behind by just ${voteDiff} votes! A comeback is totally possible — rally support!
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'losing-close')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'losing-close')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    }
    // Losing badly (behind by 6+ votes)
    else if (userPct < opponentPct) {
        situationType = 'losing-bad';
        modalIcon = '🆘';
        modalTitle = 'Save It!';
        successMessage = `
            <p class="modal-message special">
                You voted to save <strong>"${songName}"</strong>!<br>
                <span class="stakes-text">But it's losing ${userPct}% to ${opponentPct}% — it needs a miracle!</span>
            </p>
        `;
        shareContext = 'losing-bad';
        shareMessage = `
            <div class="share-cta urgent">
                <div class="share-header">
                    <span class="share-icon">📢</span>
                    <strong>EMERGENCY: Rally the Community!</strong>
                </div>
                <p class="share-text">
                    "${songName}" is down ${pctDiff}% and needs your help to survive. Share now to rally supporters!
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'losing-bad')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'losing-bad')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    }
    // Winning but close (within 10%)
    else if (pctDiff <= 10) {
        situationType = 'winning-close';
        modalIcon = '📊';
        modalTitle = 'Leading!';
        successMessage = `
            <p class="modal-message">
                Great choice! <strong>"${songName}"</strong> is leading!<br>
                <span class="stakes-text">Currently ${userPct}% to ${opponentPct}% — but it's still competitive!</span>
            </p>
        `;
        shareContext = 'winning-close';
        shareMessage = `
            <div class="share-cta">
                <div class="share-header">
                    <span class="share-icon">📊</span>
                    <strong>Maintain the Lead!</strong>
                </div>
                <p class="share-text">
                    "${songName}" is ahead but the race is still close. Help secure the victory!
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'winning-close')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'winning-close')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    }
    // Dominating (winning by 10%+)
    else {
        situationType = 'dominating';
        modalIcon = '🎯';
        modalTitle = 'Dominating!';
        successMessage = `
            <p class="modal-message victory">
                "${songName}" is crushing it at ${userPct}%!<br>
                <span class="stakes-text">Keep the momentum going!</span>
            </p>
        `;
        shareContext = 'dominating';
        shareMessage = `
            <div class="share-cta calm">
                <div class="share-header">
                    <span class="share-icon">🎯</span>
                    <strong>Victory Lap!</strong>
                </div>
                <p class="share-text">
                    "${songName}" is dominating! Share the tournament with the community:
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'dominating')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'dominating')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    }
    
    // ========================================
    // ✅ NEW: XP EARNED SECTION
    // ========================================
    let xpSection = `
        <div class="xp-earned-section">
            <div class="xp-header">
                <span class="xp-icon">✨</span>
                <div class="xp-details">
                    <div class="xp-amount">+${xpData.totalXP} XP</div>
                    <div class="xp-breakdown">
                        <span class="xp-base">+${xpData.baseXP} Base</span>
                        ${xpData.bonuses.map(bonus => `
                            <span class="xp-bonus">+${bonus.xp} ${bonus.type}</span>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="xp-progress-container">
                <div class="xp-level-info">
                    <span class="xp-level-badge">${rank.currentLevel.title}</span>
                    <span class="xp-level-text">Level ${rank.currentLevel.level}</span>
                </div>
                ${rank.nextLevel ? `
                    <div class="xp-bar-wrapper">
                        <div class="xp-bar" style="width: ${rank.progressPercentage}%"></div>
                    </div>
                    <div class="xp-next-level">
                        ${rank.progressXP.toLocaleString()} / ${rank.xpForNextLevel.toLocaleString()} to Level ${rank.nextLevel.level}
                    </div>
                ` : `
                    <div class="xp-max-level">🏆 Maximum Level Reached!</div>
                `}
            </div>
        </div>
    `;
    
    // ========================================
    // BUILD BOOK SECTION (existing code)
    // ========================================
    let bookSection = '';
    if (book) {
        bookSection = `
            <div class="book-earned-section">
                <div class="book-icon">${book.icon || '📖'}</div>
                <div class="book-info">
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-description">${book.description}</p>
                    <div class="book-stats">
                        <span class="book-rarity ${book.rarity}">${book.rarity.toUpperCase()}</span>
                        <span class="book-points">+${book.points} pts</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // ========================================
    // MODAL HTML
    // ========================================
    const modal = document.getElementById('vote-modal');
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closePostVoteModal()"></div>
        <div class="modal-content post-vote-content ${situationType}">
            <button class="modal-close" onclick="closePostVoteModal()">×</button>
            
            <div class="modal-success-icon ${situationType}">
                ${modalIcon}
            </div>
            <h2 class="modal-title">
                ${modalTitle}
            </h2>
            ${successMessage}
            
            ${xpSection}
            
            ${bookSection}
            
            ${shareMessage}
            
            <div class="modal-actions">
                <button class="modal-btn primary" onclick="closePostVoteModal()">
                    Continue Voting
                </button>
                <a href="/matches.html" class="modal-btn secondary">
                    View All Matches
                </a>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    console.log(`✅ Post-vote modal shown (${situationType}) with ${xpData.totalXP} XP`);
}

// ========================================
// SHARE FUNCTIONS
// ========================================

window.shareToTwitter = function(songName, context) {
    const matchUrl = window.location.href;
    let tweetText = '';
    
    // Get opponent name
    const opponentName = songName === currentMatch.competitor1.name 
        ? currentMatch.competitor2.name 
        : currentMatch.competitor1.name;
    
    // Get vote difference for context
    const voteDiff = Math.abs(currentMatch.competitor1.votes - currentMatch.competitor2.votes);
    
    switch(context) {
        case 'early':
            tweetText = `🌟 Just cast an early vote for "${songName}" in the League Music Tournament! Be part of the action:\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'tied':
            tweetText = `⚖️ PERFECT TIE! "${songName}" vs "${opponentName}" in the League Tournament! Cast the deciding vote!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'nailbiter':
            tweetText = `🔥 NAIL-BITER! "${songName}" needs your vote! Just ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'} separate these songs!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'losing-close':
            tweetText = `⚔️ "${songName}" is behind by ${voteDiff} votes but can still win! Help with a comeback!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'losing-bad':
            tweetText = `🆘 EMERGENCY! "${songName}" is losing badly in the League Music Tournament! Rally support now!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'winning-close':
            tweetText = `📊 "${songName}" is leading in the League Tournament, but it's still close! Help secure the victory!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'dominating':
            tweetText = `🎯 "${songName}" is DOMINATING in the League Music Tournament! Join the winning side!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'losing': // Legacy fallback
            tweetText = `🚨 "${songName}" is being eliminated! Help save it!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'close': // Legacy fallback
            tweetText = `🔥 "${songName}" vs "${opponentName}" is TOO CLOSE!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'competitive': // Legacy fallback
            tweetText = `⚔️ I just voted for "${songName}" in the League Music Tournament!\n\n${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        default:
            tweetText = `🎵 I voted in the League Music Tournament! Which League song is YOUR favorite?\n\n${matchUrl}\n\n#LeagueMusicTournament`;
    }
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    
    console.log(`📤 Shared to Twitter (${context})`);
};

window.shareToReddit = function(songName, context) {
    const matchUrl = window.location.href;
    let title = '';
    let text = '';
    
    const opponentName = songName === currentMatch.competitor1.name 
        ? currentMatch.competitor2.name 
        : currentMatch.competitor1.name;
    const voteDiff = Math.abs(currentMatch.competitor1.votes - currentMatch.competitor2.votes);
    
    switch(context) {
        case 'early':
            title = `Early voting is open for "${songName}" in the League Music Tournament!`;
            text = `Just cast one of the first votes in this matchup! Be part of shaping the results from the start.\n\nVote here: ${matchUrl}`;
            break;
        case 'tied':
            title = `[PERFECT TIE] "${songName}" vs "${opponentName}" - Cast the deciding vote!`;
            text = `These songs are EXACTLY tied! Every single vote matters right now.\n\nVote here: ${matchUrl}`;
            break;
        case 'nailbiter':
            title = `[NAIL-BITER] "${songName}" matchup separated by just ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'}!`;
            text = `This is as close as it gets! Come cast your vote in this insane matchup.\n\nVote here: ${matchUrl}`;
            break;
        case 'losing-close':
            title = `"${songName}" is behind but can still win with your help!`;
            text = `"${songName}" is only ${voteDiff} votes behind. A comeback is totally possible!\n\nVote here: ${matchUrl}`;
            break;
        case 'losing-bad':
            title = `[URGENT] "${songName}" needs a miracle comeback in the League Tournament!`;
            text = `"${songName}" is being eliminated! If you love this song, vote now to rally support!\n\nVote here: ${matchUrl}`;
            break;
        case 'winning-close':
            title = `"${songName}" is leading but the race is still close!`;
            text = `Help maintain the lead and secure the victory for "${songName}"!\n\nVote here: ${matchUrl}`;
            break;
        case 'dominating':
            title = `"${songName}" is dominating in the League Music Tournament!`;
            text = `Come vote in the League Music Tournament and see the results!\n\nVote here: ${matchUrl}`;
            break;
        case 'losing': // Legacy fallback
            title = `"${songName}" is being eliminated! Rally to save it!`;
            text = `"${songName}" is currently losing. If you love this song, vote now!\n\nVote here: ${matchUrl}`;
            break;
        case 'close': // Legacy fallback
            title = `NAIL-BITER: "${songName}" matchup is too close to call!`;
            text = `This matchup is separated by just a few votes! Every vote matters.\n\nVote here: ${matchUrl}`;
            break;
        default:
            title = `League Music Tournament - Vote for your favorite songs!`;
            text = `I just voted in the League Music Tournament! Come vote for your favorites.\n\n${matchUrl}`;
    }
    
    const redditUrl = `https://reddit.com/submit?url=${encodeURIComponent(matchUrl)}&title=${encodeURIComponent(title)}`;
    window.open(redditUrl, '_blank', 'width=800,height=600');
    
    console.log(`📤 Shared to Reddit (${context})`);
};

window.copyMatchLink = function() {
    const matchUrl = window.location.href;
    
    navigator.clipboard.writeText(matchUrl).then(() => {
        showNotification('Link copied to clipboard! 🔗', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const tempInput = document.createElement('input');
        tempInput.value = matchUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showNotification('Link copied! 🔗', 'success');
    });
    
    console.log('📋 Match link copied to clipboard');
};

/**
 * Close post-vote modal
 */
function closePostVoteModal() {
    const modal = document.getElementById('vote-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Track book clicks for analytics
 * @param {string} songSlug - Song identifier
 * @param {string} location - Where the click occurred
 */
function trackBookClick(songSlug, location) {
    console.log(`📊 Book clicked: ${songSlug} from ${location}`);
    // Add analytics tracking here if needed (Google Analytics, etc.)
}

// Make functions available globally
window.closePostVoteModal = closePostVoteModal;
window.trackBookClick = trackBookClick;
    // ========================================
    // EVENT LISTENERS
    // ========================================

    // Vote button handlers
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('vote-btn') || e.target.closest('.vote-btn')) {
            const button = e.target.classList.contains('vote-btn') ? e.target : e.target.closest('.vote-btn');
            const songId = button.dataset.competitor;
            
            if (songId && currentMatch) {
                await submitVote(songId);
            }
        }
    });

    // Video control handlers - Replay
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('replay-btn') || e.target.closest('.replay-btn')) {
            const button = e.target.classList.contains('replay-btn') ? e.target : e.target.closest('.replay-btn');
            const videoId = button.dataset.video;
            const iframe = document.getElementById(`${videoId}-video`);
            
            if (iframe) {
                const src = iframe.src;
                iframe.src = src; // Reload iframe to replay video
                console.log('🔄 Replaying video:', videoId);
            }
        }
    });

    // Video control handlers - Fullscreen
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('fullscreen-btn') || e.target.closest('.fullscreen-btn')) {
            const button = e.target.classList.contains('fullscreen-btn') ? e.target : e.target.closest('.fullscreen-btn');
            const videoId = button.dataset.video;
            const iframe = document.getElementById(`${videoId}-video`);
            
            if (iframe) {
                if (iframe.requestFullscreen) {
                    iframe.requestFullscreen();
                } else if (iframe.webkitRequestFullscreen) {
                    iframe.webkitRequestFullscreen();
                } else if (iframe.mozRequestFullScreen) {
                    iframe.mozRequestFullScreen();
                } else if (iframe.msRequestFullscreen) {
                    iframe.msRequestFullscreen();
                }
                console.log('⛶ Fullscreen requested:', videoId);
            }
        }
    });

    // Share button handlers
    document.addEventListener('click', (e) => {
        // Twitter share
        if (e.target.classList.contains('twitter') || e.target.closest('.twitter')) {
            const shareUrl = encodeURIComponent(window.location.href);
            const shareText = encodeURIComponent(`Vote now: ${currentMatch.competitor1.name} vs ${currentMatch.competitor2.name} | League Music Tournament`);
            window.open(`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`, '_blank');
        }
        
        // Facebook share
        if (e.target.classList.contains('facebook') || e.target.closest('.facebook')) {
            const shareUrl = encodeURIComponent(window.location.href);
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, '_blank');
        }
        
        // Reddit share
        if (e.target.classList.contains('reddit') || e.target.closest('.reddit')) {
            const shareUrl = encodeURIComponent(window.location.href);
            const shareText = encodeURIComponent(`Vote now: ${currentMatch.competitor1.name} vs ${currentMatch.competitor2.name}`);
            window.open(`https://reddit.com/submit?url=${shareUrl}&title=${shareText}`, '_blank');
        }
        
        // Copy link
        if (e.target.classList.contains('copy') || e.target.closest('.copy')) {
            navigator.clipboard.writeText(window.location.href).then(() => {
                showNotification('Link copied to clipboard!', 'success');
            }).catch(() => {
                showNotification('Failed to copy link', 'error');
            });
        }
    });

    // Back button handler
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // Modal handlers
    function closeModal() {
        const modal = document.getElementById('vote-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('vote-modal');
        if (e.target === modal) {
            closeModal();
        }
    });

    // Make closeModal available globally for inline onclick if needed
    window.closeModal = closeModal;

    console.log('✅ Vote.js loaded with IP + Fingerprint security');

   