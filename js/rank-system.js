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
        { level: 4, xpNeeded: 500, title: '🎸 Dedicated Fan' },          // ✅ Shortened
        { level: 5, xpNeeded: 1000, title: '🎭 Tournament Regular' },
        { level: 6, xpNeeded: 1750, title: '🔥 Power Voter' },
        { level: 7, xpNeeded: 3000, title: '⭐ Super Fan' },
        { level: 8, xpNeeded: 5000, title: '👑 Elite Voter' },
        { level: 9, xpNeeded: 8000, title: '💎 Legend' },
        { level: 10, xpNeeded: 12000, title: '🏆 Arena Champion' }       // ✅ Shortened
    ],
    
    xpSources: {
        vote: 10,
        firstVoteOfDay: 25,
        votingStreakDaily: 15,
        underdogPick: 5,
        closeMatch: 10,
        firstVoteInMatch: 5,
            share: 5  // ✅ ADD THIS

    },
    
    // ✅ NEW: Tier groupings
    tiers: {
        BRONZE: { levels: [1, 2, 3], color: '#CD7F32', label: 'Bronze' },
        SILVER: { levels: [4, 5, 6], color: '#C0C0C0', label: 'Silver' },
        GOLD: { levels: [7, 8], color: '#FFD700', label: 'Gold' },
        LEGEND: { levels: [9, 10], color: '#C8AA6E', label: 'Legendary' }
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
    
// Voting streak bonus (CAPPED at 10 days to prevent abuse)
// Users get 15 XP per day streak, but only up to 10 days = max 150 XP
const streak = parseInt(localStorage.getItem('votingStreak') || '0');
const MAX_STREAK_BONUS = 10;
const cappedStreak = Math.min(streak, MAX_STREAK_BONUS);
totalXP += cappedStreak * RANK_SYSTEM.xpSources.votingStreakDaily;

console.log(`📊 Streak bonus: ${cappedStreak} days × ${RANK_SYSTEM.xpSources.votingStreakDaily} XP = ${cappedStreak * RANK_SYSTEM.xpSources.votingStreakDaily} XP`);
    
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

export function addXP(xpToAdd, source = 'vote') {
    const currentXP = getUserXPFromStorage();
    const oldRank = getUserRank(currentXP);
    const oldLevel = oldRank.currentLevel.level;
    
    const newXP = currentXP + xpToAdd;
    saveUserXP(newXP);
    
    const newRank = getUserRank(newXP);
    const newLevel = newRank.currentLevel.level;
    
    // ✅ Check for level-up
    if (newLevel > oldLevel) {
        console.log(`🎉 LEVEL UP! ${oldLevel} → ${newLevel}`);
        
      // ✅ Show level-up toast notification
        if (window.showBulletin) {
            window.showBulletin({
                type: 'level-up',
                message: `⬆️ Level Up! Level ${newLevel}`,
                detail: `You've reached ${newRank.currentLevel.title}! +${xpToAdd} XP earned`,
                cta: 'View Progress',
                ctaAction: () => window.location.href = 'my-votes.html',
                duration: 5000
            });
        }
        
        // Update nav if available
        if (window.updateNavProfile) {
            window.updateNavProfile();
        }
    }
    
    return newXP;
}
// ========================================
// ✅ SYNC PROFILE STATS TO FIRESTORE
// ========================================

export async function syncProfileStatsToFirestore() {
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        if (!userId) {
            console.warn('⚠️ No userId - cannot sync profile');
            return;
        }
        
        // Get current XP from storage
        const totalXP = getUserXPFromStorage();
        const rank = getUserRank(totalXP);
        
        // Get vote count from stats
        const statsJson = localStorage.getItem('stats');
        let voteCount = 0;
        
        try {
            const stats = JSON.parse(statsJson);
            voteCount = stats.votes || 0;
        } catch {
            console.warn('⚠️ No stats found in localStorage');
        }
        
        const { db } = await import('./firebase-config.js');
        const { doc, updateDoc, setDoc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const profileRef = doc(db, 'profiles', userId);
        
        // Get rank title (remove emoji for storage)
        const rankTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
        
        // Check if profile exists
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            // Update existing profile
            await updateDoc(profileRef, {
                level: rank.currentLevel.level,
                totalVotes: voteCount,
                rank: rankTitle,
                xp: totalXP,
                lastSynced: Date.now()
            });
            
            console.log('✅ Profile synced:', {
                level: rank.currentLevel.level,
                votes: voteCount,
                rank: rankTitle,
                xp: totalXP
            });
        } else {
            // Create profile if doesn't exist
            const username = localStorage.getItem('username') || localStorage.getItem('tournamentUsername') || 'Anonymous';
            const avatarJson = localStorage.getItem('avatar');
            let avatar = { type: 'emoji', value: '🎵' };
            
            try {
                avatar = JSON.parse(avatarJson) || avatar;
            } catch {}
            
            await setDoc(profileRef, {
                username: username,
                avatar: avatar,
                level: rank.currentLevel.level,
                totalVotes: voteCount,
                rank: rankTitle,
                xp: totalXP,
                createdAt: Date.now(),
                lastSynced: Date.now()
            });
            
            console.log('✅ Profile created and synced');
        }
        
    } catch (error) {
        console.error('❌ Error syncing profile stats:', error);
        // Non-blocking - don't fail the calling function
    }
}