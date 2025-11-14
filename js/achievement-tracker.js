// ========================================
// ACHIEVEMENT TRACKER - Checking & Unlocking
// ========================================

import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from './achievements.js';
import { addXP } from './rank-system.js';

/**
 * Calculate stats needed for achievement checking
 * @param {Array} allVotes - User's complete vote history
 * @returns {Object} - Stats object
 */
export function calculateAchievementStats(allVotes) {
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
    uniqueArtists: 0, // ✅ NEW
    uniqueYears: 0, // ✅ NEW
    comebackVotes: 0, // ✅ NEW
    // ✅ ADD THIS:
    isFoundingMember: localStorage.getItem('foundingMember') === 'true'

  };
  
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
  
  // ✅ Calculate comeback votes (voted for song that was losing <40%)
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
  
  // ✅ Calculate unique artists
  const uniqueArtists = new Set();
  allVotes.forEach(v => {
    if (v.votedForArtist) {
      uniqueArtists.add(v.votedForArtist);
    }
  });
  stats.uniqueArtists = uniqueArtists.size;
  
  // ✅ Calculate unique years
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
 * Check which achievements user has unlocked
 * @param {Array} allVotes - User's vote history
 * @returns {Object} - Achievement status
 */
export function checkAchievements(allVotes) {
  const stats = calculateAchievementStats(allVotes);
  const unlocked = [];
  const locked = [];
  const newlyUnlocked = [];
  
  // Get previously unlocked achievements
  const previouslyUnlocked = JSON.parse(localStorage.getItem('unlockedAchievements') || '[]');
  
  Object.values(ACHIEVEMENTS).forEach(achievement => {
    const isUnlocked = achievement.condition(stats);
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
  });
  
  // Save newly unlocked achievements
  if (newlyUnlocked.length > 0) {
    const updatedUnlocked = [...previouslyUnlocked, ...newlyUnlocked.map(a => a.id)];
    localStorage.setItem('unlockedAchievements', JSON.stringify(updatedUnlocked));
    
    // Award XP for achievements
    const achievementXP = newlyUnlocked.reduce((sum, a) => sum + a.xp, 0);
    if (achievementXP > 0) {
      addXP(achievementXP);
      console.log(`✨ Achievement XP awarded: +${achievementXP}`);
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
 * Show achievement unlock notification using existing toast system
 */
export function showAchievementUnlock(achievement) {
  // Use your existing global-notifications.js system
  if (window.showBulletin) {
    window.showBulletin({
      priority: 2,
      type: 'achievement',
      matchId: `achievement-${achievement.id}`,
      thumbnailUrl: null,
      message: `🏆 Achievement Unlocked: ${achievement.name}`,
      detail: `${achievement.description} • +${achievement.xp} XP`,
      cta: 'View Achievements',
      action: 'navigate',
      targetUrl: '/my-votes.html#achievements'
    });
  }
  
  console.log(`🏆 Achievement unlocked: ${achievement.name} (+${achievement.xp} XP)`);
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