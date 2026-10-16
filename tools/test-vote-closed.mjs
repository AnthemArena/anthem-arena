// The closed-match state of the vote buttons.   node tools/test-vote-closed.mjs
import assert from 'node:assert/strict';
import { votingState, closedButton } from '../js/vote-closed.js';
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const match = (o = {}) => ({ status: 'completed', winnerId: 'vidA', competitor1: { videoId: 'vidA' }, competitor2: { videoId: 'vidB' }, ...o });

test('completed is closed, upcoming is upcoming, live with time left is open', () => {
    assert.equal(votingState(match(), NOW), 'closed');
    assert.equal(votingState(match({ status: 'upcoming' }), NOW), 'upcoming');
    assert.equal(votingState(match({ status: 'live', endDate: new Date(NOW + 3600e3).toISOString() }), NOW), 'open');
    assert.equal(votingState(match({ status: 'live' }), NOW), 'open');
});
test('a live match whose deadline has passed counts as closed (the "Voting Closed" timer case)', () => {
    assert.equal(votingState(match({ status: 'live', endDate: new Date(NOW - 1000).toISOString() }), NOW), 'closed');
    assert.equal(votingState(match({ status: 'live', endDate: 'not a date' }), NOW), 'open');
    assert.equal(votingState(null, NOW), 'open');
});
test('the winner is marked and the other side says it lost, in plain words (no "out", no "eliminated")', () => {
    const m = match();
    assert.deepEqual(closedButton(m, 'song1', 'closed'), { text: 'Won this match', winner: true });
    assert.deepEqual(closedButton(m, 'song2', 'closed'), { text: 'Lost this match', winner: false });
    const w2 = match({ winnerId: 'vidB' });
    assert.equal(closedButton(w2, 'song2', 'closed').winner, true);
    for (const s of ['song1', 'song2']) assert.ok(!/out|elimin/i.test(closedButton(m, s, 'closed').text));
});
test('no known winner (deadline passed, or an unmatched id) just says "Voting closed"', () => {
    assert.equal(closedButton(match({ status: 'live', winnerId: null }), 'song1', 'closed').text, 'Voting closed');
    assert.equal(closedButton(match({ winnerId: 'other' }), 'song2', 'closed').text, 'Voting closed');
});
test('an upcoming match says voting opens soon on both buttons', () => {
    for (const s of ['song1', 'song2']) assert.equal(closedButton(match({ status: 'upcoming', winnerId: null }), s, 'upcoming').text, 'Voting opens soon');
});
console.log(`\n${passed} tests passed`);
