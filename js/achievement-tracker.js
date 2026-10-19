// ========================================
// ACHIEVEMENT TRACKER - Checking & Unlocking
// ========================================

import { 
    ACHIEVEMENTS, 
    achievementCompletion,
    ACHIEVEMENT_CATEGORIES,
    getRarityColor,
    getRarityGlow,
    getAchievementById  // ✅ Use the exported function
} from './achievements.js';
import { addXP } from './rank-system.js';
import { streakFromVotes } from './xp-ledger.js';
import { factsOf, backedWinner } from './vote-facts.js';
import { recordProgress } from './vote-progress.js';
import { ddragonUrl } from './arcane-config.js';

// ========================================
// FIREBASE ACHIEVEMENT STORAGE
// ========================================

/**
 * Save unlocked achievement to Firebase profile
 */
export async function unlockAchievementInFirebase(achievementId, xpReward = 0) {
    const { db } = await import('./firebase-config.js');
    const { doc, setDoc, getDoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId) {
        console.warn('⚠️ No user ID - cannot save achievement');
        return false;
    }
    
    try {
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        const now = new Date().toISOString();
        
        if (profileDoc.exists()) {
            const profile = profileDoc.data();
            
            // Check if already unlocked
            if (profile.unlockedAchievements?.includes(achievementId)) {
                console.log('ℹ️ Achievement already unlocked:', achievementId);
                return false;
            }
            
            // Add to unlocked list
            await setDoc(profileRef, {
                unlockedAchievements: arrayUnion(achievementId),
                [`achievementDetails.${achievementId}`]: {
                    unlockedAt: now,
                    xpReward: xpReward
                },
                lastAchievementUnlock: now
            }, { merge: true });
            
            console.log('✅ Achievement unlocked in Firebase:', achievementId);
            
            // ✅ NEW: Also save timestamp to localStorage for recent tracking
            const timestamps = JSON.parse(localStorage.getItem('achievementTimestamps') || '{}');
            timestamps[achievementId] = Date.now();
            localStorage.setItem('achievementTimestamps', JSON.stringify(timestamps));
            
            // Also save to localStorage as cache
            const localAchievements = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
            if (!localAchievements.includes(achievementId)) {
                localAchievements.push(achievementId);
                localStorage.setItem('unlockedAchievements', JSON.stringify(localAchievements));
            }
            
            return true;
            
        } else {
            // Create new profile with first achievement
            await setDoc(profileRef, {
                userId: userId,
                unlockedAchievements: [achievementId],
                [`achievementDetails.${achievementId}`]: {
                    unlockedAt: now,
                    xpReward: xpReward
                },
                createdAt: now,
                lastAchievementUnlock: now
            });
            
            console.log('✅ Profile created with first achievement:', achievementId);
            
            // ✅ NEW: Save timestamp
            localStorage.setItem('achievementTimestamps', JSON.stringify({ [achievementId]: Date.now() }));
            
            // Save to localStorage
            localStorage.setItem('unlockedAchievements', JSON.stringify([achievementId]));
            
            return true;
        }
        
    } catch (error) {
        console.error('❌ Error unlocking achievement in Firebase:', error);
        return false;
    }
}

/**
 * Get all unlocked achievements from Firebase
 * @param {string} userId - Optional userId, defaults to current user
 */
export async function getUnlockedAchievementsFromFirebase(userId = null) {
    const { db } = await import('./firebase-config.js');
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    // ✅ Use provided userId or fall back to localStorage
    const targetUserId = userId || localStorage.getItem('tournamentUserId');
    
    if (!targetUserId) {
        console.warn('⚠️ No userId provided for achievements');
        return [];
    }
    
    try {
        const profileRef = doc(db, 'profiles', targetUserId);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            const profile = profileDoc.data();
            const unlockedAchievements = profile.unlockedAchievements || [];
            
            console.log(`✅ Loaded ${unlockedAchievements.length} achievements for user:`, targetUserId);
            
            // ✅ Only sync to localStorage if it's the current user
            if (!userId || userId === localStorage.getItem('tournamentUserId')) {
                localStorage.setItem('unlockedAchievements', JSON.stringify(unlockedAchievements));
                
                // ✅ NEW: Sync timestamps if available
                if (profile.achievementDetails) {
                    const timestamps = {};
                    Object.entries(profile.achievementDetails).forEach(([id, details]) => {
                        if (details.unlockedAt) {
                            timestamps[id] = new Date(details.unlockedAt).getTime();
                        }
                    });
                    localStorage.setItem('achievementTimestamps', JSON.stringify(timestamps));
                }
            }
            
            return unlockedAchievements;
        }
        
        console.warn('⚠️ Profile document does not exist for:', targetUserId);
        return [];
        
    } catch (error) {
        console.error('❌ Error fetching achievements from Firebase:', error);
        
        // ✅ Only fallback to localStorage for current user
        if (!userId || userId === localStorage.getItem('tournamentUserId')) {
            return JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
        }
        
        return [];
    }
}

/**
 * Check if user is a founding member (from Firebase profile)
 */
export async function checkFoundingMemberStatus() {
    const { db } = await import('./firebase-config.js');
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId) return false;
    
    try {
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            const profile = profileDoc.data();
            return profile.foundingMember === true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error checking founding member status:', error);
        // Fallback to localStorage
        return localStorage.getItem('foundingMember') === 'true';
    }
}

// ========================================
// ACHIEVEMENT CALCULATION
// ========================================

/**
 * Calculate stats needed for achievement checking
 * @param {Array} allVotes - User's complete vote history
 * @returns {Object} - Stats object
 */
// Champion-specific stats count the votes cast while that companion was active (older votes without one count as Jinx, like
// the Champions tab does). Account-wide ones (underdogs, ties) count every vote. "Tied" = the match was exactly tied
// (10+ votes) when the vote was cast.
export function championStats(allVotes) {
    const out = {};
    for (const v of allVotes) {
        const id = v.championId || 'jinx';
        (out[id] ||= []).push(v);
    }
    return Object.fromEntries(Object.entries(out).map(([id, votes]) => [id, {
        votes: votes.length,
        underdogVotes: votes.filter(v => factsOf(v).underdog).length,
        closeVotes: votes.filter(v => factsOf(v).close).length,
        againstTideVotes: votes.filter(v => factsOf(v).againstTide).length,
        backedWinners: votes.filter(backedWinner).length,
        underdogDays: new Set(votes.filter(v => factsOf(v).underdog).map(v => new Date(v.timestamp).toISOString().slice(0, 10))).size,
        earlyVotes: votes.filter(v => factsOf(v).early).length,
        decidingVotes: votes.filter(v => factsOf(v).tiedBefore).length,
        streak: streakFromVotes(votes)
    }]));
}

export function companionStats(allVotes) {
    const by = id => allVotes.filter(v => (v.championId || 'jinx') === id);
    return {
        caitlynCloseVotes: by('caitlyn').filter(v => factsOf(v).close).length,
        caitlynStreak: streakFromVotes(by('caitlyn')),
        decidingVotes: allVotes.filter(v => factsOf(v).tiedBefore).length
    };
}

export async function calculateAchievementStats(allVotes) {
    // Founding member status comes from Firebase; everything else is worked out from the votes (computeVoteStats)
    const isFoundingMember = await checkFoundingMemberStatus();
    return computeVoteStats(allVotes, { isFoundingMember });
}

// Pure (no Firebase): every number the achievements read, from the vote history.
export function computeVoteStats(allVotes, { isFoundingMember = false } = {}) {

    // ✅ Track votes in current session
    let sessionStart = parseInt(sessionStorage.getItem('sessionStart'));
    if (!Number.isFinite(sessionStart)) { sessionStart = Date.now(); try { sessionStorage.setItem('sessionStart', String(sessionStart)); } catch (e) {} }
    const votesThisSession = allVotes.filter(v => v.timestamp >= sessionStart);

    const stats = {
        totalVotes: allVotes.length,
        // All of these read what was true when the vote was cast (see vote-facts.js), not how the match stands now
        underdogVotes: allVotes.filter(v => factsOf(v).underdog).length,
        closeMatchVotes: allVotes.filter(v => factsOf(v).close).length,
        earlyVotes: allVotes.filter(v => factsOf(v).early).length,
        votingStreak: streakFromVotes(allVotes),           // from the vote days themselves (the saved counter was reset by every vote)
        furthestRound: Math.max(...allVotes.map(v => v.round), 0),
        roundsParticipated: new Set(allVotes.map(v => v.round)).size,
        uniqueMatches: new Set(allVotes.map(v => v.matchId)).size,
        lateNightVotes: 0,
        instantVotes: 0,
        prophesied: false,
        maxSongVotes: 0,
        sharesCount: parseInt(localStorage.getItem('sharesCount') || '0'),
        uniqueArtists: 0,
        uniqueYears: 0,
        comebackVotes: allVotes.filter(v => factsOf(v).againstTide).length,   // "Against the Tide": backed the edit that was behind 60-40
        isFoundingMember: isFoundingMember,
        votesInSession: votesThisSession.length,
        byChampion: championStats(allVotes),   // per-champion numbers for champion achievements (js/champion-achievements)
        ...companionStats(allVotes)
    };
  
  

  
    // Calculate late night votes (midnight to 5am)
    stats.lateNightVotes = allVotes.filter(v => {
        const hour = new Date(v.timestamp).getHours();
        return hour >= 0 && hour < 5;
    }).length;
  
    // Calculate max votes for a single song
    const songVoteCounts = {};
    allVotes.forEach(v => {
        // The edit itself: its video id, else its name. A seed alone is only a rank inside one cup, so two different edits
        // (seed 5 in two cups) must not count as one.
        const songId = v.votedForVideoId || v.votedForName || (v.votedForSeed != null ? `seed:${v.votedForSeed}` : null);
        if (songId) {
            songVoteCounts[songId] = (songVoteCounts[songId] || 0) + 1;
        }
    });
    stats.maxSongVotes = Math.max(...Object.values(songVoteCounts), 0);
  
    // Calculate unique artists
    const uniqueArtists = new Set();
    allVotes.forEach(v => {
        if (v.votedForArtist) {
            uniqueArtists.add(v.votedForArtist);
        }
    });
    stats.uniqueArtists = uniqueArtists.size;
  
    // Calculate unique years
    const uniqueYears = new Set();
    allVotes.forEach(v => {
        const match = v.match;
        if (match) {
            const votedSong = v.choice === 'song1' ? match.song1 : match.song2;
            if (votedSong && votedSong.year) {
                uniqueYears.add(votedSong.year);
            }
        }
    });
    stats.uniqueYears = uniqueYears.size;
  
    return stats;
}

/**
 * Check which achievements user has unlocked (Firebase-based)
 * @param {Array} allVotes - User's vote history
 * @param {Object} context - Context for when this is being called (e.g., { afterVote: true })
 * @returns {Object} - Achievement status
 */
let _awardChain = Promise.resolve();
export function checkAchievements(allVotes, context = {}) {
    // One check at a time: two overlapping checks (vote + share) would each see the same achievement as new and toast it twice.
    const run = _awardChain.then(() => _checkAchievements(allVotes, context));
    _awardChain = run.catch(() => {});
    return run;
}

async function _checkAchievements(allVotes, context = {}) {
    const stats = await calculateAchievementStats(allVotes);
    const unlocked = [];
    const locked = [];
    const newlyUnlocked = [];
  
    // ✅ NEW: Achievements that should ONLY be checked immediately after voting
    const voteOnlyAchievements = [
        'daily-session-kickoff',      // First vote of the day
        'opening-act',                // First vote ever
        'first-blood',                // First vote on site
        'round-first-blood',          // First vote in round
        'tournament-first-blood',     // First tournament vote
        'lightning-fast',             // Voted within 1 min
        'night-owl'                   // Late night vote
    ];
    
    // ✅ Get previously unlocked achievements from Firebase
    const previouslyUnlocked = await getUnlockedAchievementsFromFirebase();
  
    for (const achievement of Object.values(ACHIEVEMENTS)) {
        // ✅ NEW: Skip vote-only achievements if not checking after a vote
        if (voteOnlyAchievements.includes(achievement.id) && !context.afterVote) {
            // But still add to unlocked list if already unlocked!
            if (previouslyUnlocked.includes(achievement.id)) {
                const progress = achievement.progress ? achievement.progress(stats) : null;
                unlocked.push({
                    ...achievement,
                    progress
                });
            }
            continue;
        }
        
        // Check condition (may be async)
        let isUnlocked = false;
        try {
            if (typeof achievement.condition === 'function') {
                isUnlocked = await achievement.condition(stats);
            } else {
                isUnlocked = achievement.condition;
            }
        } catch (error) {
            console.error(`Error checking achievement ${achievement.id}:`, error);
            continue;
        }
    
        const wasUnlocked = previouslyUnlocked.includes(achievement.id);
    
        // Always calculate progress
        const progress = achievement.progress ? achievement.progress(stats) : null;
    
        if (isUnlocked) {
            unlocked.push({
                ...achievement,
                progress
            });
      
            // Track newly unlocked
            if (!wasUnlocked) {
                newlyUnlocked.push(achievement);
            }
        } else if (!achievement.hidden) {
            // Only show locked achievements that aren't hidden
            locked.push({
                ...achievement,
                progress
            });
        }
    }
    
    // ✅ Save newly unlocked achievements to Firebase
    if (newlyUnlocked.length > 0) {
        console.log(`🎉 ${newlyUnlocked.length} new achievements unlocked!`);
  
        for (const achievement of newlyUnlocked) {
            const wasActuallyUnlocked = await unlockAchievementInFirebase(achievement.id, achievement.xp);
    
            if (wasActuallyUnlocked) {
                if (achievement.xp > 0) {
                    addXP(achievement.xp);
                    console.log(`✨ +${achievement.xp} XP from "${achievement.name}"`);
                }
      
                // During a vote the post-vote modal lists the unlock; otherwise it toasts as before
                const captured = recordProgress({
                    type: 'achievement', id: achievement.id, name: achievement.name, icon: achievement.icon,
                    xp: achievement.xp, rarity: achievement.rarity
                });
                if (captured) saveAchievementToBell(achievement); else showAchievementUnlock(achievement);
            } else {
                console.log(`⏭️ Skipping duplicate achievement: ${achievement.name}`);
            }
        }
    }
  
    const completion = achievementCompletion(unlocked.map(a => a.id));
    return {
        unlocked,
        locked,
        newlyUnlocked,
        totalXPFromAchievements: unlocked.reduce((sum, a) => sum + a.xp, 0),
        // general set only: a new champion's achievements must not lower it (see completion for the per-champion numbers)
        completionPercentage: completion.general.percentage,
        completion
    };
}

/**
 * Keep an unlocked achievement in the bell (notification history). Called for every unlock, whether it toasts or is shown in the
 * post-vote modal instead (js/vote-progress.js). Saved as already shown, so it does not pop up a second time.
 */
export function saveAchievementToBell(achievement) {
    // (the toast alone vanished after a few seconds and the Achievements tab stayed empty)
    try {
        const userId = localStorage.getItem('tournamentUserId');
        if (userId) {
            import('./notification-storage.js').then(({ saveNotification }) => saveNotification(userId, {
                type: 'achievement',
                priority: 2,
                message: `Achievement unlocked: ${achievement.name}`,
                detail: `${achievement.description || ''} • +${achievement.xp || 0} XP`.trim(),
                icon: achievement.rarity === 'legendary' || achievement.rarity === 'mythic' ? '⭐' : '🏆',
                eventType: achievement.id,
                ctaText: 'View achievements',
                targetUrl: '/profile.html#achievements',
                shownAsToast: true
            })).catch(() => {});
        }
    } catch (e) { /* the toast already showed; the bell copy is a bonus */ }

}

/**
 * Show achievement unlock notification using champion pack
 */
export function showAchievementUnlock(achievement) {
    // ✅ NEW: Use League item icon
    const achievementIcon = achievement.icon || ddragonUrl('img/item/3041.png');
    
    // ✅ Get champion-voiced message
    const championMessage = window.championLoader?.getAchievementMessage(achievement.id, {
        name: achievement.name,
        description: achievement.description,
        xp: achievement.xp,
        rarity: achievement.rarity
    });
    
    if (window.showBulletin) {
        window.showBulletin({
            priority: 2,
            type: 'achievement',
            matchId: `achievement-${achievement.id}`,
            thumbnailUrl: achievementIcon, // ✅ Use League item icon
            icon: achievement.rarity === 'legendary' || achievement.rarity === 'mythic' ? '⭐' : '🏆',
            achievementName: achievement.name,
            message: championMessage?.message || `🏆 Achievement Unlocked: ${achievement.name}`,
            detail: championMessage?.detail || `${achievement.description} • +${achievement.xp} XP • ${achievement.rarity}`,
            cta: championMessage?.cta || 'View Achievements',
            action: 'navigate',
            targetUrl: '/profile#achievements',
                        rarity: achievement.rarity, // ✅ NEW: Pass rarity for styling

            // ✅ NEW: Add rarity styling
            customStyle: {
                borderColor: getRarityColor(achievement.rarity),
                boxShadow: getRarityGlow(achievement.rarity)
            }
        });
    }
    
    saveAchievementToBell(achievement);

    console.log(`🏆 Achievement unlocked: ${achievement.name} (+${achievement.xp} XP) [${achievement.rarity}]`);
}

/**
 * Get category info
 */
export function getCategoryInfo(categoryId) {
    return ACHIEVEMENT_CATEGORIES[categoryId] || {
        name: 'Other',
        icon: '🎵',
        color: '#999',
        description: 'Miscellaneous achievements'
    };
}

// ✅ NEW: Export for external use
export { getRarityColor, getRarityGlow } from './achievements.js';