import assert from 'node:assert/strict';
import { voteFacts, factsOf, isUnderdog, voteXpAward, utcDay, achievementVote } from '../js/vote-facts.js';

const e = (votes, seed, pot) => ({ votes, seed, pot });

// underdog: pots first, seed gap fallback, never without seeds
assert.equal(isUnderdog(e(0, 40, 3), e(0, 5, 1)), true);
assert.equal(isUnderdog(e(0, 20, 2), e(0, 5, 1)), false);        // one pot apart is not an underdog
assert.equal(isUnderdog(e(0, 20, 4), e(0, 5, 1)), true);
assert.equal(isUnderdog(e(0, 20, 1), e(0, 5, 3)), false);        // favourite
assert.equal(isUnderdog(e(0, 20, null), e(0, 12, null)), true);   // seed gap 8
assert.equal(isUnderdog(e(0, 18, null), e(0, 12, null)), false);
assert.equal(isUnderdog(e(0, null), e(0, 3)), false);

// share rules need 10 votes in
let f = voteFacts({ voted: e(3, 1, 1), other: e(2, 2, 1) });
assert.equal(f.close, false); assert.equal(f.againstTide, false); assert.equal(f.early, true);
f = voteFacts({ voted: e(10, 1), other: e(10, 2) });
assert.equal(f.close, true); assert.equal(f.tiedBefore, true); assert.equal(f.early, false); assert.equal(f.sharePct, 50);
f = voteFacts({ voted: e(8, 1), other: e(12, 2) });               // 40%
assert.equal(f.againstTide, true); assert.equal(f.close, false);
f = voteFacts({ voted: e(9, 1), other: e(11, 2) });               // 45%
assert.equal(f.close, true); assert.equal(f.againstTide, false);
f = voteFacts({ voted: e(12, 1), other: e(8, 2) });               // 60%
assert.equal(f.close, false); assert.equal(f.againstTide, false);
f = voteFacts({ voted: e(5, 1), other: e(4, 2) });                // 9 votes: early, no share rules
assert.equal(f.early, true); assert.equal(f.close, false);
f = voteFacts({ voted: e(5, 1), other: e(5, 2) });                // exactly 10: not early
assert.equal(f.early, false); assert.equal(f.close, true);

// legacy records
assert.deepEqual(factsOf({ voteType: 'closeCall', totalVotesAtTime: 3 }), { underdog: false, close: true, againstTide: false, early: true, tiedBefore: false });
assert.equal(factsOf({ voteType: 'underdog' }).againstTide, true);
assert.equal(factsOf({ facts: { underdog: true } }).underdog, true);
assert.equal(factsOf(null).early, false);

// XP
let x = voteXpAward({ facts: {}, firstVoteToday: false });
assert.deepEqual([x.totalXP, x.bonuses.length], [10, 0]);
x = voteXpAward({ facts: { underdog: true, close: true, early: true }, firstVoteToday: true, streak: 3 });
assert.equal(x.totalXP, 10 + 20 + 10 + 5 + 10 + 5);
assert.ok(x.bonuses.some(b => b.type === 'Day 3 streak'));
x = voteXpAward({ facts: {}, firstVoteToday: true, streak: 1 });
assert.equal(x.totalXP, 30);
x = voteXpAward({ facts: {}, firstVoteToday: true, streak: 11 });
assert.equal(x.totalXP, 30);                                       // streak bonus stops after day 10
x = voteXpAward({ facts: {}, firstVoteToday: false, streak: 5 });
assert.equal(x.totalXP, 10);                                       // only on the first vote of the day

assert.equal(utcDay(Date.UTC(2026, 0, 2, 23, 59)), '2026-01-02');

// achievement vote shape
const v = achievementVote('m1', { songId: 'song1', facts: { close: true }, timestamp: 5, championId: 'jinx', votedForSeed: 4 }, { round: 2 });
assert.equal(v.round, 2); assert.equal(v.facts.close, true); assert.equal(v.votedForSeed, 4);

console.log('vote-facts tests passed');
