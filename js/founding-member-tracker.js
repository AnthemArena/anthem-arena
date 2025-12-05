// ========================================
// FOUNDING MEMBER TRACKER (Firebase-integrated)
// Awards badge to users who vote before 1000 total votes
// ========================================

import { doc, getDoc, updateDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';
import { addXP } from './rank-system.js';
import { checkForAchievementUnlocks } from './vote.js';

const FOUNDING_MEMBER_THRESHOLD = 1000;
const FOUNDING_MEMBER_ACHIEVEMENT_ID = 'founding-member';
const MILESTONE_REACHED_KEY = 'foundingMemberMilestoneReached';
const LOCAL_FOUNDING_KEY = 'foundingMember';

/**
 * Initialize founding member tracking on page load
 */
export async function initFoundingMemberTracking(userId) {
  try {
    const milestoneReached = localStorage.getItem(MILESTONE_REACHED_KEY);
    if (milestoneReached === 'true') return;

    const totalVotes = await getTotalSiteVotes();
    localStorage.setItem('siteTotalVotes', totalVotes.toString());

    if (totalVotes >= FOUNDING_MEMBER_THRESHOLD) {
      localStorage.setItem(MILESTONE_REACHED_KEY, 'true');
      console.log(`🏁 Founding Member milestone reached! Total votes: ${totalVotes}`);
    } else {
      console.log(`📊 Current site votes: ${totalVotes}/${FOUNDING_MEMBER_THRESHOLD}`);
    }
  } catch (error) {
    console.error('Error initializing founding member tracking:', error);
  }
}

/**
 * Award Founding Member badge after a vote
 */
export async function awardFoundingMemberBadge(userId) {
  try {
    // Check if milestone reached
    const milestoneReached = localStorage.getItem(MILESTONE_REACHED_KEY);
    if (milestoneReached === 'true') {
      console.log('⏰ Too late - milestone already reached');
      return false;
    }

    // Check localStorage if already awarded
    const alreadyAwarded = localStorage.getItem(LOCAL_FOUNDING_KEY);
    if (alreadyAwarded === 'true') {
      console.log('✅ User already has Founding Member badge');
      return false;
    }

    // Award locally
    localStorage.setItem(LOCAL_FOUNDING_KEY, 'true');

    // Award XP
    const newXP = addXP(500, 'founding-member-achievement');
    console.log(`✨ Awarded 500 XP for Founding Member! New total: ${newXP} XP`);

    // Sync to Firebase
    if (userId) {
      const profileRef = doc(db, 'profiles', userId);
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        await updateDoc(profileRef, {
          unlockedAchievements: [FOUNDING_MEMBER_ACHIEVEMENT_ID]
        }).catch(async () => {
          // Create profile if missing
          await updateDoc(profileRef, {
            unlockedAchievements: arrayUnion(FOUNDING_MEMBER_ACHIEVEMENT_ID)
          });
        });
      } else {
        await updateDoc(profileRef, {
          unlockedAchievements: arrayUnion(FOUNDING_MEMBER_ACHIEVEMENT_ID)
        });
      }

      // Trigger achievements check
      await checkForAchievementUnlocks();
    }

    // Show toast if available
    if (typeof window !== 'undefined' && window.showBulletin) {
      setTimeout(() => {
        window.showBulletin({
          priority: 1,
          type: 'achievement',
          matchId: FOUNDING_MEMBER_ACHIEVEMENT_ID,
          message: '👑 Founding Member Unlocked!',
          detail: 'You\'re part of the first 1,000 voters - this badge is yours forever! +500 XP',
          cta: 'View Badge',
          action: 'navigate',
          targetUrl: '/my-votes.html#achievements'
        });
      }, 1500);
    }

    return true;

  } catch (error) {
    console.error('Error awarding Founding Member badge:', error);
    return false;
  }
}

/**
 * Backfill Founding Member for existing users
 */
export async function backfillFoundingMemberForExistingUsers(userId) {
  try {
    const hasLocalBadge = localStorage.getItem(LOCAL_FOUNDING_KEY) === 'true';
    if (hasLocalBadge) return false;

    const totalVotes = await getTotalSiteVotes();
    if (totalVotes >= FOUNDING_MEMBER_THRESHOLD) return false;

    return await awardFoundingMemberBadge(userId);
  } catch (error) {
    console.error('Error backfilling Founding Member badge:', error);
    return false;
  }
}

/**
 * Check if user is Founding Member (localStorage)
 */
export function isFoundingMember() {
  return localStorage.getItem(LOCAL_FOUNDING_KEY) === 'true';
}

/**
 * Get total site votes
 */
async function getTotalSiteVotes() {
  try {
    const { getTotalVotes } = await import('./api-client.js');
    const data = await getTotalVotes();
    return data.totalVotes || 0;
  } catch (error) {
    console.error('Error fetching total site votes:', error);
    return 0;
  }
}

/**
 * Backfill XP for Founding Member if badge exists locally but XP missing
 */
export async function backfillFoundingMemberXP() {
  const hasBadge = isFoundingMember();
  const xpBackfilled = localStorage.getItem('foundingMemberXPBackfilled') === 'true';

  if (hasBadge && !xpBackfilled) {
    const newXP = addXP(500, 'founding-member-achievement');
    localStorage.setItem('foundingMemberXPBackfilled', 'true');
    console.log(`✨ Backfilled 500 XP! New total: ${newXP} XP`);

    if (window.showBulletin) {
      window.showBulletin({
        priority: 1,
        type: 'achievement',
        message: '✨ Founding Member Bonus!',
        detail: 'You received 500 XP for being a Founding Member!',
        duration: 4000
      });
    }

    return true;
  }

  return false;
}
