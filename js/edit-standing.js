// What one edit has done in the active cup, worked out from the cup's matches. Pure (no DOM), unit-tested in Node:
//   node tools/test-edit-standing.mjs
//
// The gallery shows this as a small badge. The words are about PROGRESS, not losing: "Group stage", "Reached the Round of 16",
// "Finalist". The win-loss record is not shown on the gallery (it stays on the bracket pages).
//
// Group cups: one lost match in a group does NOT end an edit's run. It is out only when its group is finished and it did not
// finish in the top two. (The old code called any edit with a single loss "out", which was wrong for a group cup.)
import { allGroupStandings } from './group-builder.js';

const isFinal = m => /-finals$/.test(m.matchId || '') || m.roundLabel === 'Final';
const winnerOf = m => m.winnerId || m.winner;
const inMatch = (m, id) => m.song1?.id === id || m.song2?.id === id;

// "Quarter-finals" -> "Quarter-finalist", "Round of 16" -> "Reached the Round of 16"
export function reachedLabel(roundLabel) {
    if (!roundLabel) return 'Finished their run';
    if (roundLabel === 'Final') return 'Finalist';
    if (roundLabel === 'Semi-finals') return 'Semi-finalist';
    if (roundLabel === 'Quarter-finals') return 'Quarter-finalist';
    return `Reached the ${roundLabel}`;
}

export function standingFor(edit, matches) {
    const mine = (matches || []).filter(m => inMatch(m, edit.id)).sort((a, b) => (a.round || 0) - (b.round || 0));
    if (!mine.length) return { kind: 'entered', label: 'Entered', wins: 0, losses: 0, reached: '', liveMatch: null };

    let wins = 0, losses = 0, champion = false, knockoutLoss = null;
    for (const m of mine) {
        if (m.status !== 'completed') continue;
        const winner = winnerOf(m);
        if (winner === edit.id) { wins++; if (isFinal(m)) champion = true; }
        else if (winner) { losses++; if (m.stage !== 'group') knockoutLoss = m; }
    }
    const liveMatch = mine.find(m => m.status === 'live') || null;
    const last = mine[mine.length - 1];
    const reached = (liveMatch || last).roundLabel || '';
    const base = { wins, losses, reached, liveMatch };

    if (champion) return { ...base, kind: 'champion', label: 'Champion', reached: 'Champion', liveMatch: null };
    if (knockoutLoss) return { ...base, kind: 'eliminated', label: reachedLabel(knockoutLoss.roundLabel), reached: knockoutLoss.roundLabel || '', liveMatch: null };

    const groupMatch = mine.find(m => m.stage === 'group');
    if (groupMatch) {
        const inKnockout = mine.some(m => m.stage !== 'group');
        if (!inKnockout) {
            const g = allGroupStandings(matches).find(x => x.name === groupMatch.group);
            const row = g?.rows.find(r => r.id === edit.id);
            if (g?.complete && row) {
                if (row.rank > 2) return { ...base, kind: 'eliminated', label: 'Group stage', reached: groupMatch.roundLabel || '', liveMatch: null };
                if (!liveMatch) return { ...base, kind: 'bracket', label: 'Through to the knockout', liveMatch: null };
            }
            if (liveMatch) return { ...base, kind: 'live', label: 'Live now' };
            return { ...base, kind: 'bracket', label: groupMatch.roundLabel || 'In the groups', liveMatch: null };
        }
        if (liveMatch) return { ...base, kind: 'live', label: 'Live now' };
        return { ...base, kind: 'bracket', label: 'In the knockout', liveMatch: null };
    }

    // a plain knockout cup: one lost match ends the run
    if (losses) {
        const lostIn = [...mine].reverse().find(m => m.status === 'completed' && winnerOf(m) && winnerOf(m) !== edit.id);
        return { ...base, kind: 'eliminated', label: reachedLabel(lostIn?.roundLabel), reached: lostIn?.roundLabel || '', liveMatch: null };
    }
    if (liveMatch) return { ...base, kind: 'live', label: 'Live now' };
    return { ...base, kind: 'bracket', label: 'In the bracket', liveMatch: null };
}
