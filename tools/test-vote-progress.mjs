import assert from 'node:assert/strict';
import { beginVoteProgress, endVoteProgress, recordProgress, isCapturingProgress, buildProgressSummary, skinsForAchievement } from '../js/vote-progress.js';
import { buildPostVoteModalHtml } from '../js/champion-modal.js';

// capture
assert.equal(recordProgress({ type: 'level' }), false);            // no capture: caller toasts
beginVoteProgress(1000);
assert.equal(isCapturingProgress(1500), true);
assert.equal(recordProgress({ type: 'level', from: 2, to: 3, title: 'Spark' }, 1500), true);
assert.equal(recordProgress({ type: 'level', from: 3, to: 4, title: 'Fuse' }, 1600), true);
const ev = endVoteProgress();
assert.equal(ev.length, 2); assert.equal(isCapturingProgress(), false);
beginVoteProgress(1000);
assert.equal(isCapturingProgress(1000 + 61000), false);            // stale capture expires
endVoteProgress();

// skins from achievements
assert.deepEqual(skinsForAchievement('jinx-loose-cannon'), [{ packId: 'jinx', num: 40, name: 'Prestige Battle Cat' }]);
assert.deepEqual(skinsForAchievement('first-blood'), []);

// summary
const events = [
    { type: 'achievement', id: 'jinx-loose-cannon', name: 'Loose Cannon', icon: '💥', xp: 200, rarity: 'epic' },
    { type: 'level', from: 2, to: 3, title: 'Spark' },
    { type: 'mastery', packId: 'jinx', from: 1, to: 2, skins: [{ num: 37, name: 'Arcane Enemy' }] },
    { type: 'mastery', packId: 'jinx', from: 2, to: 3, skins: [{ num: 1, name: 'Crime City' }, { num: 2, name: 'Firecracker' }] }
];
const sum = buildProgressSummary({ events, xpData: { totalXP: 35 }, packId: 'jinx', packXp: 320 });
assert.equal(sum.voteXp, 35); assert.equal(sum.achievementXp, 200); assert.equal(sum.totalXp, 235);
assert.deepEqual(sum.levelUp, { from: 2, to: 3, title: 'Spark' });
assert.equal(sum.masteryUps.length, 1); assert.equal(sum.masteryUps[0].from, 1); assert.equal(sum.masteryUps[0].to, 3);
assert.equal(sum.masteryUps[0].skins.length, 3);
assert.equal(sum.mastery.level, 3); assert.equal(sum.mastery.nextLevel, 4);
assert.deepEqual(sum.mastery.nextSkins.map(s => s.name), ['Zombie Slayer', 'Ambitious Elf']);
assert.equal(sum.hasUnlocks, true);

const quiet = buildProgressSummary({ events: [], xpData: { totalXP: 10 }, packId: 'jinx', packXp: 5 });
assert.equal(quiet.hasNews, false); assert.equal(quiet.levelUp, null); assert.equal(quiet.totalXp, 10);

// modal html
const base = { situationType: 'x', line: 'Hi', voteTitle: 'Edit', xp: { totalXP: 35, baseXP: 10, bonuses: [{ type: 'Close match', xp: 10 }] },
    rank: { currentLevel: { title: 'Spark', level: 3 }, nextLevel: { level: 4 }, progressXP: 5, xpForNextLevel: 100, progressPercentage: 5 }, championName: 'Jinx' };
let html = buildPostVoteModalHtml({ ...base, progress: sum });
assert.match(html, /\+235 XP/); assert.match(html, /\+200 achievements/);
assert.match(html, /Level 2 &rarr; 3/);
assert.match(html, /Unlocked/);
assert.match(html, /New skin: Crime City/); assert.match(html, /Achievement: Loose Cannon/);
assert.match(html, /Unlocks the Prestige Battle Cat skin for Jinx/);
assert.match(html, /data-wear-pack="jinx" data-wear-skin="40"/);
assert.match(html, /to mastery 4 &middot; unlocks Zombie Slayer, Ambitious Elf/);
html = buildPostVoteModalHtml({ ...base, progress: quiet });
assert.doesNotMatch(html, /Unlocked/); assert.doesNotMatch(html, /Level up/); assert.match(html, /Jinx mastery/);
html = buildPostVoteModalHtml(base);                                // no progress: unchanged from before
assert.match(html, /\+35 XP/); assert.doesNotMatch(html, /mastery/);
// escaping
html = buildPostVoteModalHtml({ ...base, progress: buildProgressSummary({ events: [{ type: 'achievement', id: 'x', name: '<b>Hi</b>', icon: 'https://x/y.png', xp: 5 }], xpData: { totalXP: 10 } }) });
assert.doesNotMatch(html, /<b>Hi/); assert.match(html, /<img class="pvm-unlock-img" src="https:\/\/x\/y.png"/);

console.log('vote-progress tests passed');
