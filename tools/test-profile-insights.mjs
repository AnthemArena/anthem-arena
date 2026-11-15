// Journey numbers and the shared stats image.   node tools/test-profile-insights.mjs
import assert from 'node:assert/strict';
import { enrichVotes, computeInsights, roundText, provisionalNote, MIN_CLOSED_VOTES_FOR_STYLE } from '../js/profile-insights.js';
import { standingBand, STANDING_BANDS } from '../js/vote-facts.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const song = (id, v) => ({ id, title: id, videoId: id, votes: v });
const vote = (id, status, label, mine = 10, theirs = 5, round = 1) => ({
    matchId: id, choice: 'song1', timestamp: Date.now(),
    match: { song1: song('a' + id, mine), song2: song('b' + id, theirs), status, round, roundLabel: label, winnerId: status === 'completed' ? 'a' + id : null }
});
t('roundText: a group stage match is "Group stage", anything else "Round N"', () => {
    assert.equal(roundText(1, 'Group A'), 'Group stage'); assert.equal(roundText(3, 'Semifinal'), 'Round 3'); assert.equal(roundText(1), 'Round 1');
});
t('furthestLabel and liveVotes', () => {
    const i = computeInsights(enrichVotes([vote(1, 'completed', 'Group A'), vote(2, 'live', 'Group B')]));
    assert.equal(i.furthestLabel, 'Group stage'); assert.equal(i.liveVotes, 1);
});
t('the share image never uses a pick from a live match', () => {
    const i = computeInsights(enrichVotes([vote(1, 'completed', 'Group A'), vote(2, 'live', 'Group B'), vote(3, 'live', 'Group B')]));
    assert.equal(i.shareFavoriteEdit.id, 'a1');
    assert.ok(!computeInsights(enrichVotes([vote(2, 'live', 'Group B')])).shareFavoriteEdit, 'only live picks: nothing to name');
});
t('standing bands: edges at 39, 40, 60, 61; 50-50 is a close call; an empty match is unclassified', () => {
    assert.deepEqual(STANDING_BANDS, { underdogBelow: 40, mainstreamAbove: 60 });
    const b = pct => standingBand(pct, 10);
    assert.equal(b(39), 'underdog'); assert.equal(b(40), 'closeCall'); assert.equal(b(50), 'closeCall');
    assert.equal(b(60), 'closeCall'); assert.equal(b(61), 'mainstream');
    assert.equal(standingBand(50, 0), 'unclassified');
});
t('the three pick types always add up to the classified votes (no vote falls between tiles)', () => {
    // one vote at every share from 0 to 100, plus one in an empty match
    const votes = [];
    for (let p = 0; p <= 100; p++) votes.push(vote('m' + p, 'completed', 'Group A', p, 100 - p));
    votes.push(vote('empty', 'live', 'Group A', 0, 0));
    const i = computeInsights(enrichVotes(votes));
    assert.equal(i.underdogPicks + i.mainstreamPicks + i.closeCalls + i.unclassified, i.totalVotes);
    assert.equal(i.unclassified, 1);
});
t('the note above the tiles names Influential votes and the unclassified votes', () => {
    const i = computeInsights(enrichVotes([vote(1, 'live', 'Group A', 0, 0), vote(2, 'completed', 'Group A')]));
    const note = provisionalNote(i);
    assert.match(note, /Influential/); assert.match(note, /nobody has voted/);
    assert.equal(provisionalNote(computeInsights(enrichVotes([vote(2, 'completed', 'Group A')]))), '');
    assert.equal(MIN_CLOSED_VOTES_FOR_STYLE, 5);
    assert.equal(i.closedVotes, 1);
});
console.log(n + ' tests passed');
