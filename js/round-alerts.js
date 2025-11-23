// ========================================
// ROUND OPENING ALERTS
// Detects when new rounds or batches open
// ========================================

/**
 * Check for new rounds or match batches
 * Polls every 2 minutes to detect when admin opens matches
 */
export async function checkRoundOpenings() {
    try {
        // Fetch all matches
        const response = await fetch('/api/matches');
        if (!response.ok) return null;
        
        const allMatches = await response.json();
        
        // Get live matches only
        const liveMatches = allMatches.filter(m => m.status === 'live');
        
        if (liveMatches.length === 0) return null;
        
        // Group by round
        const matchesByRound = {};
        liveMatches.forEach(match => {
            const round = match.round || 1;
            if (!matchesByRound[round]) {
                matchesByRound[round] = [];
            }
            matchesByRound[round].push(match);
        });
        
        // Get highest round number (most recent)
        const rounds = Object.keys(matchesByRound).map(Number).sort((a, b) => b - a);
        const latestRound = rounds[0];
        const latestRoundMatches = matchesByRound[latestRound];
        
        // Load tracking data
        const notifiedRounds = JSON.parse(localStorage.getItem('notifiedRounds') || '{}');
        const lastNotifiedCount = notifiedRounds[latestRound] || 0;
        const currentMatchCount = latestRoundMatches.length;
        
        // ========================================
        // CASE 1: Brand new round detected
        // ========================================
        if (!notifiedRounds[latestRound]) {
            console.log(`🎪 NEW ROUND DETECTED: Round ${latestRound} with ${currentMatchCount} matches`);
            
            // Mark as notified
            notifiedRounds[latestRound] = currentMatchCount;
            localStorage.setItem('notifiedRounds', JSON.stringify(notifiedRounds));
            
            return {
                type: 'round-opening',
                round: latestRound,
                matchCount: currentMatchCount,
                isNewRound: true
            };
        }
        
        // ========================================
        // CASE 2: New batch in existing round
        // ========================================
        if (currentMatchCount > lastNotifiedCount) {
            const newMatchCount = currentMatchCount - lastNotifiedCount;
            console.log(`💥 NEW BATCH DETECTED: +${newMatchCount} matches in Round ${latestRound} (${lastNotifiedCount} → ${currentMatchCount})`);
            
            // Update count
            notifiedRounds[latestRound] = currentMatchCount;
            localStorage.setItem('notifiedRounds', JSON.stringify(notifiedRounds));
            
            return {
                type: 'new-matches',
                round: latestRound,
                matchCount: newMatchCount,
                totalMatches: currentMatchCount,
                isNewRound: false
            };
        }
        
        // No new rounds or batches
        return null;
        
    } catch (error) {
        console.error('❌ Error checking round openings:', error);
        return null;
    }
}

/**
 * Show round opening notification
 */
export function showRoundOpeningNotification(roundData) {
    const championLoader = window.championLoader;
    if (!championLoader) {
        console.warn('⚠️ Champion loader not available');
        return;
    }
    
    const alertType = roundData.type; // 'round-opening' or 'new-matches'
    
    const championMessage = championLoader.getChampionMessage(alertType, {
        round: roundData.round,
        matchCount: roundData.matchCount
    });
    
    if (!championMessage) {
        console.warn(`⚠️ No champion message for: ${alertType}`);
        return;
    }
    
    // Show bulletin
    if (window.showBulletin) {
        window.showBulletin({
            priority: 1, // High priority - new content!
            type: alertType,
            round: roundData.round,
            matchCount: roundData.matchCount,
            message: championMessage.message,
            detail: championMessage.detail,
            cta: championMessage.cta,
            action: 'navigate',
            targetUrl: '/vote.html'
        });
        
        const logMsg = roundData.isNewRound 
            ? `Round ${roundData.round} opened (${roundData.matchCount} matches)`
            : `+${roundData.matchCount} matches added to Round ${roundData.round}`;
            
        console.log(`🎪 Round alert shown: ${logMsg}`);
    }
}

/**
 * Reset round notifications (for testing)
 */
export function resetRoundNotifications() {
    localStorage.removeItem('notifiedRounds');
    console.log('🔄 Round notifications reset');
}