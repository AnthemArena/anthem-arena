import assert from 'node:assert/strict';
import { GENERAL_ACHIEVEMENTS } from '../js/achievements.js';
import { groupCountFor, totalRoundsFor } from '../js/group-builder.js';
import { computeVoteStats } from '../js/achievement-tracker.js';

// What one cup can offer one voter (group cups: 3 group matches per edit, then one match per knockout round)
const cup = size => ({ size, rounds: totalRoundsFor(size), mostVotesForOneEdit: 3 + (totalRoundsFor(size) - 1), underdogMatches: groupCountFor(size) * 3 });
const typical = cup(32);   // the smallest cup we would run as a main event

// "same moment N times" cannot be asked for more than an edit can play in a typical cup
const loyalty = ['repeat-favourite', 'die-hard', 'obsession'].map(id => GENERAL_ACHIEVEMENTS[id]);
for (const a of loyalty) assert.ok(a.progress({}).target <= typical.mostVotesForOneEdit, `${a.id} needs ${a.progress({}).target} votes for one edit; a ${typical.size}-entry cup allows ${typical.mostVotesForOneEdit}`);
assert.equal(cup(64).mostVotesForOneEdit, 8);

// journey: rounds asked for must exist in the live 64-entry cup (6 rounds)
for (const id of ['two-round-journey', 'deep-into-the-bracket', 'all-the-way']) assert.ok(GENERAL_ACHIEVEMENTS[id].progress({}).target <= cup(64).rounds, `${id} is not reachable in the 64-entry cup`);

// two different edits with the same seed (in two cups) are two edits, not one
globalThis.localStorage = { getItem: () => null };
globalThis.sessionStorage = { getItem: () => null, setItem() {} };
const v = (extra) => ({ timestamp: Date.now(), round: 1, matchId: Math.random().toString(), facts: {}, ...extra });
let stats = computeVoteStats([v({ votedForSeed: 5, votedForVideoId: 'a' }), v({ votedForSeed: 5, votedForVideoId: 'b' }), v({ votedForSeed: 5, votedForVideoId: 'a' })]);
assert.equal(stats.maxSongVotes, 2);
stats = computeVoteStats([v({ votedForSeed: 5, votedForName: 'X' }), v({ votedForSeed: 5, votedForName: 'X' }), v({ votedForSeed: 5, votedForName: 'Y' })]);
assert.equal(stats.maxSongVotes, 2);
stats = computeVoteStats([v({ votedForSeed: 5 }), v({ votedForSeed: 5 })]);   // old records with only a seed
assert.equal(stats.maxSongVotes, 2);

console.log('achievement reachability tests passed');
