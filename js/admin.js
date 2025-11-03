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
    if (!confirm('Schedule dates for all batches?\n\nThis will set batches 24 hours apart and clear TBD match dates.')) {
        return;
    }
    
    try {
        console.log('📅 Scheduling batch dates (24 hour spacing)...');
        
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        // Group matches by round and batch
        const batchGroups = {};
        
        snapshot.forEach(doc => {
            const match = doc.data();
            const key = `R${match.round}B${match.batch || 0}`;
            
            if (!batchGroups[key]) {
                batchGroups[key] = {
                    round: match.round,
                    batch: match.batch || 0,
                    matches: []
                };
            }
            
            batchGroups[key].matches.push({
                id: doc.id,
                data: match
            });
        });
        
        // Sort batches by round, then batch number
        const sortedBatchKeys = Object.keys(batchGroups).sort((a, b) => {
            const groupA = batchGroups[a];
            const groupB = batchGroups[b];
            
            if (groupA.round !== groupB.round) {
                return groupA.round - groupB.round;
            }
            return groupA.batch - groupB.batch;
        });
        
        let currentDate = new Date('2025-11-05T19:00:00Z'); // Starting date
        let updateCount = 0;
        let clearedCount = 0;
        let batchSchedule = [];
        
        for (const batchKey of sortedBatchKeys) {
            const batchGroup = batchGroups[batchKey];
            const { round, batch, matches } = batchGroup;
            
            let batchHasTBD = false;
            let scheduledInBatch = 0;
            
            // Check if entire batch is TBD
            for (const matchObj of matches) {
                const match = matchObj.data;
                const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchObj.id);
                
                const isTBD = match.song1?.id === 'TBD' || match.song2?.id === 'TBD';
                
                if (isTBD) {
                    batchHasTBD = true;
                    await updateDoc(matchRef, { date: null });
                    clearedCount++;
                } else {
                    // Assign the same date to all non-TBD matches in this batch
                   // When scheduling, add BOTH start and end times:
await updateDoc(matchRef, {
    date: currentDate.toISOString(),          // Start time
    endTime: new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString()  // +24 hours
});
                    scheduledInBatch++;
                    updateCount++;
                }
            }
            
            if (scheduledInBatch > 0) {
                batchSchedule.push({
                    round,
                    batch,
                    date: currentDate.toLocaleDateString('en-US', { 
                        weekday: 'short',
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    matchCount: scheduledInBatch
                });
                
                console.log(`📅 Round ${round} Batch ${batch}: ${currentDate.toLocaleDateString()} (${scheduledInBatch} matches)`);
                
                // Move to next batch date (24 hours later)
                currentDate.setHours(currentDate.getHours() + 24);
            } else {
                console.log(`⏭️ Round ${round} Batch ${batch}: Skipped (all TBD)`);
            }
        }
        
        // Create summary message
        let summaryMessage = `✅ Successfully scheduled ${updateCount} matches!\n🧹 Cleared ${clearedCount} TBD matches\n\n📅 SCHEDULE:\n\n`;
        
        batchSchedule.forEach(batch => {
            summaryMessage += `Round ${batch.round} Batch ${batch.batch}: ${batch.date} (${batch.matchCount} matches)\n`;
        });
        
        console.log(`\n✅ Scheduled ${updateCount} matches across ${batchSchedule.length} batches`);
        console.log(`✅ Cleared ${clearedCount} TBD matches`);
        
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