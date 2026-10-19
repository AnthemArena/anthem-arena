// node tools/test-champion-voice.mjs: a skin picks its voice set, the set is laid over the base pack, and Original Jinx covers every line the Arcane pack has.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { voiceSetFor, mergeVoice, applyVoiceSet, loadVoicedPack, VOICES, VOICE_SECTIONS } from '../js/champion-voice.js';
import { SKIN_UNLOCKS } from '../js/champion-unlocks.js';
let pass = 0; const t = async (n, f) => { await f(); console.log('  ok  ', n); pass++; };
const read = id => JSON.parse(fs.readFileSync(new URL(`../champion-packs/${id}.json`, import.meta.url), 'utf8'));
const base = read('jinx'), orig = read('jinx-original'), crime = read('jinx-crime-city'), project = read('jinx-project'), firecracker = read('jinx-firecracker'), starGuardian = read('jinx-star-guardian'), odyssey = read('jinx-odyssey'), battleCat = read('jinx-battle-cat'), cafeCuties = read('jinx-cafe-cuties'), oceanSong = read('jinx-ocean-song'), zombieSlayer = read('jinx-zombie-slayer'), ambitiousElf = read('jinx-ambitious-elf'), heartseeker = read('jinx-heartseeker'), t1 = read('jinx-t1'), arcaneFractured = read('jinx-arcane-fractured');
const viBase = read('vi'), viOrig = read('vi-original'), viDemon = read('vi-demon'), viProject = read('vi-project'), viNeon = read('vi-neon-strike'), viOfficer = read('vi-officer'), viDebonair = read('vi-debonair'), viPsyops = read('vi-psyops'), viHeartache = read('vi-heartache'), viPrimal = read('vi-primal-ambush'), viWarring = read('vi-warring-kingdoms'), viHeartbreaker = read('vi-heartbreaker'), viBrawler = read('vi-arcane-brawler'), viT1 = read('vi-t1');
const caitBase = read('caitlyn'), caitOrig = read('caitlyn-original'), caitResistance = read('caitlyn-resistance'), caitArctic = read('caitlyn-arctic-warfare'), caitOfficer = read('caitlyn-officer'), caitHunter = read('caitlyn-headhunter'), caitPulsefire = read('caitlyn-pulsefire'), caitPool = read('caitlyn-pool-party'), caitArcade = read('caitlyn-arcade'), caitAcademy = read('caitlyn-battle-academia'), caitSnowMoon = read('caitlyn-snow-moon'), caitHeartthrob = read('caitlyn-heartthrob'), caitFirecracker = read('caitlyn-firecracker'), caitSheriff = read('caitlyn-sheriff'), caitSafari = read('caitlyn-safari'), caitWraith = read('caitlyn-lunar-wraith'), caitDrx = read('caitlyn-drx');

await t('Arcane Enemy keeps the base voice, every other Jinx skin has its own set or speaks with the original', () => {
    assert.equal(voiceSetFor('jinx', 37), null);
    assert.equal(voiceSetFor('jinx', 60), 'jinx-arcane-fractured');
    for (const n of [0, 999]) assert.equal(voiceSetFor('jinx', n), 'jinx-original', `skin ${n}`);
    assert.equal(voiceSetFor('jinx', 1), 'jinx-crime-city');
    assert.equal(voiceSetFor('jinx', 20), 'jinx-project');
    assert.equal(voiceSetFor('jinx', 2), 'jinx-firecracker');
    assert.equal(voiceSetFor('jinx', 4), 'jinx-star-guardian');
    assert.equal(voiceSetFor('jinx', 13), 'jinx-odyssey');
    assert.equal(voiceSetFor('jinx', 38), 'jinx-battle-cat');
    assert.equal(voiceSetFor('jinx', 40), 'jinx-battle-cat');
    assert.equal(voiceSetFor('jinx', 51), 'jinx-cafe-cuties');
    assert.equal(voiceSetFor('jinx', 65), 'jinx-ocean-song');
    assert.equal(voiceSetFor('jinx', 3), 'jinx-zombie-slayer');
    assert.equal(voiceSetFor('jinx', 12), 'jinx-ambitious-elf');
    assert.equal(voiceSetFor('jinx', 29), 'jinx-heartseeker');
    assert.equal(voiceSetFor('jinx', 62), 'jinx-t1');
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
    const n = calls.length; await loadVoicedPack('jinx', 999, fetchJson, cache); assert.equal(calls.length, n, 'second loud skin is served from the cache');
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
for (const [name, set, below] of [['jinx-original', orig, base], ['vi-original', viOrig, viBase], ['vi-demon', viDemon, viOrig], ['vi-project', viProject, viOrig], ['vi-neon-strike', viNeon, viOrig], ['vi-officer', viOfficer, viOrig], ['vi-debonair', viDebonair, viOrig], ['vi-psyops', viPsyops, viOrig], ['vi-heartache', viHeartache, viOrig], ['vi-primal-ambush', viPrimal, viOrig], ['vi-warring-kingdoms', viWarring, viOrig], ['vi-heartbreaker', viHeartbreaker, viOrig], ['vi-arcane-brawler', viBrawler, viOrig], ['vi-t1', viT1, viOrig], ['caitlyn-original', caitOrig, caitBase], ['caitlyn-resistance', caitResistance, caitOrig], ['caitlyn-arctic-warfare', caitArctic, caitOrig], ['caitlyn-officer', caitOfficer, caitOrig], ['caitlyn-headhunter', caitHunter, caitOrig], ['caitlyn-pulsefire', caitPulsefire, caitOrig], ['caitlyn-pool-party', caitPool, caitOrig], ['caitlyn-arcade', caitArcade, caitOrig], ['caitlyn-battle-academia', caitAcademy, caitOrig], ['caitlyn-snow-moon', caitSnowMoon, caitOrig], ['caitlyn-heartthrob', caitHeartthrob, caitOrig], ['caitlyn-firecracker', caitFirecracker, caitOrig], ['caitlyn-sheriff', caitSheriff, caitOrig], ['caitlyn-safari', caitSafari, caitOrig], ['caitlyn-lunar-wraith', caitWraith, caitOrig], ['caitlyn-drx', caitDrx, caitOrig], ['jinx-crime-city', crime, orig], ['jinx-project', project, orig], ['jinx-firecracker', firecracker, orig], ['jinx-star-guardian', starGuardian, orig], ['jinx-odyssey', odyssey, orig], ['jinx-battle-cat', battleCat, orig], ['jinx-cafe-cuties', cafeCuties, orig], ['jinx-ocean-song', oceanSong, orig], ['jinx-zombie-slayer', zombieSlayer, orig], ['jinx-ambitious-elf', ambitiousElf, orig], ['jinx-heartseeker', heartseeker, orig], ['jinx-t1', t1, orig], ['jinx-arcane-fractured', arcaneFractured, orig]]) {
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
    'gotta die sometime', 'favorite waste of bullets', 'no need to be scared', 'accidentally did that on purpose', 'gun play', 'pandemonium with a purpose', 'glitter and guns', 'glitter bomb', 'that was stellar', 'star light, star bright', 'to infinity and', 'sparkle party', 'extreme makeover', 'mercy, or mayhem', 'guardian code', 'guardian handbook', 'first star made me', 'twinkle, twinkle', 'rising star', 'shooting star', 'tippity-top', 'pilty palace', 'nobody tells me what to do', 'nothin\' to lose but ammo', 'blue hair, blue hair', "saving the day's exhausting", 'some hero i am', 'every impossible problem', "fate doesn't care", 'stronger than i think', "i'm ignoring you", 'fortune cookie', 'sump rat', 'get jinxed', "can't fix a broken city", 'level-headed one around here', 'probably just the hair', 'silco', 'vander', 'ekko', 'sevika', 'stillwater', 'ambessa', 'heimerdinger', 'warwick'];
// Every skin voice set that has its own theme: add new ones here and the tests compare them against all the others
const THEMED = [['jinx-crime-city', crime], ['jinx-project', project], ['jinx-firecracker', firecracker], ['jinx-star-guardian', starGuardian], ['jinx-odyssey', odyssey], ['jinx-battle-cat', battleCat], ['jinx-cafe-cuties', cafeCuties], ['jinx-ocean-song', oceanSong], ['jinx-zombie-slayer', zombieSlayer], ['jinx-ambitious-elf', ambitiousElf], ['jinx-heartseeker', heartseeker], ['jinx-t1', t1], ['jinx-arcane-fractured', arcaneFractured]];
const lines = x => new Set(VOICE_SECTIONS.flatMap(s => strings(x[s])).filter(l => l.length > 28));
for (const [name, set] of THEMED) {
    await t(`${name} is its own voice: almost nothing shared with Original Jinx or the other skins, and no in-game lines`, () => {
        const mine = lines(set);
        for (const [other, o2] of [['jinx-original', orig], ...THEMED]) {
            if (o2 === set) continue;
            const theirs = lines(o2), shared = [...mine].filter(l => theirs.has(l));
            assert.ok(shared.length < mine.size * 0.02, `${name} shares ${shared.length} lines with ${other}: ${shared.slice(0, 3).join(' | ')}`);
        }
        const text = [...VOICE_SECTIONS.flatMap(s => strings(set[s]))].join('\n').toLowerCase();
        for (const quote of RIOT_PHRASES) assert.ok(!text.includes(quote), quote);
    });
}
// Vi: Arcane Undercity keeps her base pack, every other skin speaks with Original Vi or its own set
await t('Vi: Arcane Undercity keeps the base voice, every other skin speaks with the original or its own set', () => {
    assert.equal(voiceSetFor('vi', 29), null);
    assert.equal(voiceSetFor('vi', 48), 'vi-arcane-brawler');
    assert.equal(voiceSetFor('vi', 49), 'vi-t1');
    for (const n of [0, 999]) assert.equal(voiceSetFor('vi', n), 'vi-original', `skin ${n}`);
    assert.equal(voiceSetFor('vi', 1), 'vi-neon-strike');
    assert.equal(voiceSetFor('vi', 2), 'vi-officer');
    assert.equal(voiceSetFor('vi', 3), 'vi-debonair');
    assert.equal(voiceSetFor('vi', 20), 'vi-psyops');
    assert.equal(voiceSetFor('vi', 30), 'vi-heartache');
    assert.equal(voiceSetFor('vi', 39), 'vi-primal-ambush');
    assert.equal(voiceSetFor('vi', 5), 'vi-warring-kingdoms');
    assert.equal(voiceSetFor('vi', 12), 'vi-heartbreaker');
    assert.equal(voiceSetFor('vi', 4), 'vi-demon');
    assert.equal(voiceSetFor('vi', 11), 'vi-project');
});
// Lines from the League audio pages for Vi: ours are written from the character, never copied
const VI_RIOT_PHRASES = ['save the day... or wreck it', "doing this my way", 'hands do the talking', "piltover's finest", "let's get crackin", 'who needs a beatdown', 'make a door', 'my own backup', 'fun part', 'hit a wall', 'what hit', "don't need a plan", 'spot of tea', 'spot of punch', 'as far as i can throw', 'five reasons', "beat it out of you", 'hard way or', 'gives me something to aim at', 'makes a nice target', 'try the punch', 'straight answer', 'resist arrest', 'put a dent', 'smash and grab', 'punchline', 'freeze! or', 'wrecking crew', 'stands for', 'eat this', 'get dunked', 'boom, baby', 'power slam', 'high five', 'boom! headshot', 'cupcake', 'supposed to hurt'];
for (const [name, set] of [['vi-original', viOrig], ['vi-demon', viDemon], ['vi-project', viProject], ['vi-neon-strike', viNeon], ['vi-officer', viOfficer], ['vi-debonair', viDebonair], ['vi-psyops', viPsyops], ['vi-heartache', viHeartache], ['vi-primal-ambush', viPrimal], ['vi-warring-kingdoms', viWarring], ['vi-heartbreaker', viHeartbreaker], ['vi-arcane-brawler', viBrawler], ['vi-t1', viT1]]) {
    await t(`${name} is its own voice: no in-game lines, no lore names`, () => {
        const text = VOICE_SECTIONS.flatMap(s => strings(set[s])).join('\n').toLowerCase();
        for (const q of VI_RIOT_PHRASES) assert.ok(!text.includes(q), q);
        for (const n of ['silco', 'vander', 'ekko', 'sevika', 'stillwater', 'ambessa', 'heimerdinger', 'warwick', 'jayce']) assert.ok(!text.includes(n), n);
    });
}
// A Vi skin set shares almost nothing with Original Vi
for (const [name, set] of [['vi-demon', viDemon], ['vi-project', viProject], ['vi-neon-strike', viNeon], ['vi-officer', viOfficer], ['vi-debonair', viDebonair], ['vi-psyops', viPsyops], ['vi-heartache', viHeartache], ['vi-primal-ambush', viPrimal], ['vi-warring-kingdoms', viWarring], ['vi-heartbreaker', viHeartbreaker], ['vi-arcane-brawler', viBrawler], ['vi-t1', viT1]]) {
    await t(`${name} shares almost nothing with Original Vi or the other Vi skins`, () => {
        const mine = lines(set);
        for (const [other, o2] of [['vi-original', viOrig], ['vi-demon', viDemon], ['vi-project', viProject], ['vi-neon-strike', viNeon], ['vi-officer', viOfficer], ['vi-debonair', viDebonair], ['vi-psyops', viPsyops], ['vi-heartache', viHeartache], ['vi-primal-ambush', viPrimal], ['vi-warring-kingdoms', viWarring], ['vi-heartbreaker', viHeartbreaker], ['vi-arcane-brawler', viBrawler], ['vi-t1', viT1]]) {
            if (o2 === set) continue;
            const theirs = lines(o2), shared = [...mine].filter(l => theirs.has(l));
            assert.ok(shared.length < mine.size * 0.02, `${name} shares ${shared.length} lines with ${other}: ${shared.slice(0, 3).join(' | ')}`);
        }
    });
}
// Caitlyn: the Arcane skins keep her base pack, every other skin speaks with Original Caitlyn
await t('Caitlyn: the Arcane skins keep the base voice, every other skin speaks with the original', () => {
    for (const n of [28, 50]) assert.equal(voiceSetFor('caitlyn', n), null, `skin ${n}`);
    for (const n of [0, 999]) assert.equal(voiceSetFor('caitlyn', n), 'caitlyn-original', `skin ${n}`);
    assert.equal(voiceSetFor('caitlyn', 1), 'caitlyn-resistance');
    assert.equal(voiceSetFor('caitlyn', 4), 'caitlyn-arctic-warfare');
    assert.equal(voiceSetFor('caitlyn', 5), 'caitlyn-officer');
    assert.equal(voiceSetFor('caitlyn', 6), 'caitlyn-headhunter');
    assert.equal(voiceSetFor('caitlyn', 11), 'caitlyn-pulsefire');
    assert.equal(voiceSetFor('caitlyn', 13), 'caitlyn-pool-party');
    assert.equal(voiceSetFor('caitlyn', 19), 'caitlyn-arcade');
    assert.equal(voiceSetFor('caitlyn', 22), 'caitlyn-battle-academia');
    assert.equal(voiceSetFor('caitlyn', 30), 'caitlyn-snow-moon');
    assert.equal(voiceSetFor('caitlyn', 39), 'caitlyn-heartthrob');
    assert.equal(voiceSetFor('caitlyn', 54), 'caitlyn-firecracker');
    assert.equal(voiceSetFor('caitlyn', 2), 'caitlyn-sheriff');
    assert.equal(voiceSetFor('caitlyn', 3), 'caitlyn-safari');
    assert.equal(voiceSetFor('caitlyn', 10), 'caitlyn-lunar-wraith');
    assert.equal(voiceSetFor('caitlyn', 48), 'caitlyn-drx');
});
// Lines from the League audio pages for Caitlyn: ours are written from the character, never copied
const CAIT_RIOT_PHRASES = ['tea time', 'case closed', 'open and shut', 'by the book', 'cat-and-mouse', 'hot on the trail', 'no stone left', 'three steps ahead', 'crack this case', 'desk duty', "sheriff's in town", 'connect the dots', 'long arm of the law', 'right to remain silent', 'anything you say', 'on to the next case', 'guilty as charged', 'easy collar', 'securing the perimeter', 'perimeter secured', 'going somewhere', 'right where i want you', 'i never miss', 'crime never sleeps', 'sharp shooting', 'think again', 'not so close', 'perfect practice', 'boom! headshot', 'drop your weapons', 'surrender now', 'behind bars', 'i aim to win', 'do not move', 'suspect engaged', 'target in sight', 'in my sights', 'rack this up', 'crime is common', 'good chase', 'good mystery', 'chain of command', 'rust beneath', 'exemplary', 'immaculate', 'cupcake', 'yield', 'time is of the essence', "time's up", 'paradox resolved', 'time breach', 'future-proof', 'flat circle', 'end of the timeline', 'chrono criminal', 'time waits for no one', 'temporal garbage', 'closed loop', 'tomorrow is now', 'new sheriff', 'bigger gun', 'boomstick', 'pun police', 'been here, done this', 'easy a', 'class is in session', 'top of my class', 'marks for effort', 'test aced', 'make the grade', 'a-plus', 'pawns', 'study harder', 'plan q', 'labrys', 'swain', 'yuumi'];
for (const [name, set] of [['caitlyn-original', caitOrig], ['caitlyn-resistance', caitResistance], ['caitlyn-arctic-warfare', caitArctic], ['caitlyn-officer', caitOfficer], ['caitlyn-headhunter', caitHunter], ['caitlyn-pulsefire', caitPulsefire], ['caitlyn-pool-party', caitPool], ['caitlyn-arcade', caitArcade], ['caitlyn-battle-academia', caitAcademy], ['caitlyn-snow-moon', caitSnowMoon], ['caitlyn-heartthrob', caitHeartthrob], ['caitlyn-firecracker', caitFirecracker], ['caitlyn-sheriff', caitSheriff], ['caitlyn-safari', caitSafari], ['caitlyn-lunar-wraith', caitWraith], ['caitlyn-drx', caitDrx]]) {
    await t(`${name} is its own voice: no in-game lines, no lore names`, () => {
        const text = VOICE_SECTIONS.flatMap(s => strings(set[s])).join('\n').toLowerCase();
        for (const q of CAIT_RIOT_PHRASES) assert.ok(!text.includes(q), q);
        for (const n of ['camille', 'ekko', 'ezreal', 'heimerdinger', 'jayce', 'seraphine', 'urgot', 'viktor', 'zac', 'battlecast']) assert.ok(!text.includes(n), n);
    });
}
// A Caitlyn set shares almost nothing with the base voice or the other Caitlyn sets
for (const [name, set] of [['caitlyn-original', caitOrig], ['caitlyn-resistance', caitResistance], ['caitlyn-arctic-warfare', caitArctic], ['caitlyn-officer', caitOfficer], ['caitlyn-headhunter', caitHunter], ['caitlyn-pulsefire', caitPulsefire], ['caitlyn-pool-party', caitPool], ['caitlyn-arcade', caitArcade], ['caitlyn-battle-academia', caitAcademy], ['caitlyn-snow-moon', caitSnowMoon], ['caitlyn-heartthrob', caitHeartthrob], ['caitlyn-firecracker', caitFirecracker], ['caitlyn-sheriff', caitSheriff], ['caitlyn-safari', caitSafari], ['caitlyn-lunar-wraith', caitWraith], ['caitlyn-drx', caitDrx]]) {
    await t(`${name} shares almost nothing with the other Caitlyn voices`, () => {
        const mine = lines(set);
        for (const [other, o2] of [['caitlyn', caitBase], ['caitlyn-original', caitOrig], ['caitlyn-resistance', caitResistance], ['caitlyn-arctic-warfare', caitArctic], ['caitlyn-officer', caitOfficer], ['caitlyn-headhunter', caitHunter], ['caitlyn-pulsefire', caitPulsefire], ['caitlyn-pool-party', caitPool], ['caitlyn-arcade', caitArcade], ['caitlyn-battle-academia', caitAcademy], ['caitlyn-snow-moon', caitSnowMoon], ['caitlyn-heartthrob', caitHeartthrob], ['caitlyn-firecracker', caitFirecracker], ['caitlyn-sheriff', caitSheriff], ['caitlyn-safari', caitSafari], ['caitlyn-lunar-wraith', caitWraith], ['caitlyn-drx', caitDrx]]) {
            if (o2 === set) continue;
            const theirs = lines(o2), shared = [...mine].filter(l => theirs.has(l));
            assert.ok(shared.length < mine.size * 0.02, `${name} shares ${shared.length} lines with ${other}: ${shared.slice(0, 3).join(' | ')}`);
        }
    });
}
console.log(`${pass} passed`);
