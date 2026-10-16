import assert from 'node:assert/strict';
import { planTag, eligible } from '../tools/edits-tag.mjs';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const mk = (i, extra = {}) => ({ videoId: 'v' + String(i).padStart(4, '0'), id: 'v' + i, title: 'E' + i, group: 'jinx', status: 'ok', views: 1000 - i, likes: 100 - (i % 50), tournaments: [], ...extra });
const pool = n => Array.from({ length: n }, (_, i) => mk(i));

t('tags exactly the top N by seed', () => {
    const p = planTag(pool(12), { cupId: 'c-1', count: 8 });
    assert.equal(p.errors.length, 0); assert.equal(p.chosen.length, 8); assert.equal(p.spares.length, 4);
    assert.equal(p.edits.filter(e => e.tournaments.includes('c-1')).length, 8);
    assert.ok(p.edits.find(e => e.videoId === 'v0000').tournaments.includes('c-1'));
    assert.ok(!p.edits.find(e => e.videoId === 'v0011').tournaments.includes('c-1'));
});
t('is repeatable (same input twice, same result; nothing changes the second time)', () => {
    const a = planTag(pool(12), { cupId: 'c-1', count: 8 });
    const b = planTag(a.edits, { cupId: 'c-1', count: 8 });
    assert.equal(b.changes.added, 0); assert.equal(b.changes.removed, 0);
});
t('keeps other cup tags and untags the cup from edits that fell out', () => {
    const e = pool(12).map((x, i) => i === 11 ? { ...x, tournaments: ['old-cup', 'c-1'] } : i === 0 ? { ...x, tournaments: ['old-cup'] } : x);
    const p = planTag(e, { cupId: 'c-1', count: 8 });
    assert.deepEqual(p.edits[11].tournaments, ['old-cup']);
    assert.deepEqual(p.edits[0].tournaments, ['old-cup', 'c-1']);
    assert.equal(p.changes.removed, 1);
});
t('only the chosen group is eligible', () => {
    const e = [...pool(8), mk(50, { group: 'jinxandvi', views: 999999 })];
    const p = planTag(e, { cupId: 'c-1', count: 8 });
    assert.ok(!p.edits.find(x => x.videoId === 'v0050').tournaments.includes('c-1'));
    assert.equal(p.chosen.length, 8);
});
t('removed, non-ok and non-embeddable edits are not eligible', () => {
    assert.ok(!eligible(mk(1, { status: 'removed' }), 'jinx')); assert.ok(!eligible(mk(1, { embedAllowed: false }), 'jinx')); assert.ok(eligible(mk(1), 'jinx'));
});
t('errors: bad size, too few edits, bad cup id', () => {
    assert.ok(planTag(pool(20), { cupId: 'c-1', count: 10 }).errors.length);
    assert.ok(planTag(pool(5), { cupId: 'c-1', count: 8 }).errors[0].includes('Only 5'));
    assert.ok(planTag(pool(12), { cupId: 'Bad Cup!', count: 8 }).errors.length);
});
t('does not change its input', () => { const e = pool(12); const snap = JSON.stringify(e); planTag(e, { cupId: 'c-1', count: 8 }); assert.equal(JSON.stringify(e), snap); });
console.log(`${n} passed`);
