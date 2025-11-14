// ========================================
// FOUNDING MEMBER TRACKER
// Awards badge to users who vote before 1000 total votes
// ========================================

const FOUNDING_MEMBER_THRESHOLD = 1000;
const TOTAL_VOTES_KEY = 'siteTotalVotes';
const FOUNDING_MEMBER_KEY = 'foundingMember';
const MILESTONE_REACHED_KEY = 'foundingMemberMilestoneReached';

/**
 * Initialize founding member tracking
 * Call this on every page load
 */
export async function initFoundingMemberTracking() {
  try {
    // Check if milestone already reached
    const milestoneReached = localStorage.getItem(MILESTONE_REACHED_KEY);
    
    if (milestoneReached === 'true') {
      console.log('🏁 Founding Member milestone already reached (1000+ votes)');
      return;
    }
    
    // Fetch current total votes from your API/database
    const totalVotes = await getTotalSiteVotes();
    
    // Store current count
    localStorage.setItem(TOTAL_VOTES_KEY, totalVotes.toString());
    
    // Check if milestone reached
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
 * Award founding member badge when user votes
 * Call this AFTER a vote is successfully cast
 */
/**
 * Award founding member badge when user votes
 * Call this AFTER a vote is successfully cast
 */
export async function awardFoundingMemberBadge() {
  // Check if milestone already reached
  const milestoneReached = localStorage.getItem(MILESTONE_REACHED_KEY);
  
  if (milestoneReached === 'true') {
    console.log('⏰ Too late - milestone already reached');
    return false;
  }
  
  // Check if user already has badge
  const alreadyAwarded = localStorage.getItem(FOUNDING_MEMBER_KEY);
  
  if (alreadyAwarded === 'true') {
    console.log('✅ User already has Founding Member badge');
    return false;
  }
  
  // Award the badge!
  localStorage.setItem(FOUNDING_MEMBER_KEY, 'true');
  console.log('👑 Founding Member badge awarded!');
  
  // ✅ NEW: Award 500 XP
  const { addXP } = await import('./rank-system.js');
  const newXP = addXP(500, 'founding-member-achievement');
  console.log(`✨ Awarded 500 XP for Founding Member! New total: ${newXP} XP`);
  
  // Show celebration toast (if on client-side)
  if (typeof window !== 'undefined' && window.showBulletin) {
    setTimeout(() => {
      window.showBulletin({
        priority: 1,
        type: 'achievement',
        matchId: 'founding-member',
        message: '👑 Founding Member Unlocked!',
        detail: 'You\'re part of the first 1,000 voters - this badge is yours forever! +500 XP',
        cta: 'View Badge',
        action: 'navigate',
        targetUrl: '/my-votes.html#achievements'
      });
    }, 1500); // Delay so it doesn't conflict with vote success message
  }
  
  return true;
}

/**
 * Get total site votes from your backend
 */
async function getTotalSiteVotes() {
  try {
    // Import from api-client
    const { getTotalVotes } = await import('./api-client.js');
    const data = await getTotalVotes();
    return data.totalVotes || 0;
    
  } catch (error) {
    console.error('Error fetching total votes:', error);
    return 0;
  }
}

/**
 * Backfill founding member status for existing users
 * Call this ONCE when deploying the feature
 */
/**
 * Backfill founding member status for existing users
 * Call this ONCE when deploying the feature
 */
export async function backfillFoundingMemberForExistingUsers() {
  try {
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const hasVoted = Object.keys(userVotes).length > 0;
    
    // If user has voted and doesn't have badge yet
    if (hasVoted && !localStorage.getItem(FOUNDING_MEMBER_KEY)) {
      const totalVotes = await getTotalSiteVotes();
      
      // If we're still under 1000, award it
      if (totalVotes < FOUNDING_MEMBER_THRESHOLD) {
        localStorage.setItem(FOUNDING_MEMBER_KEY, 'true');
        console.log('👑 Backfilled Founding Member badge for existing user');
        
        // ✅ NEW: Award 500 XP for backfilled users too
        const { addXP } = await import('./rank-system.js');
        const newXP = addXP(500, 'founding-member-achievement');
        console.log(`✨ Awarded 500 XP for Founding Member! New total: ${newXP} XP`);
        
        return true;
      }
    }
    
    return false;
    
  } catch (error) {
    console.error('Error backfilling founding member:', error);
    return false;
  }
}

// Export for use in other files
export function isFoundingMember() {
  return localStorage.getItem(FOUNDING_MEMBER_KEY) === 'true';
}

export function getTotalVotesCount() {
  return parseInt(localStorage.getItem(TOTAL_VOTES_KEY) || '0');
}

/**
 * One-time XP backfill for users who got badge before XP was implemented
 * Call this on page load
 */
export async function backfillFoundingMemberXP() {
  const hasFoundingBadge = localStorage.getItem(FOUNDING_MEMBER_KEY) === 'true';
  const xpBackfilled = localStorage.getItem('foundingMemberXPBackfilled') === 'true';
  
  // If user has badge but hasn't received XP yet
  if (hasFoundingBadge && !xpBackfilled) {
    console.log('🔄 Backfilling 500 XP for existing Founding Member...');
    
    const { addXP } = await import('./rank-system.js');
    const newXP = addXP(500, 'founding-member-achievement');
    
    // Mark as backfilled so it doesn't happen again
    localStorage.setItem('foundingMemberXPBackfilled', 'true');
    
    console.log(`✨ Backfilled 500 XP! New total: ${newXP} XP`);
    
    // Show notification
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