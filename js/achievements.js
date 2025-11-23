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
  // MILESTONE ACHIEVEMENTS (Voting Volume)
  // ========================================
  'opening-act': {
    id: 'opening-act',
    name: 'Opening Act',
    description: 'Cast your first vote',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/1001.png', // Boots of Speed
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/1026.png', // Blasting Wand
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3145.png', // Hextech Alternator
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3108.png', // Fiendish Codex
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3031.png', // Infinity Edge
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3089.png', // Rabadon's Deathcap
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3040.png', // Seraph's Embrace
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3041.png', // Mejai's Soulstealer
    xp: 500,
    category: 'special',
    hidden: false,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => {
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3068.png', // Sunfire Aegis
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3075.png', // Thornmail
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/6333.png', // Death's Dance
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3078.png', // Trinity Force
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3742.png', // Dead Man's Plate
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3748.png', // Titanic Hydra
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3071.png', // Black Cleaver
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3006.png', // Berserker's Greaves
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3020.png', // Sorcerer's Shoes
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3157.png', // Zhonya's Hourglass
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3026.png', // Guardian Angel
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3504.png', // Ardent Censer
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3107.png', // Redemption
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3109.png', // Knight's Vow
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3053.png', // Sterak's Gage
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3190.png', // Locket of the Iron Solari
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3222.png', // Mikael's Blessing
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3152.png', // Hextech Rocketbelt
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3116.png', // Rylai's Crystal Scepter
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3050.png', // Zeke's Convergence
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3009.png', // Boots of Swiftness
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3165.png', // Morellonomicon
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3011.png', // Chemtech Putrifier
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3050.png', // Zeke's Convergence
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
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3091.png', // Wit's End
    xp: 200,
    category: 'special',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.comebackVotes >= 5,
    progress: (stats) => ({ current: stats.comebackVotes, target: 5 })
  },

  // ========================================
  // BATCH VOTING ACHIEVEMENTS
  // ========================================
  'triple-threat': {
    id: 'triple-threat',
    name: 'Triple Threat',
    description: 'Vote in 3 matches in one session',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3133.png', // Caulfield's Warhammer
    xp: 75,
    category: 'special',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.votesInSession >= 3,
    progress: (stats) => ({ current: stats.votesInSession, target: 3 })
  },

  'vote-spree': {
    id: 'vote-spree',
    name: 'Vote Spree',
    description: 'Vote in 5 matches in one session',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3134.png', // Serrated Dirk
    xp: 150,
    category: 'special',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.votesInSession >= 5,
    progress: (stats) => ({ current: stats.votesInSession, target: 5 })
  },

  'power-voter': {
    id: 'power-voter',
    name: 'Power Voter',
    description: 'Vote in 10 matches in one session',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3135.png', // Void Staff
    xp: 300,
    category: 'special',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.votesInSession >= 10,
    progress: (stats) => ({ current: stats.votesInSession, target: 10 })
  },

  'voting-marathon': {
    id: 'voting-marathon',
    name: 'Voting Marathon',
    description: 'Vote in 20 matches in one session - Unstoppable!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3124.png', // Guinsoo's Rageblade
    xp: 500,
    category: 'special',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.votesInSession >= 20,
    progress: (stats) => ({ current: stats.votesInSession, target: 20 })
  },

  // ========================================
  // SPECIAL EVENT ACHIEVEMENTS
  // ========================================
  'first-blood': {
    id: 'first-blood',
    name: 'First Blood',
    description: 'You drew first blood - the very first vote ever on the site!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3142.png', // Youmuu's Ghostblade
    xp: 500,
    category: 'special',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => {
      return localStorage.getItem('globalFirstVote') === 'true';
    }
  },

  'tournament-first-blood': {
    id: 'tournament-first-blood',
    name: 'Tournament First Blood',
    description: 'The first vote of the entire tournament!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3153.png', // Blade of the Ruined King
    xp: 750,
    category: 'special',
    hidden: true,
    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => {
      return localStorage.getItem('tournamentFirstVote') === 'true';
    }
  },

  'round-first-blood': {
    id: 'round-first-blood',
    name: 'Round First Blood',
    description: 'First vote in a new round!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3155.png', // Hexdrinker
    xp: 400,
    category: 'special',
    hidden: true,
    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => {
      const firstInRounds = JSON.parse(localStorage.getItem('firstInRounds') || '[]');
      return firstInRounds.length > 0;
    }
  },

  'daily-session-kickoff': {
    id: 'daily-session-kickoff',
    name: 'Daily Session Kickoff',
    description: 'Your first vote of the day!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3364.png', // Oracle Lens
    xp: 150,
    category: 'special',
    hidden: true,
    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => {
      const lastVoteDate = localStorage.getItem('lastVoteDate');
      const today = new Date().toDateString();
      return lastVoteDate !== today && stats.totalVotes >= 1;
    }
  },

  'daily-comeback': {
    id: 'daily-comeback',
    name: 'Welcome Back',
    description: 'Returned after being away for days!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3193.png', // Gargoyle Stoneplate
    xp: 300,
    category: 'special',
    hidden: true,
    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => {
      const lastVisit = localStorage.getItem('lastVisitDate');
      if (!lastVisit) return false;
      
      const daysSince = Math.floor((Date.now() - new Date(lastVisit)) / (1000 * 60 * 60 * 24));
      return daysSince >= 3;
    }
  },

  // ========================================
  // MATCH OUTCOME ACHIEVEMENTS
  // ========================================
  'match-won': {
    id: 'match-won',
    name: 'Victory!',
    description: 'Your voted song won the match!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/3004.png', // Manamune
    xp: 200,
    category: 'special',
    hidden: true,
    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => {
      const wonMatches = parseInt(localStorage.getItem('matchesWon') || '0');
      return wonMatches >= 1;
    }
  },

  'match-lost': {
    id: 'match-lost',
    name: 'Better Luck Next Time',
    description: 'Your song lost, but you fought well!',
    icon: 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/1055.png', // Doran's Blade
    xp: 50,
    category: 'special',
    hidden: true,
    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => {
      const lostMatches = parseInt(localStorage.getItem('matchesLost') || '0');
      return lostMatches >= 1;
    }
  },

  

'last-second-hero': {
  id: 'last-second-hero',
  name: 'Clutch Hero',
  description: 'Your vote tied or flipped a match at the last second!',
  icon: '<i class="fa-solid fa-clock"></i>',
  xp: 1000,
  category: 'special',
  hidden: true,
  tier: 'legendary',
  rarity: 'legendary',
  condition: (stats) => {
    return localStorage.getItem('lastSecondHero') === 'true';
  }
},

'level-up': {
  id: 'level-up',
  name: 'Level Up!',
  description: 'Reached a new level!',
  icon: '<i class="fa-solid fa-arrow-up"></i>',
  xp: 0, // XP already awarded by leveling system
  category: 'special',
  hidden: true,
  tier: 'bronze',
  rarity: 'common',
  condition: (stats) => {
    // This is awarded dynamically when level increases
    return false; // Never shows as unlocked, triggered manually
  }
},

'match-tied': {
  id: 'match-tied',
  name: 'Split Decision',
  description: 'Your match ended in a perfect tie!',
  icon: '<i class="fa-solid fa-equals"></i>',
  xp: 100,
  category: 'special',
  hidden: true,
  tier: 'bronze',
  rarity: 'uncommon',
  condition: (stats) => {
    const tiedMatches = parseInt(localStorage.getItem('matchesTied') || '0');
    return tiedMatches >= 1;
  }
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
 * Get achievement display name with rarity emoji
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