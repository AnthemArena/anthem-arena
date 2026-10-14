// ========================================
// BRACKETS PAGE FUNCTIONALITY
// Single-elimination bracket of ANY size (2 to 128 entries), or a group stage (groups of 4, top 2 qualify) followed by a knockout.
// Everything on the page is drawn from the match documents themselves: the number of rounds, the round
// names, the entry count and the champion all come from the data. Nothing here assumes a 64-bracket.
// ========================================

// Import API Client (uses Netlify Edge cache)
import { getAllMatches } from './api-client.js';

// Keep Firebase imports for tournament info updates only
import { db } from './firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ✅ ADD THIS LINE:
import { ARCANE_CONFIG } from './arcane-config.js';
import { roundLabel } from './bracket-builder.js';   // same round names the builder stores on each match
import { describeCup } from './group-builder.js';
import { buildGroupViews, groupStageHtml, stageTabsHtml, knockoutNoteHtml, defaultStage, cupSummary } from './brackets-groups.js';
const ACTIVE_TOURNAMENT = ARCANE_CONFIG.tournamentId;

// Facts about the bracket on screen, worked out from the matches in describeBracket().
let bracketInfo = { totalRounds: 1, entries: 0, cupName: 'Tournament' };

// Titles and creator names come from YouTube, so never put them into HTML unescaped.
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ========================================
// HELPER: CHECK IF USER VOTED IN MATCH
// ========================================

function checkUserVoted(matchId) {
    const userVote = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${matchId}`);
    return !!userVote; // Returns true if user has voted
}

// Initialize global match database
if (typeof window.matchDatabase === 'undefined') {
    window.matchDatabase = {};
}

// ========================================
// HELPER FUNCTIONS
// ========================================

// Facts about the bracket, taken from the match documents. Single elimination: { totalRounds, entries, cupName } as always.
// A group-stage cup adds { isGroupCup, groups, qualifiers, knockoutBuilt, firstKnockoutRound ... } (see describeCup).
function describeBracket(matches) {
    return describeCup(matches);
}

// What to show in an empty slot: "Winner of R1 M3" when we know which match feeds it, otherwise "TBD".
function slotName(song, byId) {
    if (song.id !== 'TBD') return song.shortTitle || song.title;
    const source = song.sourceMatch ? byId.get(song.sourceMatch) : null;
    if (!source) return 'TBD';
    // in a group-stage cup round 2 is the first knockout round, so say its name instead of "R2"
    return `Winner of ${bracketInfo.isGroupCup ? (source.roundLabel || `R${source.round}`) : `R${source.round}`} M${source.matchNumber}`;
}

// ========================================
// LOAD BRACKET DATA FROM FIREBASE
// ========================================

async function loadBracketData() {
    try {
        console.log('📥 Loading bracket data from edge cache...');
        
        showBracketLoading();
        
        // ✅ Use normal edge cache (no force bypass)
        const firebaseMatches = await getAllMatches();
        
        if (!firebaseMatches || firebaseMatches.length === 0) {
            console.error('❌ No matches found!');
            hideBracketLoading();
            showEmptyState();
            return;
        }
        
        console.log(`✅ Loaded ${firebaseMatches.length} matches from edge cache`);
        
        // Sort by match number
        firebaseMatches.sort((a, b) => a.matchNumber - b.matchNumber);
        bracketInfo = describeBracket(firebaseMatches);
        
        // Generate bracket HTML
        await generateBracketFromFirebase(firebaseMatches);
        
        // Update tournament info
        await updateTournamentInfo(firebaseMatches);
        
        hideBracketLoading();
        showBracketSections();
        applyStage();   // group-stage cups: show the Groups or the Knockout tab (single elimination: nothing to do)
        
    } catch (error) {
        console.error('❌ Error loading bracket data:', error);
        hideBracketLoading();
        showErrorState(error);
    }
}

// ========================================
// LOADING STATE HELPERS
// ========================================

function showBracketLoading() {
    const loadingState = document.getElementById('bracketLoadingState');
    if (loadingState) {
        loadingState.style.display = 'block';
    }
    
    // Hide main sections while loading
    hideBracketSections();
    
    console.log('⏳ Showing bracket loading state');
}

function hideBracketLoading() {
    const loadingState = document.getElementById('bracketLoadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    
    console.log('✅ Hiding bracket loading state');
}

function showBracketSections() {
    // Show all bracket-related sections with fade-in animation
    const sections = [
        'tournamentSelector',
        'bracketNavigation', 
        'bracketSection'
    ];
    
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'block';
            section.classList.add('bracket-fade-in');
        }
    });
    
    console.log('✅ Bracket sections visible');
}

function hideBracketSections() {
    const sections = [
        'tournamentSelector',
        'bracketNavigation',
        'bracketSection',
        'stageTabsSection',
        'groupStageSection'
    ];
    
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'none';
            section.classList.remove('bracket-fade-in');
        }
    });
}

function showEmptyState() {
    const bracketSection = document.getElementById('bracketSection');
    if (bracketSection) {
        bracketSection.style.display = 'block';
        bracketSection.innerHTML = `
            <div class="container">
                <div class="empty-bracket-state">
                    <div class="empty-icon">🏆</div>
                    <h3>No Bracket Data Yet</h3>
                    <p>The tournament bracket will appear here once matches are scheduled.</p>
                    <a href="/admin" class="retry-btn">Open the admin page</a>
                </div>
            </div>
        `;
    }
}

function showErrorState(error) {
    const bracketSection = document.getElementById('bracketSection');
    if (bracketSection) {
        bracketSection.style.display = 'block';
        bracketSection.innerHTML = `
            <div class="container">
                <div class="empty-bracket-state error">
                    <div class="empty-icon">⚠️</div>
                    <h3>Error Loading Bracket</h3>
                    <p>Could not load tournament bracket. Please try refreshing the page.</p>
                    <p style="font-size: 0.9rem; color: rgba(255, 255, 255, 0.5); margin-top: 0.5rem;">
                        Error: ${error.message}
                    </p>
                    <button onclick="location.reload()" class="retry-btn">Retry</button>
                </div>
            </div>
        `;
    }
}

// ========================================
// GENERATE BRACKET FROM FIREBASE DATA
// ========================================

async function generateBracketFromFirebase(firebaseMatches) {
    console.log('🎯 Generating bracket from Firebase data...');
    
    // ✨ NEW: Populate window.matchDatabase for modal.js
    window.matchDatabase = {};
    firebaseMatches.forEach(match => {
        // Convert Firebase format to modal format
        window.matchDatabase[match.matchId] = {
            id: match.matchId,
            tournament: bracketInfo.cupName,
            round: match.stage === 'group' ? `Group ${match.group}` : getRoundName(match.round),
            date: match.date || 'TBD',
            status: match.status,
            competitor1: {
                name: match.song1.shortTitle || match.song1.title,
                seed: match.song1.seed,
                source: `${match.song1.artist} • ${match.song1.year}`,
                videoId: match.song1.videoId,
                votes: match.song1.votes || 0,
percentage: match.totalVotes > 0 ? Math.round((match.song1.votes / match.totalVotes) * 100) : 50,

                winner: match.winnerId === match.song1.id
            },
            competitor2: {
                name: match.song2.shortTitle || match.song2.title,
                seed: match.song2.seed,
                source: `${match.song2.artist} • ${match.song2.year}`,
                videoId: match.song2.videoId,
                votes: match.song2.votes || 0,
percentage: match.totalVotes > 0 ? Math.round((match.song2.votes / match.totalVotes) * 100) : 50,

                winner: match.winnerId === match.song2.id
            },
            totalVotes: match.totalVotes || 0
        };
    });
    
    console.log(`✅ Populated window.matchDatabase with ${Object.keys(window.matchDatabase).length} matches`);
    
    // Draw one column per round, however many rounds this cup has (a group-stage cup: the knockout rounds only)
    renderRounds(firebaseMatches);

    // Group-stage cups: the group tables, the tabs and the "knockout starts later" note
    renderStageViews(firebaseMatches);

    // Dynamic stats (from the same matches, no second fetch)
    generateTournamentStats(firebaseMatches);

    // Set up click handlers
    setupClickHandlers();

    // The selector only ever has the active cup in it
    const select = document.getElementById('tournament-select');
    if (select) select.innerHTML = `<option value="${esc(ACTIVE_TOURNAMENT)}" selected>${esc(bracketInfo.cupName)}</option>`;
    
    console.log('✅ Bracket generation complete');
}

// ========================================
// UPDATE TOURNAMENT INFO SECTION
// ========================================

async function updateTournamentInfo(allMatches) {
    console.log('📊 Updating tournament info section...');
    
    try {
        // ✅ Use provided matches (already from edge cache)
        if (!allMatches || allMatches.length === 0) {
            console.warn('⚠️ No matches provided');
            return;
        }
        
        // A group-stage cup has its own wording (the knockout does not exist until the groups end)
        if (bracketInfo.isGroupCup) {
            const sum = cupSummary(allMatches, bracketInfo, { roundName: getRoundName, formatDate });
            const grid = document.querySelector('.tournament-info .info-grid');
            if (grid) {
                grid.innerHTML = `
                <div class="info-item"><span class="info-label">Status</span><span class="info-value ${sum.statusClass}">${sum.liveDot ? '<span class="live-dot"></span>' : ''}${esc(sum.statusText)}</span></div>
                <div class="info-item"><span class="info-label">Edits</span><span class="info-value">${sum.edits}</span></div>
                <div class="info-item"><span class="info-label">Progress</span><span class="info-value">${esc(sum.progress)}</span></div>
                <div class="info-item"><span class="info-label">Format</span><span class="info-value">${esc(sum.format)}</span></div>`;
            }
            return;
        }

        // Calculate stats
        const totalMatches = allMatches.length;
        const completedMatches = allMatches.filter(m => m.status === 'completed').length;
        const liveMatches = allMatches.filter(m => m.status === 'live');
        const upcomingMatches = allMatches.filter(m => m.status === 'upcoming').length;
        
        // Determine current status
        let statusText = '';
        let statusClass = '';
        
        if (completedMatches === totalMatches) {
            // Tournament complete
            const finalMatch = allMatches.find(m => m.round === bracketInfo.totalRounds);
            const winner = finalMatch
                ? (finalMatch.winnerId === finalMatch.song1.id ? finalMatch.song1 : finalMatch.song2)
                : null;
            
            statusText = `🏆 Champion: ${esc(winner?.shortTitle || 'TBD')}`;
            statusClass = 'status-completed';
            
        } else if (liveMatches.length > 0) {
            const liveRound = Math.max(...liveMatches.map(m => m.round));
            const roundName = getRoundName(liveRound);
            
            statusText = `<span class="live-dot"></span>${roundName} - ${liveMatches.length} Live ${liveMatches.length === 1 ? 'Match' : 'Matches'}`;
            statusClass = 'status-live';
            
        } else if (upcomingMatches > 0) {
            const nextRound = Math.min(...allMatches.filter(m => m.status === 'upcoming').map(m => m.round));
            const roundName = getRoundName(nextRound);
            
            const nextMatch = allMatches.find(m => m.status === 'upcoming' && m.round === nextRound);
            const dateText = nextMatch?.date ? formatDate(nextMatch.date) : 'soon';
            
            statusText = `📅 ${roundName} Opens ${dateText}`;
            statusClass = 'status-upcoming';
            
        } else {
            statusText = '⏰ Starting Soon';
            statusClass = 'status-upcoming';
        }
        
        const formatText = 'Single Elimination';
        
        // Update the HTML
        const infoGrid = document.querySelector('.tournament-info .info-grid');
        if (infoGrid) {
            infoGrid.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Status</span>
                    <span class="info-value ${statusClass}">${statusText}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Edits</span>
                    <span class="info-value">${bracketInfo.entries}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Progress</span>
                    <span class="info-value">${completedMatches} / ${totalMatches} Matches</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Format</span>
                    <span class="info-value">${formatText}</span>
                </div>
            `;
            
            console.log('✅ Tournament info updated');
        }
        
    } catch (error) {
        console.error('❌ Error updating tournament info:', error);
    }
}

// Helper: Format date nicely
function formatDate(dateString) {
    if (!dateString) return 'TBD';
    
    const date = new Date(dateString);
    const now = new Date();
    
    // Check if date is today
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return 'Today';
    
    // Check if date is tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    if (isTomorrow) return 'Tomorrow';
    
    // Format as "Nov 5"
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}
// ========================================
// CREATE MATCH CARD FROM FIREBASE DATA
// ========================================

function createMatchCardFromFirebase(match, byId = new Map()) {
    const isBye = match.matchType === 'bye';
    const isLive = match.status === 'live' || (match.totalVotes > 0 && match.status !== 'completed');
    const isCompleted = match.status === 'completed';
    const isUpcoming = !isLive && !isCompleted;

    const song1IsTBD = match.song1.id === 'TBD';
    const song2IsTBD = match.song2.id === 'TBD';
    const isChampionship = match.round === bracketInfo.totalRounds;

    // Seeds are null in random-draw cups: only show a seed badge when there is a seed
    const seedBadge = song => song.seed != null ? `<span class="seed-badge">#${esc(song.seed)}</span>` : '';

    // ✅ Check if user voted
    const userHasVoted = checkUserVoted(match.matchId);
    const userVotedSongId = userHasVoted ? getUserVotedSongId(match.matchId) : null;

    const totalVotes = match.totalVotes || 0;
    const song1Votes = match.song1?.votes || 0;
    const song2Votes = match.song2?.votes || 0;

    const song1Pct = match.song1?.percentage ?? (totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50);
    const song2Pct = match.song2?.percentage ?? (totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50);

    const isWinner1 = isCompleted && match.winnerId === match.song1.id;
    const isWinner2 = isCompleted && match.winnerId === match.song2.id;

    // ✅ Green glow shows user's voted song
    const userVotedSong1 = userVotedSongId === 'song1';
    const userVotedSong2 = userVotedSongId === 'song2';

    const song1Thumbnail = song1IsTBD ? '' : `https://img.youtube.com/vi/${encodeURIComponent(match.song1.videoId)}/mqdefault.jpg`;
    const song2Thumbnail = song2IsTBD ? '' : `https://img.youtube.com/vi/${encodeURIComponent(match.song2.videoId)}/mqdefault.jpg`;

    return `
        <div class="matchup-card ${isBye ? 'bye' : ''} ${esc(match.status)} ${userHasVoted ? 'user-voted' : ''}" 
             data-match-id="${esc(match.matchId)}"
             data-round="${match.round}"
             data-match-number="${match.matchNumber}">
            
            <div class="matchup-number">${isChampionship ? 'Championship Match' : `Match ${match.matchNumber}`}</div>
            
            <div class="matchup-competitors">
                <!-- Song 1 -->
                <div class="competitor ${song1IsTBD ? 'tbd' : ''} ${isWinner1 ? 'winner' : ''} ${userVotedSong1 ? 'leading' : ''}">
                    ${song1IsTBD ? `<div class="song-thumbnail tbd"></div>` : `
                        <img src="${song1Thumbnail}" alt="${esc(match.song1.shortTitle)}" class="song-thumbnail" loading="lazy">
                    `}
                    <div class="competitor-info">
                        ${seedBadge(match.song1)}
                        <span class="song-title">${esc(slotName(match.song1, byId))}</span>
                    </div>
                    ${(userHasVoted || isCompleted) && !song1IsTBD && totalVotes > 0 ? `
                        <div class="vote-percentage">${song1Pct}%</div>
                        ${isWinner1 ? '<span class="winner-icon">👑</span>' : ''}
                    ` : ''}
                </div>

                <!-- Song 2 -->
                <div class="competitor ${song2IsTBD ? 'tbd' : ''} ${isWinner2 ? 'winner' : ''} ${userVotedSong2 ? 'leading' : ''}">
                    ${song2IsTBD ? `<div class="song-thumbnail tbd"></div>` : `
                        <img src="${song2Thumbnail}" alt="${esc(match.song2.shortTitle)}" class="song-thumbnail" loading="lazy">
                    `}
                    <div class="competitor-info">
                        ${seedBadge(match.song2)}
                        <span class="song-title">${esc(slotName(match.song2, byId))}</span>
                    </div>
                    ${(userHasVoted || isCompleted) && !song2IsTBD && totalVotes > 0 ? `
                        <div class="vote-percentage">${song2Pct}%</div>
                        ${isWinner2 ? '<span class="winner-icon">👑</span>' : ''}
                    ` : ''}
                </div>
            </div>

            <div class="match-status">
                ${isCompleted ? `
                    <span class="status-badge completed">Final</span>
                ` : isUpcoming ? `
                    <span class="status-badge upcoming">Coming Soon</span>
                ` : `
                    ${userHasVoted ? `
                        <span class="status-badge voted">✓ View Match</span>
                    ` : `
                        <span class="status-badge active"><span class="live-dot"></span>LIVE - Vote Now!</span>
                    `}
                `}
            </div>
        </div>
    `;
}

// ========================================
// HELPER: GET WHICH SONG USER VOTED FOR
// ========================================

function getUserVotedSongId(matchId) {
    const userVote = localStorage.getItem(`vote_${ACTIVE_TOURNAMENT}_${matchId}`);
    return userVote; // Returns 'song1' or 'song2'
}


// ========================================
// DRAW THE ROUNDS (one column per round, any number of rounds)
// ========================================

function renderRounds(matches) {
    const container = document.getElementById('bracketRounds');
    if (!container) return;

    const byId = new Map(matches.map(m => [m.matchId, m]));
    const { totalRounds } = bracketInfo;
    let html = '';

    // A group-stage cup draws only the knockout here (rounds 2 and up); the group matches have their own tables.
    // Keeping the group matches out also keeps the bracket's column spacing right (it styles :nth-child(1..4) as the first rounds).
    const firstRound = bracketInfo.isGroupCup ? bracketInfo.firstKnockoutRound : 1;
    const pool = bracketInfo.isGroupCup ? matches.filter(m => m.stage !== 'group') : matches;

    for (let round = firstRound; round <= totalRounds; round++) {
        const inRound = pool
            .filter(m => m.round === round)
            .sort((a, b) => a.matchNumber - b.matchNumber);
        if (inRound.length === 0) continue;

        const isFinal = round === totalRounds;
        const subtitle = isFinal ? 'Championship Match' : `${inRound.length} Match${inRound.length === 1 ? '' : 'es'}`;

        html += `
            <div class="bracket-round round-${round}${isFinal ? ' finals' : ''}">
                <div class="round-header">
                    <h3 class="round-title">${esc(roundLabel(round, totalRounds))}</h3>
                    <span class="round-subtitle">${subtitle}</span>
                </div>
                <div id="round-${round}-matches" class="matchups-column">
                    ${inRound.map(m => createMatchCardFromFirebase(m, byId)).join('')}
                </div>
            </div>`;
    }

    container.innerHTML = html;
    console.log(`✅ Drew ${html ? totalRounds - firstRound + 1 : 0} round(s) (${pool.length} matches)`);
}

/// ========================================
// GENERATE DYNAMIC TOURNAMENT STATS
// ========================================

function generateTournamentStats(allMatches) {
    console.log('🎯 Calculating tournament statistics...');
    
    try {
        const completedMatches = allMatches.filter(m => m.status === 'completed');
        // With no completed matches yet the loops below find nothing, so only the "Current Round" card is filled in.
        
        // Check if finals are complete
        const finalsMatch = allMatches.find(m => m.round === bracketInfo.totalRounds && m.status === 'completed');
        const finalsWinner = finalsMatch ? 
            (finalsMatch.winnerId === finalsMatch.song1.id ? finalsMatch.song1 : finalsMatch.song2) 
            : null;
        
        // Calculate stats
        let closestMatch = null;
        let closestMargin = 100;
        let mostDominant = null;
        let highestMargin = 0;
        let mostVoted = null;
        let highestVotes = 0;
        
        completedMatches.forEach(match => {
            const totalVotes = match.totalVotes || 0;
            const song1Votes = match.song1.votes || 0;
            const song2Votes = match.song2.votes || 0;
            
            if (totalVotes > 0) {
                const song1Pct = (song1Votes / totalVotes) * 100;
                const song2Pct = (song2Votes / totalVotes) * 100;
                const margin = Math.abs(song1Pct - song2Pct);
                
                // Closest match (smallest margin)
                if (margin < closestMargin) {
                    closestMargin = margin;
                    closestMatch = match;
                }
                
                // Most dominant (largest margin)
                if (margin > highestMargin) {
                    highestMargin = margin;
                    mostDominant = match;
                }
                
                // Most voted
                if (totalVotes > highestVotes) {
                    highestVotes = totalVotes;
                    mostVoted = match;
                }
            }
        });
        
        // Get current active round
        const activeMatches = allMatches.filter(m => m.status === 'live');
        const activeRound = activeMatches.length > 0 ? Math.max(...activeMatches.map(m => m.round)) : 1;
        
        // Update the HTML
        updateStatsDisplay({
            finalsWinner,
            activeRound,
            closestMatch,
            closestMargin,
            mostDominant,
            highestMargin,
            mostVoted,
            highestVotes,
            totalCompleted: completedMatches.length,
            totalMatches: allMatches.length
        });
        
        console.log('✅ Tournament stats updated');
        
    } catch (error) {
        console.error('❌ Error calculating stats:', error);
    }
}

function updateStatsDisplay(stats) {
    // Current Leader / Champion
    const leaderCard = document.querySelector('.stat-card:nth-child(1)');
    if (leaderCard) {
        if (stats.finalsWinner) {
            // Tournament complete - show champion
            leaderCard.innerHTML = `
                <div class="stat-icon"><i class="fa-solid fa-crown"></i></div>
                <div class="stat-value">${esc(stats.finalsWinner.shortTitle)}</div>
                <div class="stat-label">Tournament Champion</div>
                <div class="stat-detail">${esc(stats.finalsWinner.artist)}${stats.finalsWinner.year ? ' • ' + esc(stats.finalsWinner.year) : ''}</div>
            `;
        } else {
            // Tournament in progress - show current round
            const roundName = getRoundName(stats.activeRound);
            leaderCard.innerHTML = `
                <div class="stat-icon"><i class="fa-solid fa-bullseye"></i></div>
                <div class="stat-value">${roundName}</div>
                <div class="stat-label">Current Round</div>
                <div class="stat-detail">${stats.totalCompleted} of ${stats.totalMatches} completed</div>
            `;
        }
    }
    
    // Closest Match
    const closestCard = document.querySelector('.stat-card:nth-child(2)');
    if (closestCard && stats.closestMatch) {
        const song1IsTBD = stats.closestMatch.song1.id === 'TBD';
        const song2IsTBD = stats.closestMatch.song2.id === 'TBD';
        const matchName = esc(`${song1IsTBD ? 'TBD' : stats.closestMatch.song1.shortTitle} vs ${song2IsTBD ? 'TBD' : stats.closestMatch.song2.shortTitle}`);
        
        closestCard.innerHTML = `
            <div class="stat-icon"><i class="fa-solid fa-fire"></i></div>
            <div class="stat-value">${Math.round(50 + stats.closestMargin/2)}%</div>
            <div class="stat-label">Closest Match</div>
            <div class="stat-detail">${matchName}</div>
        `;
    }
    
    // Most Dominant Win
    const dominantCard = document.querySelector('.stat-card:nth-child(3)');
    if (dominantCard && stats.mostDominant) {
        const winner = stats.mostDominant.winnerId === stats.mostDominant.song1.id 
            ? stats.mostDominant.song1 
            : stats.mostDominant.song2;
        const loser = stats.mostDominant.winnerId === stats.mostDominant.song1.id 
            ? stats.mostDominant.song2 
            : stats.mostDominant.song1;
        
        const loserIsTBD = loser.id === 'TBD';
        
        dominantCard.innerHTML = `
            <div class="stat-icon"><i class="fa-solid fa-bolt"></i></div>
            <div class="stat-value">${Math.round(50 + stats.highestMargin/2)}%</div>
            <div class="stat-label">Most Dominant Win</div>
            <div class="stat-detail">${esc(winner.shortTitle)} over ${esc(loserIsTBD ? 'TBD' : loser.shortTitle)}</div>
        `;
    }
    
    // Most Voted Match
    const votedCard = document.querySelector('.stat-card:nth-child(4)');
    if (votedCard && stats.mostVoted) {
        const roundName = matchRoundName(stats.mostVoted);
        const song1IsTBD = stats.mostVoted.song1.id === 'TBD';
        const song2IsTBD = stats.mostVoted.song2.id === 'TBD';
        const matchName = esc(`${song1IsTBD ? 'TBD' : stats.mostVoted.song1.shortTitle} vs ${song2IsTBD ? 'TBD' : stats.mostVoted.song2.shortTitle}`);
        
        votedCard.innerHTML = `
            <div class="stat-icon"><i class="fa-solid fa-chart-column"></i></div>
            <div class="stat-value">${stats.highestVotes.toLocaleString()}</div>
            <div class="stat-label">Most Voted Match</div>
            <div class="stat-detail">${matchName} (${roundName})</div>
        `;
    }
}

function getRoundName(round) {
    if (bracketInfo.isGroupCup && round === 1) return 'Group Stage';
    return roundLabel(round, bracketInfo.totalRounds);
}

// "Group C" for a group match, otherwise the round name (used where a single match is named)
function matchRoundName(match) {
    return match.stage === 'group' ? `Group ${match.group}` : getRoundName(match.round);
}


// Update a specific match card with new data
function updateMatchCard(match) {
    const matchCard = document.querySelector(`[data-match-id="${match.matchId}"]`);
    if (!matchCard) return;
    
    const totalVotes = match.totalVotes || 0;
    const song1Votes = match.song1.votes || 0;
    const song2Votes = match.song2.votes || 0;
    
    const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
    const song2Percentage = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50;
    
    // Update percentages with correct class names
    const competitors = matchCard.querySelectorAll('.competitor');
    if (competitors[0]) {
        const score = competitors[0].querySelector('.competitor-score');
        if (score) score.textContent = `${song1Percentage}%`;
    }
    if (competitors[1]) {
        const score = competitors[1].querySelector('.competitor-score');
        if (score) score.textContent = `${song2Percentage}%`;
    }
    
    // Update leading class
    competitors[0]?.classList.toggle('leading', song1Votes > song2Votes && totalVotes > 0);
    competitors[1]?.classList.toggle('leading', song2Votes > song1Votes && totalVotes > 0);
    
    // Update global database
    if (window.matchDatabase[match.matchId]) {
        window.matchDatabase[match.matchId].totalVotes = totalVotes;
        window.matchDatabase[match.matchId].competitor1.votes = song1Votes;
        window.matchDatabase[match.matchId].competitor1.percentage = song1Percentage;
        window.matchDatabase[match.matchId].competitor2.votes = song2Votes;
        window.matchDatabase[match.matchId].competitor2.percentage = song2Percentage;
        window.matchDatabase[match.matchId].status = match.status;
    }
}

// ========================================
// GROUP-STAGE CUPS: tabs, group tables, filter chips
// ========================================
// Only a cup with a group stage gets any of this (see describeCup). A single-elimination cup leaves these sections empty and hidden,
// so its page is exactly what it was. The HTML itself is built by js/brackets-groups.js.

let currentStage = null;               // 'groups' | 'knockout' for a group-stage cup, null otherwise
let stageHandlersAttached = false;

function renderStageViews(matches) {
    const tabsEl = document.getElementById('stageTabsSection');
    const groupsEl = document.getElementById('groupStageSection');
    const noteEl = document.getElementById('knockoutNote');

    if (!bracketInfo.isGroupCup) {
        currentStage = null;
        if (tabsEl) { tabsEl.innerHTML = ''; tabsEl.style.display = 'none'; }
        if (groupsEl) { groupsEl.innerHTML = ''; groupsEl.style.display = 'none'; }
        if (noteEl) noteEl.innerHTML = '';
        return;
    }

    const views = buildGroupViews(matches);
    // which tab: the link (#knockout / #groups), else the tab the visitor was on, else the sensible default
    const fromHash = location.hash === '#knockout' ? 'knockout' : location.hash === '#groups' ? 'groups' : null;
    currentStage = fromHash || currentStage || defaultStage(matches, bracketInfo);

    if (groupsEl) groupsEl.innerHTML = groupStageHtml(views, bracketInfo, { userVoted: checkUserVoted, userChoice: getUserVotedSongId });
    if (tabsEl) tabsEl.innerHTML = stageTabsHtml({ active: currentStage, info: bracketInfo, groupViews: views });
    if (noteEl) noteEl.innerHTML = bracketInfo.knockoutBuilt ? '' : knockoutNoteHtml(bracketInfo, getRoundName(bracketInfo.firstKnockoutRound));
    setupStageHandlers();
}

// Shows the Groups or the Knockout tab. Runs after showBracketSections(), which makes #bracketSection visible on its own.
function applyStage() {
    if (!bracketInfo.isGroupCup || !currentStage) return;
    const tabsEl = document.getElementById('stageTabsSection');
    const groupsEl = document.getElementById('groupStageSection');
    const bracketEl = document.getElementById('bracketSection');
    if (tabsEl) tabsEl.style.display = 'block';
    if (groupsEl) groupsEl.style.display = currentStage === 'groups' ? 'block' : 'none';
    if (bracketEl) bracketEl.style.display = currentStage === 'knockout' ? 'block' : 'none';
    document.querySelectorAll('.stage-tab').forEach(tab => {
        const on = tab.dataset.stage === currentStage;
        tab.classList.toggle('active', on);
        tab.setAttribute('aria-selected', String(on));
    });
}

function showStage(stage) {
    if (stage !== 'groups' && stage !== 'knockout') return;
    currentStage = stage;
    history.replaceState(null, '', `#${stage}`);
    applyStage();
}

function filterGroups(filter) {
    document.querySelectorAll('.gs-chip').forEach(chip => {
        const on = chip.dataset.filter === filter;
        chip.classList.toggle('active', on);
        chip.setAttribute('aria-pressed', String(on));
    });
    let shown = 0;
    document.querySelectorAll('.gs-card').forEach(card => {
        const state = card.dataset.state;
        const show = filter === 'all' || (filter === 'live' && state === 'live') || (filter === 'complete' && state === 'complete');
        card.hidden = !show;
        if (show) shown++;
    });
    const empty = document.getElementById('groupEmpty');
    if (empty) empty.hidden = shown > 0;
}

// One delegated handler for everything in the group views, attached once (the HTML inside is re-drawn on every data load).
function setupStageHandlers() {
    if (stageHandlersAttached) return;
    stageHandlersAttached = true;

    document.addEventListener('click', (e) => {
        if (!bracketInfo.isGroupCup) return;

        const stageBtn = e.target.closest('[data-stage]');          // the tabs, and the button in the "knockout starts later" note
        if (stageBtn) { showStage(stageBtn.dataset.stage); return; }

        const chip = e.target.closest('.gs-chip');
        if (chip) { filterGroups(chip.dataset.filter); return; }

        // a finished group match opens the quick results view, like a bracket card; an open one goes to the vote page (the link)
        const link = e.target.closest('.gs-match a');
        if (link && link.dataset.status === 'completed' && typeof window.showMatchDetails === 'function') {
            e.preventDefault();
            window.showMatchDetails(link.dataset.matchId);
        }
    });
}

// ========================================
// CLICK HANDLERS
// ========================================

let clickHandlerAttached = false;

function setupClickHandlers() {
    const container = document.getElementById('bracketRounds');
    if (!container || clickHandlerAttached) return;
    clickHandlerAttached = true;

    container.addEventListener('click', (e) => {
        const matchCard = e.target.closest('.matchup-card');
        if (!matchCard) return;

        const matchId = matchCard.dataset.matchId;
        const matchStatus = matchCard.classList.contains('completed') ? 'completed'
            : matchCard.classList.contains('live') ? 'live' : 'upcoming';

        // A slot still waiting for an earlier round has nothing to vote on yet
        if (matchCard.querySelector('.competitor.tbd')) {
            showNotification('This match will be available after the previous round completes', 'info');
            return;
        }

        if (matchStatus === 'completed' && typeof window.showMatchDetails === 'function') {
            window.showMatchDetails(matchId);          // quick results view
        } else {
            window.location.href = `vote?match=${encodeURIComponent(matchId)}`;
        }
    });
}

// Helper function for notifications (optional)
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // You could add a toast notification here if you want
}

// ========================================
// TOURNAMENT SELECTOR (IF NEEDED)
// ========================================

function loadTournament(tournamentId) {
    console.log('Loading tournament:', tournamentId);
    // Add logic to load different tournaments if needed
    loadBracketData();
}

// ========================================
// PAGE INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🏆 League Music Tournament Brackets - Loading...');
    
    // Load bracket data from Firebase
    loadBracketData();
    
    // Smooth scroll for internal links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// ========================================
// EXPORT FOR HTML onclick HANDLERS
// ========================================

window.loadTournament = loadTournament;

console.log('✅ Brackets.js loaded - Firebase integration active');