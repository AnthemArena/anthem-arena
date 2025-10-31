// ========================================
// BRACKETS PAGE FUNCTIONALITY - LEAGUE MUSIC TOURNAMENT
// Complete 64-Song Single Elimination Bracket
// ========================================

// Import Firebase
import { db } from './firebase-config.js';
import { collection, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ✅ ADD THIS LINE:
const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// Initialize global match database
if (typeof window.matchDatabase === 'undefined') {
    window.matchDatabase = {};
}

// ========================================
// HELPER FUNCTIONS
// ========================================

// Convert match IDs to cleaner format (e.g., "round-1-match-28" → "Winner of R1 M28")
function formatMatchReference(sourceMatch) {
    if (!sourceMatch) return 'TBD';
    
    // Extract round and match number from "round-X-match-Y"
    const parts = sourceMatch.split('-');
    if (parts.length === 4) {
        const round = parts[1];
        const matchNum = parts[3];
        return `Winner of R${round} M${matchNum}`;
    }
    return sourceMatch; // fallback to original if format doesn't match
}

// ========================================
// LOAD BRACKET DATA FROM FIREBASE
// ========================================

async function loadBracketData() {
    try {
        console.log('📥 Loading bracket data from Firebase...');
        
        // Load matches from Firebase
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        if (snapshot.empty) {
            console.error('❌ No matches found in Firebase!');
            console.log('💡 Run init-matches.html to create matches');
            showEmptyState();
            return;
        }
        
        console.log(`✅ Loaded ${snapshot.size} matches from Firebase`);
        
        // Convert Firebase docs to match objects
        const firebaseMatches = [];
        snapshot.forEach(doc => {
            firebaseMatches.push(doc.data());
        });
        
        // Sort by match number
        firebaseMatches.sort((a, b) => a.matchNumber - b.matchNumber);
        
        // Generate bracket HTML with Firebase data
        await generateBracketFromFirebase(firebaseMatches);
        
        // Set up real-time updates (optional but recommended)
        setupRealtimeUpdates();
        
    } catch (error) {
        console.error('❌ Error loading bracket data:', error);
        showErrorState(error);
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
            tournament: 'Worlds Anthems Tournament',
            round: getRoundName(match.round),
            date: match.date || 'TBD',
            status: match.status,
            competitor1: {
                name: match.song1.shortTitle || match.song1.title,
                seed: match.song1.seed,
                source: `${match.song1.artist} • ${match.song1.year}`,
                videoId: match.song1.videoId,
                votes: match.song1.votes || 0,
                percentage: match.totalVotes > 0 ? Math.round((match.song1.votes / match.totalVotes) * 100) : 0,
                winner: match.winnerId === match.song1.id
            },
            competitor2: {
                name: match.song2.shortTitle || match.song2.title,
                seed: match.song2.seed,
                source: `${match.song2.artist} • ${match.song2.year}`,
                videoId: match.song2.videoId,
                votes: match.song2.votes || 0,
                percentage: match.totalVotes > 0 ? Math.round((match.song2.votes / match.totalVotes) * 100) : 0,
                winner: match.winnerId === match.song2.id
            },
            totalVotes: match.totalVotes || 0
        };
    });
    
    console.log(`✅ Populated window.matchDatabase with ${Object.keys(window.matchDatabase).length} matches`);
    
    // Generate Round 1 (from Firebase)
    const round1Matches = firebaseMatches.filter(m => m.round === 1);
    const round1Container = document.getElementById('round-1-matches');
    if (round1Container) {
        round1Container.innerHTML = round1Matches.map(match => 
            createMatchCardFromFirebase(match)
        ).join('');
        console.log('✅ Round 1 generated');
    }
    
    // Generate all rounds
    await generateRound2WithByes();
    await generateRound3FromFirebase();
    await generateRound4FromFirebase();
    await generateRound5FromFirebase();
    await generateFinalsFromFirebase();
    
    // Generate dynamic stats
    await generateTournamentStats();
    
    // Set up click handlers
    setupClickHandlers();
    
    console.log('✅ Bracket generation complete');
}

// ========================================
// CREATE MATCH CARD FROM FIREBASE DATA
// ========================================

function createMatchCardFromFirebase(match) {
    const isBye = match.matchType === 'bye';
    const isCompleted = match.status === 'completed';
    const isUpcoming = match.status === 'upcoming';
    
    const song1IsTBD = match.song1.id === 'TBD';
    const song2IsTBD = match.song2.id === 'TBD';
    
    // Generate thumbnail URLs
    const song1Thumbnail = song1IsTBD 
        ? '' 
        : `https://img.youtube.com/vi/${match.song1.videoId}/mqdefault.jpg`;
    const song2Thumbnail = song2IsTBD 
        ? '' 
        : `https://img.youtube.com/vi/${match.song2.videoId}/mqdefault.jpg`;
    
    const totalVotes = match.totalVotes || 0;
    const song1Votes = match.song1.votes || 0;
    const song2Votes = match.song2.votes || 0;
    
    const song1Pct = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 0;
    const song2Pct = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 0;
    
    const isWinner1 = isCompleted && match.winnerId === match.song1.id;
    const isWinner2 = isCompleted && match.winnerId === match.song2.id;
    
    const autoAdvanced1 = isBye && match.song1.id !== 'TBD';
    const autoAdvanced2 = isBye && match.song2.id !== 'TBD';
    
    return `
        <div class="matchup-card ${isBye ? 'bye' : ''} ${match.status}" 
             data-match-id="${match.matchId}"
             data-round="${match.round}"
             data-match-number="${match.matchNumber}">
            
            <div class="matchup-number">Match ${match.matchNumber}</div>
            
            <div class="matchup-competitors">
                <!-- Competitor 1 -->
                <div class="competitor ${autoAdvanced1 ? 'auto-advanced' : ''} ${isWinner1 ? 'winner' : ''}">
                    ${song1IsTBD ? `
                        <div class="song-thumbnail tbd"></div>
                    ` : `
                        <img src="${song1Thumbnail}" 
                             alt="${match.song1.shortTitle}" 
                             class="song-thumbnail"
                             loading="lazy">
                    `}
                    <div class="competitor-info">
                        <span class="seed-badge">#${match.song1.seed || '?'}</span>
                        <span class="song-title">
                            ${song1IsTBD ? 'TBD' : match.song1.shortTitle}
                            ${isBye && autoAdvanced1 ? '<span class="bye-badge">BYE</span>' : ''}
                        </span>
                    </div>
                    ${isCompleted ? `
                        <div class="vote-percentage">${song1Pct}%</div>
                    ` : ''}
                </div>

                <!-- Competitor 2 -->
                <div class="competitor ${autoAdvanced2 ? 'auto-advanced' : ''} ${isWinner2 ? 'winner' : ''}">
                    ${song2IsTBD ? `
                        <div class="song-thumbnail tbd"></div>
                    ` : `
                        <img src="${song2Thumbnail}" 
                             alt="${match.song2.shortTitle}" 
                             class="song-thumbnail"
                             loading="lazy">
                    `}
                    <div class="competitor-info">
                        <span class="seed-badge">#${match.song2.seed || '?'}</span>
                        <span class="song-title">
                            ${song2IsTBD ? 'TBD' : match.song2.shortTitle}
                            ${isBye && autoAdvanced2 ? '<span class="bye-badge">BYE</span>' : ''}
                        </span>
                    </div>
                    ${isCompleted ? `
                        <div class="vote-percentage">${song2Pct}%</div>
                        ${isWinner2 ? '<span class="winner-icon">👑</span>' : ''}
                    ` : ''}
                </div>
            </div>

            <div class="match-status">
                ${isCompleted ? `
                    <span class="status-badge completed">Completed</span>
                    <span class="vote-count">${totalVotes.toLocaleString()} votes</span>
                ` : isUpcoming ? `
                    <span class="status-badge upcoming">Upcoming</span>
                ` : `
                    <span class="status-badge active">Vote Now!</span>
                    <span class="vote-count">${totalVotes.toLocaleString()} votes</span>
                `}
            </div>
        </div>
    `;
}

// ========================================
// GENERATE ROUND 2 (FROM FIREBASE)
// ========================================

async function generateRound2WithByes() {
    console.log('🎯 Generating Round 2 from Firebase...');
    
    const round2Container = document.getElementById('round-2-matches');
    if (!round2Container) return;
    
    try {
        // Load Round 2 matches from Firebase
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        const round2Matches = [];
        snapshot.forEach(doc => {
            const match = doc.data();
            if (match.round === 2) {
                round2Matches.push(match);
            }
        });
        
        // Sort by match number
        round2Matches.sort((a, b) => a.matchNumber - b.matchNumber);
        
        if (round2Matches.length === 0) {
            console.warn('⚠️ No Round 2 matches found in Firebase');
            round2Container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #888;">
                    <p style="margin-bottom: 1rem;">Round 2 matches not yet created.</p>
                    <a href="init-round2-matches.html" style="display: inline-block; padding: 1rem 2rem; background: #c89b3c; color: #0a0a0a; text-decoration: none; border-radius: 8px; font-weight: 600;">
                        Initialize Round 2 →
                    </a>
                </div>
            `;
            return;
        }
        
        // Generate HTML from Firebase data
        round2Container.innerHTML = round2Matches.map(match => 
            createRound2MatchCard(match)
        ).join('');
        
        console.log(`✅ Round 2 generated (${round2Matches.length} matches from Firebase)`);
        
    } catch (error) {
        console.error('❌ Error loading Round 2:', error);
        round2Container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #dc3232;">
                <p>Error loading Round 2: ${error.message}</p>
            </div>
        `;
    }
}

// ========================================
// GENERATE ROUND 3 FROM FIREBASE
// ========================================

async function generateRound3FromFirebase() {
    console.log('🎯 Generating Round 3 from Firebase...');
    
    const round3Container = document.getElementById('round-3-matches');
    if (!round3Container) return;
    
    try {
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        const round3Matches = [];
        snapshot.forEach(doc => {
            const match = doc.data();
            if (match.round === 3) {
                round3Matches.push(match);
            }
        });
        
        if (round3Matches.length === 0) {
            console.warn('⚠️ No Round 3 matches found - using hardcoded placeholders');
            generateRound3(); // Fall back to hardcoded
            return;
        }
        
        round3Matches.sort((a, b) => a.matchNumber - b.matchNumber);
        
        round3Container.innerHTML = round3Matches.map(match => 
            createRound2MatchCard(match) // Reuse R2 card function
        ).join('');
        
        console.log(`✅ Round 3 generated (${round3Matches.length} matches from Firebase)`);
        
    } catch (error) {
        console.error('❌ Error loading Round 3:', error);
        generateRound3(); // Fall back to hardcoded
    }
}

// ========================================
// GENERATE ROUND 4 FROM FIREBASE
// ========================================

async function generateRound4FromFirebase() {
    console.log('🎯 Generating Round 4 from Firebase...');
    
    const round4Container = document.getElementById('quarterfinals-matches');
    if (!round4Container) return;
    
    try {
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        const round4Matches = [];
        snapshot.forEach(doc => {
            const match = doc.data();
            if (match.round === 4) {
                round4Matches.push(match);
            }
        });
        
        if (round4Matches.length === 0) {
            console.warn('⚠️ No Round 4 matches found - using hardcoded placeholders');
            generateQuarterfinals(); // Fall back to hardcoded
            return;
        }
        
        round4Matches.sort((a, b) => a.matchNumber - b.matchNumber);
        
        round4Container.innerHTML = round4Matches.map(match => 
            createRound2MatchCard(match) // Reuse R2 card function
        ).join('');
        
        console.log(`✅ Round 4 generated (${round4Matches.length} matches from Firebase)`);
        
    } catch (error) {
        console.error('❌ Error loading Round 4:', error);
        generateQuarterfinals(); // Fall back to hardcoded
    }
}

// ========================================
// GENERATE ROUND 5 FROM FIREBASE
// ========================================

async function generateRound5FromFirebase() {
    console.log('🎯 Generating Round 5 from Firebase...');
    
    const round5Container = document.getElementById('semifinals-matches');
    if (!round5Container) return;
    
    try {
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        const round5Matches = [];
        snapshot.forEach(doc => {
            const match = doc.data();
            if (match.round === 5) {
                round5Matches.push(match);
            }
        });
        
        if (round5Matches.length === 0) {
            console.warn('⚠️ No Round 5 matches found - using hardcoded placeholders');
            generateSemifinals(); // Fall back to hardcoded
            return;
        }
        
        round5Matches.sort((a, b) => a.matchNumber - b.matchNumber);
        
        round5Container.innerHTML = round5Matches.map(match => 
            createRound2MatchCard(match) // Reuse R2 card function
        ).join('');
        
        console.log(`✅ Round 5 generated (${round5Matches.length} matches from Firebase)`);
        
    } catch (error) {
        console.error('❌ Error loading Round 5:', error);
        generateSemifinals(); // Fall back to hardcoded
    }
}

// ========================================
// GENERATE FINALS FROM FIREBASE
// ========================================

async function generateFinalsFromFirebase() {
    console.log('🎯 Generating Finals from Firebase...');
    
    const finalsContainer = document.getElementById('finals-match');
    if (!finalsContainer) return;
    
    try {
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        let finalsMatch = null;
        snapshot.forEach(doc => {
            const match = doc.data();
            if (match.matchId === 'finals' || match.round === 6) {
                finalsMatch = match;
            }
        });
        
        if (!finalsMatch) {
            console.warn('⚠️ No Finals match found - using hardcoded placeholder');
            generateFinals(); // Fall back to hardcoded
            return;
        }
        
        // Use the same card function as other rounds!
        finalsContainer.innerHTML = createRound2MatchCard(finalsMatch);
        
        console.log('✅ Finals generated from Firebase');
        
    } catch (error) {
        console.error('❌ Error loading Finals:', error);
        generateFinals(); // Fall back to hardcoded
    }
}

/// ========================================
// GENERATE DYNAMIC TOURNAMENT STATS
// ========================================

async function generateTournamentStats() {
    console.log('🎯 Calculating tournament statistics...');
    
    try {
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        const allMatches = [];
        snapshot.forEach(doc => {
            const match = doc.data();
            allMatches.push(match);
        });
        
        const completedMatches = allMatches.filter(m => m.status === 'completed');
        
        if (completedMatches.length === 0) {
            console.log('⚠️ No completed matches yet');
            return;
        }
        
        // Check if finals are complete
        const finalsMatch = allMatches.find(m => m.matchId === 'finals' && m.status === 'completed');
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
        const activeMatches = allMatches.filter(m => m.status === 'active');
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
            totalCompleted: completedMatches.length
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
                <div class="stat-icon">👑</div>
                <div class="stat-value">${stats.finalsWinner.shortTitle}</div>
                <div class="stat-label">Tournament Champion</div>
                <div class="stat-detail">${stats.finalsWinner.artist} • ${stats.finalsWinner.year}</div>
            `;
        } else {
            // Tournament in progress - show current round
            const roundName = getRoundName(stats.activeRound);
            leaderCard.innerHTML = `
                <div class="stat-icon">🎯</div>
                <div class="stat-value">${roundName}</div>
                <div class="stat-label">Current Round</div>
                <div class="stat-detail">${stats.totalCompleted} of 63 completed</div>
            `;
        }
    }
    
    // Closest Match
    const closestCard = document.querySelector('.stat-card:nth-child(2)');
    if (closestCard && stats.closestMatch) {
        const song1IsTBD = stats.closestMatch.song1.id === 'TBD';
        const song2IsTBD = stats.closestMatch.song2.id === 'TBD';
        const matchName = `${song1IsTBD ? 'TBD' : stats.closestMatch.song1.shortTitle} vs ${song2IsTBD ? 'TBD' : stats.closestMatch.song2.shortTitle}`;
        
        closestCard.innerHTML = `
            <div class="stat-icon">🔥</div>
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
            <div class="stat-icon">⚡</div>
            <div class="stat-value">${Math.round(50 + stats.highestMargin/2)}%</div>
            <div class="stat-label">Most Dominant Win</div>
            <div class="stat-detail">${winner.shortTitle} over ${loserIsTBD ? 'TBD' : loser.shortTitle}</div>
        `;
    }
    
    // Most Voted Match
    const votedCard = document.querySelector('.stat-card:nth-child(4)');
    if (votedCard && stats.mostVoted) {
        const roundName = getRoundName(stats.mostVoted.round);
        const song1IsTBD = stats.mostVoted.song1.id === 'TBD';
        const song2IsTBD = stats.mostVoted.song2.id === 'TBD';
        const matchName = `${song1IsTBD ? 'TBD' : stats.mostVoted.song1.shortTitle} vs ${song2IsTBD ? 'TBD' : stats.mostVoted.song2.shortTitle}`;
        
        votedCard.innerHTML = `
            <div class="stat-icon">📊</div>
            <div class="stat-value">${stats.highestVotes.toLocaleString()}</div>
            <div class="stat-label">Most Voted Match</div>
            <div class="stat-detail">${matchName} (${roundName})</div>
        `;
    }
}

function getRoundName(round) {
    const roundNames = {
        1: 'Round 1',
        2: 'Round 2',
        3: 'Sweet 16',
        4: 'Quarterfinals',
        5: 'Semifinals',
        6: 'Finals'
    };
    return roundNames[round] || `Round ${round}`;
}
// ========================================
// CREATE ROUND 2 MATCH CARD FROM FIREBASE
// ========================================

function createRound2MatchCard(match) {
    const totalVotes = match.totalVotes || 0;
    const song1Votes = match.song1.votes || 0;
    const song2Votes = match.song2.votes || 0;
    
    const song1Percentage = totalVotes > 0 ? Math.round((song1Votes / totalVotes) * 100) : 50;
    const song2Percentage = totalVotes > 0 ? Math.round((song2Votes / totalVotes) * 100) : 50;
    
    const song1IsWinner = match.winnerId === match.song1.id;
    const song2IsWinner = match.winnerId === match.song2.id;
    const song1IsLeading = song1Votes > song2Votes && totalVotes > 0 && !match.winnerId;
    const song2IsLeading = song2Votes > song1Votes && totalVotes > 0 && !match.winnerId;
    
    const isCompleted = match.status === 'completed'; // ✨ ADD THIS
    
    // Check if TBD
    const song1IsTBD = match.song1.id === 'TBD';
    const song2IsTBD = match.song2.id === 'TBD';
    
    // Generate thumbnail URLs
    const song1Thumbnail = song1IsTBD 
        ? '' 
        : `https://img.youtube.com/vi/${match.song1.videoId}/mqdefault.jpg`;
    const song2Thumbnail = song2IsTBD 
        ? '' 
        : `https://img.youtube.com/vi/${match.song2.videoId}/mqdefault.jpg`;
    
    // Check if bye
    const hasBye = match.song1.hasBye || match.song2.hasBye;
    
    let cardClasses = 'matchup-card clickable';
    if (hasBye) cardClasses += ' bye';
    if (match.status === 'upcoming') cardClasses += ' upcoming';
    if (match.status === 'live') cardClasses += ' live';
    if (match.status === 'completed') cardClasses += ' completed';
    
    window.matchDatabase[match.matchId] = {
        id: match.matchId,
        tournament: 'All Music Championship 2025',
        round: getRoundName(match.round),
        status: match.status || 'upcoming',
        date: new Date().toISOString().split('T')[0],
        totalVotes: totalVotes,
        competitor1: {
            seed: match.song1.seed,
            name: song1IsTBD ? formatMatchReference(match.song1.sourceMatch) : match.song1.shortTitle,
            source: song1IsTBD ? 'TBD' : `${match.song1.artist} • ${match.song1.year}`,
            videoId: match.song1.videoId,
            votes: song1Votes,
            percentage: song1Percentage,
            winner: song1IsWinner
        },
        competitor2: {
            seed: match.song2.seed,
            name: song2IsTBD ? formatMatchReference(match.song2.sourceMatch) : match.song2.shortTitle,
            source: song2IsTBD ? 'TBD' : `${match.song2.artist} • ${match.song2.year}`,
            videoId: match.song2.videoId,
            votes: song2Votes,
            percentage: song2Percentage,
            winner: song2IsWinner
        }
    };
    
    return `
        <div class="${cardClasses}" data-match-id="${match.matchId}">
            <div class="matchup-number">
                R${match.round} M${match.matchNumber}
                ${match.status === 'live' ? ' <span class="live-indicator">🔴 LIVE</span>' : ''}
            </div>
            
            <div class="matchup-competitors">
                <!-- Competitor 1 -->
                <div class="competitor ${song1IsLeading ? 'leading' : ''} ${song1IsWinner ? 'winner' : ''} ${song1IsTBD ? 'tbd' : ''} ${match.song1.hasBye ? 'auto-advanced' : ''}">
                    ${song1IsTBD ? `
                        <div class="song-thumbnail tbd"></div>
                    ` : `
                        <img src="${song1Thumbnail}" 
                             alt="${match.song1.shortTitle}" 
                             class="song-thumbnail"
                             loading="lazy">
                    `}
                    <div class="competitor-info">
                        <span class="seed-badge">#${song1IsTBD ? '?' : match.song1.seed}</span>
                        <span class="song-title">
                            ${song1IsTBD ? formatMatchReference(match.song1.sourceMatch) : match.song1.shortTitle}
                            ${match.song1.hasBye ? '<span class="bye-badge">BYE</span>' : ''}
                        </span>
                    </div>
                    ${isCompleted && !song1IsTBD ? `
                        <div class="vote-percentage">${song1Percentage}%</div>
                        ${song1IsWinner ? '<span class="winner-icon">👑</span>' : ''}
                    ` : ''}
                </div>
                
                <!-- Competitor 2 -->
                <div class="competitor ${song2IsLeading ? 'leading' : ''} ${song2IsWinner ? 'winner' : ''} ${song2IsTBD ? 'tbd' : ''}">
                    ${song2IsTBD ? `
                        <div class="song-thumbnail tbd"></div>
                    ` : `
                        <img src="${song2Thumbnail}" 
                             alt="${match.song2.shortTitle}" 
                             class="song-thumbnail"
                             loading="lazy">
                    `}
                    <div class="competitor-info">
                        <span class="seed-badge">#${song2IsTBD ? '?' : match.song2.seed}</span>
                        <span class="song-title">
                            ${song2IsTBD ? formatMatchReference(match.song2.sourceMatch) : match.song2.shortTitle}
                        </span>
                    </div>
                    ${isCompleted && !song2IsTBD ? `
                        <div class="vote-percentage">${song2Percentage}%</div>
                        ${song2IsWinner ? '<span class="winner-icon">👑</span>' : ''}
                    ` : ''}
                </div>
            </div>
            
            <div class="match-status">
                ${match.status === 'completed' ? `
                    <span class="status-badge completed">Completed</span>
                    <span class="vote-count">${totalVotes.toLocaleString()} votes</span>
                ` : match.status === 'upcoming' ? `
                    <span class="status-badge upcoming">Upcoming</span>
                ` : `
                    <span class="status-badge active">Vote Now!</span>
                    <span class="vote-count">${totalVotes.toLocaleString()} votes</span>
                `}
            </div>
        </div>
    `;
}

// ========================================
// GENERATE ROUND 3 (SWEET 16)
// ========================================

function generateRound3() {
    console.log('🎯 Generating Round 3 (Sweet 16)...');
    
    const round3Container = document.getElementById('round-3-matches');
    if (!round3Container) return;
    
    let round3HTML = '';
    
    // 8 matches (TBD vs TBD)
    for (let i = 1; i <= 8; i++) {
        const r2match1 = i * 2 - 1;
        const r2match2 = i * 2;
        round3HTML += `
            <div class="matchup-card upcoming" data-match-id="round-3-match-${i}">
                <div class="matchup-number">R3 MATCH ${i}</div>
                
                <div class="competitor tbd">
                    <span class="competitor-seed">?</span>
                    <div class="competitor-info">
                        <span class="competitor-name">Winner of R2 M${r2match1}</span>
                    </div>
                    <span class="competitor-score">—</span>
                </div>
                
                <div class="competitor tbd">
                    <span class="competitor-seed">?</span>
                    <div class="competitor-info">
                        <span class="competitor-name">Winner of R2 M${r2match2}</span>
                    </div>
                    <span class="competitor-score">—</span>
                </div>
            </div>
        `;
    }
    
    round3Container.innerHTML = round3HTML;
    console.log('✅ Round 3 generated (8 matches)');
}

// ========================================
// GENERATE QUARTERFINALS
// ========================================

function generateQuarterfinals() {
    console.log('🎯 Generating Quarterfinals...');
    
    const qfContainer = document.getElementById('quarterfinals-matches');
    if (!qfContainer) return;
    
    let qfHTML = '';
    
    // 4 matches (TBD vs TBD)
    for (let i = 1; i <= 4; i++) {
        const r3match1 = i * 2 - 1;
        const r3match2 = i * 2;
        qfHTML += `
            <div class="matchup-card upcoming" data-match-id="qf-match-${i}">
                <div class="matchup-number">QF ${i}</div>
                
                <div class="competitor tbd">
                    <span class="competitor-seed">?</span>
                    <div class="competitor-info">
                        <span class="competitor-name">Winner of R3 M${r3match1}</span>
                    </div>
                    <span class="competitor-score">—</span>
                </div>
                
                <div class="competitor tbd">
                    <span class="competitor-seed">?</span>
                    <div class="competitor-info">
                        <span class="competitor-name">Winner of R3 M${r3match2}</span>
                    </div>
                    <span class="competitor-score">—</span>
                </div>
            </div>
        `;
    }
    
    qfContainer.innerHTML = qfHTML;
    console.log('✅ Quarterfinals generated (4 matches)');
}

// ========================================
// GENERATE SEMIFINALS
// ========================================

function generateSemifinals() {
    console.log('🎯 Generating Semifinals...');
    
    const sfContainer = document.getElementById('semifinals-matches');
    if (!sfContainer) return;
    
    let sfHTML = '';
    
    // 2 matches (TBD vs TBD)
    for (let i = 1; i <= 2; i++) {
        const qfmatch1 = i * 2 - 1;
        const qfmatch2 = i * 2;
        sfHTML += `
            <div class="matchup-card semifinal-match upcoming" data-match-id="sf-match-${i}">
                <div class="matchup-number">SF ${i}</div>
                
                <div class="competitor tbd">
                    <span class="competitor-seed">?</span>
                    <div class="competitor-info">
                        <span class="competitor-name">Winner of QF ${qfmatch1}</span>
                    </div>
                    <span class="competitor-score">—</span>
                </div>
                
                <div class="competitor tbd">
                    <span class="competitor-seed">?</span>
                    <div class="competitor-info">
                        <span class="competitor-name">Winner of QF ${qfmatch2}</span>
                    </div>
                    <span class="competitor-score">—</span>
                </div>
            </div>
        `;
    }
    
    sfContainer.innerHTML = sfHTML;
    console.log('✅ Semifinals generated (2 matches)');
}

// ========================================
// GENERATE FINALS
// ========================================

function generateFinals() {
    console.log('🎯 Generating Finals...');
    
    const finalsContainer = document.getElementById('finals-match');
    if (!finalsContainer) return;
    
    finalsContainer.innerHTML = `
        <div class="matchup-card finals-match upcoming" data-match-id="finals-match">
            <div class="champion-crown">👑</div>
            <div class="matchup-number">CHAMPIONSHIP</div>
            
            <div class="competitor tbd">
                <span class="competitor-seed">?</span>
                <div class="competitor-info">
                    <span class="competitor-name">Winner of SF 1</span>
                </div>
                <span class="competitor-score">—</span>
            </div>
            
            <div class="vs-text">VS</div>
            
            <div class="competitor tbd">
                <span class="competitor-seed">?</span>
                <div class="competitor-info">
                    <span class="competitor-name">Winner of SF 2</span>
                </div>
                <span class="competitor-score">—</span>
            </div>
        </div>
    `;
    
    console.log('✅ Finals generated');
}

// ========================================
// REAL-TIME UPDATES (OPTIONAL)
// ========================================

function setupRealtimeUpdates() {
    console.log('🔄 Setting up real-time vote updates...');
    
const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
    
    // Listen for changes
    onSnapshot(matchesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const match = change.doc.data();
                updateMatchCard(match);
                console.log(`🔄 Updated: ${match.matchId}`);
            }
        });
    });
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
// CLICK HANDLERS
// ========================================

function setupClickHandlers() {
    console.log('🎯 Setting up click handlers with event delegation...');
    
    const roundContainers = [
        'round-1-matches', 
        'round-2-matches', 
        'round-3-matches', 
        'quarterfinals-matches', 
        'semifinals-matches', 
        'finals-match'
    ];
    
    roundContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            container.addEventListener('click', (e) => {
                const matchCard = e.target.closest('.matchup-card');
                if (matchCard) {
                    const matchId = matchCard.dataset.matchId;
                    
                    // Check if match has TBD competitors
                    const hasTBD = matchCard.querySelector('.competitor.tbd');
                    
                    if (hasTBD) {
                        console.log(`⏸️ Match ${matchId} not ready (TBD competitors)`);
                        // Optional: Show a subtle notification
                        showNotification('This match will be available after the previous round completes', 'info');
                        return;
                    }
                    
                    console.log(`🎯 Card clicked: ${matchId}`);
                    
                    if (typeof window.showMatchDetails === 'function') {
                        console.log(`🚀 Calling showMatchDetails with: ${matchId}`);
                        window.showMatchDetails(matchId);
                    } else {
                        console.warn('⚠️ modal.js not loaded, redirecting to vote page');
                        window.location.href = `vote.html?match=${matchId}`;
                    }
                }
            });
            console.log(`✅ Click handler added to ${containerId}`);
        }
    });
}

// Helper function for notifications (optional)
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // You could add a toast notification here if you want
}

// ========================================
// ERROR STATES
// ========================================

function showEmptyState() {
    const round1Container = document.getElementById('round-1-matches');
    if (round1Container) {
        round1Container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <h2 style="color: #c89b3c; margin-bottom: 1rem;">No Matches Found</h2>
                <p style="color: #888; margin-bottom: 1.5rem;">Initialize the tournament to create matches</p>
                <a href="init-matches.html" style="display: inline-block; padding: 1rem 2rem; background: #c89b3c; color: #0a0a0a; text-decoration: none; border-radius: 8px; font-weight: 600;">
                    Initialize Tournament
                </a>
            </div>
        `;
    }
}

function showErrorState(error) {
    const round1Container = document.getElementById('round-1-matches');
    if (round1Container) {
        round1Container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <h2 style="color: #dc3232; margin-bottom: 1rem;">Error Loading Bracket</h2>
                <p style="color: #888; margin-bottom: 1.5rem;">${error.message}</p>
                <button onclick="location.reload()" style="padding: 1rem 2rem; background: #c89b3c; color: #0a0a0a; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                    Retry
                </button>
            </div>
        `;
    }
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