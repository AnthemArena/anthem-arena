// node tools/test-notification-model.mjs
import assert from 'node:assert/strict';
import { pickUnshown, isSocialNotification } from '../js/notification-model.js';
let pass = 0; const t = (n, f) => { f(); console.log('  ok  ', n); pass++; };
const now = 1_000_000, cutoff = now - 600_000;
const n = (id, o) => ({ id, shownAsToast: false, timestamp: now - 60_000, expiresAt: now + 1e6, ...o });
t('keeps fresh unshown, newest first', () => {
    const r = pickUnshown([n('a', { timestamp: now - 120_000 }), n('b', { timestamp: now - 30_000 })], cutoff, now);
    assert.deepEqual(r.map(x => x.id), ['b', 'a']);
});
t('drops shown, old and expired', () => {
    const r = pickUnshown([n('s', { shownAsToast: true }), n('o', { timestamp: cutoff - 1 }), n('e', { expiresAt: now - 1 }), n('ok')], cutoff, now);
    assert.deepEqual(r.map(x => x.id), ['ok']);
});
t('empty / null input is safe', () => { assert.deepEqual(pickUnshown(null, cutoff, now), []); assert.deepEqual(pickUnshown([null], cutoff, now), []); });
t('social = ally or opponent', () => { assert.ok(isSocialNotification({ relationship: 'ally' })); assert.ok(isSocialNotification({ relationship: 'opponent' })); assert.ok(!isSocialNotification({ type: 'like' })); assert.ok(!isSocialNotification(null)); });
console.log(`${pass} passed`);
