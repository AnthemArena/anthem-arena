// ========================================
// VOTE FACTS (pure, no browser, no Firebase)
// ========================================
// What was true at the moment a vote was cast, worked out once and saved with the vote. XP, achievements and the post-vote
// summary all read these, so a vote means the same thing today as it did when it was cast. The rules, in one place:
//
//   underdog      you backed the edit seeded at least two pots lower (a pot is a quarter of the field). Without pot data
//                 (older brackets) the fallback is seeded at least 8 places lower. No seeds: never an underdog.
//   close         the two edits were within 45-55% of the votes, with at least 10 votes in.
//   againstTide   the edit you backed was behind by 60-40 or more (40% or less), with at least 10 votes in.
//   early         you were among the first 10 voters (fewer than 10 votes in before yours).
//   tiedBefore    the edits were exactly level with 10 or more votes in (your vote broke the tie).
//
// The 10-vote minimum keeps a 2-1 or 1-0 start from counting as "close" or "behind".

export const MIN_VOTES_FOR_SHARE_RULES = 10;
export const CLOSE_BAND = { min: 45, max: 55 };
export const AGAINST_TIDE_MAX_SHARE = 40;
export const EARLY_VOTER_LIMIT = 10;
export const UNDERDOG_POT_GAP = 2;
export const UNDERDOG_SEED_GAP_FALLBACK = 8;

const isNum = v => typeof v === 'number' && Number.isFinite(v);

// `voted` / `other`: { votes, seed, pot } for the two edits as they stood just before the vote was counted.
export function isUnderdog(voted, other) {
    if (!voted || !other) return false;
    if (isNum(voted.pot) && isNum(other.pot)) return voted.pot - other.pot >= UNDERDOG_POT_GAP;
    if (isNum(voted.seed) && isNum(other.seed)) return voted.seed - other.seed >= UNDERDOG_SEED_GAP_FALLBACK;
    return false;
}

export function voteFacts({ voted, other }) {
    const v = Number(voted?.votes) || 0, o = Number(other?.votes) || 0, total = v + o;
    const enough = total >= MIN_VOTES_FOR_SHARE_RULES;
    const sharePct = total > 0 ? Math.round((v / total) * 100) : 50;
    return {
        sharePct,
        totalVotesAtTime: total,
        underdog: isUnderdog(voted, other),
        close: enough && sharePct >= CLOSE_BAND.min && sharePct <= CLOSE_BAND.max,
        againstTide: enough && sharePct <= AGAINST_TIDE_MAX_SHARE,
        early: total < EARLY_VOTER_LIMIT,
        tiedBefore: enough && v === o
    };
}

// One vote's facts from whatever was saved. Records saved before this model have only a share-based `voteType`
// ('underdog' = under 40%, 'closeCall' = 40-60%) and `totalVotesAtTime`; they are read as closely as that allows.
export function factsOf(vote) {
    const f = vote?.facts;
    if (f && typeof f === 'object') {
        return { underdog: !!f.underdog, close: !!f.close, againstTide: !!f.againstTide, early: !!f.early, tiedBefore: !!f.tiedBefore };
    }
    return {
        underdog: vote?.voteType === 'underdog',
        close: vote?.voteType === 'closeCall',
        againstTide: vote?.voteType === 'underdog',
        early: isNum(vote?.totalVotesAtTime) ? vote.totalVotesAtTime < EARLY_VOTER_LIMIT : false,
        tiedBefore: !!vote?.tiedBefore
    };
}

// ---------- XP for one vote ----------
export const VOTE_XP = { vote: 10, firstVoteOfDay: 20, streakDay: 10, streakDaysPaid: 10, underdog: 5, close: 10, early: 5, share: 5 };

export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

// facts: from voteFacts(); firstVoteToday: no earlier vote on this UTC day; streak: consecutive vote days ending today
// (1 on the first day). The streak bonus is 10 XP on each of the first 10 days of a run, so a long streak is worth at most 100.
export function voteXpAward({ facts = {}, firstVoteToday = false, streak = 1 } = {}) {
    const bonuses = [];
    if (firstVoteToday) bonuses.push({ type: 'First vote today', xp: VOTE_XP.firstVoteOfDay });
    if (firstVoteToday && streak >= 2 && streak <= VOTE_XP.streakDaysPaid) bonuses.push({ type: `Day ${streak} streak`, xp: VOTE_XP.streakDay });
    if (facts.underdog) bonuses.push({ type: 'Underdog pick', xp: VOTE_XP.underdog });
    if (facts.close) bonuses.push({ type: 'Close match', xp: VOTE_XP.close });
    if (facts.early) bonuses.push({ type: 'Early voter', xp: VOTE_XP.early });
    const totalXP = VOTE_XP.vote + bonuses.reduce((s, b) => s + b.xp, 0);
    return { totalXP, baseXP: VOTE_XP.vote, bonuses };
}

// The vote shape the achievement code reads (js/achievement-tracker.js), built from a saved record and the match it was for.
export function achievementVote(matchId, saved, match) {
    const f = factsOf(saved);
    return {
        matchId,
        timestamp: saved.timestamp || Date.now(),
        facts: f,
        voteType: saved.voteType,
        championId: saved.championId,
        tiedBefore: f.tiedBefore,
        round: match?.round || saved.round || 1,
        votedForSeed: saved.votedForSeed ?? null,
        votedForName: saved.songTitle || null,
        choice: saved.songId,
        match: match || {}
    };
}
