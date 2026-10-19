// node tools/test-champion-voice.mjs: a skin picks its voice set, the set is laid over the base pack, and Original Jinx covers every line the Arcane pack has.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { voiceSetFor, mergeVoice, applyVoiceSet, loadVoicedPack, VOICES, VOICE_SECTIONS } from '../js/champion-voice.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
let pass = 0; const t = async (n, f) => { await f(); console.log('  ok  ', n); pass++; };
const read = id => JSON.parse(fs.readFileSync(new URL(`../champion-packs/${id}.json`, import.meta.url), 'utf8'));
const base = read('jinx'), orig = read('jinx-original'), crime = read('jinx-crime-city'), project = read('jinx-project'), firecracker = read('jinx-firecracker');

await t('Arcane skins keep the base voice, every other Jinx skin speaks with the original', () => {
    assert.equal(voiceSetFor('jinx', 37), null);
    assert.equal(voiceSetFor('jinx', 60), null);
    for (const n of [0, 40, 62]) assert.equal(voiceSetFor('jinx', n), 'jinx-original', `skin ${n}`);
    assert.equal(voiceSetFor('jinx', 1), 'jinx-crime-city');
    assert.equal(voiceSetFor('jinx', 20), 'jinx-project');
    assert.equal(voiceSetFor('jinx', 2), 'jinx-firecracker');
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
    const n = calls.length; await loadVoicedPack('jinx', 62, fetchJson, cache); assert.equal(calls.length, n, 'second loud skin is served from the cache');
    assert.equal((await loadVoicedPack('jinx', 0, async id => (id === 'jinx' ? files.jinx : null), new Map())).alerts.danger, 'arcane');
    assert.equal(await loadVoicedPack('jinx', 0, async () => null, new Map()), null);
});

const holes = s => new Set([...JSON.stringify(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]));
const strings = x => typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : [];
const shape = x => Array.isArray(x) ? x.map(shape) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shape(v)])) : typeof x;
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

// Each set must have the same entries as the set below it (so a skin never loses a line) and the same placeholders
for (const [name, set, below] of [['jinx-original', orig, base], ['jinx-crime-city', crime, orig], ['jinx-project', project, orig], ['jinx-firecracker', firecracker, orig]]) {
    await t(`${name} has every section and entry of the set below it, in the same shape`, () => {
        for (const s of VOICE_SECTIONS) {
            assert.ok(set[s], s);
            assert.deepEqual(Object.keys(set[s]).sort(), Object.keys(below[s]).sort(), `${s} keys`);
        }
        for (const k of Object.keys(below.alerts)) {
            if (k === 'welcome') { for (const w of Object.keys(below.alerts.welcome)) assert.deepEqual(Object.keys(set.alerts.welcome[w]), Object.keys(below.alerts.welcome[w]), w); continue; }
            assert.deepEqual(Object.keys(set.alerts[k]), Object.keys(below.alerts[k]), `alerts.${k} parts`);
            for (const part of Object.keys(below.alerts[k])) assert.equal(set.alerts[k][part].length, below.alerts[k][part].length, `alerts.${k}.${part} count`);
            const conds = x => (x.messages || []).map(m => JSON.stringify(m.condition ?? null));
            assert.deepEqual(conds(set.alerts[k]), conds(below.alerts[k]), `alerts.${k} conditions`);
        }
        for (const s of ['bubble', 'modal', 'pages', 'share']) for (const k of Object.keys(below[s])) assert.equal(set[s][k].length, below[s][k].length, `${s}.${k} count`);
        for (const k of Object.keys(below.achievements)) assert.deepEqual(shape(set.achievements[k]), shape(below.achievements[k]), `achievement ${k}`);
    });
    await t(`${name} only uses placeholders the lines below use, and keeps the ones each achievement needs`, () => {
        for (const s of VOICE_SECTIONS) for (const k of Object.keys(below[s])) {
            const allowed = holes(below[s][k]);
            for (const h of holes(set[s][k])) assert.ok(allowed.has(h), `${s}.${k} uses {${h}}`);
        }
        for (const k of Object.keys(below.achievements)) for (const h of holes(below.achievements[k].details)) assert.ok(holes(set.achievements[k].details).has(h), `achievement ${k} details keep {${h}}`);
    });
    await t(`${name} lines are real sentences: no leftovers, no empty strings, no stretches yelled in capitals`, () => {
        const all = VOICE_SECTIONS.flatMap(s => strings(set[s]));
        assert.ok(all.length > 600);
        for (const s of all) {
            assert.ok(s.trim().length > 0);
            assert.doesNotMatch(s, name === 'jinx-original' ? /songTitle|\bsongs?\b/i : /songTitle/);   // a music-hall skin may talk about songs
            assert.doesNotMatch(s, /!!/);
            assert.doesNotMatch(s, /\b[A-Z]{3,}\b[ ,.!?]+\b[A-Z]{3,}\b/, `shouting: ${s}`);
        }
        const long = all.filter(x => x.length > 28);
        assert.ok(new Set(long).size >= long.length - 3, 'almost no repeated lines (buttons repeat on purpose)');
    });
}
// Lines from the League audio pages that Jinx's skins share: ours are written from the character, never copied
const RIOT_PHRASES = ["what's in my violin case", 'who wants a solo', "i've got a recital", 'scream along if you know the words', 'pop the cork', 'drink up',
    'wreaking havoc', 'stands for jinx', "doctor's note", "guns don't kill people", 'fat hands', 'hat lady', 'snoresville', 'everybody, panic',
    'gotta die sometime', 'favorite waste of bullets', 'no need to be scared', 'accidentally did that on purpose', 'gun play', "that could happen"];
const lines = x => new Set(VOICE_SECTIONS.flatMap(s => strings(x[s])).filter(l => l.length > 28));
for (const [name, set] of [['jinx-crime-city', crime], ['jinx-project', project], ['jinx-firecracker', firecracker]]) {
    await t(`${name} is its own voice: almost nothing shared with Original Jinx or the other skins, and no in-game lines`, () => {
        const mine = lines(set);
        for (const [other, o2] of [['jinx-original', orig], ['jinx-crime-city', crime], ['jinx-project', project], ['jinx-firecracker', firecracker]]) {
            if (o2 === set) continue;
            const theirs = lines(o2), shared = [...mine].filter(l => theirs.has(l));
            assert.ok(shared.length < mine.size * 0.02, `${name} shares ${shared.length} lines with ${other}: ${shared.slice(0, 3).join(' | ')}`);
        }
        const text = [...VOICE_SECTIONS.flatMap(s => strings(set[s]))].join('\n').toLowerCase();
        for (const quote of RIOT_PHRASES) assert.ok(!text.includes(quote), quote);
    });
}
console.log(`${pass} passed`);
