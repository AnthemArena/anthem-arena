// ========================================
// VOTE PAGE FUNCTIONALITY - LEAGUE MUSIC TOURNAMENT
// ========================================

// Import Firebase
import { db } from './firebase-config.js';
import { doc, updateDoc, increment, getDoc, collection, query, where, getDocs, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAllTournamentStats } from './music-gallery.js';
import { getBookForSong } from './bookMappings.js';

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
// Line 68 - Accept both 'id' and 'match' parameters for backwards compatibility
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
        console.log('📥 Loading match data from Firebase...');

         // ⭐ Load song data from JSON first
        if (allSongsData.length === 0) {
            await loadSongData();
        }
        
        // Get match from Firebase
const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchId);
        const matchDoc = await getDoc(matchRef);
        
        if (!matchDoc.exists()) {
            console.error('❌ Match not found in Firebase:', matchId);
            showNotification('Match not found', 'error');
            return;
        }
        
        const matchData = matchDoc.data();
        console.log('✅ Match data loaded:', matchData);
        
        // Convert Firebase format to page format
        currentMatch = {
            id: matchData.matchId,
            round: matchData.round || 1, // ⭐ ADDED: Store round number
            status: matchData.status,
            totalVotes: matchData.totalVotes || 0,
            competitor1: {
                id: 'song1',
                seed: matchData.song1.seed,
                name: matchData.song1.shortTitle,
                source: `${matchData.song1.artist} • ${matchData.song1.year}`,
                videoId: matchData.song1.videoId,
                votes: matchData.song1.votes || 0,
                percentage: 50
            },
            competitor2: {
                id: 'song2',
                seed: matchData.song2.seed,
                name: matchData.song2.shortTitle,
                source: `${matchData.song2.artist} • ${matchData.song2.year}`,
                videoId: matchData.song2.videoId,
                votes: matchData.song2.votes || 0,
                percentage: 50
            }
        };
        
        // Calculate percentages
        if (currentMatch.totalVotes > 0) {
            currentMatch.competitor1.percentage = Math.round((currentMatch.competitor1.votes / currentMatch.totalVotes) * 100);
            currentMatch.competitor2.percentage = Math.round((currentMatch.competitor2.votes / currentMatch.totalVotes) * 100);
        }
        
        // ⭐ UPDATED: Check if user already voted (using new system)
        await checkVoteStatus();
        
        // Update page content
        await updatePageContent();
        
        // ✨ NEW: Add dynamic stats and descriptions
        await updateCompetitorInfo(currentMatch);
        
        // Initialize YouTube players
        initializeYouTubePlayers();

           // ========================================
        // ✨ NEW: START REAL-TIME UPDATES
        // ========================================
        setTimeout(() => {
            startRealTimeUpdates();
        }, 5000); // Start after 5 seconds (give page time to settle)
        
    } catch (error) {
        console.error('❌ Error loading match:', error);
        showNotification('Error loading match data', 'error');
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
            
            // Also store in localStorage for quick checking
            localStorage.setItem(`vote_${currentMatch.id}`, voteData.choice);
            
            // Disable vote buttons
            disableVoting(voteData.choice);
        } else {
            // Double-check localStorage as backup
            const localVote = localStorage.getItem(`vote_${currentMatch.id}`);
            if (localVote) {
                hasVoted = true;
                console.log('✅ Found vote in localStorage:', localVote);
                disableVoting(localVote);
            }
        }
    } catch (error) {
        console.error('⚠️ Error checking vote status:', error);
        // Fallback to localStorage only
        const localVote = localStorage.getItem(`vote_${currentMatch.id}`);
        if (localVote) {
            hasVoted = true;
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
    
    // Update time remaining
    const timeRemaining = document.getElementById('time-remaining');
    if (timeRemaining) {
        if (currentMatch.status === 'live') {
            timeRemaining.innerHTML = '🔴 LIVE NOW';
            timeRemaining.style.color = '#ff4444';
        } else if (currentMatch.status === 'upcoming') {
            timeRemaining.innerHTML = '⏰ Coming Soon';
        } else if (currentMatch.status === 'completed') {
            timeRemaining.innerHTML = '✅ Voting Closed';
        } else {
            timeRemaining.innerHTML = '⏰ Vote Now';
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
    // ✨ NEW: ADD URGENCY INDICATORS
    // ========================================
    updateVoteUrgency();
    
    
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
    // Don't show if already voted
    if (hasVoted) return;
    
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
// ⭐ UPDATED: SUBMIT VOTE TO FIREBASE
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
        
        // Create vote document
        await setDoc(voteRef, {
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
        
        // Update match vote counts
const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, currentMatch.id);
        
        await updateDoc(matchRef, {
            totalVotes: increment(1),
            [`song${votedForSong1 ? '1' : '2'}.votes`]: increment(1)
        });
        
        console.log('✅ Vote counts updated in match');
        
        // Save vote locally as backup
        localStorage.setItem(`vote_${currentMatch.id}`, songId);
        
              // Reload match data to show updated counts
        await reloadMatchData();

        // ✅ Get full song data for modal (not just slug)
        const songSeed = votedForSong1 ? currentMatch.competitor1.seed : currentMatch.competitor2.seed;
        const songName = votedForSong1 ? currentMatch.competitor1.name : currentMatch.competitor2.name;
        const songData = allSongsData.find(s => s.seed === songSeed);
        
        // Show success notification
        showNotification(`✅ Vote cast for "${songName}"!`, 'success');
        
        // Show voted indicator
        disableVoting(songId);
        
        // ✨ Show post-vote modal with book recommendation
        setTimeout(() => {
            showPostVoteModal(songName, songData);
        }, 800);
        
        console.log('✅ Vote submitted successfully!');

         // ========================================
        // ✨ NEW: STOP UPDATES AFTER VOTING
        // ========================================
        stopRealTimeUpdates();
        console.log('⏹️ Stopped real-time updates (user has voted)');
        
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
// RELOAD MATCH DATA
// ========================================

async function reloadMatchData() {
    try {
const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, currentMatch.id);
        const matchDoc = await getDoc(matchRef);
        
        if (matchDoc.exists()) {
            const matchData = matchDoc.data();
            
            // Update vote counts
            currentMatch.competitor1.votes = matchData.song1.votes || 0;
            currentMatch.competitor2.votes = matchData.song2.votes || 0;
            currentMatch.totalVotes = matchData.totalVotes || 0;
            
            // Recalculate percentages
            if (currentMatch.totalVotes > 0) {
                currentMatch.competitor1.percentage = Math.round((currentMatch.competitor1.votes / currentMatch.totalVotes) * 100);
                currentMatch.competitor2.percentage = Math.round((currentMatch.competitor2.votes / currentMatch.totalVotes) * 100);
            }
            
            // Update UI
            const comp1Percentage = document.getElementById('competitor1-percentage');
            const comp1Votes = document.getElementById('competitor1-votes');
            const comp2Percentage = document.getElementById('competitor2-percentage');
            const comp2Votes = document.getElementById('competitor2-votes');
            const totalVotesEl = document.getElementById('total-votes');
            
            if (comp1Percentage) comp1Percentage.textContent = `${currentMatch.competitor1.percentage}%`;
            if (comp1Votes) comp1Votes.textContent = `${currentMatch.competitor1.votes.toLocaleString()} votes`;
            if (comp2Percentage) comp2Percentage.textContent = `${currentMatch.competitor2.percentage}%`;
            if (comp2Votes) comp2Votes.textContent = `${currentMatch.competitor2.votes.toLocaleString()} votes`;
            if (totalVotesEl) totalVotesEl.innerHTML = `📊 ${currentMatch.totalVotes.toLocaleString()} votes cast`;
            
            console.log('✅ Match data reloaded');
        }
    } catch (error) {
        console.error('⚠️ Error reloading match data:', error);
    }
}

// ========================================
// ✨ NEW: REAL-TIME VOTE UPDATES
// ========================================

let updateInterval = null;

/**
 * Start polling for vote updates every 10 seconds
 */
function startRealTimeUpdates() {

        // ✅ ADD THIS CHECK FIRST (prevents the error)
    if (!currentMatch) {
        console.log('⏸️ No match loaded yet, skipping real-time updates');
        return;
    }

    if (currentMatch.status !== 'live') {
        console.log('⏸️ Match not live, skipping real-time updates');
        return;
    }
    
    if (updateInterval) {
        console.log('⏸️ Real-time updates already running');
        return;
    }
    
    console.log('🔄 Starting real-time vote updates...');
    
    // ✨ Show live indicator
    showLiveIndicator();
    
    updateInterval = setInterval(async () => {
        try {
            console.log('🔄 Fetching latest votes...');
            await reloadMatchData();
            
            if (!hasVoted) {
                updateVoteUrgency();
            }
            
        } catch (error) {
            console.error('❌ Error during real-time update:', error);
        }
    }, 10000);
    
    console.log('✅ Real-time updates started');
}

/**
 * Show visual indicator that updates are running
 */
function showLiveIndicator() {
    // Check if already exists
    if (document.getElementById('live-update-indicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'live-update-indicator';
    indicator.innerHTML = `
        <span class="live-dot"></span>
        <span class="live-text">LIVE</span>
    `;
    
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 68, 68, 0.1);
        border: 2px solid #ff4444;
        color: #ff4444;
        padding: 0.5rem 1rem;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
    `;
    
    document.body.appendChild(indicator);
    
    // Add pulsing dot
    const style = document.createElement('style');
    style.textContent = `
        .live-dot {
            width: 8px;
            height: 8px;
            background: #ff4444;
            border-radius: 50%;
            animation: livePulse 2s ease-in-out infinite;
        }
        
        @keyframes livePulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Remove live indicator
 */
function hideLiveIndicator() {
    const indicator = document.getElementById('live-update-indicator');
    if (indicator) {
        indicator.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => indicator.remove(), 300);
    }
}

/**
 * Stop polling for updates
 */
function stopRealTimeUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
        hideLiveIndicator(); // ✨ Hide indicator
        console.log('⏹️ Real-time updates stopped');
    }
}


// ========================================
// NOTIFICATION SYSTEM
// ========================================

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Style based on type
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
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
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
            transform: translateX(400px);
            opacity: 0;
        }
    }
    
    @keyframes slideDown {
        from {
            transform: translateY(-20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    .meta-item.winning {
        color: #00c896;
        font-weight: 600;
    }
    
    .meta-item.hot-streak {
        color: #ff6b35;
        font-weight: 600;
    }
    
    .meta-item.debut {
        color: #4a9eff;
        font-weight: 600;
    }
`;
document.head.appendChild(style);

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
function showPostVoteModal(songName, songData) {
    const book = songData ? getBookForSong(songData) : null;
    
    // ✨ Calculate if they saved a losing song
    const votedFor = songData.seed === currentMatch.competitor1.seed ? 'song1' : 'song2';
    const comp1Pct = currentMatch.competitor1.percentage;
    const comp2Pct = currentMatch.competitor2.percentage;
    const voteDiff = Math.abs(currentMatch.competitor1.votes - currentMatch.competitor2.votes);
    
    const wasLosing = (votedFor === 'song1' && comp1Pct < comp2Pct) || 
                     (votedFor === 'song2' && comp2Pct < comp1Pct);
    
    const wasTied = Math.abs(comp1Pct - comp2Pct) <= 2;
    const isClose = Math.abs(comp1Pct - comp2Pct) <= 10;
    
    // ========================================
    // DYNAMIC SUCCESS MESSAGE
    // ========================================
    let successMessage = '';
    let shareMessage = '';
    
    if (wasLosing) {
        // They voted for the LOSING song - rally support!
        successMessage = `
            <p class="modal-message special">
                🔥 You voted to save <strong>"${songName}"</strong> from elimination!<br>
                <span class="stakes-text">But it's still losing ${Math.abs(comp1Pct - comp2Pct)}% to ${comp1Pct < comp2Pct ? currentMatch.competitor2.name : currentMatch.competitor1.name}</span>
            </p>
        `;
        shareMessage = `
            <div class="share-cta urgent">
                <div class="share-header">
                    <span class="share-icon">📢</span>
                    <strong>Rally Support!</strong>
                </div>
                <p class="share-text">
                    "${songName}" needs more votes to survive. Share this match to rally the community!
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'losing')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'losing')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    } else if (wasTied) {
        // NAIL-BITER
        successMessage = `
            <p class="modal-message special">
                ⚖️ You voted in a <strong>nail-biter</strong>!<br>
                <span class="stakes-text">Only ${voteDiff} ${voteDiff === 1 ? 'vote' : 'votes'} separate these songs!</span>
            </p>
        `;
        shareMessage = `
            <div class="share-cta close">
                <div class="share-header">
                    <span class="share-icon">🔥</span>
                    <strong>This Race is TOO CLOSE!</strong>
                </div>
                <p class="share-text">
                    Help decide this matchup! Every vote matters.
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'close')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'close')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    } else if (isClose) {
        // COMPETITIVE but not tied
        successMessage = `
            <p class="modal-message">
                Thanks for voting for <strong>"${songName}"</strong>!<br>
                <span class="stakes-text">This is a close race - every vote counts!</span>
            </p>
        `;
        shareMessage = `
            <div class="share-cta">
                <div class="share-header">
                    <span class="share-icon">📊</span>
                    <strong>Keep the Momentum Going!</strong>
                </div>
                <p class="share-text">
                    Share this match to bring more voters!
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'competitive')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'competitive')">
                        <span class="btn-icon">🔶</span> Reddit
                    </button>
                    <button class="share-btn copy" onclick="copyMatchLink()">
                        <span class="btn-icon">🔗</span> Copy Link
                    </button>
                </div>
            </div>
        `;
    } else {
        // BLOWOUT - less urgent
        successMessage = `
            <p class="modal-message">
                Thanks for voting for <strong>"${songName}"</strong>!
            </p>
        `;
        shareMessage = `
            <div class="share-cta calm">
                <p class="share-text">
                    Share this tournament with the community:
                </p>
                <div class="share-buttons">
                    <button class="share-btn twitter" onclick="shareToTwitter('${songName}', 'voted')">
                        <span class="btn-icon">🐦</span> Tweet
                    </button>
                    <button class="share-btn reddit" onclick="shareToReddit('${songName}', 'voted')">
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
    const modal = document.getElementById('postVoteModal');
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closePostVoteModal()"></div>
        <div class="modal-content post-vote-content">
            <button class="modal-close" onclick="closePostVoteModal()">×</button>
            
            <div class="modal-success-icon ${wasLosing ? 'save-icon' : wasTied ? 'tied-icon' : ''}">
                ${wasLosing ? '🛡️' : wasTied ? '⚖️' : '✓'}
            </div>
            <h2 class="modal-title">
                ${wasLosing ? 'Clutch Vote!' : wasTied ? 'Nail-Biter!' : 'Vote Recorded!'}
            </h2>
            ${successMessage}
            
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
    document.body.style.overflow = 'hidden';
}

// ========================================
// SHARE FUNCTIONS
// ========================================

window.shareToTwitter = function(songName, context) {
    const matchUrl = window.location.href;
    let tweetText = '';
    
    switch(context) {
        case 'losing':
            tweetText = `🚨 "${songName}" is being eliminated in the League Music Tournament! Help save it!\n\nVote now: ${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'close':
            tweetText = `🔥 NAIL-BITER! "${songName}" vs "${currentMatch.competitor1.seed === getSongData(songName).seed ? currentMatch.competitor2.name : currentMatch.competitor1.name}" is TOO CLOSE!\n\nVote now: ${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        case 'competitive':
            tweetText = `⚔️ I just voted for "${songName}" in the League Music Tournament!\n\nCast your vote: ${matchUrl}\n\n#LeagueMusicTournament`;
            break;
        default:
            tweetText = `🎵 I voted in the League Music Tournament! Which League song is YOUR favorite?\n\nVote now: ${matchUrl}\n\n#LeagueMusicTournament`;
    }
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
};

window.shareToReddit = function(songName, context) {
    const matchUrl = window.location.href;
    let title = '';
    let text = '';
    
    switch(context) {
        case 'losing':
            title = `"${songName}" is being eliminated! Rally to save it!`;
            text = `"${songName}" is currently losing in the League Music Tournament. If you love this song, vote now to keep it alive!\n\nVote here: ${matchUrl}`;
            break;
        case 'close':
            title = `NAIL-BITER: "${songName}" matchup is too close to call!`;
            text = `This matchup is separated by just a few votes! Every vote matters.\n\nCast your vote: ${matchUrl}`;
            break;
        default:
            title = `League Music Tournament - Vote for your favorite songs!`;
            text = `I just voted in the League Music Tournament! Come vote for your favorites.\n\n${matchUrl}`;
    }
    
    const redditUrl = `https://reddit.com/submit?url=${encodeURIComponent(matchUrl)}&title=${encodeURIComponent(title)}`;
    window.open(redditUrl, '_blank', 'width=800,height=600');
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
};

/**
 * Close post-vote modal
 */
function closePostVoteModal() {
    const modal = document.getElementById('post-vote-modal');
    if (modal) {
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

// ========================================
// CLEANUP: STOP UPDATES ON PAGE UNLOAD
// ========================================

window.addEventListener('beforeunload', () => {
    stopRealTimeUpdates();
    console.log('👋 Page unloading, stopped real-time updates');
});

// Also stop if user navigates away via browser buttons
window.addEventListener('pagehide', () => {
    stopRealTimeUpdates();
});

// Stop updates if user switches tabs (optional - saves resources)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('👁️ Tab hidden, pausing updates');
        stopRealTimeUpdates();
    } else {
        console.log('👁️ Tab visible, resuming updates');
        
        // ✅ CHANGE THIS LINE - only restart if match loaded
        if (currentMatch) {
            startRealTimeUpdates();
        }
    }
});