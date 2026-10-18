// node tools/test-champion-voice.mjs: a skin picks its voice set, the set is laid over the base pack, and Original Jinx covers every line the Arcane pack has.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { voiceSetFor, mergeVoice, loadVoicedPack, VOICES, VOICE_SECTIONS } from '../js/champion-voice.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
let pass = 0; const t = async (n, f) => { await f(); console.log('  ok  ', n); pass++; };
const read = id => JSON.parse(fs.readFileSync(new URL(`../champion-packs/${id}.json`, import.meta.url), 'utf8'));
const base = read('jinx'), orig = read('jinx-original');

await t('Arcane skins keep the base voice, every other Jinx skin speaks with the original', () => {
    assert.equal(voiceSetFor('jinx', 37), null);
    assert.equal(voiceSetFor('jinx', 60), null);
    for (const n of [0, 20, 40, 1, 62]) assert.equal(voiceSetFor('jinx', n), 'jinx-original', `skin ${n}`);
    assert.equal(voiceSetFor('vi', 29), null);
    assert.equal(voiceSetFor('nobody', 0), null);
    assert.equal(voiceSetFor('jinx', '37'), null);
});
await t('the Arcane skins named in the voice table are real Jinx skins', () => {
    const nums = SKIN_UNLOCKS.jinx.skins.map(s => s.num);
    for (const n of VOICES.jinx.baseSkins) assert.ok(nums.includes(n), n);
    assert.ok(SKIN_UNLOCKS.jinx.skins.find(s => s.num === 37).name.startsWith('Arcane'));
    assert.ok(SKIN_UNLOCKS.jinx.skins.find(s => s.num === 60).name.startsWith('Arcane'));
});
await t('mergeVoice rewrites only what the set has and keeps everything else', () => {
    const m = mergeVoice({ id: 'x', theme: { a: 1 }, alerts: { danger: 'old', ally: 'old' }, share: { invite: ['old'] } }, { id: 'v', alerts: { danger: 'new' } });
    assert.equal(m.alerts.danger, 'new'); assert.equal(m.alerts.ally, 'old'); assert.deepEqual(m.share, { invite: ['old'] }); assert.equal(m.theme.a, 1); assert.equal(m.id, 'x'); assert.equal(m.voiceSet, 'v');
    assert.equal(mergeVoice({ a: 1 }, null).a, 1);
});
await t('loadVoicedPack: right set per skin, cached, a missing voice file keeps the base voice', async () => {
    const calls = []; const files = { jinx: { id: 'jinx', alerts: { danger: 'arcane' } }, 'jinx-original': { id: 'jinx-original', alerts: { danger: 'loud' } } };
    const fetchJson = async id => { calls.push(id); return files[id] || null; };
    const cache = new Map();
    assert.equal((await loadVoicedPack('jinx', 37, fetchJson, cache)).alerts.danger, 'arcane');
    assert.equal((await loadVoicedPack('jinx', 0, fetchJson, cache)).alerts.danger, 'loud');
    const n = calls.length; await loadVoicedPack('jinx', 20, fetchJson, cache); assert.equal(calls.length, n, 'second loud skin is served from the cache');
    assert.equal((await loadVoicedPack('jinx', 0, async id => (id === 'jinx' ? files.jinx : null), new Map())).alerts.danger, 'arcane');
    assert.equal(await loadVoicedPack('jinx', 0, async () => null, new Map()), null);
});

// Original Jinx must have the same entries as the Arcane pack (so a skin never loses a line) and the same placeholders
const holes = s => new Set([...JSON.stringify(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]));
const strings = x => typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : [];
const shape = x => Array.isArray(x) ? x.map(shape) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shape(v)])) : typeof x;
await t('Original Jinx has every section and entry of the Arcane pack, in the same shape', () => {
    for (const s of VOICE_SECTIONS) {
        assert.ok(orig[s], s);
        assert.deepEqual(Object.keys(orig[s]).sort(), Object.keys(base[s]).sort(), `${s} keys`);
    }
    for (const k of Object.keys(base.alerts)) {
        if (k === 'welcome') { for (const w of Object.keys(base.alerts.welcome)) assert.deepEqual(Object.keys(orig.alerts.welcome[w]), Object.keys(base.alerts.welcome[w]), w); continue; }
        assert.deepEqual(Object.keys(orig.alerts[k]), Object.keys(base.alerts[k]), `alerts.${k} parts`);
        for (const part of Object.keys(base.alerts[k])) assert.equal(orig.alerts[k][part].length, base.alerts[k][part].length, `alerts.${k}.${part} count`);
        const conds = x => (x.messages || []).map(m => JSON.stringify(m.condition ?? null));
        assert.deepEqual(conds(orig.alerts[k]), conds(base.alerts[k]), `alerts.${k} conditions`);
    }
    for (const s of ['bubble', 'modal', 'pages', 'share']) for (const k of Object.keys(base[s])) assert.equal(orig[s][k].length, base[s][k].length, `${s}.${k} count`);
    for (const k of Object.keys(base.achievements)) assert.deepEqual(shape(orig.achievements[k]), shape(base.achievements[k]), `achievement ${k}`);
});
await t('Original Jinx only uses placeholders the Arcane lines use, and keeps the ones each part needs', () => {
    for (const s of VOICE_SECTIONS) for (const k of Object.keys(base[s])) {
        const allowed = holes(base[s][k]);
        for (const h of holes(orig[s][k])) assert.ok(allowed.has(h), `${s}.${k} uses {${h}}`);
    }
    for (const k of Object.keys(base.achievements)) {
        const need = e => holes(e.details);
        for (const h of need(base.achievements[k])) assert.ok(holes(orig.achievements[k].details).has(h), `achievement ${k} details keep {${h}}`);
    }
});
await t('Original Jinx lines are real sentences: no leftovers from the old pack, no empty strings, no stretches yelled in capitals (one shouted word for emphasis is fine)', () => {
    const all = VOICE_SECTIONS.flatMap(s => strings(orig[s]));
    assert.ok(all.length > 600);
    for (const s of all) {
        assert.ok(s.trim().length > 0);
        assert.doesNotMatch(s, /songTitle|\bsongs?\b/i);
        assert.doesNotMatch(s, /!!/);
        assert.doesNotMatch(s, /\b[A-Z]{3,}\b[ ,.!?]+\b[A-Z]{3,}\b/, `shouting: ${s}`);
    }
    const long = all.filter(x => x.length > 28);
    assert.ok(new Set(long).size >= long.length - 3, 'almost no repeated lines (buttons repeat on purpose)');
});
console.log(`${pass} passed`);
