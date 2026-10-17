// node tools/test-notification-model.mjs
import assert from 'node:assert/strict';
import { pickUnshown, isSocialNotification, isSocialTabItem, isFollowNotification, followQuip, followHeadline, FOLLOW_QUIPS, isFollowBack, FOLLOW_BACK_QUIPS, groupNotifications, isContentNotification, contentHeadline, contentQuote, contentCta, contentIcon, mentionWhere, CONTENT_PRIORITY } from '../js/notification-model.js';
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
const L = (id, type, who, ts, extra = {}) => ({ id, type, triggerUsername: who, triggerUserId: who.toLowerCase(), targetUrl: '/feed.html#post-1', timestamp: ts, ...extra });
t('content notifications group per post and kind, not per person', () => {
    const g = groupNotifications([L('a', 'like', 'Kai', 1, { detail: 'my edit' }), L('b', 'like', 'Rex', 2, { detail: 'my edit' }), L('c', 'like', 'Mia', 3), L('d', 'like', 'Kai', 4, { targetUrl: '/feed.html#post-2' }), L('e', 'comment', 'Kai', 5, { detail: '"hi"' })]);
    assert.equal(g.length, 3);
    const likes1 = g.find(x => x.type === 'like' && x.targetUrl.endsWith('post-1'));
    assert.equal(likes1.count, 3); assert.deepEqual(likes1.users, ['Kai', 'Rex', 'Mia']); assert.equal(likes1.groupKind, 'content');
    assert.equal(likes1.detail, 'my edit');      // a later like without text does not blank the quote
    assert.ok(isContentNotification(likes1) && !isContentNotification({ type: 'achievement' }));
});
t('content headlines: one person, two, a crowd, repeat commenter, mention place', () => {
    const one = groupNotifications([L('a', 'like', 'Kai', 1)])[0];
    assert.equal(contentHeadline(one).headline, 'Kai liked your post');
    const two = groupNotifications([L('a', 'like', 'Kai', 1), L('b', 'like', 'Rex', 2)])[0];
    assert.equal(contentHeadline(two).headline, 'Kai and Rex liked your post');
    const crowd = groupNotifications(['Kai', 'Rex', 'Mia', 'Zed', 'Ana'].map((w, i) => L('i' + i, 'like', w, i + 1)))[0];
    const h = contentHeadline(crowd); assert.equal(h.headline, '5 people liked your post'); assert.equal(h.who, '5 people'); assert.equal(h.names, 'Kai, Rex, Mia +2 more');
    const twice = groupNotifications([L('a', 'comment', 'Kai', 1), L('b', 'comment', 'Kai', 2)])[0];
    assert.equal(contentHeadline(twice).headline, 'Kai commented 2 times on your post');
    assert.equal(contentHeadline(groupNotifications([L('a', 'reply', 'Kai', 1)])[0]).headline, 'Kai replied to your comment');
    const m = L('m', 'mention', 'Kai', 1, { message: '📢 Kai mentioned you in a reply', ctaText: 'View Reply' });
    assert.equal(mentionWhere(m), 'reply'); assert.equal(contentHeadline(groupNotifications([m])[0]).headline, 'Kai mentioned you in a reply');
    assert.equal(mentionWhere({ message: '', ctaText: 'View Comment' }), 'comment'); assert.equal(mentionWhere({}), 'post');
});
t('content quote: strips quotes, trims, skips placeholders; button text; priority order', () => {
    assert.equal(contentQuote({ detail: '"nice edit!"' }), 'nice edit!');
    assert.equal(contentQuote({ detail: 'your post' }), ''); assert.equal(contentQuote({}), '');
    const q = contentQuote({ detail: 'x'.repeat(300) }); assert.ok(q.length === 110 && q.endsWith('…'));
    assert.equal(contentCta({ type: 'like' }), 'View post'); assert.equal(contentCta({ type: 'comment', ctaText: 'View Comment' }), 'View comment'); assert.equal(contentCta({ type: 'mention', ctaText: 'View Reply' }), 'View reply'); assert.equal(contentCta({ type: 'mention' }), 'View post');
    assert.ok(CONTENT_PRIORITY.reply > CONTENT_PRIORITY.comment && CONTENT_PRIORITY.comment > CONTENT_PRIORITY.like);
});

t('emote notifications: grouped per match and kind, headline by emote type, icon, button, Social tab', () => {
    const E = (id, who, ts, eventType) => ({ id, type: 'emote-received', eventType, triggerUsername: who, triggerUserId: who.toLowerCase(), targetUrl: '/vote.html?match=m1', detail: 'Game on! 🎮', timestamp: ts });
    const g = groupNotifications([E('a', 'Kai', 1, 'rivalry'), E('b', 'Rex', 2, 'rivalry'), E('c', 'Kai', 3, 'props')]);
    assert.equal(g.length, 2);
    const riv = g.find(x => x.eventType === 'rivalry');
    assert.equal(contentHeadline(riv).headline, 'Kai and Rex challenged you');
    assert.equal(contentHeadline(g.find(x => x.eventType === 'props')).headline, 'Kai gave you props');
    assert.equal(contentHeadline({ type: 'emote-received', eventType: 'thanks', users: ['Kai'] }).headline, 'Kai sent you thanks');
    assert.equal(contentHeadline({ type: 'emote-received', eventType: 'hype', users: ['A', 'B', 'C'], count: 3 }).headline, '3 people sent you hype');
    assert.equal(contentIcon(riv), '⚔️'); assert.equal(contentCta(riv), 'View match'); assert.equal(contentQuote(riv), 'Game on! 🎮');
    assert.ok(isSocialTabItem({ type: 'emote-received' })); assert.ok(CONTENT_PRIORITY['emote-received'] >= CONTENT_PRIORITY.reply);
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
