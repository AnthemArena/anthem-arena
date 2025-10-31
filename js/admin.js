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
// OPEN A ROUND
// ========================================

window.openRound = async function(roundNumber) {
    if (!confirm(`Open Round ${roundNumber} for voting?`)) return;
    
    try {
        console.log(`🚀 Opening Round ${roundNumber}...`);
        
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const q = query(matchesRef, where('round', '==', roundNumber));
        const snapshot = await getDocs(q);
        
        let updateCount = 0;
        
        for (const matchDoc of snapshot.docs) {
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchDoc.id), {
                status: 'live'
            });
            updateCount++;
        }
        
        console.log(`✅ Opened ${updateCount} matches in Round ${roundNumber}`);
        alert(`✅ Round ${roundNumber} is now LIVE!\n\n${updateCount} matches opened for voting.`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error opening round:', error);
        alert(`Error: ${error.message}`);
    }
};

// ========================================
// CLOSE A ROUND
// ========================================

window.closeRound = async function(roundNumber) {
    if (!confirm(`Close Round ${roundNumber} and advance winners?`)) return;
    
    try {
        console.log(`🔒 Closing Round ${roundNumber}...`);
        
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const q = query(matchesRef, where('round', '==', roundNumber));
        const snapshot = await getDocs(q);
        
        let closedCount = 0;
        const winners = [];
        
        for (const matchDoc of snapshot.docs) {
            const match = matchDoc.data();
            
            const winnerId = match.song1.votes > match.song2.votes ? match.song1.id : match.song2.id;
            const winnerData = match.song1.votes > match.song2.votes ? match.song1 : match.song2;
            
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchDoc.id), {
                status: 'completed',
                winnerId: winnerId
            });
            
            winners.push({
                matchId: match.matchId,
                winner: winnerData
            });
            
            closedCount++;
        }
        
        console.log(`✅ Closed ${closedCount} matches`);
        
        await advanceWinners(roundNumber, winners);
        
        alert(`✅ Round ${roundNumber} closed!\n\n${closedCount} matches completed.\nWinners advanced to Round ${roundNumber + 1}.`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error closing round:', error);
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

window.closeMatch = async function(matchId) {
    if (!confirm(`Close match ${matchId}?\n\nThis will mark it as completed and determine the winner.`)) return;
    
    try {
        const matchRef = doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchId);
        const matchSnap = await getDoc(matchRef);
        
        if (!matchSnap.exists()) {
            alert('Match not found!');
            return;
        }
        
        const match = matchSnap.data();
        const winnerId = match.song1.votes > match.song2.votes ? match.song1.id : match.song2.id;
        
        await updateDoc(matchRef, {
            status: 'completed',
            winnerId: winnerId
        });
        
        console.log(`✅ Closed match: ${matchId}, Winner: ${winnerId}`);
        alert(`✅ Match ${matchId} closed!\n\nWinner: ${match.song1.votes > match.song2.votes ? match.song1.shortTitle : match.song2.shortTitle}`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error closing match:', error);
        alert(`Error: ${error.message}`);
    }
};

// ========================================
// ADVANCE WINNERS TO NEXT ROUND
// ========================================

async function advanceWinners(completedRound, winners) {
    console.log(`📈 Advancing winners from Round ${completedRound}...`);
    
    const nextRound = completedRound + 1;
    const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
    const q = query(matchesRef, where('round', '==', nextRound));
    const nextRoundMatches = await getDocs(q);
    
    for (const nextMatchDoc of nextRoundMatches.docs) {
        const nextMatch = nextMatchDoc.data();
        
        const song1Source = nextMatch.song1.sourceMatch;
        const song2Source = nextMatch.song2.sourceMatch;
        
        let updates = {};
        
        if (song1Source) {
            const winner1 = winners.find(w => w.matchId === song1Source);
            if (winner1) {
                updates.song1 = {
                    ...winner1.winner,
                    votes: 0
                };
            }
        }
        
        if (song2Source) {
            const winner2 = winners.find(w => w.matchId === song2Source);
            if (winner2) {
                updates.song2 = {
                    ...winner2.winner,
                    votes: 0
                };
            }
        }
        
        if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, nextMatchDoc.id), updates);
            console.log(`✅ Updated ${nextMatchDoc.id} with winners`);
        }
    }
    
    console.log(`✅ Winners advanced to Round ${nextRound}`);
}

// ========================================
// LOAD MATCHES INTO TABLE
// ========================================

async function loadMatches() {
    console.log('📥 Loading matches...');
    
    const tbody = document.getElementById('matches-table');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    
    try {
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const snapshot = await getDocs(matchesRef);
        
        const matches = [];
        snapshot.forEach(doc => matches.push(doc.data()));
        
        matches.sort((a, b) => {
            if (a.round !== b.round) return a.round - b.round;
            return a.matchNumber - b.matchNumber;
        });
        
        tbody.innerHTML = '';
        
        for (const match of matches) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>R${match.round} M${match.matchNumber}</td>
                <td>${match.song1.shortTitle || match.song1.title}</td>
                <td>${match.song1.votes || 0}</td>
                <td>${match.song2.shortTitle || match.song2.title}</td>
                <td>${match.song2.votes || 0}</td>
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
        tbody.innerHTML = `<tr><td colspan="7" style="color: #dc3232;">Error: ${error.message}</td></tr>`;
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
// PAGE LOAD
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🏆 Admin Panel Initializing...');
    // Auth state listener will handle the rest
});

// Add these event listeners with your other code
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
        const matchesRef = collection(db, 'tournaments/2025-worlds-anthems/matches');
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