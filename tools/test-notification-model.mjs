// node tools/test-notification-model.mjs
import assert from 'node:assert/strict';
import { pickUnshown, isSocialNotification, isSocialTabItem, isFollowNotification, followQuip, followHeadline, FOLLOW_QUIPS, isFollowBack, FOLLOW_BACK_QUIPS } from '../js/notification-model.js';
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
t('Social tab: follows (new-follower), likes, comments, mentions, replies and ally/rival alerts; not votes or achievements', () => {
    for (const type of ['new-follower', 'follow', 'like', 'comment', 'mention', 'reply']) assert.ok(isSocialTabItem({ type }), type);
    assert.ok(isSocialTabItem({ type: 'ally-vote', relationship: 'ally' })); assert.ok(isSocialTabItem({ type: 'rival-vote', relationship: 'opponent' }));
    for (const type of ['achievement', 'live-activity', 'causal-event']) assert.ok(!isSocialTabItem({ type }), type);
    assert.ok(!isSocialTabItem(null));
});
t('follow back: message detected, headline says "followed you back", own quip pool', () => {
    const fb = { id: 'x1', triggerUsername: 'Kai', message: 'Kai followed you back' };
    assert.ok(isFollowBack(fb)); assert.ok(!isFollowBack({ message: 'Kai started following you' })); assert.ok(!isFollowBack(null));
    assert.equal(followHeadline(fb), 'Kai followed you back');
    assert.ok(FOLLOW_BACK_QUIPS.includes(followQuip(fb))); assert.ok(!FOLLOW_QUIPS.includes(followQuip(fb)));
});

t('follow notifications: type check, headline, stable quip', () => {
    assert.ok(isFollowNotification({ type: 'new-follower' })); assert.ok(isFollowNotification({ type: 'follow' })); assert.ok(!isFollowNotification({ type: 'like' }));
    assert.equal(followHeadline({ triggerUsername: 'Kai' }), 'Kai followed you'); assert.equal(followHeadline({}), 'Someone followed you');
    const a = followQuip({ id: 'abc123' }); assert.equal(a, followQuip({ id: 'abc123' })); assert.ok(FOLLOW_QUIPS.includes(a));
    assert.ok(FOLLOW_QUIPS.includes(followQuip(null)));
});
console.log(`${pass} passed`);
