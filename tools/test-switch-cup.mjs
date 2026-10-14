// Tests tools/switch-cup.mjs against a temp copy of the real files.   node tools/test-switch-cup.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGETS, inspect, plan, isValidCupId } from './switch-cup.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tool = path.join(repo, 'tools/switch-cup.mjs');
const FILES = [...TARGETS.map(t => t.file), 'data/edits.json'];
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

const fresh = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-cup-'));
    for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(repo, f), path.join(dir, f)); }
    return dir;
};
const run = (dir, ...args) => spawnSync('node', [tool, ...args, '--root', dir], { encoding: 'utf8' });
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const snapshot = dir => Object.fromEntries(FILES.map(f => [f, read(dir, f)]));

test('the real repo files each have exactly one place to change (so future edits cannot silently break the tool)', () => {
    const { rows, problems } = inspect(repo);
    assert.deepEqual(problems, []); assert.equal(rows.length, 4);
});

test('--check on agreeing files reports the cup and the entry count, exit 0', () => {
    const dir = fresh(), r = run(dir, '--check');
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /All four agree: /); assert.match(r.stdout, /Not checked: the rules published in the Firebase console/);
});

test('switching changes ONLY the one line in each of the four files', () => {
    const dir = fresh(), before = snapshot(dir), r = run(dir, 'jinx-cup-1');
    assert.equal(r.status, 0, r.stderr);
    for (const t of TARGETS) {
        const a = before[t.file].split('\n'), b = read(dir, t.file).split('\n');
        assert.equal(a.length, b.length, t.file);
        const diff = a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
        assert.equal(diff.length, 1, `${t.file}: ${diff.length} lines changed`);
        assert.ok(diff[0][1].includes('jinx-cup-1') && !diff[0][1].includes(diff[0][0].match(/arcane-test-01/)?.[0] ?? '\u0000'), diff[0][1]);
    }
    assert.equal(read(dir, 'data/edits.json'), before['data/edits.json']);                  // data is never touched
});

test('quote styles are kept (rules and config single, edge functions double)', () => {
    const dir = fresh(); run(dir, 'jinx-cup-1');
    assert.match(read(dir, 'firestore.rules'), /return 'jinx-cup-1';/);
    assert.match(read(dir, 'js/arcane-config.js'), /tournamentId: 'jinx-cup-1',/);
    assert.match(read(dir, 'netlify/edge-functions/firebase-cache.js'), /const TOURNAMENT = "jinx-cup-1";/);
    assert.match(read(dir, 'netlify/edge-functions/live-matches.js'), /const TOURNAMENT = "jinx-cup-1";/);
});

test('afterwards --check passes with the new id, and the output tells you to publish the rules', () => {
    const dir = fresh(), r = run(dir, 'jinx-cup-1');
    assert.match(r.stdout, /PUBLISH firestore\.rules in the Firebase console/); assert.match(r.stdout, /No edit in data\/edits\.json lists "jinx-cup-1"/);
    const c = run(dir, '--check'); assert.equal(c.status, 0); assert.match(c.stdout, /All four agree: jinx-cup-1/);
});

test('running it twice is harmless', () => {
    const dir = fresh(); run(dir, 'jinx-cup-1'); const once = snapshot(dir), r = run(dir, 'jinx-cup-1');
    assert.equal(r.status, 0); assert.match(r.stdout, /Nothing to do/); assert.deepEqual(snapshot(dir), once);
});

test('--dry-run shows the change and writes nothing', () => {
    const dir = fresh(), before = snapshot(dir), r = run(dir, 'jinx-cup-1', '--dry-run');
    assert.equal(r.status, 0); assert.match(r.stdout, /dry run/); assert.match(r.stdout, /arcane-test-01\s+->\s+jinx-cup-1/); assert.deepEqual(snapshot(dir), before);
});

test('bad cup ids are refused and nothing changes', () => {
    for (const bad of ['Jinx-Cup', 'jinx cup', 'a', '-jinx', 'jinx-', '../etc', "jinx'cup", 'jinx"; rm', 'x'.repeat(70)]) {
        const dir = fresh(), before = snapshot(dir), r = run(dir, bad);
        assert.equal(r.status, 1, bad); assert.match(r.stderr, /not a usable cup id/); assert.deepEqual(snapshot(dir), before);
    }
    assert.ok(isValidCupId('jinx-cup-1') && isValidCupId('group-test-01') && isValidCupId('arcane-test-01'));
});

test('all-or-nothing: if one file has no place to change, NOTHING is written', () => {
    const dir = fresh(); fs.writeFileSync(path.join(dir, 'netlify/edge-functions/live-matches.js'), 'const SOMETHING_ELSE = "x";\n');
    const before = snapshot(dir), r = run(dir, 'jinx-cup-1');
    assert.equal(r.status, 1); assert.match(r.stderr, /live-matches\.js: expected exactly one place to change, found 0/); assert.deepEqual(snapshot(dir), before);
});

test('all-or-nothing: a file with TWO places is refused too', () => {
    const dir = fresh(), f = path.join(dir, 'netlify/edge-functions/firebase-cache.js');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8') + '\nconst TOURNAMENT = "other";\n');
    const before = snapshot(dir), r = run(dir, 'jinx-cup-1');
    assert.equal(r.status, 1); assert.match(r.stderr, /firebase-cache\.js: expected exactly one place to change, found 2/); assert.deepEqual(snapshot(dir), before);
});

test('a missing file is reported, not crashed on', () => {
    const dir = fresh(); fs.rmSync(path.join(dir, 'firestore.rules'));
    const r = run(dir, 'jinx-cup-1'); assert.equal(r.status, 1); assert.match(r.stderr, /firestore\.rules: file not found/);
});

test('--check catches a half-done switch (the mistake this tool exists to prevent)', () => {
    const dir = fresh(), f = path.join(dir, 'netlify/edge-functions/live-matches.js');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('arcane-test-01', 'jinx-cup-1'));
    const r = run(dir, '--check');
    assert.equal(r.status, 1); assert.match(r.stderr, /DISAGREE/); assert.match(r.stdout, /live-matches\.js\s+jinx-cup-1/); assert.match(r.stdout, /firebase-cache\.js\s+arcane-test-01/);
});

test('plan() is pure: it returns the new text and writes nothing', () => {
    const dir = fresh(), before = snapshot(dir), p = plan(dir, 'jinx-cup-1');
    assert.equal(p.changes.length, 4); assert.ok(p.changes.every(c => c.text.includes('jinx-cup-1') && c.from === 'arcane-test-01')); assert.deepEqual(snapshot(dir), before);
});

test('with entries listed, the entry count is reported instead of the warning', () => {
    const dir = fresh(), f = path.join(dir, 'data/edits.json'), edits = JSON.parse(fs.readFileSync(f, 'utf8'));
    edits.slice(0, 3).forEach(e => { e.tournaments = [...(e.tournaments || []), 'jinx-cup-1']; }); fs.writeFileSync(f, JSON.stringify(edits));
    const r = run(dir, 'jinx-cup-1'); assert.doesNotMatch(r.stdout, /No edit in data/);
    assert.match(run(dir, '--check').stdout, /3 edit\(s\) in data\/edits\.json list "jinx-cup-1"/);
});

console.log(`\n${passed} tests passed`);
