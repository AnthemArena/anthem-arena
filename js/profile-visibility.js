// profile-visibility.js: what a profile may show about votes in matches that are still open.
//
// The rule is the one used on the Feed and the vote page: who someone picked in a live match is only shown to people who have
// voted in that match themselves (or to the owner of the page). Once a match has closed, the pick is shown to everyone.
// Pure functions, no DOM, so tools/test-profile-visibility.mjs can test them.

// closed = completed. Trust `status` when it is set (a re-opened match can still carry an old winnerId); old documents with no status
// fall back to winnerId.
export const isClosed = m => !!m && (m.status ? m.status === 'completed' : !!m.winnerId);

// true when this vote's pick must stay hidden from this viewer
export function voteLocked(match, { isOwner = false, viewerVoted = false } = {}) {
    if (!match || isOwner) return false;
    return !isClosed(match) && !viewerVoted;
}

// "Jinx Cup 1 · Group A": the cup and the stage. Falls back to the round number, then to the site name.
export function matchLabel(match, cupName = '') {
    const cup = match?.tournamentName || cupName || 'Arcane Moments';
    const stage = match?.roundLabel || (match?.round ? `Round ${match.round}` : '');
    return stage ? `${cup} · ${stage}` : cup;
}

export const lockedVoteText = label => `Voted in ${label}. Vote in it to see who they picked.`;

/**
 * "Edits you backed most": only edits picked in 2+ matches count, and a tie at the cut-off is dropped
 * rather than broken arbitrarily. Returns [] when there is no real order to show.
 */
export function backedMost(entries, max = 3) {
    const ranked = entries.filter(e => e.count >= 2).sort((a, b) => b.count - a.count);
    if (ranked.length > max && ranked[max - 1].count === ranked[max].count) {
        const cut = ranked[max].count;
        return ranked.filter(e => e.count > cut);
    }
    return ranked.slice(0, max);
}

// "Match 3": the number the Brackets page shows. A stand-in so two locked rows can be told apart without saying anything about the pick.
export const matchIdent = m => (m && Number(m.matchNumber) > 0 ? `Match ${Number(m.matchNumber)}` : '');

// Label for a locked row: "Jinx Cup 1 · Group A · Match 3"
export function lockedLabel(match, cupName = '') {
    return [matchLabel({ ...match, tournamentName: '' }, cupName), matchIdent(match)].filter(Boolean).join(' · ');
}

/**
 * Puts rows the viewer may read first (in the order given) and locked rows last, by match number, so neither the position nor
 * the order of a locked row can hint at the pick. One rule for every list of someone's votes.
 *   rows: anything; getMatch(row) -> match; getId(row) -> matchId; viewerVoted(matchId) -> bool
 */
export function arrangeVotes(rows, { getMatch, getId, isOwner = false, viewerVoted = () => false }) {
    const open = [], locked = [];
    for (const r of rows) (voteLocked(getMatch(r), { isOwner, viewerVoted: viewerVoted(getId(r)) }) ? locked : open).push(r);
    locked.sort((a, b) => (Number(getMatch(a)?.matchNumber) || 0) - (Number(getMatch(b)?.matchNumber) || 0));
    return [...open, ...locked];
}
