import { masteryLevel, skinsUnlockedBetween } from './champion-unlocks.js';
import { getChampionSplashUrl } from './arcane-config.js';
import { activePackId, addPackXp, readPackXp, mergeXp, streakFromVotes, backfillPackXp } from './xp-ledger.js';
import { factsOf, voteXpAward, utcDay } from './vote-facts.js';
import { recordProgress } from './vote-progress.js';

// ========================================
// RANK PROGRESSION SYSTEM
// ========================================

// ========================================
// RANK PROGRESSION SYSTEM (SIMPLIFIED)
// ========================================

export const RANK_SYSTEM = {
    levels: [
     { level: 1, xpNeeded: 0, title: '✨ New Arrival' },
{ level: 2, xpNeeded: 100, title: '🛤️ Undercity Regular' },
{ level: 3, xpNeeded: 250, title: '🌟 Rising Name' },
{ level: 4, xpNeeded: 500, title: '🔮 Arcane Insider' },
{ level: 5, xpNeeded: 1000, title: '🥊 Streetwise' },
{ level: 6, xpNeeded: 1750, title: '🔥 Notorious' },
{ level: 7, xpNeeded: 3000, title: '⚡ Hextech Adept' },
{ level: 8, xpNeeded: 5000, title: '💥 Power Player' },
{ level: 9, xpNeeded: 8000, title: '👑 Underworld Legend' },
{ level: 10, xpNeeded: 12000, title: '🌌 Arcane Legend' }
    ],

    xpSources: {
        vote: 10,
        firstVoteOfDay: 20,
        votingStreakDaily: 10,
        underdogPick: 5,
        closeMatch: 10,
        firstVoteInMatch: 5,
        share: 5
    },

    tiers: {
        BRONZE: {
            levels: [1, 2, 3],
            color: '#CD7F32',
            label: 'Bronze'
        },
        SILVER: {
            levels: [4, 5, 6],
            color: '#C0C0C0',
            label: 'Silver'
        },
        GOLD: {
            levels: [7, 8],
            color: '#FFD700',
            label: 'Gold'
        },
        LEGEND: {
            levels: [9, 10],
            color: '#C8AA6E',
            label: 'Legendary'
        }
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
        
        // Bonuses use what was true at vote time (vote.facts, see vote-facts.js); a vote from before that existed falls back to
        // the old flags
        const f = vote.facts ? factsOf(vote) : null;
        if (f ? f.early : (vote.voteNumber && vote.voteNumber <= 10)) totalXP += RANK_SYSTEM.xpSources.firstVoteInMatch;
        if (f ? f.close : vote.isCloseMatch) totalXP += RANK_SYSTEM.xpSources.closeMatch;
        if (f && f.underdog) totalXP += RANK_SYSTEM.xpSources.underdogPick;
        
        votedMatches.add(vote.matchId);
    });
    
// Voting streak bonus (CAPPED at 10 days to prevent abuse), worked out from the votes themselves so it is the
// same for every viewer (it used to read the viewer's own browser).
const streak = streakFromVotes(allVotes);
const MAX_STREAK_BONUS = 10;
const cappedStreak = Math.min(streak, MAX_STREAK_BONUS);
totalXP += cappedStreak * RANK_SYSTEM.xpSources.votingStreakDaily;

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

export function calculateVoteXP(voteData = {}) {
    // The daily bonus is paid once per UTC day, remembered under one key in one format (it used to share a key with the
    // streak counter in a different format, so every vote counted as the first of the day).
    const today = utcDay();
    const firstVoteToday = localStorage.getItem('lastVoteDayUtc') !== today;
    if (firstVoteToday) localStorage.setItem('lastVoteDayUtc', today);
    return voteXpAward({ facts: voteData.facts || {}, firstVoteToday, streak: voteData.streak || 1 });
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

// A companion reached a new mastery level: one alert saying so, with the skins it unlocked (their splash art as a strip).
function announceMastery(packId, from, to, xp) {
    const unlocked = skinsUnlockedBetween(packId, from, to);
    // During a vote the post-vote modal reports this (js/vote-progress.js); no toast on top of it
    if (recordProgress({ type: 'mastery', packId, from, to, skins: unlocked.map(x => ({ num: x.num, name: x.name })) })) return;
    if (!window.showBulletin) return;
    const name = window.championLoader?.getCurrentPack?.()?.name || packId;
    const rank = `${name} Mastery ${to}`;
    const voiced = window.championLoader?.getAchievementMessage('mastery-up', { rank, xp });
    const champ = packId.charAt(0).toUpperCase() + packId.slice(1);
    window.showBulletin({
        type: 'mastery-up',
        level: to,
        packId,
        message: voiced?.message || `${rank}!`,
        detail: unlocked.length ? `Unlocked: ${unlocked.map(x => x.name).join(', ')}` : (voiced?.detail || rank),
        strip: unlocked.length ? { thumbs: unlocked.slice(0, 3).map(x => getChampionSplashUrl(champ, x.num)), more: Math.max(0, unlocked.length - 3) } : null,
        cta: unlocked.length ? 'Wear it now' : (voiced?.cta || 'View champions'),
        ctaAction: () => {
            if (unlocked.length && window.openSettingsModal) window.openSettingsModal({ champion: packId, skin: unlocked[unlocked.length - 1].num });
            else window.location.href = '/profile#champions';
        },
        duration: 6000
    });
}

export function addXP(xpToAdd, source = 'vote') {
    const currentXP = getUserXPFromStorage();
    const oldRank = getUserRank(currentXP);
    const oldLevel = oldRank.currentLevel.level;
    
    const newXP = currentXP + xpToAdd;
    saveUserXP(newXP);
    const packId = activePackId(localStorage);
    const masteryBefore = masteryLevel(readPackXp(localStorage)[packId]).level;
    addPackXp(localStorage, packId, xpToAdd);   // the active companion's mastery
    const masteryAfter = masteryLevel(readPackXp(localStorage)[packId]).level;
    if (masteryAfter > masteryBefore) announceMastery(packId, masteryBefore, masteryAfter, xpToAdd);
    
    const newRank = getUserRank(newXP);
    const newLevel = newRank.currentLevel.level;
    
    // ✅ Check for level-up
    if (newLevel > oldLevel) {
        console.log(`🎉 LEVEL UP! ${oldLevel} → ${newLevel}`);
        const captured = recordProgress({ type: 'level', from: oldLevel, to: newLevel, title: newRank.currentLevel.title });

      // ✅ Show level-up toast notification (during a vote the post-vote modal says it instead)
        if (window.showBulletin && !captured) {
            const voiced = window.championLoader?.getAchievementMessage('level-up', {
                rank: newRank.currentLevel.title, xp: xpToAdd
            });
            window.showBulletin({
                type: 'level-up',
                level: newLevel,
                message: voiced?.message || `⬆️ New Arcane Rank!`,
detail: voiced?.detail || `You've reached ${newRank.currentLevel.title}! +${xpToAdd} XP earned`,
cta: voiced?.cta || 'View Progress',
                ctaAction: () => window.location.href = '/profile#overview',
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

// How many votes this browser knows about: the larger of the saved "stats" number and the saved votes themselves.
export function localVoteCount(storage = globalThis.localStorage) {
    let fromStats = 0, fromVotes = 0;
    try { fromStats = Number((JSON.parse(storage.getItem('stats') || 'null') || {}).votes) || 0; } catch { /* no stats */ }
    try { fromVotes = Object.keys(JSON.parse(storage.getItem('userVotes') || '{}')).length; } catch { /* no saved votes */ }
    return Math.max(fromStats, fromVotes);
}

// Counts only votes whose match still exists (same rule as the profile page, which hides votes from deleted or old
// tournaments). Pure so it can be tested.
export function countLiveVotes(votes, matches) {
    const list = Array.isArray(votes) ? votes : [];
    if (!Array.isArray(matches) || !matches.length) return list.length;   // can't tell which are old: count them all
    const ids = new Set(matches.map(m => m.matchId || m.id));
    return list.filter(v => ids.has(v.matchId)).length;
}

export async function syncProfileStatsToFirestore() {
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        if (!userId) {
            console.warn('⚠️ No userId - cannot sync profile');
            return;
        }
        
        // XP only goes up: if the profile already holds more than this browser (cleared site data), keep the larger one
        let totalXP = getUserXPFromStorage();
        let packXp = readPackXp();
        let rank = getUserRank(totalXP);
        
        // Vote count: the saved "stats" object can lag (it left other people's tooltips at 0 votes), so also count saved votes
        let voteCount = localVoteCount();
        
        const { db } = await import('./firebase-config.js');
        const { doc, updateDoc, setDoc, getDoc, collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // The saved votes are the truth (this browser's copy can include a vote from a deleted tournament, which made
        // tooltips say 3 while the profile page said 2). Fall back to the local number if the lookup fails.
        try {
            const snap = await getDocs(query(collection(db, 'votes'), where('userId', '==', userId)));
            let matches = [];
            try { matches = await (await import('./api-client.js')).getAllMatches(); } catch (e) { /* count all */ }
            voteCount = countLiveVotes(snap.docs.map(d => d.data()), matches);
        } catch (e) { console.warn('⚠️ Could not count saved votes, using this browser\'s count', e); }
        
        const profileRef = doc(db, 'profiles', userId);
        
        // Get rank title (remove emoji for storage)
        const rankTitle = rank.currentLevel.title.replace(/[^\w\s]/gi, '').trim();
        
        // Check if profile exists
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
            const merged = mergeXp({ xp: totalXP, packXp }, profileDoc.data());
            if (merged.changedLocal) { saveUserXP(merged.xp); localStorage.setItem('userPackXP', JSON.stringify(merged.packXp)); }
            totalXP = merged.xp; packXp = merged.packXp; rank = getUserRank(totalXP);
            // Update existing profile
            await updateDoc(profileRef, {
                level: rank.currentLevel.level,
                totalVotes: voteCount,
                rank: String(rank.currentLevel.title).replace(/[^\w\s]/gi, '').trim(),
                xp: totalXP,
                packXp,
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
                packXp,
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

// ========================================
// READ THE SAVED XP BACK (once per visit)
// ========================================
// Pulls the larger of this browser's XP and the profile's XP into this browser, so the level survives cleared site data.
// Returns true when this browser's numbers changed.
export async function hydrateXpFromProfile() {
    try {
        const userId = localStorage.getItem('userId') || localStorage.getItem('tournamentUserId');
        if (!userId || sessionStorage.getItem('xpHydrated') === userId) return false;
        sessionStorage.setItem('xpHydrated', userId);
        const { db } = await import('./firebase-config.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const snap = await getDoc(doc(db, 'profiles', userId));
        if (!snap.exists()) return false;
        const remote = snap.data();
        // the chosen companion looks follow the profile too (what is already on this device wins)
        let looksChanged = false;
        if (remote.companionSkins && typeof remote.companionSkins === 'object') {
            let local = {}; try { local = JSON.parse(localStorage.getItem('companionSkins') || '{}') || {}; } catch { /* none */ }
            const both = { ...remote.companionSkins, ...local };
            if (JSON.stringify(both) !== JSON.stringify(local)) { localStorage.setItem('companionSkins', JSON.stringify(both)); looksChanged = true; }
        }
        const merged = mergeXp({ xp: getUserXPFromStorage(), packXp: readPackXp() }, remote);
        // XP from before per-companion XP existed goes to the active companion once
        const filled = backfillPackXp(merged.packXp, merged.xp, activePackId());
        if (JSON.stringify(Object.entries(filled).sort()) !== JSON.stringify(Object.entries(merged.packXp).sort())) { merged.packXp = filled; merged.changedLocal = true; }
        if (!merged.changedLocal) { if (looksChanged) window.updateNavProfile?.(); return looksChanged; }
        saveUserXP(merged.xp);
        localStorage.setItem('userPackXP', JSON.stringify(merged.packXp));
        window.updateNavProfile?.();
        return true;
    } catch (e) { console.warn('⚠️ Could not read saved XP', e); return false; }
}

// A person's XP as shown to everyone: the profile's saved number when it has one, otherwise worked out from their votes.
export function xpForProfile(profile, votes = []) {
    const saved = Number(profile?.xp);
    return Number.isFinite(saved) && saved > 0 ? saved : calculateUserXP(votes).totalXP;
}
