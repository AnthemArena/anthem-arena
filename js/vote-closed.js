// What the two big vote buttons should say when a match is NOT open for voting. Pure (no DOM), unit-tested in Node:
//   node tools/test-vote-closed.mjs
//
// Before this, a finished match still showed two big "Vote for ..." buttons (clicking one only said "Voting is not open").
// Now they become a result: the winner is marked, the other side says it lost, and the percentages are shown.

/** 'open' | 'upcoming' | 'closed'.  `now` is a ms timestamp (passed in so tests need no clock). */
export function votingState(match, now = Date.now()) {
    if (!match) return 'open';
    if (match.status === 'completed') return 'closed';
    if (match.status === 'upcoming') return 'upcoming';
    if (match.status === 'live' && match.endDate) {
        const end = new Date(match.endDate).getTime();
        if (Number.isFinite(end) && end <= now) return 'closed';   // deadline passed, not yet closed by the admin
    }
    return 'open';
}

/**
 * Button text for one side. side: 'song1' | 'song2'.
 * Returns { text, winner }.  winner is true for the side that won (only known once the match is completed).
 */
export function closedButton(match, side, state) {
    if (state === 'upcoming') return { text: 'Voting opens soon', winner: false };
    const winnerSide = match?.status === 'completed' && match.winnerId
        ? (match.winnerId === match.competitor1?.videoId ? 'song1' : match.winnerId === match.competitor2?.videoId ? 'song2' : null)
        : null;
    if (!winnerSide) return { text: 'Voting closed', winner: false };
    return side === winnerSide ? { text: 'Won this match', winner: true } : { text: 'Lost this match', winner: false };
}
