import assert from 'node:assert/strict';
import { withdrawInText } from './withdraw-edit.mjs';

const mk = (id, o = {}) => ({ id, videoId: id, title: `Title ${id} 💜`, artist: 'a', group: 'jinx', status: 'ok', embedAllowed: true, tournaments: [], notes: '', flags: [], ...o });
const base = [mk('AAA', { tournaments: ['group-test-01', 'cup-1'] }), mk('BBB'), mk('CCC', { tournaments: ['cup-1'] }), mk('DDD', { group: 'vi' }), mk('EEE', { tournaments: ['cup-1'] })];
const text = JSON.stringify(base, null, 2) + '\n';
const run = (o, t = text) => withdrawInText(t, { removed: 'AAA', replacement: 'BBB', cup: 'cup-1', today: '2026-11-15', ...o });

const out = run({}), parsed = JSON.parse(out);
const A = parsed.find(e => e.videoId === 'AAA'), B = parsed.find(e => e.videoId === 'BBB');
assert.equal(A.status, 'removed'); assert.deepEqual(A.tournaments, ['group-test-01']); assert.match(A.notes, /2026-11-15.*replaced by BBB/);
assert.deepEqual(B.tournaments, ['cup-1']); assert.match(B.notes, /replacement for AAA/); assert.equal(B.status, 'ok');
// everything else is byte for byte the same: each untouched edit's exact text is still in the file
const blockText = id => { const o = base.find(e => e.videoId === id); return JSON.stringify(o, null, 2).split('\n').map(l => '  ' + l).join('\n'); };
for (const id of ['CCC', 'DDD', 'EEE']) assert.ok(out.includes(blockText(id)), `${id} is untouched`);
assert.ok(out.startsWith('[\n  {') && out.endsWith('  }\n]\n'));
assert.deepEqual(parsed.filter(e => !['AAA', 'BBB'].includes(e.videoId)), base.filter(e => !['AAA', 'BBB'].includes(e.videoId)));
assert.ok(out.endsWith('\n') && out.includes('💜'), 'trailing newline and emoji survive');

for (const [name, o, msg] of [
    ['unknown removed', { removed: 'NOPE' }, /not in the edit data/], ['unknown replacement', { replacement: 'NOPE' }, /not in the edit data/],
    ['same', { replacement: 'AAA' }, /same/], ['not in the cup', { removed: 'BBB', replacement: 'DDD' }, /not entered in cup-1/],
    ['replacement in a cup', { replacement: 'CCC' }, /already entered in a cup/], ['other group', { replacement: 'DDD' }, /group "vi"/],
]) assert.throws(() => run(o), msg, name);
assert.throws(() => run({}, JSON.stringify([{ ...base[0] }, base[1]], null, 4)), /not laid out/);
const bad = JSON.stringify(base.map(e => e.videoId === 'BBB' ? { ...e, embedAllowed: false } : e), null, 2);
assert.throws(() => run({}, bad), /not playable/);
assert.throws(() => run({}, out), /already marked removed/);
// a Windows copy (CRLF line endings, maybe a BOM) works too, and keeps its own endings and BOM
const crlf = text.replace(/\n/g, '\r\n');
for (const [name, input] of [['CRLF', crlf], ['BOM', '\uFEFF' + text], ['CRLF + BOM', '\uFEFF' + crlf]]) {
    const o = run({}, input);
    assert.equal(o.startsWith('\uFEFF'), input.startsWith('\uFEFF'), `${name}: BOM kept as it was`);
    assert.equal(o.includes('\r\n'), input.includes('\r\n'), `${name}: line endings kept as they were`);
    assert.ok(!/(^|[^\r])\n/.test(input.includes('\r\n') ? o : '') , `${name}: no bare LF in a CRLF file`);
    assert.deepEqual(JSON.parse(o.replace(/^\uFEFF/, '')), parsed, `${name}: same result as the LF file`);
}
console.log('withdraw-edit: all checks passed');
