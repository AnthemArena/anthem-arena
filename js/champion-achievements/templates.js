// ========================================
// ACHIEVEMENT RULES (shared by every champion file)
// ========================================
// A rule is a stat to read and a target. `rule('early', 10, { packId: 'vi' })` gives the condition and progress for "be among the
// first 10 voters in 10 matches with Vi active". The rules are written and tested once here; a champion file only chooses which
// rules it uses, the thresholds, and its own names and icons.
//   scope 'champion' (default): counts only votes cast with that companion active (stats.byChampion.<packId>)
//   scope 'all': counts every vote, whoever the companion was (the general stats)
// To add a rule: add it to METRICS and to the champion stats in js/achievement-tracker.js (championStats), then test it.

export const METRICS = {
    votes:       { champion: 'votes',          all: 'totalVotes' },
    underdog:    { champion: 'underdogVotes',  all: 'underdogVotes' },
    close:       { champion: 'closeVotes',     all: 'closeMatchVotes' },
    againstTide: { champion: 'againstTideVotes', all: 'comebackVotes' },
    early:       { champion: 'earlyVotes',     all: 'earlyVotes' },
    deciding:    { champion: 'decidingVotes',  all: 'decidingVotes' },
    streak:      { champion: 'streak',         all: 'votingStreak' }
};

export function rule(metric, target, { packId, scope = 'champion' } = {}) {
    const m = METRICS[metric];
    if (!m) throw new Error(`Unknown achievement rule: ${metric}`);
    if (scope === 'champion' && !packId) throw new Error('A champion rule needs a packId');
    const read = stats => Number(scope === 'champion' ? stats?.byChampion?.[packId]?.[m.champion] : stats?.[m.all]) || 0;
    return {
        metric, scope, target,
        condition: stats => read(stats) >= target,
        progress: stats => ({ current: read(stats), target })
    };
}
