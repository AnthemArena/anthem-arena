import assert from 'node:assert/strict';
import { voteFacts, factsOf, isUnderdog, voteXpAward, utcDay, achievementVote, buildVoteRecord, winningSide, backedWinner } from '../js/vote-facts.js';

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

// ---- the saved vote record ----
const song = { name: 'Edit A' }, other = { name: 'Edit B' };
const cast = { facts: { underdog: true, close: false, againstTide: true, early: false, tiedBefore: false, sharePct: 35, totalVotesAtTime: 20 }, timestamp: 1000, votedForSeed: 9, votedForVideoId: 'vid1' };
let rec = buildVoteRecord({ songId: 'song1', votedSong: song, opponentSong: other, round: 2, cast, activePack: 'vi', now: 5 });
assert.deepEqual(rec.facts, { underdog: true, close: false, againstTide: true, early: false, tiedBefore: false });
assert.equal(rec.sharePct, 35); assert.equal(rec.totalVotesAtTime, 20); assert.equal(rec.timestamp, 1000);
assert.equal(rec.votedForVideoId, 'vid1'); assert.equal(rec.votedForSeed, 9); assert.equal(rec.voteType, 'underdog'); assert.equal(rec.championId, 'vi');
// a plain revisit leaves an existing record alone (same object, same facts)
assert.equal(buildVoteRecord({ existing: rec, songId: 'song1', votedSong: song, opponentSong: other, activePack: 'jinx' }), rec);
// a new device: the saved vote document brings the facts and the original time and companion
rec = buildVoteRecord({ songId: 'song2', votedSong: song, opponentSong: other, cast: { facts: { close: true, sharePct: 50, totalVotesAtTime: 12 }, timestamp: 777, championId: 'caitlyn' }, activePack: 'jinx', now: 5 });
assert.equal(rec.facts.close, true); assert.equal(rec.timestamp, 777); assert.equal(rec.championId, 'caitlyn'); assert.equal(rec.voteType, 'closeCall');
// an old vote document has no facts: record is saved without them (read the old way), with the document's time
rec = buildVoteRecord({ songId: 'song1', votedSong: song, opponentSong: other, cast: { facts: null, timestamp: 321, championId: 'jinx' }, now: 5 });
assert.equal(rec.facts, undefined); assert.equal(rec.timestamp, 321); assert.equal(rec.voteType, 'balanced');
// an existing record without facts is upgraded when the document has them; one with facts is never replaced
const legacy = { songId: 'song1', timestamp: 50, championId: 'jinx', voteType: 'balanced' };
rec = buildVoteRecord({ existing: legacy, songId: 'song1', votedSong: song, opponentSong: other, cast: { facts: { early: true, totalVotesAtTime: 3, sharePct: 50 }, timestamp: 900 }, now: 5 });
assert.equal(rec.facts.early, true); assert.equal(rec.championId, 'jinx');
const full = { songId: 'song1', facts: { early: false }, timestamp: 1 };
assert.equal(buildVoteRecord({ existing: full, songId: 'song1', votedSong: song, opponentSong: other, cast: { facts: { early: true } } }), full);
// switching the pick on the same match is a different vote: a fresh record
rec = buildVoteRecord({ existing: full, songId: 'song2', votedSong: song, opponentSong: other, cast: null, now: 42 });
assert.equal(rec.songId, 'song2'); assert.equal(rec.timestamp, 42);

// ---- who won ----
const done = (winnerId, extra = {}) => ({ status: 'completed', winnerId, song1: { id: 'a', videoId: 'va' }, song2: { id: 'b', videoId: 'vb' }, ...extra });
assert.equal(winningSide(done('a')), 'song1');                       // the song's id
assert.equal(winningSide(done('vb')), 'song2');                      // the video id
assert.equal(winningSide(done('song2')), 'song2');                   // the slot name
assert.equal(winningSide({ status: 'completed', winnerId: 'vb', competitor1: { videoId: 'va' }, competitor2: { videoId: 'vb' } }), 'song2');   // the vote page's shape
assert.equal(winningSide(done('zzz')), null);                        // cannot be told
assert.equal(winningSide(done(null)), null);
assert.equal(winningSide(done('a', { status: 'live' })), null);      // reopened: an old winner does not count
assert.equal(winningSide(null), null);
assert.equal(winningSide({ winnerId: 'a', song1: { id: 'a' }, song2: { id: 'b' } }), 'song1');   // old docs with no status
assert.equal(backedWinner({ choice: 'song1', match: done('a') }), true);
assert.equal(backedWinner({ choice: 'song2', match: done('a') }), false);
assert.equal(backedWinner({ choice: 'song1' }), false);              // match no longer available
assert.equal(backedWinner({ choice: 'song1', match: done('a', { status: 'live' }) }), false);

console.log('vote-facts tests passed');
