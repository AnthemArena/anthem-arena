// Ekko is wired in everywhere but stays hidden (enabled: false) until his lines are written. This checks the wiring is
// complete and consistent, and that nothing leaks while he is off. Remaining "TODO" lines are reported, not failed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COMPANION_PACKS } from '../js/arcane-config.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
import { CHAMPION_ACHIEVEMENTS, MAX_PER_CHAMPION, MAX_XP_PER_CHAMPION } from '../js/champion-achievements/index.js';
import { voiceSetFor } from '../js/champion-voice.js';
import { PACK_IDS } from '../js/xp-ledger.js';
const read = f => JSON.parse(fs.readFileSync(new URL(`../champion-packs/${f}.json`, import.meta.url), 'utf8').replace(/^﻿/, ''));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const live = COMPANION_PACKS.find(p => p.id === 'ekko').enabled;

t('manifest and config agree about Ekko, and the flag is the single switch', () => {
    const entry = read('champion-manifest').packs.find(p => p.id === 'ekko');
    assert.ok(entry); assert.equal(entry.icon.endsWith('/champion/Ekko.png'), true);
    assert.equal(entry.enabled, live);
    assert.equal(PACK_IDS.includes('ekko'), live);
});

t('skin ladder: Classic first, Arcane at 2 and 10, one prestige skin tied to its achievement', () => {
    const s = SKIN_UNLOCKS.ekko.skins;
    assert.equal(new Set(s.map(x => x.num)).size, s.length, 'duplicate skin number');
    assert.deepEqual(s.filter(x => x.mastery === 1).map(x => x.num), [0]);
    assert.equal(s.find(x => x.num === 36).mastery, 2); assert.equal(s.find(x => x.num === 57).mastery, 10);
    assert.deepEqual(s.filter(x => x.achievement).map(x => [x.num, x.achievement]), [[46, 'ekko-firelight']]);
});

t('achievements follow the registry budget', () => {
    const list = Object.values(CHAMPION_ACHIEVEMENTS.ekko);
    assert.ok(list.length <= MAX_PER_CHAMPION); assert.ok(list.reduce((s, a) => s + a.xp, 0) <= MAX_XP_PER_CHAMPION);
    assert.ok(list.every(a => a.id.startsWith('ekko-')));
});

t('Ekko has one voice: every skin uses ekko.json', () => {
    for (const sk of SKIN_UNLOCKS.ekko.skins) assert.equal(voiceSetFor('ekko', sk.num), null, `skin ${sk.num}`);
});

t('ekko.json has the same sections and keys as Caitlyn, so every toast has a slot', () => {
    const shape = o => (o && typeof o === 'object' && !Array.isArray(o)) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : 0;
    const e = read('ekko'), c = read('caitlyn');
    for (const sec of ['alerts', 'achievements', 'bubble', 'modal', 'pages', 'share']) assert.deepEqual(Object.keys(e[sec]).filter(k => !k.startsWith('ekko-')).sort(), Object.keys(c[sec]).sort(), sec);
    assert.deepEqual(shape(e.alerts), shape(c.alerts));
});

t('ekko.json has a toast entry for every champion achievement, Ekko\'s included', () => {
    const A = read('ekko').achievements;
    for (const id of Object.keys(CHAMPION_ACHIEVEMENTS.ekko)) assert.ok(A[id]?.messages?.length, id);
});

t('Ekko cannot be switched on while lines are still TODO', () => {
    const todo = (JSON.stringify(read('ekko')).match(/"TODO[^"]*"/g) || []).length;
    console.log(`        (${todo} lines still TODO)`);
    if (live) assert.equal(todo, 0, 'Ekko is enabled but still has TODO lines');
});
console.log(`ekko pack tests passed (${n})`);
