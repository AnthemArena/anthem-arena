// js/emote-system.js sendEmoteReaction against the in-memory fake Firestore (which refuses undefined fields like the real SDK).
//   node tools/test-emote-send.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./test-support/hooks.mjs', import.meta.url);
const { store } = await import('./test-support/fake-firestore.mjs');
const ls = new Map();
globalThis.localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
for (const k of ['log', 'warn', 'error']) console[k] = () => {};
const { sendEmoteReaction } = await import('../js/emote-system.js');
const features = await import('../js/features.js');
features.__setEmotesEnabledForTests(true);      // the sending code itself is still tested; the switch-off is tested below

let pass = 0, fail = 0;
const t = async (n, f) => { store.clear(); ls.clear(); ls.set('tournamentUserId', 'uidA'); ls.set('tournamentUsername', 'Kai'); try { await f(); process.stdout.write(`  ok   ${n}\n`); pass++; } catch (e) { process.stdout.write(`  FAIL ${n}\n       ${e.message}\n`); fail++; } };
const sent = () => [...store.entries()].filter(([k]) => k.startsWith('user-reactions/')).map(([, v]) => v);

await t('a normal emote is stored', async () => {
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'props', { matchId: 'm1', matchTitle: 'A vs B', songTitle: 'A' }), true);
    const r = sent()[0];
    assert.equal(r.fromUserId, 'uidA'); assert.equal(r.toUserId, 'uidB'); assert.equal(r.seen, false); assert.equal(r.type, 'props'); assert.ok(r.message.length > 0 && r.message.length <= 200);
});
await t('missing match details no longer make Firestore reject it', async () => {
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'hype', { matchId: 'm1' }), true);
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'hype', undefined), true);
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'hype', { matchId: 'm1', matchTitle: undefined, songTitle: null }), true);
    assert.equal(sent().length, 3);
    for (const r of sent()) assert.ok(!Object.values(r).includes(undefined));
});
await t('the receiver also gets a bell note (already shown as a toast), with only fields the rules allow', async () => {
    await sendEmoteReaction('Mia', 'uidB', 'rivalry', { matchId: 'm1', matchTitle: 'A vs B' });
    const notes = [...store.entries()].filter(([k]) => k.startsWith('user-notifications/')).map(([, v]) => v);
    assert.equal(notes.length, 1);
    const n = notes[0];
    assert.equal(n.userId, 'uidB'); assert.equal(n.type, 'emote-received'); assert.equal(n.eventType, 'rivalry'); assert.equal(n.triggerUserId, 'uidA');
    assert.equal(n.shownAsToast, true); assert.equal(n.read, false); assert.equal(n.targetUrl, '/vote.html?match=m1'); assert.ok(n.message.length <= 500);
    const allowed = ['userId', 'type', 'priority', 'message', 'detail', 'icon', 'matchId', 'matchTitle', 'triggerUsername', 'triggerUserId', 'eventType', 'relationship', 'ctaText', 'ctaAction', 'ctaData', 'targetUrl', 'timestamp', 'read', 'dismissed', 'shownAsToast', 'expiresAt'];
    for (const k of Object.keys(n)) assert.ok(allowed.includes(k), k);
});
await t('only fields the security rules allow are sent', async () => {
    await sendEmoteReaction('Mia', 'uidB', 'thanks', { matchId: 'm1', matchTitle: 't', songTitle: 's', extra: 'x' });
    const allowed = ['fromUserId', 'fromUsername', 'toUserId', 'toUsername', 'type', 'matchId', 'matchTitle', 'songTitle', 'message', 'timestamp', 'seen'];
    assert.deepEqual(Object.keys(sent()[0]).filter(k => !allowed.includes(k)), []);
});
await t('long values are cut to the lengths the rules allow', async () => {
    await sendEmoteReaction('Mia', 'uidB', 'props', { matchId: 'm1' }, 'x'.repeat(500));
    assert.equal(sent()[0].message.length, 200);
});
await t('not to yourself, not to nobody, not anonymous', async () => {
    assert.equal(await sendEmoteReaction('Kai', 'uidA', 'props', {}), false);
    assert.equal(await sendEmoteReaction('Mia', '', 'props', {}), false);
    ls.set('tournamentUsername', 'Anonymous'); ls.delete('username');
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'props', {}), false);
    assert.equal(sent().length, 0);
});
await t('username falls back to the "username" key', async () => {
    ls.delete('tournamentUsername'); ls.set('username', 'Kai2');
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'props', {}), true);
    assert.equal(sent()[0].fromUsername, 'Kai2');
});
await t('an unknown type is refused instead of crashing', async () => {
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'nonsense', {}), false);
    assert.equal(await sendEmoteReaction('Mia', 'uidB', 'custom', {}, 'hello'), true);
});
await t('with emotes switched off nothing is sent, and an emote button becomes View match', async () => {
    features.__setEmotesEnabledForTests(false);
    try {
        assert.equal(await sendEmoteReaction('Mia', 'uidB', 'props', { matchId: 'm1' }), false);
        assert.equal(sent().length, 0);
        const n = features.withoutEmoteCta({ ctaAction: 'send-emote', ctaText: 'Challenge: Boom', cta: 'Challenge: Boom', ctaData: { x: 1 }, matchId: 'm1', message: 'hi' });
        assert.equal(n.ctaAction, 'navigate'); assert.equal(n.action, 'navigate'); assert.equal(n.ctaText, 'View match'); assert.equal(n.ctaData, undefined); assert.equal(n.targetUrl, '/vote.html?match=m1'); assert.equal(n.message, 'hi');
        const plain = { ctaAction: 'navigate', ctaText: 'View post' };
        assert.equal(features.withoutEmoteCta(plain), plain);
        features.__setEmotesEnabledForTests(true);
        const kept = { ctaAction: 'send-emote', ctaText: 'Boom' };
        assert.equal(features.withoutEmoteCta(kept), kept);
    } finally { features.__setEmotesEnabledForTests(true); }
});
console.log(`${pass} passed${fail ? `, ${fail} FAILED` : ''}`); process.exit(fail ? 1 : 0);
