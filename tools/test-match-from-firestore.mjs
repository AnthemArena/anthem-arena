// The direct-Firestore fallback shapes a match document exactly as the edge function does.
// Run: node tools/test-match-from-firestore.mjs
import assert from 'node:assert/strict';
import { matchFromFirestore, plainValue } from '../js/match-from-firestore.js';
let passed = 0; const t = (n, f) => { f(); passed++; console.log('  ok  ' + n); };

t('timestamps become ISO strings, nested too', () => {
    const ts = { toDate: () => new Date('2026-11-14T18:00:00Z') };
    assert.equal(plainValue(ts), '2026-11-14T18:00:00.000Z');
    assert.deepEqual(plainValue({ a: { b: ts }, c: [ts, 1] }), { a: { b: '2026-11-14T18:00:00.000Z' }, c: ['2026-11-14T18:00:00.000Z', 1] });
});
t('the document id becomes id (an id already in the data wins)', () => {
    assert.equal(matchFromFirestore('m-1', { status: 'live' }).id, 'm-1');
    assert.equal(matchFromFirestore('m-1', { id: 'other' }).id, 'other');
});
t('totals and percentages come from the counters on the match', () => {
    const m = matchFromFirestore('m', { song1: { title: 'A', votes: 3 }, song2: { title: 'B', votes: 1 } });
    assert.equal(m.totalVotes, 4); assert.equal(m.song1.percentage, 75); assert.equal(m.song2.percentage, 25); assert.equal(m.song1.title, 'A');
});
t('no votes yet: 50 / 50, zero total, missing songs do not crash', () => {
    const m = matchFromFirestore('m', {});
    assert.equal(m.totalVotes, 0); assert.equal(m.song1.percentage, 50); assert.equal(m.song2.percentage, 50);
    assert.equal(matchFromFirestore('m', undefined).totalVotes, 0);
});
t('percentages always add up to 100', () => {
    for (const [a, b] of [[1, 2], [1, 6], [5, 5], [99, 1], [1, 0]]) {
        const m = matchFromFirestore('m', { song1: { votes: a }, song2: { votes: b } });
        assert.equal(m.song1.percentage + m.song2.percentage, 100);
    }
});
t('the match fields are not changed (status, dates, results)', () => {
    const m = matchFromFirestore('m', { status: 'completed', endDate: 'x', winnerId: 's1', round: 2 });
    assert.deepEqual([m.status, m.endDate, m.winnerId, m.round], ['completed', 'x', 's1', 2]);
});
console.log(`\n${passed} tests passed`);
