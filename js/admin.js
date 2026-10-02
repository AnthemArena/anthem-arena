// ========================================
// ADMIN PANEL - TOURNAMENT MANAGEMENT + BLOG GENERATION
// ========================================

import { db, auth } from './firebase-config.js';
import { initializeCompleteTournament } from './init-firebase.js';

// ✅ NEW: Import blog generation functions
import {
    generateMatchRecap,
    generateRoundRecap,
    generateRoundPreview,
    saveBlogPost,
    getAllBlogPosts,
    autoGenerateMatchRecap,
    autoGenerateRoundRecap
} from './blog-generator.js';

import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ========================================
// TOURNAMENT CONFIG
// ========================================

import { ARCANE_CONFIG } from './arcane-config.js';
const ACTIVE_TOURNAMENT = ARCANE_CONFIG.tournamentId;

// ========================================
// AUTHENTICATION
// ========================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('✅ Authenticated as:', user.email);
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('admin-content').style.display = 'block';
        loadMatches();
        loadRecentBlogPosts();
    } else {
        console.log('❌ Not authenticated');
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('admin-content').style.display = 'none';
    }
});

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
// BLOG GENERATION FUNCTIONS
// ========================================

window.generateMatchRecapFromAdmin = async function() {
    const matchId = document.getElementById('blogMatchId').value.trim();
    
    if (!matchId) {
        alert('Please enter a match ID');
        return;
    }
    
    logBlog(`🤖 Generating match recap for ${matchId}...`);
    
    try {
        const blogPost = await generateMatchRecap(matchId);
        await saveBlogPost(blogPost);
        
        logBlog(`✅ SUCCESS: "${blogPost.headline}"`, 'success');
        logBlog(`📝 Post ID: ${blogPost.id}`);
        logBlog(`🔗 Slug: /blog/${blogPost.slug}`);
        
        document.getElementById('blogMatchId').value = '';
        loadRecentBlogPosts();
        
        alert(`✅ Blog post created!\n\n${blogPost.headline}\n\nView at: /blog/${blogPost.slug}`);
        
    } catch (error) {
        logBlog(`❌ ERROR: ${error.message}`, 'error');
        alert(`❌ Error: ${error.message}`);
        console.error(error);
    }
};

window.generateRoundRecapFromAdmin = async function() {
    const roundNumber = parseInt(document.getElementById('blogRoundNumber').value);
    
    if (!roundNumber || roundNumber < 1 || roundNumber > 6) {
        alert('Please enter a valid round number (1-6)');
        return;
    }
    
    logBlog(`🤖 Generating round ${roundNumber} recap...`);
    
    try {
        const blogPost = await generateRoundRecap(roundNumber);
        await saveBlogPost(blogPost);
        
        logBlog(`✅ SUCCESS: "${blogPost.headline}"`, 'success');
        logBlog(`📝 Post ID: ${blogPost.id}`);
        
        document.getElementById('blogRoundNumber').value = '';
        loadRecentBlogPosts();
        
        alert(`✅ Round recap created!\n\n${blogPost.headline}`);
        
    } catch (error) {
        logBlog(`❌ ERROR: ${error.message}`, 'error');
        alert(`❌ Error: ${error.message}`);
        console.error(error);
    }
};

async function loadRecentBlogPosts() {
    try {
        const posts = await getAllBlogPosts(5);
        const container = document.getElementById('recentBlogPosts');
        
        if (!container) return;
        
        if (posts.length === 0) {
            container.innerHTML = '<p style="color: #888;">No blog posts yet. Generate one above!</p>';
            return;
        }
        
        container.innerHTML = posts.map(post => `
            <div class="blog-post-item">
                <div class="blog-post-header">
                    <span class="blog-post-type">${post.type}</span>
                    ${post.featured ? '<span class="featured-badge">⭐ Featured</span>' : ''}
                </div>
                <h4>${post.headline}</h4>
                <p class="blog-post-meta">
                    ${new Date(post.publishedDate).toLocaleDateString()} • 
                    ${post.category} • 
                    ${post.tags.slice(0, 2).join(', ')}
                </p>
                <div class="blog-post-actions">
                    <a href="/blog/${post.slug}" target="_blank" class="btn-view">View Post</a>
                </div>
            </div>
        `).join('');
        
        logBlog(`✅ Loaded ${posts.length} recent blog posts`);
        
    } catch (error) {
        console.error('Error loading recent blog posts:', error);
        logBlog(`⚠️ Failed to load recent posts: ${error.message}`, 'error');
    }
}

function logBlog(message, type = 'info') {
    const logOutput = document.getElementById('blogGenerationLog');
    if (!logOutput) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const className = type === 'error' ? 'log-error' : type === 'success' ? 'log-success' : 'log-info';
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${className}`;
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
    
    logOutput.insertBefore(logEntry, logOutput.firstChild);
    
    while (logOutput.children.length > 50) {
        logOutput.removeChild(logOutput.lastChild);
    }
}

// ========================================
// STAGGERED BLOG GENERATION QUEUE
// ========================================

let blogGenerationQueue = [];
let isProcessingQueue = false;

async function addToGenerationQueue(matchId, delayMinutes = 0) {
    blogGenerationQueue.push({
        matchId,
        scheduledTime: Date.now() + (delayMinutes * 60 * 1000)
    });
    
    logBlog(`📋 Queued blog for ${matchId} (publish in ${delayMinutes}m)`);
    
    if (!isProcessingQueue) {
        processGenerationQueue();
    }
}

async function processGenerationQueue() {
    isProcessingQueue = true;
    
    while (blogGenerationQueue.length > 0) {
        const now = Date.now();
        const nextItem = blogGenerationQueue[0];
        
        if (now >= nextItem.scheduledTime) {
            blogGenerationQueue.shift();
            
            try {
                logBlog(`🤖 Generating scheduled blog for ${nextItem.matchId}...`);
                const blogPost = await autoGenerateMatchRecap(nextItem.matchId);
                
                if (blogPost) {
                    logBlog(`✅ Published: "${blogPost.headline}"`, 'success');
                    loadRecentBlogPosts();
                }
            } catch (error) {
                logBlog(`❌ Failed to generate ${nextItem.matchId}: ${error.message}`, 'error');
            }
        } else {
            const waitTime = nextItem.scheduledTime - now;
            logBlog(`⏳ Next blog in ${Math.round(waitTime / 60000)}m...`);
            await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 60000)));
        }
    }
    
    isProcessingQueue = false;
    logBlog(`✅ Blog generation queue complete`);
}

// ========================================
// MATCH OPERATIONS
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
        
        // ========================================
        // ✅ DETERMINE WINNER WITH TIEBREAKER
        // ========================================
        
        const song1Votes = match.song1.votes;
        const song2Votes = match.song2.votes;
        const song1Seed = match.song1.seed;
        const song2Seed = match.song2.seed;
        
        let winnerId;
        let winnerData;
        let winMethod;
        
        if (song1Votes > song2Votes) {
            // Song 1 wins by votes
            winnerId = match.song1.id;
            winnerData = match.song1;
            winMethod = 'votes';
        } else if (song2Votes > song1Votes) {
            // Song 2 wins by votes
            winnerId = match.song2.id;
            winnerData = match.song2;
            winMethod = 'votes';
        } else {
            // ✅ TIE - Higher seed (lower number) wins
            if (song1Seed < song2Seed) {
                winnerId = match.song1.id;
                winnerData = match.song1;
                winMethod = 'tiebreaker-seed';
                console.log(`⚖️ TIEBREAKER: Seed ${song1Seed} beats Seed ${song2Seed}`);
            } else {
                winnerId = match.song2.id;
                winnerData = match.song2;
                winMethod = 'tiebreaker-seed';
                console.log(`⚖️ TIEBREAKER: Seed ${song2Seed} beats Seed ${song1Seed}`);
            }
        }
        
        // ========================================
        // UPDATE MATCH WITH WINNER INFO
        // ========================================
        
        await updateDoc(matchRef, {
            status: 'completed',
            winnerId: winnerId,
            winMethod: winMethod,  // ← NEW: Track how they won
            finalScore: `${song1Votes}-${song2Votes}`  // ← NEW: Store final score
        });
        
        console.log(`✅ Closed match: ${matchId}`);
        console.log(`Winner: ${winnerData.shortTitle} (${winMethod})`);
        console.log(`Final Score: ${song1Votes}-${song2Votes}`);
        
        await advanceWinnerToNextRound(match, winnerData);
        
        // Single match = immediate blog (no staggering)
        const autoGenerate = document.getElementById('autoGenerateBlog');
        if (autoGenerate && autoGenerate.checked) {
            logBlog(`🤖 Generating blog for ${matchId}...`);
            try {
                const blogPost = await autoGenerateMatchRecap(matchId);
                if (blogPost) {
                    logBlog(`✅ Published: "${blogPost.headline}"`, 'success');
                    loadRecentBlogPosts();
                }
            } catch (error) {
                logBlog(`⚠️ Blog generation failed: ${error.message}`, 'error');
            }
        }
        
        // ✅ UPDATED ALERT - Show if tiebreaker was used
        const tiebreakerMsg = winMethod === 'tiebreaker-seed' 
            ? `\n\n⚖️ TIEBREAKER: Won by higher seed (${winnerData.seed} > ${winnerData === match.song1 ? match.song2.seed : match.song1.seed})`
            : '';
        
        alert(`✅ Match ${matchId} closed!\n\nWinner: ${winnerData.shortTitle}\nScore: ${song1Votes}-${song2Votes}${tiebreakerMsg}\n✨ Advanced to next round!`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error closing match:', error);
        alert(`❌ Error: ${error.message}`);
    }
};

async function advanceWinnerToNextRound(completedMatch, winner) {
    const nextRound = completedMatch.round + 1;
    
    console.log(`📈 Checking if ${completedMatch.matchId} winner advances to Round ${nextRound}...`);
    
    const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
    const q = query(matchesRef, where('round', '==', nextRound));
    const snapshot = await getDocs(q);
    
    let advanced = false;
    
    for (const nextMatchDoc of snapshot.docs) {
        const nextMatch = nextMatchDoc.data();
        
        if (nextMatch.song1?.sourceMatch === completedMatch.matchId) {
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, nextMatchDoc.id), {
                'song1': {
                    ...winner,
                    votes: 0,
                    sourceMatch: completedMatch.matchId
                }
            });
            console.log(`  ✅ Advanced to ${nextMatch.matchId} (song1 slot)`);
            advanced = true;
        }
        
        if (nextMatch.song2?.sourceMatch === completedMatch.matchId) {
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, nextMatchDoc.id), {
                'song2': {
                    ...winner,
                    votes: 0,
                    sourceMatch: completedMatch.matchId
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
// BATCH OPERATIONS
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
        
        // ✅ Generate round preview if this is batch 1
        const autoGenerate = document.getElementById('autoGenerateBlog');
        if (autoGenerate && autoGenerate.checked && batchNumber === 1) {
            logBlog(`🔮 Generating Round ${roundNumber} preview...`);
            try {
                const previewPost = await generateRoundPreview(roundNumber);
                await saveBlogPost(previewPost);
                logBlog(`✅ Round preview published: "${previewPost.headline}"`, 'success');
                loadRecentBlogPosts();
            } catch (error) {
                logBlog(`⚠️ Preview generation failed: ${error.message}`, 'error');
            }
        }
        
        alert(`✅ Round ${roundNumber}, Batch ${batchNumber} is now LIVE!\n\n${updateCount} matches opened:\n${matchList.join('\n')}`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error opening batch:', error);
        alert(`Error: ${error.message}`);
    }
};

window.closeBatch = async function(roundNumber, batchNumber) {
    if (!confirm(`Close Round ${roundNumber}, Batch ${batchNumber}?\n\nThis will:\n- Determine winners\n- Advance them to next round\n- Stagger blog post generation`)) return;
    
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
        const autoGenerate = document.getElementById('autoGenerateBlog');
        const shouldAutoGenerate = autoGenerate && autoGenerate.checked;
        
        // ✅ Categorize matches for staggered posting
        const upsets = [];
        const nailbiters = [];
        const regularMatches = [];
        
        for (const matchDoc of snapshot.docs) {
            const match = matchDoc.data();
            
            // ========================================
            // ✅ DETERMINE WINNER WITH TIEBREAKER
            // ========================================
            
            const song1Votes = match.song1.votes;
            const song2Votes = match.song2.votes;
            const song1Seed = match.song1.seed;
            const song2Seed = match.song2.seed;
            
            let winnerId;
            let winnerData;
            let loserData;
            let winMethod;
            
            if (song1Votes > song2Votes) {
                winnerId = match.song1.id;
                winnerData = match.song1;
                loserData = match.song2;
                winMethod = 'votes';
            } else if (song2Votes > song1Votes) {
                winnerId = match.song2.id;
                winnerData = match.song2;
                loserData = match.song1;
                winMethod = 'votes';
            } else {
                // ✅ TIE - Higher seed (lower number) wins
                if (song1Seed < song2Seed) {
                    winnerId = match.song1.id;
                    winnerData = match.song1;
                    loserData = match.song2;
                    winMethod = 'tiebreaker-seed';
                    console.log(`⚖️ TIEBREAKER: Seed ${song1Seed} beats Seed ${song2Seed}`);
                } else {
                    winnerId = match.song2.id;
                    winnerData = match.song2;
                    loserData = match.song1;
                    winMethod = 'tiebreaker-seed';
                    console.log(`⚖️ TIEBREAKER: Seed ${song2Seed} beats Seed ${song1Seed}`);
                }
            }
            
            // ========================================
            // UPDATE MATCH WITH WINNER INFO
            // ========================================
            
            await updateDoc(doc(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`, matchDoc.id), {
                status: 'completed',
                winnerId: winnerId,
                winMethod: winMethod,  // ← Store how they won
                finalScore: `${song1Votes}-${song2Votes}`  // ← Store final score
            });
            
            await advanceWinnerToNextRound(match, winnerData);
            
            // ✅ Add tiebreaker indicator to results
            const tiebreakerIndicator = winMethod === 'tiebreaker-seed' ? ' ⚖️' : '';
            results.push(`${match.matchId}: ${winnerData.shortTitle} defeats ${loserData.shortTitle} (${winnerData.votes}-${loserData.votes})${tiebreakerIndicator}`);
            closedCount++;
            
            // ✅ Categorize for staggered posting
            if (shouldAutoGenerate) {
                const voteDiff = Math.abs(winnerData.votes - loserData.votes);
                const totalVotes = match.totalVotes || (winnerData.votes + loserData.votes);
                const percentDiff = totalVotes > 0 ? (voteDiff / totalVotes) * 100 : 0;
                const isUpset = loserData.seed < winnerData.seed;
                const isNailbiter = voteDiff <= 5 || percentDiff <= 5;
                
                if (isUpset && Math.abs(loserData.seed - winnerData.seed) >= 8) {
                    upsets.push(match.matchId);
                } else if (isNailbiter) {
                    nailbiters.push(match.matchId);
                } else {
                    regularMatches.push(match.matchId);
                }
            }
        }
        
        console.log(`✅ Closed ${closedCount} matches`);
        
        // ✅ Stagger blog post generation
        if (shouldAutoGenerate && closedCount > 0) {
            logBlog(`📰 Scheduling ${closedCount} blog posts with smart timing...`);
            
            let delayMinutes = 0;
            
            // Priority 1: Upsets (immediate)
            for (const matchId of upsets) {
                await addToGenerationQueue(matchId, delayMinutes);
                delayMinutes += 15;
            }
            
            // Priority 2: Nail-biters
            for (const matchId of nailbiters) {
                await addToGenerationQueue(matchId, delayMinutes);
                delayMinutes += 20;
            }
            
            // Priority 3: Regular matches
            for (const matchId of regularMatches) {
                await addToGenerationQueue(matchId, delayMinutes);
                delayMinutes += 30;
            }
            
            logBlog(`📅 Blog schedule:`, 'success');
            logBlog(`  • ${upsets.length} upsets (0-${upsets.length * 15}m)`);
            logBlog(`  • ${nailbiters.length} thrillers (${upsets.length * 15}-${upsets.length * 15 + nailbiters.length * 20}m)`);
            logBlog(`  • ${regularMatches.length} regular (${upsets.length * 15 + nailbiters.length * 20}+m)`);
            
            // ✅ Schedule round recap after all match recaps (only if round complete)
            const roundRecapDelay = delayMinutes + 120;
            
            setTimeout(async () => {
                const stillLiveQuery = query(
                    matchesRef,
                    where('round', '==', roundNumber),
                    where('status', '==', 'live')
                );
                const stillLiveSnap = await getDocs(stillLiveQuery);
                
                if (stillLiveSnap.empty) {
                    logBlog(`🎉 Round ${roundNumber} complete! Generating round recap...`);
                    try {
                        const roundBlogPost = await autoGenerateRoundRecap(roundNumber);
                        if (roundBlogPost) {
                            logBlog(`✅ Round recap published: "${roundBlogPost.headline}"`, 'success');
                            loadRecentBlogPosts();
                        }
                    } catch (error) {
                        logBlog(`⚠️ Round recap failed: ${error.message}`, 'error');
                    }
                } else {
                    logBlog(`ℹ️ Round ${roundNumber} still has ${stillLiveSnap.size} live matches - skipping round recap`);
                }
            }, roundRecapDelay * 60 * 1000);
            
            logBlog(`📖 Round recap scheduled in ${Math.round(roundRecapDelay / 60)}h ${roundRecapDelay % 60}m (if round complete)`);
        }
        
        alert(`✅ Round ${roundNumber}, Batch ${batchNumber} closed!\n\n${closedCount} matches completed\n\n${shouldAutoGenerate ? `Blog posts scheduled:\n• ${upsets.length} upsets\n• ${nailbiters.length} thrillers\n• ${regularMatches.length} regular\n\nPublishing over next ${Math.round(delayMinutes / 60)}h ${delayMinutes % 60}m` : 'Auto-blog disabled'}\n\n${results.slice(0, 3).join('\n')}${results.length > 3 ? `\n...and ${results.length - 3} more` : ''}`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error closing batch:', error);
        alert(`Error: ${error.message}`);
    }
};

// ========================================
// LOAD MATCHES
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
        
        let currentRound = null;
        let currentBatch = null;
        
        for (const match of matches) {
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

window.viewMatch = function(matchId) {
    window.location.href = `/vote.html?match=${matchId}`;
};

// ========================================
// TESTING FUNCTIONS
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
        
        const deletePromises = votesSnapshot.docs.map(voteDoc => 
            deleteDoc(doc(db, 'votes', voteDoc.id))
        );
        
        await Promise.all(deletePromises);
        
        console.log('✅ All votes cleared');
        alert(`✅ Successfully deleted ${voteCount} votes!`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error clearing votes:', error);
        alert(`❌ Error: ${error.message}`);
    }
};

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🏆 Admin Panel Initializing...');
    
    document.getElementById('initTournamentBtn')?.addEventListener('click', async () => {
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

    document.getElementById('resetTournamentBtn')?.addEventListener('click', async () => {
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
            
            await initializeCompleteTournament();
            
            alert('✅ Tournament reset complete! Refresh page.');
            location.reload();
            
        } catch (error) {
            alert('❌ Error: ' + error.message);
            console.error(error);
        }
    });
    
    loadRecentBlogPosts();
    logBlog('🎨 Admin Panel loaded - Blog generation ready');
});
// ========================================
// RECOUNT ALL ROUND 1 VOTES
// ========================================

window.recountRound1 = async function() {
    if (!confirm('Recount all Round 1 votes and fix winners?\n\nThis will:\n- Recount votes from vote records\n- Update match scores\n- Fix Round 2 bracket')) {
        return;
    }
    
    try {
        console.log('🔧 Starting Round 1 recount...\n');
        
        const matchesRef = collection(db, `tournaments/${ACTIVE_TOURNAMENT}/matches`);
        const matchesQuery = query(matchesRef, where('round', '==', 1));
        const matchesSnap = await getDocs(matchesQuery);
        
        console.log(`📊 Found ${matchesSnap.size} Round 1 matches\n`);
        
        let fixedCount = 0;
        
        for (const matchDoc of matchesSnap.docs) {
            const matchId = matchDoc.id;
            const match = matchDoc.data();
            
            console.log(`🔄 ${matchId}: ${match.song1.shortTitle} vs ${match.song2.shortTitle}`);
            
            // Count votes
            const votesRef = collection(db, 'votes');
            const votesQuery = query(votesRef, where('matchId', '==', matchId));
            const votesSnap = await getDocs(votesQuery);
            
            let song1Votes = 0;
            let song2Votes = 0;
            
            votesSnap.forEach(voteDoc => {
                const vote = voteDoc.data();
                if (vote.choice === 'song1') song1Votes++;
                if (vote.choice === 'song2') song2Votes++;
            });
            
            console.log(`   Old: ${match.song1?.votes || 0}-${match.song2?.votes || 0} → New: ${song1Votes}-${song2Votes}`);
            
            // Determine winner
            let winnerId, winnerData, winMethod;
            
            if (song1Votes > song2Votes) {
                winnerId = match.song1.id;
                winnerData = match.song1;
                winMethod = 'votes';
            } else if (song2Votes > song1Votes) {
                winnerId = match.song2.id;
                winnerData = match.song2;
                winMethod = 'votes';
            } else {
                if (match.song1.seed < match.song2.seed) {
                    winnerId = match.song1.id;
                    winnerData = match.song1;
                    winMethod = 'tiebreaker-seed';
                } else {
                    winnerId = match.song2.id;
                    winnerData = match.song2;
                    winMethod = 'tiebreaker-seed';
                }
                console.log(`   ⚖️ TIE: ${winnerData.shortTitle} wins by seed`);
            }
            
            console.log(`   ✅ Winner: ${winnerData.shortTitle}`);
            
            // Update match
            await updateDoc(matchDoc.ref, {
                'song1.votes': song1Votes,
                'song2.votes': song2Votes,
                totalVotes: song1Votes + song2Votes,
                winnerId: winnerId,
                winMethod: winMethod,
                finalScore: `${song1Votes}-${song2Votes}`,
                status: 'completed'
            });
            
            // Update Round 2
            await advanceWinnerToNextRound(match, winnerData);
            
            fixedCount++;
            console.log('');
        }
        
        console.log(`\n🎉 Fixed ${fixedCount} matches!`);
        alert(`✅ Success!\n\nRecounted ${fixedCount} matches.\nRefresh brackets.html to see correct winners.`);
        
        loadMatches();
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert(`Error: ${error.message}`);
    }
};