import assert from 'node:assert/strict';
import { rule, METRICS } from '../js/champion-achievements/templates.js';
import { ACHIEVEMENTS } from '../js/achievements.js';
import { championStats } from '../js/achievement-tracker.js';

// champion scope reads only that champion's numbers
const r = rule('early', 10, { packId: 'vi' });
assert.equal(r.condition({ earlyVotes: 99, byChampion: { jinx: { earlyVotes: 99 } } }), false);
assert.equal(r.condition({ byChampion: { vi: { earlyVotes: 10 } } }), true);
assert.deepEqual(r.progress({ byChampion: { vi: { earlyVotes: 4 } } }), { current: 4, target: 10 });
assert.deepEqual(r.progress({}), { current: 0, target: 10 });
// all scope reads the general numbers
const a = rule('deciding', 1, { packId: 'caitlyn', scope: 'all' });
assert.equal(a.condition({ decidingVotes: 1 }), true); assert.equal(a.condition({ byChampion: { caitlyn: { decidingVotes: 5 } } }), false);
assert.throws(() => rule('nope', 1, { packId: 'x' }));
assert.throws(() => rule('early', 1));
// every metric has a champion stat that championStats really produces
const sample = championStats([{ championId: 'x', timestamp: 1, facts: {} }]).x;
for (const [name, m] of Object.entries(METRICS)) assert.ok(m.champion in sample, `championStats has no ${m.champion} (rule ${name})`);

// the new achievements, end to end
const day = n => Date.UTC(2026, 0, n);
const votes = [
    ...Array.from({ length: 10 }, (_, i) => ({ championId: 'vi', timestamp: day(1 + i), facts: { early: true } })),
    ...Array.from({ length: 5 }, (_, i) => ({ championId: 'jinx', timestamp: day(1 + i), facts: { againstTide: true, underdog: true } }))
];
const stats = { byChampion: championStats(votes), earlyVotes: 10 };
assert.equal(ACHIEVEMENTS['vi-door-breaker'].condition(stats), true);
assert.equal(ACHIEVEMENTS['vi-heavy-hitter'].condition(stats), false);          // 10 of 30 votes
assert.deepEqual(ACHIEVEMENTS['vi-heavy-hitter'].progress(stats), { current: 10, target: 30 });
assert.equal(ACHIEVEMENTS['jinx-chaos-agent'].condition(stats), true);
assert.equal(ACHIEVEMENTS['jinx-loose-cannon'].condition(stats), false);        // 5 of 10 underdogs
assert.ok(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[\d.]+\/img\/spell\/ViQ\.png$/.test(ACHIEVEMENTS['vi-door-breaker'].icon));
// distinct days, not a count of votes
const dayVotes = [1, 1, 1, 2, 3, 3].map((d, i) => ({ championId: 'jinx', timestamp: Date.UTC(2026, 0, d, 10 + i), facts: { underdog: true } }))
    .concat([{ championId: 'jinx', timestamp: Date.UTC(2026, 0, 9), facts: {} }, { championId: 'vi', timestamp: Date.UTC(2026, 0, 10), facts: { underdog: true } }]);
assert.equal(championStats(dayVotes).jinx.underdogDays, 3);
assert.equal(championStats(dayVotes).vi.underdogDays, 1);
const trouble = ACHIEVEMENTS['jinx-troublemaker'];
assert.deepEqual(trouble.progress({ byChampion: championStats(dayVotes) }), { current: 3, target: 5 });
assert.equal(trouble.condition({ byChampion: { jinx: { underdogDays: 5 } } }), true);
assert.throws(() => rule('underdogDays', 1, { scope: 'all' }));
// Right Call: backing the winner, per champion, only for finished matches
const finished = (win, choice, champ) => ({ championId: champ, timestamp: 1, choice, facts: {}, match: { status: 'completed', winnerId: win, song1: { id: 'a' }, song2: { id: 'b' } } });
const rc = [...Array.from({ length: 15 }, () => finished('a', 'song1', 'vi')), finished('a', 'song2', 'vi'), finished('a', 'song1', 'jinx'), { championId: 'vi', timestamp: 1, choice: 'song1', facts: {} }];
assert.equal(championStats(rc).vi.backedWinners, 15); assert.equal(championStats(rc).jinx.backedWinners, 1);
assert.equal(ACHIEVEMENTS['vi-right-call'].condition({ byChampion: championStats(rc) }), true);
assert.deepEqual(ACHIEVEMENTS['vi-right-call'].progress({ byChampion: championStats(rc.slice(0, 5)) }), { current: 5, target: 15 });
assert.throws(() => rule('backedWinner', 1, { scope: 'all' }));
console.log('achievement rules tests passed');
