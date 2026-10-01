// ========================================
// ACHIEVEMENT SYSTEM - LEAGUE MUSIC TOURNAMENT
// Music-focused achievements with League inspiration
// ========================================

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
 */
export async function getUnlockedAchievementsFromFirebase() {
    const { db } = await import('./firebase-config.js');
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    const userId = localStorage.getItem('tournamentUserId');
    if (!userId) return [];
    
    try {
        const profileRef = doc(db, 'profiles', userId);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            const profile = profileDoc.data();
            const unlockedAchievements = profile.unlockedAchievements || [];
            
            // Sync to localStorage as cache
            localStorage.setItem('unlockedAchievements', JSON.stringify(unlockedAchievements));
            
            return unlockedAchievements;
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Error fetching achievements from Firebase:', error);
        // Fallback to localStorage
        return JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
    }
}

// ========================================
// ACHIEVEMENT SYSTEM - LEAGUE MUSIC TOURNAMENT
// Music-focused achievements with League item icons
// ========================================

export const ACHIEVEMENTS = {

  // ========================================
  // MILESTONES
  // ========================================

  'first-choice': {
    id: 'first-choice',
    name: 'First Choice',
    description: 'Cast your first vote',
    icon: '✨',
    xp: 25,
    category: 'milestones',
    hidden: false,
    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => stats.totalVotes >= 1,
    progress: (stats) => ({ current: stats.totalVotes, target: 1 })
  },

  'getting-started': {
    id: 'getting-started',
    name: 'Getting Started',
    description: 'Cast 5 votes',
    icon: '🗳️',
    xp: 50,
    category: 'milestones',
    hidden: true,
    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => stats.totalVotes >= 5,
    progress: (stats) => ({ current: stats.totalVotes, target: 5 })
  },

  'arcane-regular': {
    id: 'arcane-regular',
    name: 'Arcane Regular',
    description: 'Cast 10 votes',
    icon: '🔮',
    xp: 75,
    category: 'milestones',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.totalVotes >= 10,
    progress: (stats) => ({ current: stats.totalVotes, target: 10 })
  },

  'crowd-voice': {
    id: 'crowd-voice',
    name: 'Crowd Voice',
    description: 'Cast 25 votes',
    icon: '📣',
    xp: 150,
    category: 'milestones',
    hidden: true,
    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.totalVotes >= 25,
    progress: (stats) => ({ current: stats.totalVotes, target: 25 })
  },

  'deep-in-the-story': {
    id: 'deep-in-the-story',
    name: 'Deep in the Story',
    description: 'Cast 50 votes',
    icon: '📖',
    xp: 250,
    category: 'milestones',
    hidden: true,
    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.totalVotes >= 50,
    progress: (stats) => ({ current: stats.totalVotes, target: 50 })
  },

  'arcane-legend': {
    id: 'arcane-legend',
    name: 'Arcane Legend',
    description: 'Cast 100 votes',
    icon: '🌌',
    xp: 500,
    category: 'milestones',
    hidden: true,
    tier: 'legendary',
    rarity: 'epic',
    condition: (stats) => stats.totalVotes >= 100,
    progress: (stats) => ({ current: stats.totalVotes, target: 100 })
  },

  // ========================================
  // STREAKS
  // ========================================

  'spark': {
    id: 'spark',
    name: 'Spark',
    description: 'Vote on 3 consecutive days',
    icon: '🔥',
    xp: 50,
    category: 'streaks',
    hidden: true,
    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => stats.votingStreak >= 3,
    progress: (stats) => ({ current: stats.votingStreak, target: 3 })
  },

  'on-a-roll': {
    id: 'on-a-roll',
    name: 'On a Roll',
    description: 'Vote on 7 consecutive days',
    icon: '⚡',
    xp: 125,
    category: 'streaks',
    hidden: true,
    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.votingStreak >= 7,
    progress: (stats) => ({ current: stats.votingStreak, target: 7 })
  },

  'unstoppable': {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Vote on 14 consecutive days',
    icon: '💥',
    xp: 250,
    category: 'streaks',
    hidden: true,
    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.votingStreak >= 14,
    progress: (stats) => ({ current: stats.votingStreak, target: 14 })
  },

  'arcane-dedication': {
    id: 'arcane-dedication',
    name: 'Arcane Dedication',
    description: 'Vote on 30 consecutive days',
    icon: '👑',
    xp: 500,
    category: 'streaks',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.votingStreak >= 30,
    progress: (stats) => ({ current: stats.votingStreak, target: 30 })
  },

  // ========================================
  // UNDERDOG
  // ========================================

  'against-the-grain': {
    id: 'against-the-grain',
    name: 'Against the Grain',
    description: 'Vote for 5 underdogs',
    icon: '🃏',
    xp: 75,
    category: 'underdog',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.underdogVotes >= 5,
    progress: (stats) => ({ current: stats.underdogVotes, target: 5 })
  },

  'rebel-heart': {
    id: 'rebel-heart',
    name: 'Rebel Heart',
    description: 'Vote for 15 underdogs',
    icon: '❤️‍🔥',
    xp: 175,
    category: 'underdog',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.underdogVotes >= 15,
    progress: (stats) => ({ current: stats.underdogVotes, target: 15 })
  },

  'dark-horse': {
    id: 'dark-horse',
    name: 'Dark Horse',
    description: 'Vote for 30 underdogs',
    icon: '🐴',
    xp: 350,
    category: 'underdog',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.underdogVotes >= 30,
    progress: (stats) => ({ current: stats.underdogVotes, target: 30 })
  },

  // ========================================
  // EARLY VOTER
  // ========================================

  'first-on-the-scene': {
    id: 'first-on-the-scene',
    name: 'First on the Scene',
    description: 'Be among the first 10 voters in 5 matches',
    icon: '👀',
    xp: 100,
    category: 'early',
    hidden: true,
    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.earlyVotes >= 5,
    progress: (stats) => ({ current: stats.earlyVotes, target: 5 })
  },

  'ahead-of-the-curve': {
    id: 'ahead-of-the-curve',
    name: 'Ahead of the Curve',
    description: 'Be among the first 10 voters in 15 matches',
    icon: '🚀',
    xp: 250,
    category: 'early',
    hidden: true,
    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.earlyVotes >= 15,
    progress: (stats) => ({ current: stats.earlyVotes, target: 15 })
  },

  // ========================================
  // CLOSE MATCHES
  // ========================================

  'nail-biter': {
    id: 'nail-biter',
    name: 'Nail-Biter',
    description: 'Vote in 10 close matches',
    icon: '⚖️',
    xp: 125,
    category: 'clutch',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.closeMatchVotes >= 10,
    progress: (stats) => ({ current: stats.closeMatchVotes, target: 10 })
  },

  'deciding-voice': {
    id: 'deciding-voice',
    name: 'Deciding Voice',
    description: 'Vote in 25 close matches',
    icon: '🎯',
    xp: 300,
    category: 'clutch',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.closeMatchVotes >= 25,
    progress: (stats) => ({ current: stats.closeMatchVotes, target: 25 })
  },

  'comeback-believer': {
    id: 'comeback-believer',
    name: 'Comeback Believer',
    description: 'Vote for 5 moments that were behind when you chose them',
    icon: '🔄',
    xp: 150,
    category: 'clutch',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.comebackVotes >= 5,
    progress: (stats) => ({ current: stats.comebackVotes, target: 5 })
  },

  // ========================================
  // MOMENT LOYALTY
  // ========================================

  'repeat-favourite': {
    id: 'repeat-favourite',
    name: 'Repeat Favourite',
    description: 'Vote for the same moment 3 times',
    icon: '💜',
    xp: 100,
    category: 'loyalty',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.maxSongVotes >= 3,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 3 })
  },

  'die-hard': {
    id: 'die-hard',
    name: 'Die-Hard Fan',
    description: 'Vote for the same moment 5 times',
    icon: '💗',
    xp: 200,
    category: 'loyalty',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.maxSongVotes >= 5,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 5 })
  },

  'obsession': {
    id: 'obsession',
    name: 'Obsession',
    description: 'Vote for the same moment 10 times',
    icon: '💥',
    xp: 400,
    category: 'loyalty',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.maxSongVotes >= 10,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 10 })
  },

  // ========================================
  // ARCANE JOURNEY
  // ========================================

  'two-round-journey': {
    id: 'two-round-journey',
    name: 'Keep Watching',
    description: 'Vote in 2 different tournament rounds',
    icon: '🛤️',
    xp: 75,
    category: 'journey',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.roundsParticipated >= 2,
    progress: (stats) => ({ current: stats.roundsParticipated, target: 2 })
  },

  'deep-into-the-bracket': {
    id: 'deep-into-the-bracket',
    name: 'Deep into the Bracket',
    description: 'Vote in 4 different tournament rounds',
    icon: '🌀',
    xp: 200,
    category: 'journey',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.roundsParticipated >= 4,
    progress: (stats) => ({ current: stats.roundsParticipated, target: 4 })
  },

  'all-the-way': {
    id: 'all-the-way',
    name: 'All the Way',
    description: 'Vote in 6 different tournament rounds',
    icon: '🏆',
    xp: 400,
    category: 'journey',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.roundsParticipated >= 6,
    progress: (stats) => ({ current: stats.roundsParticipated, target: 6 })
  },

  // ========================================
  // EXPLORER / PARTICIPATION
  // ========================================

  'match-explorer': {
    id: 'match-explorer',
    name: 'Match Explorer',
    description: 'Vote in 10 unique matches',
    icon: '🗺️',
    xp: 100,
    category: 'completionist',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.uniqueMatches >= 10,
    progress: (stats) => ({ current: stats.uniqueMatches, target: 10 })
  },

  'every-corner': {
    id: 'every-corner',
    name: 'Every Corner',
    description: 'Vote in 25 unique matches',
    icon: '🧭',
    xp: 200,
    category: 'completionist',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.uniqueMatches >= 25,
    progress: (stats) => ({ current: stats.uniqueMatches, target: 25 })
  },

  'bracket-veteran': {
    id: 'bracket-veteran',
    name: 'Bracket Veteran',
    description: 'Vote in 50 unique matches',
    icon: '🏅',
    xp: 400,
    category: 'completionist',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.uniqueMatches >= 50,
    progress: (stats) => ({ current: stats.uniqueMatches, target: 50 })
  },

  // ========================================
  // SESSION / SPECIAL
  // ========================================

  'long-session': {
    id: 'long-session',
    name: 'Long Session',
    description: 'Vote in 5 matches during one session',
    icon: '🔥',
    xp: 100,
    category: 'special',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.votesInSession >= 5,
    progress: (stats) => ({ current: stats.votesInSession, target: 5 })
  },

  'deep-dive': {
    id: 'deep-dive',
    name: 'Deep Dive',
    description: 'Vote in 10 matches during one session',
    icon: '🌊',
    xp: 250,
    category: 'special',
    hidden: true,
    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.votesInSession >= 10,
    progress: (stats) => ({ current: stats.votesInSession, target: 10 })
  },

  'night-owl': {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Cast a vote between midnight and 5am',
    icon: '🌙',
    xp: 75,
    category: 'special',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.lateNightVotes >= 1,
    progress: (stats) => ({ current: stats.lateNightVotes, target: 1 })
  },

  // ========================================
  // SOCIAL
  // ========================================

  'signal-boost': {
    id: 'signal-boost',
    name: 'Signal Boost',
    description: 'Share 5 matches or moments',
    icon: '📡',
    xp: 100,
    category: 'social',
    hidden: true,
    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.sharesCount >= 5,
    progress: (stats) => ({ current: stats.sharesCount, target: 5 })
  },

  'spreading-the-word': {
    id: 'spreading-the-word',
    name: 'Spreading the Word',
    description: 'Share 15 matches or moments',
    icon: '📣',
    xp: 250,
    category: 'social',
    hidden: true,
    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.sharesCount >= 15,
    progress: (stats) => ({ current: stats.sharesCount, target: 15 })
  }
};

// ========================================
// ACHIEVEMENT CATEGORIES
// ========================================

export const ACHIEVEMENT_CATEGORIES = {
  milestones: {
    name: 'Milestones',
    icon: '<i class="fa-solid fa-bullseye"></i>',
    color: '#4a9eff',
    description: 'Your Arcane Moments voting milestones'
  },

  streaks: {
    name: 'Streaks',
    icon: '<i class="fa-solid fa-fire"></i>',
    color: '#ff4444',
    description: 'Keep coming back day after day'
  },

  underdog: {
    name: 'Underdog',
    icon: '<i class="fa-solid fa-masks-theater"></i>',
    color: '#c84aff',
    description: 'Back the moments that are behind'
  },

  early: {
    name: 'Early Voter',
    icon: '<i class="fa-solid fa-bolt"></i>',
    color: '#00c896',
    description: 'Be there when a match begins'
  },

  clutch: {
    name: 'Close Calls',
    icon: '<i class="fa-solid fa-scale-balanced"></i>',
    color: '#ffaa00',
    description: 'Make your voice count when matches are tight'
  },

  loyalty: {
    name: 'Favourites',
    icon: '<i class="fa-solid fa-heart"></i>',
    color: '#ff69b4',
    description: 'Keep backing the moments you love'
  },

  journey: {
    name: 'Journey',
    icon: '<i class="fa-solid fa-road"></i>',
    color: '#c8aa6e',
    description: 'Follow the tournament through its rounds'
  },

  completionist: {
    name: 'Explorer',
    icon: '<i class="fa-solid fa-compass"></i>',
    color: '#4aff4a',
    description: 'Explore more of the tournament'
  },

  special: {
    name: 'Special',
    icon: '<i class="fa-solid fa-star"></i>',
    color: '#ffd700',
    description: 'Unusual and memorable accomplishments'
  },

  social: {
    name: 'Social',
    icon: '<i class="fa-solid fa-share-nodes"></i>',
    color: '#ff69b4',
    description: 'Help spread Arcane Moments'
  }
};

// ========================================
// RARITY SYSTEM  ← ADD THIS NEW SECTION HERE
// ========================================

export const RARITY_INFO = {
  common: {
    color: '#A0A0A0',
    name: 'Common',
    glow: '0 0 10px rgba(160, 160, 160, 0.3)',
    gradient: 'linear-gradient(135deg, #808080, #A0A0A0)'
  },
  uncommon: {
    color: '#1EFF0C',
    name: 'Uncommon',
    glow: '0 0 15px rgba(30, 255, 12, 0.4)',
    gradient: 'linear-gradient(135deg, #0FC800, #1EFF0C)'
  },
  rare: {
    color: '#0070DD',
    name: 'Rare',
    glow: '0 0 20px rgba(0, 112, 221, 0.5)',
    gradient: 'linear-gradient(135deg, #0058B0, #0070DD)'
  },
  epic: {
    color: '#A335EE',
    name: 'Epic',
    glow: '0 0 25px rgba(163, 53, 238, 0.6)',
    gradient: 'linear-gradient(135deg, #8B2DB8, #A335EE)'
  },
  legendary: {
    color: '#FF8000',
    name: 'Legendary',
    glow: '0 0 30px rgba(255, 128, 0, 0.7)',
    gradient: 'linear-gradient(135deg, #E67300, #FF8000)'
  },
  mythic: {
    color: '#E74C3C',
    name: 'Mythic',
    glow: '0 0 35px rgba(231, 76, 60, 0.8)',
    gradient: 'linear-gradient(135deg, #C0392B, #E74C3C)'
  }
};


// ========================================
// HELPER FUNCTIONS (UPDATED)
// ========================================

// ✅ KEEP: Your original function (it groups by category)
export function getAchievementsByCategory(category) {
  if (category) {
    // If category provided, return only that category
    return Object.values(ACHIEVEMENTS).filter(a => a.category === category);
  }
  
  // If no category, return all grouped
  const grouped = {};
  Object.values(ACHIEVEMENTS).forEach(achievement => {
    const cat = achievement.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(achievement);
  });
  return grouped;
}

// ✅ KEEP: Your original function name (compatibility)
export function getAchievementById(id) {
  return ACHIEVEMENTS[id] || null;
}

// ✅ KEEP: Your original function (useful)
export function getAllAchievements() {
  return Object.values(ACHIEVEMENTS);
}

// ✅ KEEP: Your original function (useful for UI)
export function getVisibleAchievements() {
  return Object.values(ACHIEVEMENTS).filter(a => !a.hidden);
}

// ========================================
// NEW HELPER FUNCTIONS (ADD THESE)
// ========================================

/**
 * Get achievement rarity color
 */
export function getRarityColor(rarity) {
  return RARITY_INFO[rarity]?.color || RARITY_INFO.common.color;
}

/**
 * Get achievement rarity glow effect
 */
export function getRarityGlow(rarity) {
  return RARITY_INFO[rarity]?.glow || RARITY_INFO.common.glow;
}

/**
 * Get achievement rarity gradient
 */
export function getRarityGradient(rarity) {
  return RARITY_INFO[rarity]?.gradient || RARITY_INFO.common.gradient;
}

/**
 * Get all unlocked achievements for current user
 */
export function getUnlockedAchievements() {
  return JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
}

/**
 * Get total XP from all unlocked achievements
 */
export function getTotalAchievementXP() {
  const unlocked = getUnlockedAchievements();
  return unlocked.reduce((total, achievementId) => {
    const achievement = ACHIEVEMENTS[achievementId];
    return total + (achievement?.xp || 0);
  }, 0);
}

/**
 * Get achievement completion percentage
 */
export function getAchievementCompletion() {
  const unlocked = getUnlockedAchievements();
  const total = Object.keys(ACHIEVEMENTS).length;
  return {
    unlocked: unlocked.length,
    total: total,
    percentage: Math.round((unlocked.length / total) * 100)
  };
}

/**
 * Get achievements by rarity
 */
export function getAchievementsByRarity(rarity) {
  return Object.values(ACHIEVEMENTS).filter(a => a.rarity === rarity);
}

/**
 * Get recently unlocked achievements (last 7 days)
 */
export function getRecentlyUnlockedAchievements() {
  const achievementTimestamps = JSON.parse(localStorage.getItem('achievementTimestamps') || '{}');
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  return Object.entries(achievementTimestamps)
    .filter(([_, timestamp]) => timestamp > sevenDaysAgo)
    .map(([id, timestamp]) => ({
      ...ACHIEVEMENTS[id],
      unlockedAt: timestamp
    }))
    .sort((a, b) => b.unlockedAt - a.unlockedAt);
}

/**
 * Calculate achievement score (weighted by rarity)
 */
export function calculateAchievementScore() {
  const unlocked = getUnlockedAchievements();
  const rarityWeights = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 5,
    legendary: 10,
    mythic: 20
  };
  
  return unlocked.reduce((score, achievementId) => {
    const achievement = ACHIEVEMENTS[achievementId];
    const weight = rarityWeights[achievement?.rarity] || 1;
    return score + weight;
  }, 0);
}

/**
 * Get next milestone achievement
 */
export function getNextMilestone() {
  const milestones = getAchievementsByCategory('milestones');
  const unlocked = getUnlockedAchievements();
  
  return milestones.find(achievement => 
    !unlocked.includes(achievement.id)
  ) || null;
}

/**
 * Get rarest unlocked achievement
 */
export function getRarestAchievement() {
  const unlocked = getUnlockedAchievements();
  const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
  
  for (const rarity of rarityOrder) {
    const achievement = unlocked.find(id => ACHIEVEMENTS[id]?.rarity === rarity);
    if (achievement) return ACHIEVEMENTS[achievement];
  }
  
  return null;
}

/**
 * Check if user has any achievements in a category
 */
export function hasAchievementsInCategory(category) {
  const unlocked = getUnlockedAchievements();
  return Object.values(ACHIEVEMENTS)
    .filter(a => a.category === category)
    .some(a => unlocked.includes(a.id));
}

/**
 * Get achievement display name with rarity emojis
 */
export function getAchievementDisplayName(achievementId) {
  const achievement = ACHIEVEMENTS[achievementId];
  if (!achievement) return '';
  
  const rarityEmoji = {
    common: '',
    uncommon: '✦',
    rare: '✦✦',
    epic: '✦✦✦',
    legendary: '⭐',
    mythic: '🔥'
  };
  
  return `${achievement.name} ${rarityEmoji[achievement.rarity] || ''}`;
}