// vote-post-text.js: the one sentence for an automatic vote post, used by the Feed, the profile Posts tab and notification text.
//
// It says who was picked over whom and nothing else: no percentages, no "too close", no "dominating". A post is written at the
// moment of the vote, so any line about how the match stands would be out of date by the time the match closes (and would tell
// people who have not voted how a live match is going). Text saved on older posts is ignored: it is rebuilt from the names.
export function votePostParts({ votedName, opponentName }) {
    return { lead: 'voted for', voted: votedName || 'an edit', joiner: 'over', opponent: opponentName || '' };
}

export function votePostText(post, tidy = s => s) {
    const voted = tidy(post?.votedMomentName || post?.votedSongName || post?.songTitle || '');
    const opponent = tidy(post?.opponentMomentName || post?.opponentSongName || '');
    const p = votePostParts({ votedName: voted, opponentName: opponent });
    return opponent ? `${p.lead} ${p.voted} ${p.joiner} ${p.opponent}` : `${p.lead} ${p.voted}`;
}

// While a live match is hidden from the viewer, a vote post names the two edits but not the pick. The order must not give the
// pick away (the picked edit is stored first), so it follows the video id instead. Returns [first, second] names.
export function lockedVoteNames(post, tidy = s => s) {
    const a = { id: post?.votedMomentId || post?.votedSongId || '', name: tidy(post?.votedMomentName || post?.votedSongName || post?.songTitle || '') || 'an edit' };
    const b = { id: post?.opponentMomentId || post?.opponentSongId || '', name: tidy(post?.opponentMomentName || post?.opponentSongName || '') };
    if (!b.name) return [a.name];
    return [a, b].sort((x, y) => String(x.id || x.name).localeCompare(String(y.id || y.name))).map(e => e.name);
}
