// ========================================
// ACHIEVEMENT TRACKER - Checking & Unlocking
// ========================================

import { 
    ACHIEVEMENTS, 
    ACHIEVEMENT_CATEGORIES,
    getRarityColor,
    getRarityGlow,
    getAchievementById  // ✅ Use the exported function
} from './achievements.js';
import { addXP } from './rank-system.js';

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
export async function calculateAchievementStats(allVotes) {

    // ✅ Track votes in current session
    const sessionStart = parseInt(sessionStorage.getItem('sessionStart') || Date.now());
    const votesThisSession = allVotes.filter(v => v.timestamp >= sessionStart);

    // Check founding member status from Firebase
    const isFoundingMember = await checkFoundingMemberStatus();
  
    const stats = {
        totalVotes: allVotes.length,
        underdogVotes: allVotes.filter(v => v.voteType === 'underdog').length,
        closeMatchVotes: allVotes.filter(v => v.voteType === 'closeCall').length,
        earlyVotes: 0,
        votingStreak: parseInt(localStorage.getItem('votingStreak') || '0'),
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
        comebackVotes: 0,
        isFoundingMember: isFoundingMember,
        votesInSession: votesThisSession.length,
        
    };
  
    // ADD THESE 3 LINES HERE
    stats.wonMatches  = allVotes.filter(v => v.outcome === 'won').length;
    stats.lostMatches = allVotes.filter(v => v.outcome === 'lost').length;
    stats.tiedMatches = allVotes.filter(v => v.outcome === 'tied').length;
  

  
    // Calculate early votes (match had <10 votes when user voted)
    stats.earlyVotes = allVotes.filter(v => {
        const match = v.match;
        if (!match) return false;
        const totalAtTimeOfVote = (match.song1?.votes || 0) + (match.song2?.votes || 0);
        return totalAtTimeOfVote <= 10;
    }).length;
  
    // Calculate late night votes (midnight to 5am)
    stats.lateNightVotes = allVotes.filter(v => {
        const hour = new Date(v.timestamp).getHours();
        return hour >= 0 && hour < 5;
    }).length;
  
    // Calculate comeback votes (voted for song that was losing <40%)
    stats.comebackVotes = allVotes.filter(v => {
        return v.votedSongPercentage < 40;
    }).length;
  
    // Calculate max votes for a single song
    const songVoteCounts = {};
    allVotes.forEach(v => {
        const songId = v.votedForSeed || v.votedForName;
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
export async function checkAchievements(allVotes, context = {}) {
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
      
                showAchievementUnlock(achievement);
            } else {
                console.log(`⏭️ Skipping duplicate achievement: ${achievement.name}`);
            }
        }
    }
  
    return {
        unlocked,
        locked,
        newlyUnlocked,
        totalXPFromAchievements: unlocked.reduce((sum, a) => sum + a.xp, 0),
        completionPercentage: Math.round((unlocked.length / Object.keys(ACHIEVEMENTS).length) * 100)
    };
}

/**
 * Show achievement unlock notification using champion pack
 */
export function showAchievementUnlock(achievement) {
    // ✅ NEW: Use League item icon
    const achievementIcon = achievement.icon || 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3041.png';
    
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
            message: championMessage?.message || `🏆 Achievement Unlocked: ${achievement.name}`,
            detail: championMessage?.detail || `${achievement.description} • +${achievement.xp} XP • ${achievement.rarity}`,
            cta: championMessage?.cta || 'View Achievements',
            action: 'navigate',
            targetUrl: '/my-votes.html#achievements',
                        rarity: achievement.rarity, // ✅ NEW: Pass rarity for styling

            // ✅ NEW: Add rarity styling
            customStyle: {
                borderColor: getRarityColor(achievement.rarity),
                boxShadow: getRarityGlow(achievement.rarity)
            }
        });
    }
    
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