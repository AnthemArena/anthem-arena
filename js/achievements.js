// ========================================
// ACHIEVEMENT SYSTEM - LEAGUE MUSIC TOURNAMENT
// Inspired by League of Legends progression
// ========================================



export const ACHIEVEMENTS = {
  
  // ========================================
  // MILESTONE ACHIEVEMENTS (Voting Volume)
  // ========================================
  'first-blood': {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Cast your first vote',
    icon: '⚔️',
    xp: 25,
    category: 'milestones',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => stats.totalVotes >= 1,
    progress: (stats) => ({ current: stats.totalVotes, target: 1 })
  },
  
  'double-kill': {
    id: 'double-kill',
    name: 'Double Kill',
    description: 'Cast 5 votes',
    icon: '⚔️⚔️',
    xp: 50,
    category: 'milestones',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'bronze',
    rarity: 'common',
    condition: (stats) => stats.totalVotes >= 5,
    progress: (stats) => ({ current: stats.totalVotes, target: 5 })
  },
  
  'triple-kill': {
    id: 'triple-kill',
    name: 'Triple Kill',
    description: 'Cast 10 votes',
    icon: '🔥',
    xp: 100,
    category: 'milestones',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.totalVotes >= 10,
    progress: (stats) => ({ current: stats.totalVotes, target: 10 })
  },
  
  'quadra-kill': {
    id: 'quadra-kill',
    name: 'Quadra Kill',
    description: 'Cast 25 votes',
    icon: '🔥🔥',
    xp: 150,
    category: 'milestones',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'uncommon',
    condition: (stats) => stats.totalVotes >= 25,
    progress: (stats) => ({ current: stats.totalVotes, target: 25 })
  },
  
  'penta-kill': {
    id: 'penta-kill',
    name: 'Pentakill',
    description: 'Cast 50 votes',
    icon: '💀',
    xp: 300,
    category: 'milestones',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.totalVotes >= 50,
    progress: (stats) => ({ current: stats.totalVotes, target: 50 })
  },
  
  'legendary': {
    id: 'legendary',
    name: 'Legendary!',
    description: 'Cast 100 votes',
    icon: '👑',
    xp: 500,
    category: 'milestones',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'legendary',
    rarity: 'epic',
    condition: (stats) => stats.totalVotes >= 100,
    progress: (stats) => ({ current: stats.totalVotes, target: 100 })
  },

  // ========================================
  // STREAK ACHIEVEMENTS
  // ========================================
  'hot-streak': {
    id: 'hot-streak',
    name: 'On Fire',
    description: 'Vote 3 days in a row',
    icon: '🔥',
    xp: 75,
    category: 'streaks',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.votingStreak >= 3,
    progress: (stats) => ({ current: stats.votingStreak, target: 3 })
  },
  
  'rampage': {
    id: 'rampage',
    name: 'Rampage',
    description: 'Vote 7 days in a row',
    icon: '🔥🔥',
    xp: 200,
    category: 'streaks',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.votingStreak >= 7,
    progress: (stats) => ({ current: stats.votingStreak, target: 7 })
  },
  
  'unstoppable': {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Vote 14 days in a row',
    icon: '⚡',
    xp: 400,
    category: 'streaks',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.votingStreak >= 14,
    progress: (stats) => ({ current: stats.votingStreak, target: 14 })
  },
  
  'godlike': {
    id: 'godlike',
    name: 'Godlike',
    description: 'Vote 30 days in a row',
    icon: '👑',
    xp: 1000,
    category: 'streaks',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.votingStreak >= 30,
    progress: (stats) => ({ current: stats.votingStreak, target: 30 })
  },

  // ========================================
  // UNDERDOG ACHIEVEMENTS
  // ========================================
  'giant-slayer': {
    id: 'giant-slayer',
    name: 'Giant Slayer',
    description: 'Vote for 5 underdogs',
    icon: '🎯',
    xp: 100,
    category: 'underdog',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.underdogVotes >= 5,
    progress: (stats) => ({ current: stats.underdogVotes, target: 5 })
  },
  
  'david-goliath': {
    id: 'david-goliath',
    name: 'David vs Goliath',
    description: 'Vote for 15 underdogs',
    icon: '🎭',
    xp: 250,
    category: 'underdog',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.underdogVotes >= 15,
    progress: (stats) => ({ current: stats.underdogVotes, target: 15 })
  },
  
  'rebel-heart': {
    id: 'rebel-heart',
    name: 'Rebel Heart',
    description: 'Vote for 30 underdogs',
    icon: '💔',
    xp: 500,
    category: 'underdog',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.underdogVotes >= 30,
    progress: (stats) => ({ current: stats.underdogVotes, target: 30 })
  },

  // ========================================
  // EARLY VOTER ACHIEVEMENTS
  // ========================================
  'vision-control': {
    id: 'vision-control',
    name: 'Vision Control',
    description: 'Be among first 10 voters in 5 matches',
    icon: '👁️',
    xp: 150,
    category: 'early',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.earlyVotes >= 5,
    progress: (stats) => ({ current: stats.earlyVotes, target: 5 })
  },
  
  'pioneer': {
    id: 'pioneer',
    name: 'Pioneer',
    description: 'Be among first 10 voters in 15 matches',
    icon: '🌟',
    xp: 300,
    category: 'early',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.earlyVotes >= 15,
    progress: (stats) => ({ current: stats.earlyVotes, target: 15 })
  },

  // ========================================
  // CLOSE MATCH ACHIEVEMENTS
  // ========================================
  'clutch-factor': {
    id: 'clutch-factor',
    name: 'Clutch Factor',
    description: 'Vote in 10 close matches (within 5%)',
    icon: '⏰',
    xp: 150,
    category: 'clutch',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.closeMatchVotes >= 10,
    progress: (stats) => ({ current: stats.closeMatchVotes, target: 10 })
  },
  
  'last-second': {
    id: 'last-second',
    name: 'Last Second Hero',
    description: 'Vote in 25 close matches',
    icon: '🚨',
    xp: 350,
    category: 'clutch',
            hidden: true,  // ✅ ADD THIS LINE

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
    icon: '💙',
    xp: 100,
    category: 'loyalty',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'bronze',
    rarity: 'uncommon',
    condition: (stats) => stats.maxSongVotes >= 3,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 3 })
  },
  
  'superfan': {
    id: 'superfan',
    name: 'Superfan',
    description: 'Vote for the same song 5 times',
    icon: '⭐',
    xp: 250,
    category: 'loyalty',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.maxSongVotes >= 5,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 5 })
  },
  
  'ultimate-stan': {
    id: 'ultimate-stan',
    name: 'Ultimate Stan',
    description: 'Vote for the same song 10 times',
    icon: '👑',
    xp: 500,
    category: 'loyalty',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.maxSongVotes >= 10,
    progress: (stats) => ({ current: stats.maxSongVotes, target: 10 })
  },

  // ========================================
  // JOURNEY ACHIEVEMENTS
  // ========================================
  'quarter-finalist': {
    id: 'quarter-finalist',
    name: 'Quarter-Finalist Supporter',
    description: 'Support a song to the Quarterfinals',
    icon: '🏆',
    xp: 200,
    category: 'journey',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.furthestRound >= 4,
    progress: (stats) => ({ current: stats.furthestRound, target: 4 })
  },
  
  'semi-finalist': {
    id: 'semi-finalist',
    name: 'Semi-Finalist Supporter',
    description: 'Support a song to the Semifinals',
    icon: '🥇',
    xp: 400,
    category: 'journey',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'gold',
    rarity: 'epic',
    condition: (stats) => stats.furthestRound >= 5,
    progress: (stats) => ({ current: stats.furthestRound, target: 5 })
  },
  
  'finalist': {
    id: 'finalist',
    name: 'Finalist Supporter',
    description: 'Support a song to the Finals',
    icon: '🌟',
    xp: 800,
    category: 'journey',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'legendary',
    rarity: 'legendary',
    condition: (stats) => stats.furthestRound >= 6,
    progress: (stats) => ({ current: stats.furthestRound, target: 6 })
  },

  // ========================================
  // COMPLETIONIST ACHIEVEMENTS
  // ========================================
  'round-warrior': {
    id: 'round-warrior',
    name: 'Round Warrior',
    description: 'Vote in all rounds (1-6)',
    icon: '⚔️',
    xp: 300,
    category: 'completionist',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'gold',
    rarity: 'rare',
    condition: (stats) => stats.roundsParticipated >= 6,
    progress: (stats) => ({ current: stats.roundsParticipated, target: 6 })
  },
  
  'tournament-completionist': {
    id: 'tournament-completionist',
    name: 'Tournament Completionist',
    description: 'Vote in 50 unique matches',
    icon: '✅',
    xp: 500,
    category: 'completionist',
            hidden: true,  // ✅ ADD THIS LINE

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
    icon: '🦉',
    xp: 50,
    category: 'special',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'bronze',
    rarity: 'uncommon',
    hidden: true,
    condition: (stats) => stats.lateNightVotes >= 1
  },
  
  'speed-demon': {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Vote within 1 minute of match going live',
    icon: '⚡',
    xp: 100,
    category: 'special',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    hidden: true,
    condition: (stats) => stats.instantVotes >= 1
  },
  
  'prophet': {
    id: 'prophet',
    name: 'Prophet of Runeterra',
    description: 'Vote for the tournament winner in Round 1',
    icon: '🔮',
    xp: 1000,
    category: 'special',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'legendary',
    rarity: 'legendary',
    hidden: true,
    condition: (stats) => stats.prophesied === true
  },

  // ========================================
  // SOCIAL ACHIEVEMENTS
  // ========================================
  'influencer': {
    id: 'influencer',
    name: 'Content Creator',
    description: 'Share 5 matches on social media',
    icon: '📱',
    xp: 200,
    category: 'social',
            hidden: true,  // ✅ ADD THIS LINE

    tier: 'silver',
    rarity: 'rare',
    condition: (stats) => stats.sharesCount >= 5,
    progress: (stats) => ({ current: stats.sharesCount, target: 5 })
  }
};

// ========================================
// ACHIEVEMENT CATEGORIES
// ========================================

export const ACHIEVEMENT_CATEGORIES = {
  milestones: {
    name: 'Milestones',
    icon: '🎯',
    color: '#4a9eff',
    description: 'Voting volume achievements'
  },
  streaks: {
    name: 'Streaks',
    icon: '🔥',
    color: '#ff4444',
    description: 'Consecutive daily voting'
  },
  underdog: {
    name: 'Underdog',
    icon: '🎭',
    color: '#c84aff',
    description: 'Supporting the less favored'
  },
  early: {
    name: 'Early Voter',
    icon: '👁️',
    color: '#00c896',
    description: 'Being first to vote'
  },
  clutch: {
    name: 'Clutch',
    icon: '⏰',
    color: '#ffaa00',
    description: 'Close match participation'
  },
  loyalty: {
    name: 'Loyalty',
    icon: '💙',
    color: '#667eea',
    description: 'Supporting favorite songs'
  },
  journey: {
    name: 'Journey',
    icon: '🏆',
    color: '#c8aa6e',
    description: 'Tournament progression'
  },
  completionist: {
    name: 'Completionist',
    icon: '✅',
    color: '#4aff4a',
    description: 'Full participation'
  },
  special: {
    name: 'Special',
    icon: '⭐',
    color: '#ffd700',
    description: 'Hidden and rare achievements'
  },
  social: {
    name: 'Social',
    icon: '📱',
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