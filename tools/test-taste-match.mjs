import assert from 'node:assert/strict';
import { compareVotes, tasteLabel, tasteTier, pickTitle, pickThumb } from '../js/taste-match.js';
const t = (n, f) => { f(); console.log('  ok  ', n); };
const v = (matchId, choice, ts = 0, extra = {}) => ({ matchId, choice, timestamp: ts, ...extra });
t('counts agree / disagree only on matches both voted in', () => {
    const r = compareVotes([v('a', 'song1'), v('b', 'song2'), v('c', 'song1'), v('only-me', 'song1')], [v('a', 'song1'), v('b', 'song1'), v('c', 'song1'), v('only-them', 'song2')]);
    assert.equal(r.shared, 3); assert.equal(r.agreeCount, 2); assert.equal(r.disagreeCount, 1); assert.equal(r.pct, 67); assert.equal(r.label, 'Similar taste'); assert.equal(r.tier.tone, 'agree');
});
t('nothing in common gives null percent and no label', () => {
    const r = compareVotes([v('a', 'song1')], [v('b', 'song1')]);
    assert.equal(r.shared, 0); assert.equal(r.pct, null); assert.equal(r.label, null);
});
t('bad data is ignored and duplicates counted once', () => {
    const r = compareVotes([v('a', 'song1'), { matchId: 'x', choice: 'nope' }, null], [v('a', 'song1'), v('a', 'song2'), v('x', 'song1'), undefined]);
    assert.equal(r.shared, 1); assert.equal(r.agreeCount, 1);
});
t('under 3 shared matches: neutral text, no percent', () => {
    assert.deepEqual(tasteTier(0, 2), { label: '2 matches in common', tone: 'none', showPct: false });
    assert.equal(tasteTier(100, 1).label, '1 match in common');
});
t('every ratio gets the right label', () => {
    const L = (pct, n = 10) => tasteLabel(pct, n);
    assert.equal(L(100), 'Soul mates'); assert.equal(L(100, 4), 'Kindred spirits'); assert.equal(L(95), 'Kindred spirits'); assert.equal(L(90), 'Kindred spirits');
    assert.equal(L(80), 'Same wavelength'); assert.equal(L(75), 'Same wavelength'); assert.equal(L(70), 'Similar taste'); assert.equal(L(60), 'Similar taste');
    assert.equal(L(50), 'Split decision'); assert.equal(L(40), 'Split decision'); assert.equal(L(30), 'Different tastes'); assert.equal(L(25), 'Different tastes');
    assert.equal(L(20), 'Rivals'); assert.equal(L(10), 'Rivals'); assert.equal(L(0), 'Arch-rivals'); assert.equal(L(0, 4), 'Rivals');
});
t('tones: green for agreement, amber for split, pink for differing', () => {
    assert.equal(tasteTier(85, 8).tone, 'agree'); assert.equal(tasteTier(50, 8).tone, 'mixed'); assert.equal(tasteTier(10, 8).tone, 'differ');
});
t('edit thumbnails come from the match videoId', () => {
    const row = { yourChoice: 'song1', theirChoice: 'song2', match: { song1: { videoId: 'AAA' }, song2: {} } };
    assert.equal(pickThumb(row, 'yours'), 'https://img.youtube.com/vi/AAA/mqdefault.jpg'); assert.equal(pickThumb(row, 'theirs'), null);
});
t('lists are newest first and titles come from the match', () => {
    const m = { song1: { title: 'A' }, song2: { title: 'B' } };
    const r = compareVotes([v('a', 'song1', 1, { match: m }), v('b', 'song1', 5, { match: m })], [v('a', 'song2', 1, { match: m }), v('b', 'song2', 5, { match: m })]);
    assert.deepEqual(r.disagree.map(x => x.matchId), ['b', 'a']);
    assert.equal(pickTitle(r.disagree[0], 'yours'), 'A'); assert.equal(pickTitle(r.disagree[0], 'theirs'), 'B');
});
console.log('7 passed');
