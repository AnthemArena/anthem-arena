// node tools/test-notification-prefs.mjs   (prefs + relationship-aware grouping)
import assert from 'node:assert/strict';
import { readNotificationPrefs, shouldSaveSocial, shouldToastSocial } from '../js/notification-prefs.js';
import { groupNotifications, groupHeadline } from '../js/notification-model.js';
let pass = 0; const t = (n, f) => { f(); console.log('  ok  ', n); pass++; };
const store = o => ({ getItem: k => (k in o ? o[k] : null) });

t('defaults: everyone, everyone, match alerts on', () => assert.deepEqual(readNotificationPrefs(store({})), { notifyFrom: 'everyone', toastFrom: 'everyone', matchAlerts: true }));
t('reads saved values, ignores junk', () => {
    assert.deepEqual(readNotificationPrefs(store({ notifyFrom: 'following', toastFrom: 'off', matchAlerts: 'false' })), { notifyFrom: 'following', toastFrom: 'off', matchAlerts: false });
    assert.equal(readNotificationPrefs(store({ notifyFrom: 'banana' })).notifyFrom, 'everyone');
    assert.equal(readNotificationPrefs(null).notifyFrom, 'everyone');
});
t('save rule', () => {
    const p = o => ({ notifyFrom: 'everyone', toastFrom: 'everyone', matchAlerts: true, ...o });
    assert.ok(shouldSaveSocial(p(), false)); assert.ok(!shouldSaveSocial(p({ notifyFrom: 'nobody' }), true));
    assert.ok(!shouldSaveSocial(p({ notifyFrom: 'following' }), false)); assert.ok(shouldSaveSocial(p({ notifyFrom: 'following' }), true));
});
t('toast rule (never toasts what is not saved)', () => {
    const p = o => ({ notifyFrom: 'everyone', toastFrom: 'everyone', matchAlerts: true, ...o });
    assert.ok(shouldToastSocial(p(), false)); assert.ok(!shouldToastSocial(p({ toastFrom: 'off' }), true));
    assert.ok(!shouldToastSocial(p({ toastFrom: 'following' }), false)); assert.ok(shouldToastSocial(p({ toastFrom: 'following' }), true));
    assert.ok(!shouldToastSocial(p({ notifyFrom: 'following', toastFrom: 'everyone' }), false));
});

const n = (id, who, uid, match, rel, ts) => ({ id, triggerUsername: who, triggerUserId: uid, matchId: match, matchTitle: `T-${match}`, relationship: rel, type: 'live-activity', timestamp: ts });
t('strangers group per match, followed people per person', () => {
    const list = [n('1', 'Kai', 'k', 'm1', 'opponent', 5), n('2', 'Mia', 'm', 'm1', 'opponent', 4), n('3', 'Zed', 'z', 'm1', 'opponent', 3), n('4', 'Zed', 'z', 'm2', 'opponent', 6), n('5', 'Kai', 'k', 'm2', 'ally', 2)];
    const g = groupNotifications(list, new Set(['z']));
    const byKey = Object.fromEntries(g.map(x => [`${x.groupKind}:${x.triggerUserId}:${x.relationship}`, x]));
    assert.equal(g.length, 3);   // m1 crowd (Kai+Mia), followed Zed (2 matches), Kai's m2 ally row
    assert.equal(byKey['match:k:opponent'].count, 2);                // Kai + Mia in m1
    assert.equal(byKey['user:z:opponent'].count, 2);                 // followed Zed, two matches
});
t('headlines say what the row is about', () => {
    const list = [n('1', 'Kai', 'k', 'm1', 'opponent', 5), n('2', 'Mia', 'm', 'm1', 'opponent', 4), n('3', 'Zed', 'z', 'm2', 'ally', 3), n('4', 'Zed', 'z', 'm3', 'ally', 2)];
    const g = groupNotifications(list, new Set(['z']));
    const crowd = g.find(x => x.groupKind === 'match'), person = g.find(x => x.groupKind === 'user');
    assert.deepEqual(groupHeadline(crowd), { message: '2 people voted against you in T-m1', detail: 'Kai, Mia' });
    assert.deepEqual(groupHeadline(person), { message: 'Zed picked the same as you in 2 matches', detail: null });
    assert.equal(groupHeadline(g.find(x => x.count === 1) || { relationship: 'ally', count: 1 }), null);
});
t('non-social rows still group per person', () => {
    const l = [{ id: 'a', type: 'like', triggerUserId: 'u', timestamp: 2 }, { id: 'b', type: 'like', triggerUserId: 'u', timestamp: 1 }];
    const g = groupNotifications(l, new Set()); assert.equal(g.length, 1); assert.equal(g[0].count, 2); assert.equal(groupHeadline(g[0]), null);
});
console.log(`${pass} passed`);
