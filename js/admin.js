// ========================================
// ADMIN PANEL - TOURNAMENT MANAGEMENT
// ========================================

import { db, auth } from './firebase-config.js';
import { initializeCompleteTournament } from './init-firebase.js';

import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ========================================
// TOURNAMENT CONFIG
// ========================================

const ACTIVE_TOURNAMENT = '2025-worlds-anthems';

// ========================================
// AUTHENTICATION
// ========================================

// Check authentication state on page load
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in
        console.log('✅ Authenticated as:', user.email);
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('admin-content').style.display = 'block';
        loadMatches();
    } else {
        // User is not logged in
        console.log('❌ Not authenticated');
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('admin-content').style.display = 'none';
    }
});

// Login function
window.loginAdmin = async function(event) {
    event.preventDefault();
    
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorDiv = document.getElementById('login-error');
    
    errorDiv.textContent = '';
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        console.log('✅ Login successful');
    } catch (error) {
        console.error('❌ Login error:', error);
        errorDiv.textContent = `Error: ${error.message}`;
    }
};

// Logout function
window.logoutAdmin = async function() {
    if (!confirm('Logout from admin panel?')) return;
    
    try {
        await signOut(auth);
        console.log('✅ Logged out');
    } catch (error) {
        console.error('❌ Logout error:', error);
        alert(`Error: ${error.message}`);
    }
};



// ========================================
// OPEN INDIVIDUAL MATCH
// ========================================

window.openMatch = async function(matchId) {
    if (!confirm(`Open match ${matchId} for voting?`)) return;
    
    try {
        await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchId), {
            status: 'live'
        });
        
        console.log(`✅ Opened match: ${matchId}`);
        alert(`✅ Match ${matchId} is now LIVE!`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error opening match:', error);
        alert(`Error: ${error.message}`);
    }
};

// ========================================
// CLOSE INDIVIDUAL MATCH
// ========================================

// ========================================
// CLOSE INDIVIDUAL MATCH (with auto-advance)
// ========================================

window.closeMatch = async function(matchId) {
    if (!confirm(`Close match ${matchId}?\n\nThis will determine the winner and advance them to the next round.`)) return;
    
    try {
        const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchId);
        const matchSnap = await getDoc(matchRef);
        
        if (!matchSnap.exists()) {
            alert('Match not found!');
            return;
        }
        
        const match = matchSnap.data();
        const winnerId = match.song1.votes > match.song2.votes ? match.song1.id : match.song2.id;
        const winnerData = match.song1.votes > match.song2.votes ? match.song1 : match.song2;
        
        // Close the match
        await updateDoc(matchRef, {
            status: 'completed',
            winnerId: winnerId
        });
        
        console.log(`✅ Closed match: ${matchId}, Winner: ${winnerId}`);
        
        // ✅ Auto-advance winner to next round
        await advanceWinnerToNextRound(match, winnerData);
        
        alert(`✅ Match ${matchId} closed!\n\nWinner: ${winnerData.shortTitle}\n✨ Advanced to next round!`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error closing match:', error);
        alert(`❌ Error: ${error.message}`);
    }
};

// ========================================
// AUTO-ADVANCE WINNER USING sourceMatch
// ========================================

async function advanceWinnerToNextRound(completedMatch, winner) {
    const nextRound = completedMatch.round + 1;
    
    console.log(`📈 Checking if ${completedMatch.matchId} winner advances to Round ${nextRound}...`);
    
    // Find next-round matches that reference this match
    const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
    const q = query(matchesRef, where('round', '==', nextRound));
    const snapshot = await getDocs(q);
    
    let advanced = false;
    
    for (const nextMatchDoc of snapshot.docs) {
        const nextMatch = nextMatchDoc.data();
        
        // Check if song1 should come from this match
        if (nextMatch.song1?.sourceMatch === completedMatch.matchId) {
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, nextMatchDoc.id), {
                'song1': {
                    ...winner,
                    votes: 0,
                    sourceMatch: completedMatch.matchId  // Keep the sourceMatch reference
                }
            });
            console.log(`  ✅ Advanced to ${nextMatch.matchId} (song1 slot)`);
            advanced = true;
        }
        
        // Check if song2 should come from this match
        if (nextMatch.song2?.sourceMatch === completedMatch.matchId) {
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, nextMatchDoc.id), {
                'song2': {
                    ...winner,
                    votes: 0,
                    sourceMatch: completedMatch.matchId  // Keep the sourceMatch reference
                }
            });
            console.log(`  ✅ Advanced to ${nextMatch.matchId} (song2 slot)`);
            advanced = true;
        }
    }
    
    if (!advanced) {
        console.log(`ℹ️ No next round found for ${completedMatch.matchId} (might be tournament winner!)`);
    }
}



// ========================================
// LOAD MATCHES INTO TABLE
// ========================================

async function loadMatches() {
    console.log('📥 Loading matches...');
    
    const tbody = document.getElementById('matches-table');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
    
    try {
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        const matches = [];
        snapshot.forEach(doc => matches.push(doc.data()));
        
        matches.sort((a, b) => {
            if (a.round !== b.round) return a.round - b.round;
            if (a.batch !== b.batch) return (a.batch || 0) - (b.batch || 0);
            return a.matchNumber - b.matchNumber;
        });
        
        tbody.innerHTML = '';
        
        // Track batch groups for batch controls
        let currentRound = null;
        let currentBatch = null;
        
        for (const match of matches) {
            // Add batch header row when batch changes
            if (match.round !== currentRound || match.batch !== currentBatch) {
                currentRound = match.round;
                currentBatch = match.batch;
                
                const batchHeaderRow = document.createElement('tr');
                batchHeaderRow.className = 'batch-header';
                batchHeaderRow.innerHTML = `
                    <td colspan="8" style="background: #f0f0f0; font-weight: bold; padding: 12px;">
                        📦 Round ${currentRound} - Batch ${currentBatch}
                        <span style="float: right;">
                            <button class="btn-open" onclick="openBatch(${currentRound}, ${currentBatch})" style="margin-right: 10px;">Open Batch</button>
                            <button class="btn-close" onclick="closeBatch(${currentRound}, ${currentBatch})">Close Batch</button>
                        </span>
                    </td>
                `;
                tbody.appendChild(batchHeaderRow);
            }
            
            // Format date
            const dateStr = match.date 
                ? new Date(match.date).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Not scheduled';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>R${match.round}M${match.matchNumber} <span style="color: #666;">(B${match.batch})</span></td>
                <td>${match.song1.shortTitle || match.song1.title}</td>
                <td>${match.song1.votes || 0}</td>
                <td>${match.song2.shortTitle || match.song2.title}</td>
                <td>${match.song2.votes || 0}</td>
                <td>${dateStr}</td>
                <td>
                    <span class="status-badge ${match.status}">
                        ${match.status}
                    </span>
                </td>
                <td>
                    <div class="match-actions">
                        ${match.status === 'upcoming' ? `<button class="btn-open" onclick="openMatch('${match.matchId}')">Open</button>` : ''}
                        ${match.status === 'live' ? `<button class="btn-close" onclick="closeMatch('${match.matchId}')">Close</button>` : ''}
                        <button class="btn-view" onclick="viewMatch('${match.matchId}')">View</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        }
        
        console.log(`✅ Loaded ${matches.length} matches`);
        
    } catch (error) {
        console.error('❌ Error loading matches:', error);
        tbody.innerHTML = `<tr><td colspan="8" style="color: #dc3232;">Error: ${error.message}</td></tr>`;
    }
}

// ========================================
// VIEW MATCH DETAILS
// ========================================

window.viewMatch = function(matchId) {
    window.location.href = `/vote.html?match=${matchId}`;
};

// ========================================
// CLEAR ALL VOTES (TESTING ONLY)
// ========================================

window.clearAllVotesForTesting = async function() {
    const confirmation = prompt(
        '⚠️ WARNING: This will DELETE ALL VOTES from ALL USERS!\n\n' +
        'This action CANNOT be undone!\n\n' +
        'Type "DELETE ALL VOTES" to confirm:'
    );
    
    if (confirmation !== 'DELETE ALL VOTES') {
        alert('❌ Action cancelled');
        return;
    }
    
    try {
        console.log('🗑️ Clearing all votes...');
        
        const votesRef = collection(db, 'votes');
        const votesSnapshot = await getDocs(votesRef);
        
        const voteCount = votesSnapshot.size;
        console.log(`Found ${voteCount} votes to delete`);
        
        if (voteCount === 0) {
            alert('ℹ️ No votes to clear!');
            return;
        }
        
        // Delete all vote documents
        const deletePromises = votesSnapshot.docs.map(voteDoc => 
            deleteDoc(doc(db, 'votes', voteDoc.id))
        );
        
        await Promise.all(deletePromises);
        
        console.log('✅ All votes cleared');
        alert(`✅ Successfully deleted ${voteCount} votes!`);
        
        // Refresh the matches table to show updated vote counts
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error clearing votes:', error);
        alert(`❌ Error: ${error.message}`);
    }
};

// ========================================
// OPEN A BATCH
// ========================================

window.openBatch = async function(roundNumber, batchNumber) {
    if (!confirm(`Open Round ${roundNumber}, Batch ${batchNumber} for voting?`)) return;
    
    try {
        console.log(`🚀 Opening Round ${roundNumber}, Batch ${batchNumber}...`);
        
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const q = query(
            matchesRef, 
            where('round', '==', roundNumber),
            where('batch', '==', batchNumber)
        );
        const snapshot = await getDocs(q);
        
        let updateCount = 0;
        const matchList = [];
        
        for (const matchDoc of snapshot.docs) {
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchDoc.id), {
                status: 'live'
            });
            matchList.push(matchDoc.data().matchId);
            updateCount++;
        }
        
        console.log(`✅ Opened ${updateCount} matches:`, matchList);
        alert(`✅ Round ${roundNumber}, Batch ${batchNumber} is now LIVE!\n\n${updateCount} matches opened:\n${matchList.join('\n')}`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error opening batch:', error);
        alert(`Error: ${error.message}`);
    }
};

// ========================================
// CLOSE A BATCH
// ========================================

window.closeBatch = async function(roundNumber, batchNumber) {
    if (!confirm(`Close Round ${roundNumber}, Batch ${batchNumber}?\n\nThis will:\n- Determine winners\n- Advance them to next round\n- Close voting`)) return;
    
    try {
        console.log(`🔒 Closing Round ${roundNumber}, Batch ${batchNumber}...`);
        
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const q = query(
            matchesRef,
            where('round', '==', roundNumber),
            where('batch', '==', batchNumber)
        );
        const snapshot = await getDocs(q);
        
        let closedCount = 0;
        const results = [];
        
        for (const matchDoc of snapshot.docs) {
            const match = matchDoc.data();
            
            const winnerId = match.song1.votes > match.song2.votes ? match.song1.id : match.song2.id;
            const winnerData = match.song1.votes > match.song2.votes ? match.song1 : match.song2;
            const loserData = match.song1.votes > match.song2.votes ? match.song2 : match.song1;
            
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchDoc.id), {
                status: 'completed',
                winnerId: winnerId
            });
            
            // Auto-advance winner
            await advanceWinnerToNextRound(match, winnerData);
            
            results.push(`${match.matchId}: ${winnerData.shortTitle} defeats ${loserData.shortTitle} (${winnerData.votes}-${loserData.votes})`);
            closedCount++;
        }
        
        console.log(`✅ Closed ${closedCount} matches`);
        console.log('Results:', results);
        
        alert(`✅ Round ${roundNumber}, Batch ${batchNumber} closed!\n\n${closedCount} matches completed:\n\n${results.join('\n')}`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error closing batch:', error);
        alert(`Error: ${error.message}`);
    }
};

// ========================================
// SCHEDULE MATCH DATES
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🏆 Admin Panel Initializing...');
    
    // Initialize Tournament Button
    document.getElementById('initTournamentBtn').addEventListener('click', async () => {
        if (!confirm('Create all 63 tournament matches?\n\nOnly run this once!')) {
            return;
        }
        
        try {
            await initializeCompleteTournament();
            alert('✅ Tournament initialized! Refresh to see matches.');
            location.reload();
        } catch (error) {
            alert('❌ Error: ' + error.message);
            console.error(error);
        }
    });

document.getElementById('scheduleDatesBtn').addEventListener('click', async () => {
    // ✅ Ask for Round 1 start and end dates
    const startDateInput = prompt(
        '📅 Enter ROUND 1 START date:\n\n' +
        'Format: YYYY-MM-DD\n' +
        'Example: 2025-11-05'
    );
    
    if (!startDateInput) {
        alert('❌ Cancelled');
        return;
    }
    
    const endDateInput = prompt(
        '📅 Enter ROUND 1 END date:\n\n' +
        'Format: YYYY-MM-DD\n' +
        'Example: 2025-11-11\n\n' +
        '(All Round 1 batches will close on this date)'
    );
    
    if (!endDateInput) {
        alert('❌ Cancelled');
        return;
    }
    
    // Validate dates
    const round1Start = new Date(startDateInput + 'T00:00:00Z');
    const round1End = new Date(endDateInput + 'T23:59:59Z'); // End of day
    
    if (isNaN(round1Start.getTime()) || isNaN(round1End.getTime())) {
        alert('❌ Invalid date format! Use YYYY-MM-DD');
        return;
    }
    
    if (round1End <= round1Start) {
        alert('❌ End date must be after start date!');
        return;
    }
    
    if (!confirm(
        `Start Round 1 on ${round1Start.toLocaleDateString()}?\n` +
        `End Round 1 on ${round1End.toLocaleDateString()}?\n\n` +
        `Batches will open daily but all close on ${round1End.toLocaleDateString()}.`
    )) {
        return;
    }
    
    try {
        console.log('📅 Scheduling Round 1:', round1Start.toISOString(), 'to', round1End.toISOString());
        
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        // Group matches by round & batch
        const batchGroups = {};
        
        snapshot.forEach(doc => {
            const match = doc.data();
            const key = `R${match.round}B${match.batch || 1}`;
            
            if (!batchGroups[key]) {
                batchGroups[key] = {
                    round: match.round,
                    batch: match.batch || 1,
                    matches: []
                };
            }
            
            batchGroups[key].matches.push({
                id: doc.id,
                data: match
            });
        });
        
        // Sort batches
        const sortedBatchKeys = Object.keys(batchGroups).sort((a, b) => {
            const groupA = batchGroups[a];
            const groupB = batchGroups[b];
            
            if (groupA.round !== groupB.round) {
                return groupA.round - groupB.round;
            }
            return groupA.batch - groupB.batch;
        });
        
        // ✅ Assign dates with STAGGERED STARTS but SAME END for Round 1
        let updateCount = 0;
        let clearedCount = 0;
        const batchSummary = [];
        
        // Track when next round should start (after R1 ends)
        let currentRoundEndDate = round1End;
        let currentRound = 1;
        
        for (const batchKey of sortedBatchKeys) {
            const batchGroup = batchGroups[batchKey];
            const { round, batch, matches } = batchGroup;
            
            let batchStartDate;
            let batchEndDate;
            
            if (round === 1) {
                // ✅ Round 1: Staggered starts, same end
                const dayOffset = batch - 1; // Batch 1 = day 0, Batch 2 = day 1, etc.
                batchStartDate = new Date(round1Start.getTime() + dayOffset * 24 * 60 * 60 * 1000);
                batchEndDate = round1End; // All R1 batches end on same date
            } else {
                // ✅ Future rounds: Start after previous round ends
                if (round !== currentRound) {
                    // New round starts 24h after previous round ended
                    currentRoundEndDate = new Date(currentRoundEndDate.getTime() + 24 * 60 * 60 * 1000);
                    currentRound = round;
                }
                
                const dayOffset = batch - 1;
                batchStartDate = new Date(currentRoundEndDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
                batchEndDate = new Date(batchStartDate.getTime() + 6 * 24 * 60 * 60 * 1000); // 6 days for future rounds
            }
            
            let scheduledInBatch = 0;
            
            for (const matchObj of matches) {
                const match = matchObj.data;
                const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchObj.id);
                
                const isTBD = match.song1?.id === 'TBD' || match.song2?.id === 'TBD';
                
                if (isTBD) {
                    // Clear dates for TBD matches
                    await updateDoc(matchRef, { 
                        date: null,
                        startDate: null,
                        endDate: null
                    });
                    clearedCount++;
                } else {
                    // ✅ Assign staggered start but same round end
                    await updateDoc(matchRef, {
                        date: batchStartDate.toISOString(),      // When batch opens
                        startDate: batchStartDate.toISOString(), // When voting starts
                        endDate: batchEndDate.toISOString()      // When voting ends (same for all R1)
                    });
                    scheduledInBatch++;
                    updateCount++;
                }
            }
            
            if (scheduledInBatch > 0) {
                batchSummary.push({
                    round,
                    batch,
                    start: new Date(batchStartDate),
                    end: new Date(batchEndDate),
                    count: scheduledInBatch
                });
                
                console.log(`📅 R${round}B${batch}: Opens ${batchStartDate.toLocaleDateString()} → Closes ${batchEndDate.toLocaleDateString()} (${scheduledInBatch} matches)`);
            }
        }
        
        // Show summary
        let summaryMessage = `✅ Scheduled ${updateCount} matches!\n🧹 Cleared ${clearedCount} TBD matches\n\n📅 SCHEDULE:\n\n`;
        
        batchSummary.forEach(batch => {
            const startStr = batch.start.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
            });
            const endStr = batch.end.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
            });
            summaryMessage += `R${batch.round}B${batch.batch}: Opens ${startStr} → Closes ${endStr} (${batch.count} matches)\n`;
        });
        
        const finalDate = batchSummary[batchSummary.length - 1]?.end;
        if (finalDate) {
            summaryMessage += `\n🏆 Tournament ends: ${finalDate.toLocaleDateString('en-US', { 
                weekday: 'long',
                month: 'long', 
                day: 'numeric',
                year: 'numeric'
            })}`;
        }
        
        console.log(`✅ Scheduled ${updateCount} matches across ${batchSummary.length} batches`);
        alert(summaryMessage);
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error scheduling dates:', error);
        alert(`❌ Error: ${error.message}`);
    }
});



    // Reset Tournament Button
    document.getElementById('resetTournamentBtn').addEventListener('click', async () => {
        if (!confirm('⚠️ DELETE ALL MATCHES AND REGENERATE?\n\nThis cannot be undone!')) {
            return;
        }
        
        if (!confirm('Are you ABSOLUTELY SURE? Type OK in next prompt.')) {
            return;
        }
        
        const confirm2 = prompt('Type OK to confirm:');
        if (confirm2 !== 'OK') {
            alert('Cancelled');
            return;
        }
        
        try {
            // Delete all matches
            const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
            const snapshot = await getDocs(matchesRef);
            
            let deleteCount = 0;
            for (const docSnap of snapshot.docs) {
                await deleteDoc(docSnap.ref);
                deleteCount++;
                if (deleteCount % 10 === 0) {
                    console.log(`Deleted ${deleteCount}/${snapshot.size} matches...`);
                }
            }
            
            alert(`✅ Deleted ${deleteCount} matches! Now regenerating...`);
            
            // Regenerate
            await initializeCompleteTournament();
            
            alert('✅ Tournament reset complete! Refresh page.');
            location.reload();
            
        } catch (error) {
            alert('❌ Error: ' + error.message);
            console.error(error);
        }
    });
});