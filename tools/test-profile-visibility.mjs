// The profile's rule for votes in live matches, and the neutral vote sentence.   node tools/test-profile-visibility.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isClosed, backedMost, arrangeVotes, lockedLabel, matchIdent, voteLocked, matchLabel, lockedVoteText } from '../js/profile-visibility.js';
import { addBlock, isHiddenFor } from '../js/moderation-model.js';
import { votePostText, votePostParts } from '../js/vote-post-text.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
t('backedMost: needs 2+ picks and a real order', () => {
    const e = (id, count) => ({ id, count });
    assert.deepEqual(backedMost([e('a', 1), e('b', 1)]), []);
    assert.deepEqual(backedMost([e('a', 3), e('b', 2), e('c', 1)]).map(x => x.id), ['a', 'b']);
    assert.deepEqual(backedMost([e('a', 4), e('b', 2), e('c', 2), e('d', 2)]).map(x => x.id), ['a'], 'tie at the cut-off is dropped');
    assert.deepEqual(backedMost([e('a', 3), e('b', 3), e('c', 2)]).map(x => x.id), ['a', 'b', 'c']);
});
t('blocking from a profile hides that person\'s posts in the Feed (same block list, same check)', () => {
    const blocked = addBlock({}, 'u_owner', 'Owner');
    assert.ok(isHiddenFor({ userId: 'u_owner', type: 'user_post' }, { blocked, viewerId: 'me' }));
    assert.ok(!isHiddenFor({ userId: 'someone_else' }, { blocked, viewerId: 'me' }));
});
t('locked rows: labelled with the match number and put last, in match-number order', () => {
    const m = (id, n, status) => ({ id, status, matchNumber: n, roundLabel: 'Group A' });
    assert.equal(matchIdent(m('a', 3)), 'Match 3'); assert.equal(matchIdent({}), '');
    assert.equal(lockedLabel(m('a', 3), 'Jinx Cup 1'), 'Jinx Cup 1 · Group A · Match 3');
    const rows = [m('x', 9, 'live'), m('y', 2, 'completed'), m('z', 4, 'live'), m('w', 1, 'live')];
    const order = arrangeVotes(rows, { getMatch: r => r, getId: r => r.id }).map(r => r.id);
    assert.deepEqual(order, ['y', 'w', 'z', 'x'], 'readable first, then locked by match number');
    const voted = arrangeVotes(rows, { getMatch: r => r, getId: r => r.id, viewerVoted: id => id === 'x' }).map(r => r.id);
    assert.deepEqual(voted, ['x', 'y', 'w', 'z']);
    assert.deepEqual(arrangeVotes(rows, { getMatch: r => r, getId: r => r.id, isOwner: true }).map(r => r.id), ['x', 'y', 'z', 'w']);
});
const live = { status: 'live' }, done = { status: 'completed' };

t('closed means completed; status wins over an old winnerId', () => {
    assert.ok(isClosed(done)); assert.ok(!isClosed(live)); assert.ok(!isClosed({ status: 'live', winnerId: 'x' }));
    assert.ok(isClosed({ winnerId: 'x' }), 'old documents with no status'); assert.ok(!isClosed(null));
});
t('a pick in a live match is hidden from a visitor who has not voted in it', () => assert.ok(voteLocked(live, { isOwner: false, viewerVoted: false })));
t('...shown once the visitor has voted in it', () => assert.ok(!voteLocked(live, { isOwner: false, viewerVoted: true })));
t('...shown to everyone once the match has closed', () => assert.ok(!voteLocked(done, { isOwner: false, viewerVoted: false })));
t('...and always shown to the owner', () => assert.ok(!voteLocked(live, { isOwner: true, viewerVoted: false })));
t('with no match to judge by, nothing is locked (the card shows its own error)', () => assert.ok(!voteLocked(null, {})));
t('the label names the cup and the stage, and falls back sensibly', () => {
    assert.equal(matchLabel({ tournamentName: 'Jinx Cup 1', roundLabel: 'Group A' }), 'Jinx Cup 1 · Group A');
    assert.equal(matchLabel({ roundLabel: 'Group A' }, 'Jinx Cup 1'), 'Jinx Cup 1 · Group A');
    assert.equal(matchLabel({ round: 2 }, 'Jinx Cup 1'), 'Jinx Cup 1 · Round 2');
    assert.equal(matchLabel({}), 'Arcane Moments');
});
t('locked sentence', () => assert.equal(lockedVoteText('Jinx Cup 1 · Group A'), 'Voted in Jinx Cup 1 · Group A. Vote in it to see who they picked.'));

t('the vote sentence names the pick and the opponent, nothing else', () => {
    assert.equal(votePostText({ votedSongName: 'A', opponentSongName: 'B' }), 'voted for A over B');
    assert.equal(votePostText({ votedMomentName: 'A', opponentMomentName: 'B', text: 'just cast a deciding vote! A vs B is TOO close!' }), 'voted for A over B', 'stored text is ignored');
    assert.equal(votePostText({ songTitle: 'A' }), 'voted for A');
    assert.equal(votePostText({ votedSongName: 'A - X #tag', opponentSongName: 'B' }, s => s.replace(/ #\w+/, '')), 'voted for A - X over B');
    assert.deepEqual(votePostParts({ votedName: 'A', opponentName: 'B' }), { lead: 'voted for', voted: 'A', joiner: 'over', opponent: 'B' });
});
t('the post writer no longer stores or phrases how a match stands', () => {
    const src = fs.readFileSync(new URL('../js/social-feed.js', import.meta.url), 'utf8');
    assert.ok(!/matchState/.test(src), 'no matchState'); assert.ok(!/TOO close|dominating|nail-biter|tipped the scales/i.test(src), 'no standings wording');
    assert.ok(/votePostText/.test(src));
});
console.log(`\n${n} tests passed`);
