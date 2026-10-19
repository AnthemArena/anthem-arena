import assert from 'node:assert/strict';
import { ACHIEVEMENTS, GENERAL_ACHIEVEMENTS, achievementCompletion, getChampionAchievements } from '../js/achievements.js';
import { CHAMPION_ACHIEVEMENTS, CHAMPION_IDS, MAX_PER_CHAMPION, MAX_XP_PER_CHAMPION } from '../js/champion-achievements/index.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
import { companionStats, championStats } from '../js/achievement-tracker.js';

const REQUIRED = ['id', 'name', 'description', 'icon', 'xp', 'category', 'rarity', 'condition'];
const packIds = Object.keys(SKIN_UNLOCKS);

// ids: unique, equal to their key, complete
const ids = Object.values(ACHIEVEMENTS).map(a => a.id);
assert.equal(new Set(ids).size, ids.length, 'duplicate achievement id');
for (const [key, a] of Object.entries(ACHIEVEMENTS)) {
    assert.equal(a.id, key, `key/id mismatch: ${key}`);
    for (const f of REQUIRED) assert.ok(a[f] !== undefined && a[f] !== '', `${key} is missing ${f}`);
    assert.equal(typeof a.condition, 'function', `${key}.condition`);
}
assert.equal(Object.keys(ACHIEVEMENTS).length, Object.keys(GENERAL_ACHIEVEMENTS).length + CHAMPION_IDS.reduce((n, p) => n + Object.keys(CHAMPION_ACHIEVEMENTS[p]).length, 0));

// namespaces: a pack-prefixed id lives only in that champion's file; general ids never carry a pack prefix
for (const id of Object.keys(GENERAL_ACHIEVEMENTS)) {
    for (const p of [...packIds, ...CHAMPION_IDS]) assert.ok(!id.startsWith(p + '-'), `general achievement ${id} uses the ${p} namespace`);
}
for (const [packId, list] of Object.entries(CHAMPION_ACHIEVEMENTS)) {
    for (const [id, a] of Object.entries(list)) {
        assert.ok(id.startsWith(packId + '-'), `${id} must start with ${packId}-`);
        assert.equal(a.champion, packId); assert.equal(a.category, 'companions');
    }
    // budget
    const items = Object.values(list);
    assert.ok(items.length <= MAX_PER_CHAMPION, `${packId} has too many achievements`);
    assert.ok(items.reduce((s, a) => s + a.xp, 0) <= MAX_XP_PER_CHAMPION, `${packId} is over its XP budget`);
}

// skins and achievements name each other
for (const [packId, pack] of Object.entries(SKIN_UNLOCKS)) {
    for (const s of pack.skins.filter(x => x.achievement)) {
        const a = ACHIEVEMENTS[s.achievement];
        assert.ok(a, `${packId} skin ${s.name} names a missing achievement ${s.achievement}`);
        assert.equal(a.champion, packId, `${s.achievement} must belong to ${packId}`);
    }
}
for (const a of Object.values(ACHIEVEMENTS).filter(x => x.champion)) {
    assert.ok(SKIN_UNLOCKS[a.champion]?.skins.some(s => s.achievement === a.id), `${a.id} unlocks no skin (add it to SKIN_UNLOCKS or make it a general achievement)`);
}

// completion is separate: a champion's achievements never change the general percentage
const all = Object.keys(GENERAL_ACHIEVEMENTS);
const c = achievementCompletion(all);
assert.equal(c.general.percentage, 100); assert.equal(c.general.total, all.length);
assert.equal(c.byChampion.caitlyn.unlocked, 0); assert.equal(c.byChampion.caitlyn.total, getChampionAchievements('caitlyn').length);
assert.equal(achievementCompletion([...all, 'caitlyn-close-calls']).general.percentage, 100);

// per-champion stats come only from votes cast with that champion
const day = n => Date.UTC(2026, 0, n);
const votes = [
    { championId: 'caitlyn', timestamp: day(1), facts: { close: true } },
    { championId: 'caitlyn', timestamp: day(2), facts: { close: true, tiedBefore: true } },
    { championId: 'jinx', timestamp: day(2), facts: { underdog: true } },
    { timestamp: day(3), facts: { underdog: true } }                 // no champion saved: Jinx
];
const by = championStats(votes);
assert.deepEqual([by.caitlyn.votes, by.caitlyn.closeVotes, by.caitlyn.streak, by.caitlyn.decidingVotes], [2, 2, 2, 1]);
assert.deepEqual([by.jinx.votes, by.jinx.underdogVotes], [2, 2]);
assert.equal(companionStats(votes).caitlynCloseVotes, 2);
assert.equal(by.vi, undefined);
const stats = { byChampion: by };
assert.equal(ACHIEVEMENTS['caitlyn-close-calls'].progress(stats).current, 2);
assert.equal(ACHIEVEMENTS['caitlyn-steady-aim'].progress({}).current, 0);   // no champion data: zero, not a crash

console.log('achievement registry tests passed');
