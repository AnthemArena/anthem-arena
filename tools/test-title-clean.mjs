// Offline tests for js/title-clean.js and the real titles in data/edits.json.   node tools/test-title-clean.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanTitle, shortTitle, tidyNames } from '../js/title-clean.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

test('a trailing hashtag run is removed, with the separator left in front of it', () => {
    assert.equal(cleanTitle('Bro tried to rizz Jinx \u{1F480} - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx #arcane #edit'), 'Bro tried to rizz Jinx \u{1F480} - JINX EDIT || Britney Spears - Toxic');
    assert.equal(cleanTitle('JINX edit|wannabe-why mona|Arcane #jinxarcane #powder #arcane #jinx'), 'JINX edit|wannabe-why mona|Arcane');
    assert.equal(cleanTitle('Song - Edit || #jinx #arcane'), 'Song - Edit');
    assert.equal(cleanTitle('Ekko Saves Jinx \u{1F625} | Arcane | #shorts #edit #viral #arcane'), 'Ekko Saves Jinx \u{1F625} | Arcane');
});

test('a title without hashtags is returned as it was (spaces tidied)', () => {
    assert.equal(cleanTitle('Jinx Edit V1 | Timeless - The Weeknd, Playboi Carti'), 'Jinx Edit V1 | Timeless - The Weeknd, Playboi Carti');
    assert.equal(cleanTitle('  too   many    spaces  '), 'too many spaces');
});

test('hashtags in the middle of a sentence stay (they are part of it); numbers are not hashtags', () => {
    assert.equal(cleanTitle('I love #jinx so much - edit'), 'I love #jinx so much - edit');
    assert.equal(cleanTitle('Top 10 #1'), 'Top 10 #1');
    assert.equal(cleanTitle('Playlist #12 #jinx'), 'Playlist #12');
});

test('hashtags glued to the word before them are removed too', () => {
    assert.equal(cleanTitle('Jinx lost her finger#jinx'), 'Jinx lost her finger');
    assert.equal(cleanTitle('"Make me"-vi edit|Fight back(slowed+reverb)#arcane'), '"Make me"-vi edit|Fight back(slowed+reverb)');
});

test('"C#" and a lone # are not hashtags; non-Latin hashtags work', () => {
    assert.equal(cleanTitle('Etude in C#'), 'Etude in C#');
    assert.equal(cleanTitle('Jinx edit #\u30b8\u30f3\u30af #\u0430\u0440\u043a\u0435\u0439\u043d'), 'Jinx edit');
});

test('if nothing sensible is left, the original comes back (never an empty heading)', () => {
    assert.equal(cleanTitle('#jinx #arcane'), '#jinx #arcane');
    assert.equal(cleanTitle('ab #jinx'), 'ab #jinx');
    assert.equal(cleanTitle(''), '');
    assert.equal(cleanTitle(null), '');
    assert.equal(cleanTitle(undefined), '');
});

test('it is idempotent and never longer than its input', () => {
    for (const t of ['A - B #x #y', 'plain', 'x || y |', '"quoted" - t #q']) {
        assert.equal(cleanTitle(cleanTitle(t)), cleanTitle(t));
        assert.ok(cleanTitle(t).length <= t.length);
    }
});

test('real titles in data/edits.json: none becomes empty, none ends in a hashtag any more, most get shorter', () => {
    const edits = JSON.parse(fs.readFileSync(new URL('../data/edits.json', import.meta.url), 'utf8'));
    let shorter = 0;
    for (const e of edits) {
        const c = cleanTitle(e.title);
        assert.ok(c.length >= 3, `empty result for: ${e.title}`);
        if (c.length < e.title.length) shorter++;
    }
    assert.ok(shorter > edits.length * 0.4, `only ${shorter} of ${edits.length} titles changed`);
    const stillTrailing = edits.map(e => cleanTitle(e.title)).filter(c => /#[\p{L}\p{N}_]+\s*$/u.test(c));
    assert.deepEqual(stillTrailing, [], 'titles still ending in a hashtag');
});

test('shortTitle keeps the first part of a long edit title', () => {
    assert.equal(shortTitle('Bro tried to rizz Jinx 💀 - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx'), 'Bro tried to rizz Jinx 💀');
    assert.equal(shortTitle('Jinx edit 💙🔥 #arcane #jinx'), 'Jinx edit 💙🔥');
    assert.equal(shortTitle(''), '');
    assert.equal(shortTitle('A'.repeat(60), 20), 'A'.repeat(19) + '…');
});

test('tidyNames swaps raw titles inside a saved sentence (old feed posts) for their short form', () => {
    const a = 'Bro tried to rizz Jinx \u{1F480} - JINX EDIT || Britney Spears - Toxic #jinxedit #jinx #arcane #edit';
    const b = 'Jinx edit \u{1F499}\u{1F525} #arcane #leagueoflegends #jinx';
    assert.equal(tidyNames(`chose ${a} over ${b}`, [a, b]), 'chose Bro tried to rizz Jinx \u{1F480} over Jinx edit \u{1F499}\u{1F525}');
    assert.equal(tidyNames(`voted for ${a}`, [a, undefined, null, '']), 'voted for Bro tried to rizz Jinx \u{1F480}');
    assert.equal(tidyNames('no names here', [a]), 'no names here');
    assert.equal(tidyNames('same ' + a + ' twice ' + a, [a, a]), 'same Bro tried to rizz Jinx \u{1F480} twice Bro tried to rizz Jinx \u{1F480}');
    assert.equal(tidyNames(undefined, [a]), '');
});

console.log(`\n${passed} tests passed`);
