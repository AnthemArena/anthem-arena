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

export const ACHIEVEMENTS = {
  
  // ========================================
  // MILESTONE ACHIEVEMENTS (Voting Volume)
  // ========================================
  'opening-act': {
    id: 'opening-act',
    name: 'Opening Act',
    description: 'Cast your first vote',
    icon: '<i class="fa-solid fa-microphone"></i>',
    xp: 25,
    category: 'milestones',
    hidden: true,
    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => stats.totalVotes >= 1,
    progress: (stats) => ({ current: stats.totalVotes, target: 1 })
  },
  
  'encore': {
    id: 'encore',
    name: 'Encore',
    description: 'Cast 5 votes',
    icon: '<i class="fa-solid fa-music"></i>',
    xp: 50,
    category: 'milestones',
    hidden: true,
    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => stats.totalVotes >= 5,
    progress: (stats) => ({ current: stats.totalVotes, target: 5 })
  },
  
  'world-tour': {
    id: 'world-tour',
    name: 'World Tour',
    description: 'Cast 10 votes',
    icon: '<i class="fa-solid fa-earth-americas"></i>',
    xp: 100,
    category: 'milestones',
    hidden: true,
    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.totalVotes >= 10,
    progress: (stats) => ({ current: stats.totalVotes, target: 10 })
  },
  
  'headliner': {
    id: 'headliner',
    name: 'Headliner',
    description: 'Cast 25 votes',
    icon: '<i class="fa-solid fa-star"></i>',
    xp: 150,
    category: 'milestones',
    hidden: true,
    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.totalVotes >= 25,
    progress: (stats) => ({ current: stats.totalVotes, target: 25 })
  },
  
  'pentakill': {
    id: 'pentakill',
    name: 'Pentakill',
    description: 'Cast 50 votes - Rock on like the legendary band!',
    icon: '<i class="fa-solid fa-guitar"></i>',
    xp: 300,
    category: 'milestones',
    hidden: true,
    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.totalVotes >= 50,
    progress: (stats) => ({ current: stats.totalVotes, target: 50 })
  },
  
  'chart-topper': {
    id: 'chart-topper',
    name: 'Chart Topper',
    description: 'Cast 100 votes',
    icon: '<i class="fa-solid fa-chart-line"></i>',
    xp: 500,
    category: 'milestones',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.totalVotes >= 100,
    progress: (stats) => ({ current: stats.totalVotes, target: 100 })
  },

  'hall-of-fame': {
    id: 'hall-of-fame',
    name: 'Hall of Fame',
    description: 'Cast 250 votes - You are a legend!',
    icon: '<i class="fa-solid fa-trophy"></i>',
    xp: 1000,
    category: 'milestones',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.totalVotes >= 250,
    progress: (stats) => ({ current: stats.totalVotes, target: 250 })
  },


  // ========================================
// FOUNDING MEMBER ACHIEVEMENT (SPECIAL)
// ========================================
'founding-member': {
  id: 'founding-member',
  name: 'Founding Member',
  description: 'Voted before the site reached 1,000 total votes',
  icon: '<i class="fa-solid fa-crown"></i>',
  xp: 500,
  category: 'special',
  hidden: false, // ✅ Visible to encourage voting
  tier: 'legendary',
  rarity: 'legendary',
  condition: (stats) => {
    // Check if user voted before 1000-vote milestone
    const foundingMember = localStorage.getItem('foundingMember');
    return foundingMember === 'true';
  }
},

  // ========================================
  // STREAK ACHIEVEMENTS
  // ========================================
  'on-fire': {
    id: 'on-fire',
    name: 'On Fire',
    description: 'Vote 3 days in a row',
    icon: '<i class="fa-solid fa-fire"></i>',
    xp: 75,
    category: 'streaks',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.votingStreak >= 3,
    progress: (stats) => ({ current: stats.votingStreak, target: 3 })
  },
  
  'hot-streak': {
    id: 'hot-streak',
    name: 'Hot Streak',
    description: 'Vote 7 days in a row',
    icon: '<i class="fa-solid fa-fire-flame-curved"></i>',
    xp: 200,
    category: 'streaks',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.votingStreak >= 7,
    progress: (stats) => ({ current: stats.votingStreak, target: 7 })
  },
  
  'unstoppable': {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Vote 14 days in a row',
    icon: '<i class="fa-solid fa-bolt"></i>',
    xp: 400,
    category: 'streaks',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.votingStreak >= 14,
    progress: (stats) => ({ current: stats.votingStreak, target: 14 })
  },
  
  'legendary-streak': {
    id: 'legendary-streak',
    name: 'Legendary',
    description: 'Vote 30 days in a row - Unstoppable dedication!',
    icon: '<i class="fa-solid fa-crown"></i>',
    xp: 1000,
    category: 'streaks',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.votingStreak >= 30,
    progress: (stats) => ({ current: stats.votingStreak, target: 30 })
  },

  // ========================================
  // UNDERDOG ACHIEVEMENTS
  // ========================================
  'underdog-champion': {
    id: 'underdog-champion',
    name: 'Underdog Champion',
    description: 'Vote for 5 underdogs',
    icon: '<i class="fa-solid fa-bullseye"></i>',
    xp: 100,
    category: 'underdog',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.underdogVotes >= 5,
    progress: (stats) => ({ current: stats.underdogVotes, target: 5 })
  },
  
  'dark-horse': {
    id: 'dark-horse',
    name: 'Dark Horse',
    description: 'Vote for 15 underdogs',
    icon: '<i class="fa-solid fa-horse"></i>',
    xp: 250,
    category: 'underdog',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.underdogVotes >= 15,
    progress: (stats) => ({ current: stats.underdogVotes, target: 15 })
  },
  
  'rebel-heart': {
    id: 'rebel-heart',
    name: 'Rebel Heart',
    description: 'Vote for 30 underdogs - You love the unexpected!',
    icon: '<i class="fa-solid fa-heart-crack"></i>',
    xp: 500,
    category: 'underdog',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.underdogVotes >= 30,
    progress: (stats) => ({ current: stats.underdogVotes, target: 30 })
  },

  // ========================================
  // EARLY VOTER ACHIEVEMENTS
  // ========================================
  'early-bird': {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Be among first 10 voters in 5 matches',
    icon: '<i class="fa-solid fa-dove"></i>',
    xp: 150,
    category: 'early',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.earlyVotes >= 5,
    progress: (stats) => ({ current: stats.earlyVotes, target: 5 })
  },
  
  'trendsetter': {
    id: 'trendsetter',
    name: 'Trendsetter',
    description: 'Be among first 10 voters in 15 matches',
icon: '<i class="fa-solid fa-fire"></i>',
    xp: 300,
    category: 'early',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.earlyVotes >= 15,
    progress: (stats) => ({ current: stats.earlyVotes, target: 15 })
  },

  // ========================================
  // CLOSE MATCH ACHIEVEMENTS
  // ========================================
  'nail-biter': {
    id: 'nail-biter',
    name: 'Nail-Biter',
    description: 'Vote in 10 close matches (within 5%)',
    icon: '<i class="fa-solid fa-scale-balanced"></i>',
    xp: 150,
    category: 'clutch',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.closeMatchVotes >= 10,
    progress: (stats) => ({ current: stats.closeMatchVotes, target: 10 })
  },
  
  'deciding-vote': {
    id: 'deciding-vote',
    name: 'Deciding Vote',
    description: 'Vote in 25 close matches',
    icon: '<i class="fa-solid fa-bullseye"></i>',
    xp: 350,
    category: 'clutch',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.closeMatchVotes >= 25,
    progress: (stats) => ({ current: stats.closeMatchVotes, target: 25 })
  },

  // ========================================
  // SONG LOYALTY ACHIEVEMENTS
  // ========================================
  'true-fan': {
    id: 'true-fan',
    name: 'True Fan',
    description: 'Vote for the same song 3 times',
    icon: '<i class="fa-solid fa-heart"></i>',
    xp: 100,
    category: 'loyalty',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.maxSongVotes >= 3,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 3 })
  },
  
  'superfan': {
    id: 'superfan',
    name: 'Superfan',
    description: 'Vote for the same song 5 times',
    icon: '<i class="fa-solid fa-star"></i>',
    xp: 250,
    category: 'loyalty',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.maxSongVotes >= 5,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 5 })
  },
  
  'ultimate-stan': {
    id: 'ultimate-stan',
    name: 'Ultimate Stan',
    description: 'Vote for the same song 10 times - True devotion!',
    icon: '<i class="fa-solid fa-crown"></i>',
    xp: 500,
    category: 'loyalty',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.maxSongVotes >= 10,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 10 })
  },

  // ========================================
  // JOURNEY ACHIEVEMENTS
  // ========================================
  'quarter-final-supporter': {
    id: 'quarter-final-supporter',
    name: 'Quarter-Final Supporter',
    description: 'Support a song to the Quarterfinals',
    icon: '<i class="fa-solid fa-medal"></i>',
    xp: 200,
    category: 'journey',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.furthestRound >= 4,
    progress: (stats) => ({ current: stats.furthestRound, target: 4 })
  },
  
  'semi-final-believer': {
    id: 'semi-final-believer',
    name: 'Semi-Final Believer',
    description: 'Support a song to the Semifinals',
    icon: '<i class="fa-solid fa-award"></i>',
    xp: 400,
    category: 'journey',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.furthestRound >= 5,
    progress: (stats) => ({ current: stats.furthestRound, target: 5 })
  },
  
  'championship-supporter': {
    id: 'championship-supporter',
    name: 'Championship Supporter',
    description: 'Support a song to the Finals - Almost there!',
    icon: '<i class="fa-solid fa-gem"></i>',
    xp: 800,
    category: 'journey',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.furthestRound >= 6,
    progress: (stats) => ({ current: stats.furthestRound, target: 6 })
  },

  // ========================================
  // COMPLETIONIST ACHIEVEMENTS
  // ========================================
  'tournament-veteran': {
    id: 'tournament-veteran',
    name: 'Tournament Veteran',
    description: 'Vote in all rounds (1-6)',
    icon: '<i class="fa-solid fa-shield"></i>',
    xp: 300,
    category: 'completionist',
    hidden: true,
    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.roundsParticipated >= 6,
    progress: (stats) => ({ current: stats.roundsParticipated, target: 6 })
  },
  
  'completionist': {
    id: 'completionist',
    name: 'Completionist',
    description: 'Vote in 50 unique matches',
    icon: '<i class="fa-solid fa-circle-check"></i>',
    xp: 500,
    category: 'completionist',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.uniqueMatches >= 50,
    progress: (stats) => ({ current: stats.uniqueMatches, target: 50 })
  },

  // ========================================
  // SPECIAL/HIDDEN ACHIEVEMENTS
  // ========================================
  'night-owl': {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Vote between midnight and 5am',
    icon: '<i class="fa-solid fa-moon"></i>',
    xp: 50,
    category: 'special',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.lateNightVotes >= 1
  },
  
  'lightning-fast': {
    id: 'lightning-fast',
    name: 'Lightning Fast',
    description: 'Vote within 1 minute of match going live',
    icon: '<i class="fa-solid fa-bolt"></i>',
    xp: 100,
    category: 'special',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.instantVotes >= 1
  },
  
  'prophet': {
    id: 'prophet',
    name: 'Prophet',
    description: 'Vote for the tournament winner in Round 1',
    icon: '<i class="fa-solid fa-crystal-ball"></i>',
    xp: 1000,
    category: 'special',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.prophesied === true
  },

  'taste-maker': {
    id: 'taste-maker',
    name: 'Taste Maker',
    description: 'Vote for 10 different artists',
    icon: '<i class="fa-solid fa-palette"></i>',
    xp: 200,
    category: 'special',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.uniqueArtists >= 10,
    progress: (stats) => ({ current: stats.uniqueArtists, target: 10 })
  },

  'music-historian': {
    id: 'music-historian',
    name: 'Music Historian',
    description: 'Vote for songs from 5 different years',
    icon: '<i class="fa-solid fa-book"></i>',
    xp: 150,
    category: 'special',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.uniqueYears >= 5,
    progress: (stats) => ({ current: stats.uniqueYears, target: 5 })
  },

  'comeback-believer': {
    id: 'comeback-believer',
    name: 'Comeback Believer',
    description: 'Vote for 5 songs that were losing when you voted',
    icon: '<i class="fa-solid fa-masks-theater"></i>',
    xp: 200,
    category: 'special',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.comebackVotes >= 5,
    progress: (stats) => ({ current: stats.comebackVotes, target: 5 })
  },

  // ========================================
  // SOCIAL ACHIEVEMENTS
  // ========================================
  'community-voice': {
    id: 'community-voice',
    name: 'Community Voice',
    description: 'Share 5 matches on social media',
    icon: '<i class="fa-solid fa-mobile-screen"></i>',
    xp: 200,
    category: 'social',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.sharesCount >= 5,
    progress: (stats) => ({ current: stats.sharesCount, target: 5 })
  },

  'hype-master': {
    id: 'hype-master',
    name: 'Hype Master',
    description: 'Share 15 matches - Spread the word!',
    icon: '<i class="fa-solid fa-bullhorn"></i>',
    xp: 500,
    category: 'social',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
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
    description: 'Voting volume achievements'
  },
  streaks: {
    name: 'Streaks',
    icon: '<i class="fa-solid fa-fire"></i>',
    color: '#ff4444',
    description: 'Consecutive daily voting'
  },
  underdog: {
    name: 'Underdog',
    icon: '<i class="fa-solid fa-masks-theater"></i>',
    color: '#c84aff',
    description: 'Supporting the underdogs'
  },
  early: {
    name: 'Early Voter',
    icon: '<i class="fa-solid fa-dove"></i>',
    color: '#00c896',
    description: 'Being first to vote'
  },
  clutch: {
    name: 'Close Calls',
    icon: '<i class="fa-solid fa-scale-balanced"></i>',
    color: '#ffaa00',
    description: 'Close match participation'
  },
  loyalty: {
    name: 'Loyalty',
    icon: '<i class="fa-solid fa-heart"></i>',
    color: '#667eea',
    description: 'Supporting favorite songs'
  },
  journey: {
    name: 'Journey',
    icon: '<i class="fa-solid fa-trophy"></i>',
    color: '#c8aa6e',
    description: 'Tournament progression'
  },
  completionist: {
    name: 'Completionist',
    icon: '<i class="fa-solid fa-circle-check"></i>',
    color: '#4aff4a',
    description: 'Full participation'
  },
  special: {
    name: 'Special',
    icon: '<i class="fa-solid fa-star"></i>',
    color: '#ffd700',
    description: 'Hidden and rare achievements'
  },
  social: {
    name: 'Social',
    icon: '<i class="fa-solid fa-mobile-screen"></i>',
    color: '#ff69b4',
    description: 'Community engagement'
  }
};

// ========================================
// HELPER FUNCTIONS
// ========================================

export function getAchievementsByCategory() {
  const grouped = {};
  
  Object.values(ACHIEVEMENTS).forEach(achievement => {
    const cat = achievement.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(achievement);
  });
  
  return grouped;
}

export function getAchievementById(id) {
  return ACHIEVEMENTS[id] || null;
}

export function getAllAchievements() {
  return Object.values(ACHIEVEMENTS);
}

export function getVisibleAchievements() {
  return Object.values(ACHIEVEMENTS).filter(a => !a.hidden);
}