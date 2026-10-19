// ========================================
// VOTE PROGRESS (what one vote changed)
// ========================================
// A vote can raise XP, move the person up a level, raise a companion's mastery (unlocking skins) and unlock achievements.
// Each of those used to pop its own toast, and the toasts sat on top of the post-vote modal. While a vote is being processed
// the vote page opens a capture (beginVoteProgress); level-up, mastery-up and achievement code record into it instead of
// toasting, and the post-vote modal shows one summary at the end. Outside a capture (a share, a profile visit) they toast
// as before. Pure: no DOM, no Firebase. Tested in tools/test-vote-progress.mjs.

import { masteryLevel, nextUnlock, skinsFor } from './champion-unlocks.js';

const CAPTURE_TTL_MS = 60000;   // a capture that was never ended (an error mid-vote) must not swallow toasts for long
let session = null;

export function beginVoteProgress(now = Date.now()) { session = { startedAt: now, events: [] }; }

export function isCapturingProgress(now = Date.now()) {
    if (session && now - session.startedAt > CAPTURE_TTL_MS) session = null;
    return !!session;
}

// Returns true when the event was captured (the caller then skips its own toast).
export function recordProgress(event, now = Date.now()) {
    if (!isCapturingProgress(now)) return false;
    session.events.push(event);
    return true;
}

export function endVoteProgress() {
    const events = session ? session.events : [];
    session = null;
    return events;
}

// The prestige skins an achievement unlocks, as [{ packId, num, name }].
export function skinsForAchievement(achievementId) {
    const out = [];
    for (const packId of ['jinx', 'vi', 'caitlyn']) {
        for (const s of skinsFor(packId)) if (s.achievement === achievementId) out.push({ packId, num: s.num, name: s.name });
    }
    return out;
}

// events: recorded during the vote. xpData: { totalXP, baseXP, bonuses }. packId / packXp: the active companion and its XP
// after the vote, for the mastery line.
export function buildProgressSummary({ events = [], xpData = {}, packId = null, packXp = 0 } = {}) {
    const voteXp = Number(xpData.totalXP) || 0;
    const levels = events.filter(e => e.type === 'level');
    const levelUp = levels.length ? { from: levels[0].from, to: levels[levels.length - 1].to, title: levels[levels.length - 1].title } : null;

    const achievements = events.filter(e => e.type === 'achievement').map(e => ({
        id: e.id, name: e.name, icon: e.icon || '', xp: Number(e.xp) || 0, rarity: e.rarity || '',
        skins: skinsForAchievement(e.id)
    }));
    const achievementXp = achievements.reduce((s, a) => s + a.xp, 0);

    const byPack = new Map();
    for (const e of events.filter(ev => ev.type === 'mastery')) {
        const cur = byPack.get(e.packId);
        if (!cur) byPack.set(e.packId, { packId: e.packId, from: e.from, to: e.to, skins: [...(e.skins || [])] });
        else { cur.to = e.to; cur.skins.push(...(e.skins || [])); }
    }
    const masteryUps = [...byPack.values()];

    let mastery = null;
    if (packId) {
        const m = masteryLevel(packXp);
        const next = nextUnlock(packId, m.level);
        mastery = {
            packId, level: m.level, isMax: m.isMax, progressXp: m.progressXp, neededXp: m.neededXp, percent: m.percent,
            nextLevel: next ? next.mastery : null, nextSkins: next ? next.skins.map(s => ({ num: s.num, name: s.name })) : []
        };
    }

    return {
        voteXp, achievementXp, totalXp: voteXp + achievementXp,
        levelUp, achievements, masteryUps, mastery,
        hasUnlocks: achievements.length > 0 || masteryUps.some(m => m.skins.length > 0),
        hasNews: !!levelUp || achievements.length > 0 || masteryUps.length > 0
    };
}
