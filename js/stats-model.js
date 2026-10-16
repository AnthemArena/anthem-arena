// ========================================
// STATS MODEL - pure helpers for the Stats page (stats.html)
// Everything is worked out from the list of match documents, so it is easy to test in Node.
// ========================================
import { allGroupStandings } from './group-builder.js';
import { shortTitle } from './title-clean.js';

const nameOf = c => shortTitle(c?.shortTitle || c?.title || '', 60);
const real = c => c && c.id && c.id !== 'TBD';
const winnerSide = m => (m.winnerId && (m.winnerId === m.song1?.id || m.winnerId === 'song1') ? 1
    : m.winnerId && (m.winnerId === m.song2?.id || m.winnerId === 'song2') ? 2 : 0);

function matchSummary(m) {
    const v1 = m.song1?.votes || 0, v2 = m.song2?.votes || 0, total = v1 + v2;
    const p1 = total ? (v1 / total) * 100 : 50;
    return { matchId: m.matchId, label: m.roundLabel || '', status: m.status, edit1: nameOf(m.song1), edit2: nameOf(m.song2),
        votes1: v1, votes2: v2, total, percent1: p1, percent2: 100 - p1, gap: Math.abs(v1 - v2), lean: Math.abs(50 - p1) };
}

export function computeStats(matches = []) {
    const list = (Array.isArray(matches) ? matches : []).filter(m => m && m.song1 && m.song2);
    const by = { completed: 0, live: 0, upcoming: 0 };
    let totalVotes = 0;
    const edits = new Map();
    const touch = c => {
        if (!edits.has(c.id)) edits.set(c.id, { id: c.id, title: nameOf(c), creator: c.artist || '', videoId: c.videoId || '', votes: 0, against: 0, wins: 0, losses: 0, played: 0 });
        return edits.get(c.id);
    };
    const rounds = new Map();
    const voted = [];

    for (const m of list) {
        if (by[m.status] !== undefined) by[m.status]++;
        const v1 = m.song1.votes || 0, v2 = m.song2.votes || 0;
        totalVotes += m.totalVotes ?? (v1 + v2);
        const label = m.roundLabel || `Round ${m.round}`;
        if (!rounds.has(label)) rounds.set(label, { label, round: m.round || 0, group: m.stage === 'group', total: 0, completed: 0 });
        const r = rounds.get(label); r.total++; if (m.status === 'completed') r.completed++;

        if (real(m.song1)) touch(m.song1); if (real(m.song2)) touch(m.song2);
        if (v1 + v2 > 0) voted.push(m);
        if (m.status !== 'completed' && m.status !== 'live') continue;
        const a = real(m.song1) ? touch(m.song1) : null, b = real(m.song2) ? touch(m.song2) : null;
        if (a) { a.votes += v1; a.against += v2; }
        if (b) { b.votes += v2; b.against += v1; }
        if (m.status === 'completed') {
            const w = winnerSide(m);
            if (a) { a.played++; if (w === 1) a.wins++; else if (w === 2) a.losses++; }
            if (b) { b.played++; if (w === 2) b.wins++; else if (w === 1) b.losses++; }
        }
    }

    const rows = [...edits.values()].map(e => ({ ...e, share: e.votes + e.against ? (e.votes / (e.votes + e.against)) * 100 : 0, record: `${e.wins}-${e.losses}` }));
    const sums = voted.map(matchSummary);
    const pick = (cmp) => sums.reduce((best, s) => (!best || cmp(s, best) ? s : best), null);
    const finished = sums.filter(s => s.status === 'completed' && s.total > 0);
    const mostVotedEdit = rows.reduce((b, e) => (!b || e.votes > b.votes ? e : b), null);
    const bestShare = rows.filter(e => e.played > 0).reduce((b, e) => (!b || e.share > b.share ? e : b), null);

    const groups = allGroupStandings(list);
    return {
        totalVotes, totalMatches: list.length, completed: by.completed, live: by.live, upcoming: by.upcoming,
        editCount: rows.length, groupCount: groups.length, groupsComplete: groups.filter(g => g.complete).length,
        rows, groups,
        rounds: [...rounds.values()].sort((a, b) => a.round - b.round),
        records: {
            mostVotedMatch: pick((s, b) => s.total > b.total),
            closest: finished.reduce((b, s) => (!b || s.lean < b.lean ? s : b), null),
            blowout: finished.reduce((b, s) => (!b || s.lean > b.lean ? s : b), null),
            mostVotedEdit: mostVotedEdit && mostVotedEdit.votes > 0 ? mostVotedEdit : null,
            bestShare: bestShare && bestShare.share > 0 ? bestShare : null
        }
    };
}

export const SORTS = {
    votes: (a, b) => b.votes - a.votes || b.wins - a.wins,
    share: (a, b) => (b.played > 0) - (a.played > 0) || b.share - a.share || b.votes - a.votes,
    wins: (a, b) => b.wins - a.wins || b.share - a.share || b.votes - a.votes
};
export function sortRows(rows, key = 'votes') { return [...rows].sort(SORTS[key] || SORTS.votes); }
