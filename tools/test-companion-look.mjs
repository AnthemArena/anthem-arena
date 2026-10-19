import assert from 'node:assert/strict';
import { lookSkin, saveLook, readLooks, lookState, TEST_UNLOCK_KEY } from '../js/companion-look.js';
import { companionStats } from '../js/achievement-tracker.js';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../js/achievements.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const store = (o = {}) => { const m = { ...o }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };

t('look: classic at mastery 1, Arcane at 2, the saved choice after that', () => {
    const J = { id: 'jinx' };
    assert.equal(lookSkin(J, store()), 0);
    assert.equal(lookSkin(J, store({ userPackXP: '{"jinx":100}' })), 37);
    const s = store({ userPackXP: '{"jinx":1000}' });
    saveLook('jinx', 13, s);
    assert.equal(lookSkin(J, s), 13);
    assert.deepEqual(readLooks(s), { jinx: 13 });
    assert.equal(lookSkin({ id: 'jinx' }, store({ userPackXP: '{"jinx":1}', companionSkins: '{"jinx":13}' })), 0);   // saved choice not unlocked yet
});
t('look: prestige skin needs the achievement; packs without skins keep their own portrait; bad storage is fine', () => {
    const base = { userPackXP: '{"jinx":99999}', companionSkins: '{"jinx":40}' };
    assert.equal(lookSkin({ id: 'jinx' }, store(base)), 37);
    assert.equal(lookSkin({ id: 'jinx' }, store({ ...base, unlockedAchievements: '["jinx-loose-cannon"]' })), 40);
    assert.equal(lookSkin({ id: 'default', portrait: { skin: 5 } }, store()), 5);
    assert.equal(lookSkin({ id: 'vi' }, store({ companionSkins: '{bad', userPackXP: 'x' })), 0);
    assert.equal(lookSkin({ id: 'vi' }, undefined), 0);
    assert.deepEqual(lookState('vi', store({ userPackXP: '{"vi":300}' })), { level: 3, achievements: [] });
});
t('companion stats: close calls and streak are per companion (old votes count as Jinx), tie-breakers count every vote', () => {
    const day = d => Date.parse(`2026-10-${String(d).padStart(2, '0')}T12:00:00Z`);
    const votes = [
        ...Array.from({ length: 4 }, () => ({ championId: 'jinx', voteType: 'underdog', timestamp: day(1) })),
        ...Array.from({ length: 3 }, () => ({ voteType: 'underdog', timestamp: day(1) })),            // old votes: Jinx
        ...Array.from({ length: 5 }, (_, i) => ({ championId: 'caitlyn', voteType: 'closeCall', timestamp: day(10 + i) })),
        { championId: 'caitlyn', voteType: 'mainstream', tiedBefore: true, timestamp: day(15) },
        { championId: 'vi', voteType: 'closeCall', tiedBefore: true, timestamp: day(15) }
    ];
    assert.deepEqual(companionStats(votes), { caitlynCloseVotes: 5, caitlynStreak: 6, decidingVotes: 2 });   // ties count for any champion
    assert.deepEqual(companionStats([]), { caitlynCloseVotes: 0, caitlynStreak: 0, decidingVotes: 0 });
});
t('the four pack achievements exist, are visible, belong to a category and match the unlock table', () => {
    const ids = Object.values(SKIN_UNLOCKS).flatMap(p => p.skins.filter(s => s.achievement).map(s => s.achievement));
    assert.equal(ids.length, 4);
    for (const id of ids) {
        const a = ACHIEVEMENTS[id];
        assert.ok(a, id + ' missing'); assert.equal(a.hidden, false); assert.ok(ACHIEVEMENT_CATEGORIES[a.category], id + ' category');
        assert.equal(a.condition({ underdogVotes: 99, decidingVotes: 99, byChampion: { caitlyn: { closeVotes: 99, streak: 99 }, jinx: { underdogVotes: 99 } } }), true);
        assert.equal(a.condition({ decidingVotes: 0, byChampion: { caitlyn: { closeVotes: 0, streak: 0 } } }), false);
        assert.ok(a.progress({ underdogVotes: 1, decidingVotes: 0, byChampion: { caitlyn: { closeVotes: 1, streak: 1 }, jinx: { underdogVotes: 1 } } }).target >= 1);
    }
});
t('look: the test-page switch opens every skin, including the prestige one, and only when set to 1', () => {
    const locked = store({ companionSkins: '{"jinx":40,"vi":48}' });
    assert.equal(lookSkin({ id: 'jinx' }, locked), 0);
    for (const v of ['0', 'yes']) assert.equal(lookSkin({ id: 'jinx' }, store({ companionSkins: '{"jinx":40}', [TEST_UNLOCK_KEY]: v })), 0);
    const open = store({ companionSkins: '{"jinx":40,"vi":48}', [TEST_UNLOCK_KEY]: '1' });
    assert.equal(lookSkin({ id: 'jinx' }, open), 40);
    assert.equal(lookSkin({ id: 'vi' }, open), 48);
});
console.log(`\n${n} passed`);
