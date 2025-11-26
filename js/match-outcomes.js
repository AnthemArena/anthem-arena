// ========================================
// MATCH OUTCOME CHECKER
// Checks completed matches and notifies users
// ========================================

import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Check all user's votes for match outcomes
 * Called periodically by global-notifications.js
 */
export async function checkMatchOutcomes() {
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId || userId === 'anonymous') return [];
    
    try {
        // Get user's votes from localStorage
        const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
        
        if (Object.keys(userVotes).length === 0) {
            return [];
        }
        
        // Get already-notified matches
        const notifiedMatches = JSON.parse(localStorage.getItem('notifiedMatchOutcomes') || '[]');
        
        // Fetch all matches
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        
        const outcomes = [];
        
        for (const [matchId, voteData] of Object.entries(userVotes)) {
            // Skip if already notified
            if (notifiedMatches.includes(matchId)) continue;
            
            // Find the match
            const match = allMatches.find(m => (m.matchId || m.id) === matchId);
            
            if (!match) continue;
            
            // Only check completed matches
            if (match.status !== 'completed') continue;
            
            // Determine outcome
            const outcome = await determineOutcome(match, voteData);
            
            if (outcome) {
                outcomes.push({
                    matchId: matchId,
                    matchTitle: `${match.song1?.shortTitle || match.song1?.title} vs ${match.song2?.shortTitle || match.song2?.title}`,
                    userPick: voteData.songTitle,
                    winner: outcome.winner,
                    loser: outcome.loser,
                    result: outcome.result,
                    finalVotes: outcome.finalVotes,
                    thumbnailUrl: getThumbnailUrl(match, voteData.songId)
                });
                
                // Mark as notified
                notifiedMatches.push(matchId);
            }
        }
        
        // ✅ NEW: Update Firebase votes with outcomes
        if (outcomes.length > 0) {
            localStorage.setItem('notifiedMatchOutcomes', JSON.stringify(notifiedMatches));
            
            // Import Firebase functions
            const { doc, updateDoc, collection, query, where, getDocs } = 
                await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            // Update each vote in Firebase
            for (const outcome of outcomes) {
                try {
                    // Find the vote document
                    const votesRef = collection(db, 'votes');
                    const voteQuery = query(
                        votesRef,
                        where('userId', '==', userId),
                        where('matchId', '==', outcome.matchId)
                    );
                    
                    const voteSnapshot = await getDocs(voteQuery);
                    
                    if (!voteSnapshot.empty) {
                        const voteDoc = voteSnapshot.docs[0];
                        
                        // ✅ Update vote with outcome
                        await updateDoc(doc(db, 'votes', voteDoc.id), {
                            outcome: outcome.result,
                            matchCompleted: true,
                            completedAt: new Date().toISOString()
                        });
                        
                        console.log(`✅ Updated vote with outcome: ${outcome.result} for match ${outcome.matchId}`);
                    } else {
                        console.warn(`⚠️ No vote found for user ${userId} in match ${outcome.matchId}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Failed to update vote outcome for match ${outcome.matchId}:`, error);
                }
            }
        }
        
        return outcomes;
        
    } catch (error) {
        console.error('❌ Error checking match outcomes:', error);
        return [];
    }
}

/**
 * Determine the outcome of a completed match
 */
/**
 * Determine the outcome of a completed match
 */
async function determineOutcome(match, voteData) {
    const song1Votes = match.song1?.votes || 0;
    const song2Votes = match.song2?.votes || 0;
    
    let winner, loser, result;
    
    if (song1Votes !== song2Votes) {
        // Clear winner by votes
        if (song1Votes > song2Votes) {
            winner = match.song1?.shortTitle || match.song1?.title;
            loser = match.song2?.shortTitle || match.song2?.title;
            result = voteData.songId === match.song1?.videoId ? 'won' : 'lost';
        } else {
            winner = match.song2?.shortTitle || match.song2?.title;
            loser = match.song1?.shortTitle || match.song1?.title;
            result = voteData.songId === match.song2?.videoId ? 'won' : 'lost';
        }
    } 
    else {
        // ✅ TIE: Check which song advanced to next round
        const advancedSong = await checkWhichSongAdvanced(match);
        
        if (advancedSong) {
            winner = advancedSong === 'song1' 
                ? match.song1?.shortTitle || match.song1?.title
                : match.song2?.shortTitle || match.song2?.title;
            
            loser = advancedSong === 'song1'
                ? match.song2?.shortTitle || match.song2?.title
                : match.song1?.shortTitle || match.song1?.title;
            
            const winnerVideoId = advancedSong === 'song1' 
                ? match.song1?.videoId 
                : match.song2?.videoId;
            
            result = voteData.songId === winnerVideoId ? 'won' : 'lost';
            
            console.log(`🤝 Tie-breaker: ${winner} advanced to next round`);
        } else {
            // Can't determine - default to song1 wins (fallback)
            console.warn('⚠️ Could not determine tie-breaker winner');
            winner = match.song1?.shortTitle || match.song1?.title;
            loser = match.song2?.shortTitle || match.song2?.title;
            result = voteData.songId === match.song1?.videoId ? 'won' : 'lost';
        }
    }
    
    return {
        winner: winner,
        loser: loser,
        result: result,
        finalVotes: {
            song1: song1Votes,
            song2: song2Votes,
            total: song1Votes + song2Votes,
            wasTied: song1Votes === song2Votes
        }
    };
}

/**
 * Check which song advanced to the next round
 */
async function checkWhichSongAdvanced(completedMatch) {
    try {
        // Fetch all matches to find next round
        const response = await fetch('/api/matches');
        const allMatches = await response.json();
        
        // Determine next round number
        const currentRound = completedMatch.round;
        const nextRound = currentRound + 1;
        
        // Find matches in next round
        const nextRoundMatches = allMatches.filter(m => m.round === nextRound);
        
        // Check if either song appears in next round
        for (const nextMatch of nextRoundMatches) {
            // Check if song1 from completed match appears
            if (nextMatch.song1?.videoId === completedMatch.song1?.videoId ||
                nextMatch.song2?.videoId === completedMatch.song1?.videoId) {
                return 'song1'; // Song1 advanced
            }
            
            // Check if song2 from completed match appears
            if (nextMatch.song1?.videoId === completedMatch.song2?.videoId ||
                nextMatch.song2?.videoId === completedMatch.song2?.videoId) {
                return 'song2'; // Song2 advanced
            }
        }
        
        // No match found in next round - might be finals or still processing
        return null;
        
    } catch (error) {
        console.error('Error checking advancement:', error);
        return null;
    }
}

/**
 * Get thumbnail URL for the user's voted song
 */
function getThumbnailUrl(match, votedSongId) {
    if (match.song1?.videoId === votedSongId) {
        return `https://img.youtube.com/vi/${match.song1.videoId}/mqdefault.jpg`;
    } else if (match.song2?.videoId === votedSongId) {
        return `https://img.youtube.com/vi/${match.song2.videoId}/mqdefault.jpg`;
    }
    return null;
}

/**
 * Show match outcome notification
 */
export function showMatchOutcomeNotification(outcome) {
    const championLoader = window.championLoader;
    if (!championLoader) {
        console.warn('⚠️ Champion loader not available');
        return;
    }
    
    // ✅ NEW: Check if this is user's first win/loss
    const unlockedAchievements = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    const isFirstWin = outcome.result === 'won' && !unlockedAchievements.includes('match-won');
    const isFirstLoss = outcome.result === 'lost' && !unlockedAchievements.includes('match-lost');
    
    // ✅ If first time, skip recurring alert (achievement system will handle it)
    if (isFirstWin || isFirstLoss) {
        console.log(`🏆 First-time ${outcome.result} - deferring to achievement system`);
        return;
    }
    
    let championMessage;
    let priority;
    let type;
    
    if (outcome.result === 'won') {
        championMessage = championLoader.getChampionMessage('match-won', {
            songTitle: outcome.userPick
        });
        priority = 2;
        type = 'match-won';
        
    } else if (outcome.result === 'lost') {
        championMessage = championLoader.getChampionMessage('match-lost', {
            songTitle: outcome.userPick
        });
        priority = 3;
        type = 'match-lost';
        
    } else if (outcome.result === 'tied') {
        championMessage = championLoader.getChampionMessage('match-tied', {
            songTitle: outcome.userPick
        });
        priority = 3;
        type = 'match-tied';
    }
    
    if (!championMessage) {
        console.warn(`⚠️ No message for outcome: ${outcome.result}`);
        return;
    }
    
    // Show bulletin
    if (window.showBulletin) {
        window.showBulletin({
            priority: priority,
            type: type,
            matchId: outcome.matchId,
            song: outcome.userPick,
            opponent: outcome.result === 'won' ? outcome.loser : outcome.winner,
            thumbnailUrl: outcome.thumbnailUrl,
            message: championMessage.message,
            detail: championMessage.detail,
            cta: championMessage.cta,
            action: 'navigate',
            targetUrl: `/vote.html?match=${outcome.matchId}`
        });
        
        console.log(`🏆 Match outcome shown: ${outcome.userPick} ${outcome.result} in ${outcome.matchTitle}`);
    }
}