// Pure helper: how much of a cup a voter has taken part in, stage by stage. No DOM, no Firebase.
//
//   buildParticipation({ matches, votes, cupId }) -> { overallPercentage, totalVotes, totalPossible, byStage: [row...], current }
//
// matches  the cup's matches from /api/matches (any status)
// votes    the user's vote docs ({ matchId })
// Only matches that have OPENED count (not "upcoming"), and only real pairings (no TBD slots). Measuring against a whole
// 384-match group stage would leave everyone near 0% while the groups open one at a time.

const real = c => c && c.id && c.id !== 'TBD';
const idOf = m => m.matchId || m.id;

export const stageLabel = m => (m.stage === 'group' ? 'Group stage' : (m.roundLabel || `Round ${m.round ?? 1}`));

export function shortStage(label) {
    const s = String(label || '');
    if (/^group/i.test(s)) return 'Groups';
    const r = s.match(/round of (\d+)/i); if (r) return `R${r[1]}`;
    if (/quarter/i.test(s)) return 'QF';
    if (/semi/i.test(s)) return 'SF';
    if (/^final/i.test(s)) return 'F';
    return s;
}

// Under 1% would round to a flat 0%, which reads as "nothing": one decimal there instead.
export function percent(part, whole) {
    if (!whole) return 0;
    const x = (part / whole) * 100;
    return x > 0 && x < 1 ? Math.max(0.1, Math.round(x * 10) / 10) : Math.round(x);
}

export function buildParticipation({ matches = [], votes = [], cupId = null } = {}) {
    const opened = (Array.isArray(matches) ? matches : []).filter(m =>
        m && m.song1 && m.song2 && m.status !== 'upcoming' && real(m.song1) && real(m.song2) && (!cupId || !m.tournament || m.tournament === cupId));
    const voted = new Set((votes || []).map(v => v && v.matchId).filter(Boolean));

    const stages = new Map();
    for (const m of opened) {
        const label = stageLabel(m);
        if (!stages.has(label)) stages.set(label, { label, order: (m.stage === 'group' ? 0 : 1000) + (Number(m.round) || 0), total: 0, voted: 0, live: false });
        const s = stages.get(label);
        s.total++;
        if (voted.has(idOf(m))) s.voted++;
        if (m.status === 'live') s.live = true;
    }
    const byStage = [...stages.values()].sort((a, b) => a.order - b.order).map(s => ({
        label: s.label, short: shortStage(s.label), voted: s.voted, total: s.total, live: s.live, percentage: percent(s.voted, s.total)
    }));

    const totalPossible = opened.length;
    const totalVotes = opened.filter(m => voted.has(idOf(m))).length;
    return {
        overallPercentage: percent(totalVotes, totalPossible),
        totalVotes, totalPossible, byStage,
        current: byStage.find(s => s.live && s.voted < s.total) || null
    };
}
