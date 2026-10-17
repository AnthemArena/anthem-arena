import assert from 'node:assert/strict';
import { compareVotes, tasteLabel, pickTitle } from '../js/taste-match.js';
const t = (n, f) => { f(); console.log('  ok  ', n); };
const v = (matchId, choice, ts = 0, extra = {}) => ({ matchId, choice, timestamp: ts, ...extra });
t('counts agree / disagree only on matches both voted in', () => {
    const r = compareVotes([v('a', 'song1'), v('b', 'song2'), v('c', 'song1'), v('only-me', 'song1')], [v('a', 'song1'), v('b', 'song1'), v('c', 'song1'), v('only-them', 'song2')]);
    assert.equal(r.shared, 3); assert.equal(r.agreeCount, 2); assert.equal(r.disagreeCount, 1); assert.equal(r.pct, 67); assert.equal(r.label, 'Similar taste');
});
t('nothing in common gives null percent and no label', () => {
    const r = compareVotes([v('a', 'song1')], [v('b', 'song1')]);
    assert.equal(r.shared, 0); assert.equal(r.pct, null); assert.equal(r.label, null);
});
t('bad data is ignored and duplicates counted once', () => {
    const r = compareVotes([v('a', 'song1'), { matchId: 'x', choice: 'nope' }, null], [v('a', 'song1'), v('a', 'song2'), v('x', 'song1'), undefined]);
    assert.equal(r.shared, 1); assert.equal(r.agreeCount, 1);
});
t('labels stay neutral below 3 shared matches', () => {
    assert.equal(tasteLabel(100, 2), 'Just getting started'); assert.equal(tasteLabel(100, 3), 'Kindred spirits'); assert.equal(tasteLabel(50, 4), 'Mixed opinions'); assert.equal(tasteLabel(0, 5), 'Natural rivals');
});
t('lists are newest first and titles come from the match', () => {
    const m = { song1: { title: 'A' }, song2: { title: 'B' } };
    const r = compareVotes([v('a', 'song1', 1, { match: m }), v('b', 'song1', 5, { match: m })], [v('a', 'song2', 1, { match: m }), v('b', 'song2', 5, { match: m })]);
    assert.deepEqual(r.disagree.map(x => x.matchId), ['b', 'a']);
    assert.equal(pickTitle(r.disagree[0], 'yours'), 'A'); assert.equal(pickTitle(r.disagree[0], 'theirs'), 'B');
});
console.log('5 passed');
