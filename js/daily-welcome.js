// ========================================
// VOTE SESSION TRACKING - VOTE PAGE ONLY
// Tracks first vote of day for achievements
// ========================================

/**
 * Track first vote of the day
 * Called from submitVote() in vote.js
 */
export function markDailySessionStarted() {
    const today = new Date().toDateString();
    const lastVoteDate = localStorage.getItem('lastVoteDate');
    
    if (lastVoteDate !== today) {
        // First vote today!
        localStorage.setItem('dailySessionStarted', 'true');
        localStorage.setItem('lastVoteDate', today);
        
        console.log('✅ Daily session started - first vote of day');
        return true;
    }
    
    return false;
}