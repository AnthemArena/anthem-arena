import assert from 'node:assert/strict';
import { readPackXp, addPackXp, mergePackXp, mergeXp, streakFromVotes, activePackId, cleanPackXp, backfillPackXp } from '../js/xp-ledger.js';
const mem = (o = {}) => { const m = { ...o }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

t('active pack: companionId, then championPack, then jinx', () => {
    assert.equal(activePackId(mem({ companionId: 'vi' })), 'vi');
    assert.equal(activePackId(mem({ championPack: 'caitlyn' })), 'caitlyn');
    assert.equal(activePackId(mem()), 'jinx');
});
t('pack XP adds up per companion and ignores junk', () => {
    const s = mem();
    addPackXp(s, 'vi', 30); addPackXp(s, 'vi', 20); addPackXp(s, 'jinx', 10); addPackXp(s, 'jinx', -5); addPackXp(s, 'jinx', 'x');
    assert.deepEqual(readPackXp(s), { vi: 50, jinx: 10 });
    assert.deepEqual(cleanPackXp({ a: 'z', b: -1, c: 7.9 }), { c: 7 });
    assert.deepEqual(readPackXp(mem({ userPackXP: '{bad' })), {});
});
t('old XP from before companions goes to the active companion, once', () => {
    assert.deepEqual(backfillPackXp({}, 450, 'vi'), { vi: 450 });
    assert.deepEqual(backfillPackXp({ jinx: 100 }, 450, 'vi'), { jinx: 100, vi: 350 });
    assert.deepEqual(backfillPackXp(backfillPackXp({ jinx: 100 }, 450, 'vi'), 450, 'vi'), { jinx: 100, vi: 350 });
    assert.deepEqual(backfillPackXp({ jinx: 500 }, 450, 'vi'), { jinx: 500 });
    assert.deepEqual(backfillPackXp({}, 50, 'nobody'), { jinx: 50 });
});
t('merge keeps the larger copy, per companion', () => {
    assert.deepEqual(mergePackXp({ jinx: 100, vi: 5 }, { jinx: 40, vi: 60, caitlyn: 3 }), { jinx: 100, vi: 60, caitlyn: 3 });
});
t('a cleared browser takes the profile numbers', () => {
    const m = mergeXp({ xp: 0, packXp: {} }, { xp: 450, packXp: { jinx: 450 } });
    assert.equal(m.xp, 450); assert.deepEqual(m.packXp, { jinx: 450 }); assert.equal(m.changedLocal, true); assert.equal(m.changedRemote, false);
});
t('a browser ahead of the profile updates the profile, not itself', () => {
    const m = mergeXp({ xp: 900, packXp: { jinx: 900 } }, { xp: 450, packXp: { jinx: 450 } });
    assert.equal(m.xp, 900); assert.equal(m.changedLocal, false); assert.equal(m.changedRemote, true);
});
t('equal copies change nothing; missing profile fields are fine', () => {
    const m = mergeXp({ xp: 10, packXp: { vi: 10 } }, { xp: 10, packXp: { vi: 10 } });
    assert.equal(m.changedLocal, false); assert.equal(m.changedRemote, false);
    assert.equal(mergeXp({ xp: 5 }, undefined).xp, 5);
    assert.equal(mergeXp(undefined, { xp: 'abc' }).xp, 0);
});
t('streak counts consecutive days ending at the latest vote', () => {
    const d = s => ({ timestamp: Date.parse(s + 'T12:00:00Z') });
    assert.equal(streakFromVotes([]), 0);
    assert.equal(streakFromVotes([d('2026-10-10'), d('2026-10-10')]), 1);
    assert.equal(streakFromVotes([d('2026-10-08'), d('2026-10-09'), d('2026-10-10')]), 3);
    assert.equal(streakFromVotes([d('2026-10-01'), d('2026-10-02'), d('2026-10-05'), d('2026-10-06')]), 2);
});
console.log(`\n${n} passed`);
