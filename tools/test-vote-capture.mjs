import assert from 'node:assert/strict';

// minimal browser stand-ins
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const toasts = [];
globalThis.window = { showBulletin: t => toasts.push(t), updateNavProfile() {}, championLoader: null, location: {} };

const { addXP } = await import('../js/rank-system.js');
const { beginVoteProgress, endVoteProgress, buildProgressSummary } = await import('../js/vote-progress.js');
const { readPackXp, addPackXp } = await import('../js/xp-ledger.js');

function reset() { store.clear(); toasts.length = 0; localStorage.setItem('userTotalXP', '95'); addPackXp(localStorage, 'jinx', 95); }

// inside a vote: nothing toasts, the events are collected, the summary reads them
reset();
beginVoteProgress();
addXP(10);                                    // 95 -> 105: level 1 -> 2, and Jinx mastery 1 -> 2 (100 pack XP)
const events = endVoteProgress();
assert.equal(toasts.length, 0, 'no toast during a vote');
assert.deepEqual(events.map(e => e.type).sort(), ['level', 'mastery']);
const sum = buildProgressSummary({ events, xpData: { totalXP: 10 }, packId: 'jinx', packXp: readPackXp(localStorage).jinx });
assert.deepEqual([sum.levelUp.from, sum.levelUp.to], [1, 2]);
assert.equal(sum.masteryUps[0].to, 2);
assert.deepEqual(sum.masteryUps[0].skins.map(s => s.name), ['Arcane Enemy']);
assert.equal(sum.mastery.level, 2);
assert.equal(sum.hasUnlocks, true);

// outside a vote (a share, a profile visit): they toast as before
reset();
addXP(10);
assert.deepEqual(toasts.map(t => t.type).sort(), ['level-up', 'mastery-up']);

// a capture that was ended is closed: the next award toasts again
reset();
beginVoteProgress(); endVoteProgress();
addXP(10);
assert.equal(toasts.length, 2);

// an award that changes nothing records nothing
reset(); localStorage.setItem('userTotalXP', '10');
beginVoteProgress(); addXP(1);
assert.equal(endVoteProgress().length, 0);

console.log('vote capture tests passed');
