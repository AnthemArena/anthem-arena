// Offline tests for tools/edits-clean-titles.mjs.   node tools/test-edits-clean-titles.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanEdits } from './edits-clean-titles.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const edit = (id, title, shortTitle, extra = {}) => ({ id, title, shortTitle, slug: id, views: 5, ...extra });

test('only shortTitle changes; a hand-written shortTitle is kept; clean ones are left', () => {
    const input = [
        edit('a', 'Song - Edit #jinx #arcane', 'Song - Edit #jinx #arcane'),        // never edited: cleaned
        edit('b', 'Long Title #x', 'My own short name'),                            // hand-written: kept
        edit('c', 'Already fine', 'Already fine'),                                   // nothing to remove
        edit('d', 'No short title #q', undefined),                                   // missing: filled in
    ];
    const r = cleanEdits(input);
    assert.deepEqual(r.edits.map(e => e.shortTitle), ['Song - Edit', 'My own short name', 'Already fine', 'No short title']);
    assert.equal(r.keptByHand, 1);
    assert.equal(r.alreadyClean, 1);
    assert.deepEqual(r.changed.map(c => c.id), ['a', 'd']);
    r.edits.forEach((e, i) => { assert.equal(e.title, input[i].title); assert.equal(e.views, 5); assert.equal(e.slug, input[i].slug); });
    assert.equal(input[0].shortTitle, 'Song - Edit #jinx #arcane', 'the input is not mutated');
});

test('running it twice changes nothing the second time', () => {
    const once = cleanEdits([edit('a', 'A - B #x #y', 'A - B #x #y')]).edits;
    const twice = cleanEdits(once);
    assert.equal(twice.changed.length, 0);
    assert.deepEqual(twice.edits, once);
});

test('the real data/edits.json: cleaning keeps every id and title, and only shortTitle differs', () => {
    const edits = JSON.parse(fs.readFileSync(new URL('../data/edits.json', import.meta.url), 'utf8'));
    const r = cleanEdits(edits);
    assert.equal(r.edits.length, edits.length);
    r.edits.forEach((e, i) => {
        const { shortTitle: a, ...restNew } = e, { shortTitle: b, ...restOld } = edits[i];
        assert.deepEqual(restNew, restOld);
        assert.ok(a && a.length >= 3);
    });
    // the file may already have been cleaned (the owner ran --write), so check stability rather than 'something changed'
    assert.equal(cleanEdits(r.edits).changed.length, 0);
});

test('command line: a dry run writes nothing, --write changes only titles, a reformatting file is refused', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edits-'));
    const file = path.join(dir, 'edits.json');
    const data = [edit('a', 'Song #jinx #arcane', 'Song #jinx #arcane'), edit('b', 'Keep', 'Keep')];
    const text = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(file, text);
    const tool = new URL('./edits-clean-titles.mjs', import.meta.url).pathname;
    const dry = execFileSync('node', [tool, file], { encoding: 'utf8' });
    assert.ok(dry.includes('Dry run') && fs.readFileSync(file, 'utf8') === text);
    execFileSync('node', [tool, file, '--write'], { encoding: 'utf8' });
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(after[0].shortTitle, 'Song');
    assert.equal(after[0].title, 'Song #jinx #arcane');
    assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(after, null, 2) + '\n');
    assert.ok(execFileSync('node', [tool, file], { encoding: 'utf8' }).includes('Nothing to do'));
    // a file in another format is refused rather than reformatted
    const odd = path.join(dir, 'odd.json');
    fs.writeFileSync(odd, JSON.stringify(data));          // one line, no indent
    let refused = false;
    try { execFileSync('node', [tool, odd, '--write'], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { refused = /Refusing to write/.test(String(e.stderr)); }
    assert.ok(refused);
    assert.equal(fs.readFileSync(odd, 'utf8'), JSON.stringify(data));
});

console.log(`\n${passed} tests passed`);
