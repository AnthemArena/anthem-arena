// ========================================
// RANK PROGRESSION SYSTEM
// ========================================

// ========================================
// RANK PROGRESSION SYSTEM (SIMPLIFIED)
// ========================================

export const RANK_SYSTEM = {
    levels: [
        { level: 1, xpNeeded: 0, title: '🎵 New Voter' },
        { level: 2, xpNeeded: 100, title: '🎶 Music Fan' },
        { level: 3, xpNeeded: 250, title: '🎧 Enthusiast' },
        { level: 4, xpNeeded: 500, title: '🎸 Dedicated Supporter' },
        { level: 5, xpNeeded: 1000, title: '🎭 Tournament Regular' },
        { level: 6, xpNeeded: 1750, title: '🔥 Power Voter' },
        { level: 7, xpNeeded: 3000, title: '⭐ Super Fan' },
        { level: 8, xpNeeded: 5000, title: '👑 Elite Voter' },
        { level: 9, xpNeeded: 8000, title: '💎 Legend' },
        { level: 10, xpNeeded: 12000, title: '🏆 Anthem Arena Champion' }
    ],
    
    xpSources: {
        vote: 10,                    // Base XP per vote
        firstVoteOfDay: 25,          // Bonus for first vote each day
        votingStreakDaily: 15,       // Bonus per day of active streak
        underdogPick: 5,             // Bonus for voting underdog (lower seed)
        closeMatch: 10,              // Bonus for voting in close match
        firstVoteInMatch: 5          // Early voter bonus (first 10 votes)
    }
};

// ========================================
// CALCULATE USER XP
// ========================================

export function calculateUserXP(allVotes) {
    let totalXP = 0;
    const voteDates = new Set();
    const votedMatches = new Set();
    
    // Sort votes by timestamp
    const sortedVotes = [...allVotes].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    sortedVotes.forEach((vote) => {
        // Base XP for every vote
        totalXP += RANK_SYSTEM.xpSources.vote;
        
        // First vote of day bonus
        const voteDate = new Date(vote.timestamp).toISOString().split('T')[0];
        if (!voteDates.has(voteDate)) {
            totalXP += RANK_SYSTEM.xpSources.firstVoteOfDay;
            voteDates.add(voteDate);
        }
        
        // First voter in match bonus (if vote number < 10)
        if (vote.voteNumber && vote.voteNumber <= 10) {
            totalXP += RANK_SYSTEM.xpSources.firstVoteInMatch;
        }
        
        // Close match bonus (if within 10 votes difference when they voted)
        if (vote.isCloseMatch) {
            totalXP += RANK_SYSTEM.xpSources.closeMatch;
        }
        
        votedMatches.add(vote.matchId);
    });
    
    // Voting streak bonus (from localStorage)
    const streak = parseInt(localStorage.getItem('votingStreak') || '0');
    totalXP += streak * RANK_SYSTEM.xpSources.votingStreakDaily;
    
    return {
        totalXP,
        totalVotes: allVotes.length,
        uniqueDays: voteDates.size,
        uniqueMatches: votedMatches.size,
        currentStreak: streak
    };
}

// ========================================
// GET USER RANK
// ========================================

export function getUserRank(xp) {
    const levels = RANK_SYSTEM.levels;
    
    // Find current level
    let currentLevel = levels[0];
    for (let i = levels.length - 1; i >= 0; i--) {
        if (xp >= levels[i].xpNeeded) {
            currentLevel = levels[i];
            break;
        }
    }
    
    // Find next level
    const currentIndex = levels.indexOf(currentLevel);
    const nextLevel = levels[currentIndex + 1] || null;
    
    // Calculate progress to next level
    let progressXP = 0;
    let xpForNextLevel = 0;
    let progressPercentage = 100;
    
    if (nextLevel) {
        progressXP = xp - currentLevel.xpNeeded;
        xpForNextLevel = nextLevel.xpNeeded - currentLevel.xpNeeded;
        progressPercentage = Math.min(100, Math.round((progressXP / xpForNextLevel) * 100));
    }
    
    return {
        currentLevel,
        nextLevel,
        totalXP: xp,
        progressXP,
        xpForNextLevel,
        progressPercentage,
        isMaxLevel: nextLevel === null
    };
}

// ========================================
// CALCULATE XP GAINED FROM VOTE
// ========================================

export function calculateVoteXP(voteData) {
    let xp = RANK_SYSTEM.xpSources.vote;
    const bonuses = [];
    
    // First vote of day
    const lastVoteDate = localStorage.getItem('lastVoteDate');
    const today = new Date().toISOString().split('T')[0];
    if (lastVoteDate !== today) {
        xp += RANK_SYSTEM.xpSources.firstVoteOfDay;
        bonuses.push({ type: 'First vote today', xp: RANK_SYSTEM.xpSources.firstVoteOfDay });
        localStorage.setItem('lastVoteDate', today);
    }
    
    // Underdog bonus (if voted for lower seed)
    if (voteData.isUnderdog) {
        xp += RANK_SYSTEM.xpSources.underdogPick;
        bonuses.push({ type: 'Underdog pick', xp: RANK_SYSTEM.xpSources.underdogPick });
    }
    
    // Close match bonus
    if (voteData.isCloseMatch) {
        xp += RANK_SYSTEM.xpSources.closeMatch;
        bonuses.push({ type: 'Close match', xp: RANK_SYSTEM.xpSources.closeMatch });
    }
    
    return {
        totalXP: xp,
        baseXP: RANK_SYSTEM.xpSources.vote,
        bonuses
    };
}

// ========================================
// SAVE XP TO LOCAL STORAGE
// ========================================

export function saveUserXP(xp) {
    localStorage.setItem('userTotalXP', xp.toString());
}

export function getUserXPFromStorage() {
    return parseInt(localStorage.getItem('userTotalXP') || '0');
}

export function addXP(xpToAdd) {
    const currentXP = getUserXPFromStorage();
    const newXP = currentXP + xpToAdd;
    saveUserXP(newXP);
    return newXP;
}