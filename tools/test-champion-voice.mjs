// node tools/test-champion-voice.mjs: one voice per champion (every skin speaks with the champion's own pack), and the voice-set machinery still works.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { voiceSetFor, mergeVoice, applyVoiceSet, loadVoicedPack, VOICES } from '../js/champion-voice.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
let pass = 0; const t = async (n, f) => { await f(); console.log('  ok  ', n); pass++; };

await t('every skin of every champion speaks with the champion pack (no skin voice sets)', () => {
    for (const [packId, d] of Object.entries(SKIN_UNLOCKS)) {
        for (const s of d.skins) assert.equal(voiceSetFor(packId, s.num), null, `${packId} skin ${s.num}`);
        assert.equal(voiceSetFor(packId, 999), null);
    }
    assert.equal(voiceSetFor('nobody', 0), null);
    assert.deepEqual(Object.keys(VOICES).sort(), Object.keys(SKIN_UNLOCKS).sort(), 'every champion is in the voice table');
});
await t('champion-packs holds one pack per champion, plus default and the manifest, and no leftover skin voice files', () => {
    const files = fs.readdirSync(new URL('../champion-packs/', import.meta.url)).map(f => f.replace(/\.json$/, '')).sort();
    assert.deepEqual(files, ['caitlyn', 'champion-manifest', 'default', 'ekko', 'jinx', 'vi']);
});
await t('mergeVoice rewrites only what the set has and keeps everything else', () => {
    const m = mergeVoice({ id: 'x', theme: { a: 1 }, alerts: { danger: 'old', ally: 'old' }, share: { invite: ['old'] } }, { id: 'v', alerts: { danger: 'new' } });
    assert.equal(m.alerts.danger, 'new'); assert.equal(m.alerts.ally, 'old'); assert.deepEqual(m.share, { invite: ['old'] }); assert.equal(m.theme.a, 1); assert.equal(m.id, 'x'); assert.equal(m.voiceSet, 'v');
    assert.equal(mergeVoice({ a: 1 }, null).a, 1);
});
await t('loadVoicedPack gives the champion pack for any skin, loaded once and cached', async () => {
    const calls = []; const files = { jinx: { id: 'jinx', alerts: { danger: 'arcane' } } };
    const fetchJson = async id => { calls.push(id); return files[id] || null; };
    const cache = new Map();
    for (const skin of [0, 37, 60, 999]) assert.equal((await loadVoicedPack('jinx', skin, fetchJson, cache)).alerts.danger, 'arcane');
    assert.equal(calls.length, 1, 'fetched once');
    assert.equal(await loadVoicedPack('jinx', 0, async () => null, new Map()), null);
});
await t('a voice set still works if one is configured (the machinery is kept for later)', async () => {
    const saved = VOICES.jinx; VOICES.jinx = { baseSkins: [37], skins: { 1: 'jinx-x' }, other: 'jinx-loud' };
    try {
        const files = { jinx: { id: 'jinx', alerts: { danger: 'arcane' } }, 'jinx-loud': { alerts: { danger: 'loud' } }, 'jinx-x': { alerts: { danger: 'x' } } };
        const f = async id => files[id] || null; const cache = new Map();
        assert.equal((await loadVoicedPack('jinx', 37, f, cache)).alerts.danger, 'arcane');
        assert.equal((await loadVoicedPack('jinx', 0, f, cache)).alerts.danger, 'loud');
        assert.equal((await loadVoicedPack('jinx', 1, f, cache)).alerts.danger, 'x');
    } finally { VOICES.jinx = saved; }
});

await t('applyVoiceSet follows "extends": parent first, then the set itself, missing files skipped', async () => {
    const files = { child: { extends: 'parent', alerts: { b: 'child-b' } }, parent: { alerts: { a: 'parent-a', b: 'parent-b' } } };
    const f = async id => files[id] || null;
    const m = await applyVoiceSet({ alerts: { a: 'base-a', b: 'base-b', c: 'base-c' } }, 'child', f);
    assert.deepEqual(m.alerts, { a: 'parent-a', b: 'child-b', c: 'base-c' });
    assert.equal(m.voiceSet, 'child');
    assert.deepEqual((await applyVoiceSet({ alerts: { a: 'base-a' } }, 'missing', f)).alerts, { a: 'base-a' });
    const loop = { x: { extends: 'y', alerts: { a: 'x' } }, y: { extends: 'x', alerts: { a: 'y' } } };
    await applyVoiceSet({ alerts: {} }, 'x', async id => loop[id]);   // a loop of "extends" ends instead of hanging
});
console.log(`${pass} passed`);
