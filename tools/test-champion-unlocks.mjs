import assert from 'node:assert/strict';
import { resolveLook, MASTERY_XP, SKIN_UNLOCKS, masteryLevel, skinsFor, isSkinUnlocked, unlockedSkins, skinsUnlockedBetween, nextUnlock, usableSkin } from '../js/champion-unlocks.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

t('mastery curve: levels at the agreed XP and progress inside a level', () => {
    assert.deepEqual(MASTERY_XP, [0, 100, 300, 600, 1000, 1600, 2400, 3500, 5000, 7500]);
    assert.equal(masteryLevel(0).level, 1);
    assert.equal(masteryLevel(99).level, 1);
    assert.equal(masteryLevel(100).level, 2);
    const p = masteryLevel(200);
    assert.deepEqual([p.level, p.progressXp, p.neededXp, p.nextLevelXp, p.percent], [2, 100, 200, 300, 50]);
    assert.equal(masteryLevel(7499).level, 9);
    const top = masteryLevel(99999);
    assert.deepEqual([top.level, top.isMax, top.percent, top.nextLevelXp], [10, true, 100, null]);
    assert.equal(masteryLevel('x').level, 1); assert.equal(masteryLevel(-5).level, 1);
});
t('skin counts match the Data Dragon lists (no chromas)', () => {
    assert.equal(skinsFor('jinx').length, 16);
    assert.equal(skinsFor('vi').length, 14);
    assert.equal(skinsFor('caitlyn').length, 21);
    for (const id of Object.keys(SKIN_UNLOCKS)) {
        const nums = skinsFor(id).map(s => s.num);
        assert.equal(new Set(nums).size, nums.length, id + ' has a skin twice');
        assert.ok(skinsFor(id).every(s => s.name && (s.mastery >= 1 && s.mastery <= 10 || /^[a-z-]+$/.test(s.achievement))));
        assert.equal(skinsFor(id).find(s => s.num === 0).mastery, 1, id + ' classic is free');
    }
});
t('Arcane season 1 at mastery 2, season 2 at mastery 10', () => {
    const at = (p, num) => skinsFor(p).find(s => s.num === num);
    assert.equal(at('jinx', 37).mastery, 2); assert.equal(at('jinx', 60).mastery, 10);
    assert.equal(at('vi', 29).mastery, 2); assert.equal(at('vi', 48).mastery, 10);
    assert.equal(at('caitlyn', 28).mastery, 2); assert.equal(at('caitlyn', 50).mastery, 10);
});
t('prestige skins need their achievement', () => {
    assert.equal(skinsFor('caitlyn').filter(s => s.achievement).length, 3);
    const prestige = skinsFor('jinx').find(s => s.num === 40);
    assert.equal(isSkinUnlocked(prestige, { level: 10 }), false);
    assert.equal(isSkinUnlocked(prestige, { level: 1, achievements: ['jinx-loose-cannon'] }), true);
});
t('unlocked skins grow with the level', () => {
    assert.deepEqual(unlockedSkins('vi', { level: 1 }).map(s => s.num), [0]);
    assert.deepEqual(unlockedSkins('vi', { level: 2 }).map(s => s.num), [0, 29]);
    assert.equal(unlockedSkins('vi', { level: 10 }).length, 14);
    assert.equal(unlockedSkins('jinx', { level: 10 }).length, 15);   // all but the achievement skin
    assert.equal(unlockedSkins('caitlyn', { level: 10 }).length, 18);
});
t('level-up lists what it unlocks (also across several levels)', () => {
    assert.deepEqual(skinsUnlockedBetween('jinx', 1, 2).map(s => s.name), ['Arcane Enemy']);
    assert.deepEqual(skinsUnlockedBetween('caitlyn', 2, 3).map(s => s.name), ['Officer', 'Sheriff']);
    assert.deepEqual(skinsUnlockedBetween('vi', 7, 9).map(s => s.name), ['Primal Ambush', 'T1']);
    assert.deepEqual(skinsUnlockedBetween('vi', 3, 3), []);
});
t('next unlock and the fall-back to the classic look', () => {
    assert.deepEqual(nextUnlock('vi', 1).skins.map(s => s.name), ['Arcane Undercity']);
    assert.equal(nextUnlock('vi', 10), null);
    assert.equal(usableSkin('vi', 29, { level: 1 }), 0);
    assert.equal(usableSkin('vi', 29, { level: 2 }), 29);
    assert.equal(usableSkin('vi', 999, { level: 10 }), 0);
    assert.equal(usableSkin('nobody', 29, { level: 10 }), 0);
});
t('look: chosen skin if unlocked, else Arcane once unlocked, else classic', () => {
    assert.equal(resolveLook('jinx', undefined, { level: 1 }), 0);
    assert.equal(resolveLook('jinx', undefined, { level: 2 }), 37);
    assert.equal(resolveLook('jinx', 0, { level: 5 }), 0);              // choosing the classic look sticks
    assert.equal(resolveLook('jinx', 13, { level: 5 }), 13);
    assert.equal(resolveLook('jinx', 60, { level: 5 }), 37);            // chosen skin still locked: falls back to Arcane
    assert.equal(resolveLook('jinx', 40, { level: 10 }), 37);           // prestige needs its achievement
    assert.equal(resolveLook('jinx', 40, { level: 1, achievements: ['jinx-loose-cannon'] }), 40);
    assert.equal(resolveLook('vi', undefined, { level: 2 }), 29);
    assert.equal(resolveLook('caitlyn', undefined, { level: 3 }), 28);
    assert.equal(resolveLook('default', 5, { level: 10 }), 0);
});
console.log(`\n${n} passed`);
