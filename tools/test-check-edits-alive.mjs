// Tests tools/check-edits-alive.mjs with a fake YouTube (no network).
import assert from 'node:assert/strict';
import { classify, checkVideo, checkEdits, oembedUrl, suggestReplacement, replacementCandidates, pickLiveReplacement, formatReport } from './check-edits-alive.mjs';

assert.deepEqual(['ok', 'gone', 'restricted', 'restricted', 'unknown', 'unknown'], [200, 404, 401, 403, 429, 500].map(classify));
assert.ok(oembedUrl('abc_DEF-123').includes(encodeURIComponent('https://www.youtube.com/watch?v=abc_DEF-123')));

const res = status => ({ status });
const fake = map => async url => { const id = decodeURIComponent(url).match(/v=([^&]+)/)[1]; const v = map[id]; if (v instanceof Error) throw v; return res(v ?? 200); };

// one video: results and retries
assert.equal((await checkVideo('A', { fetchImpl: fake({ A: 200 }) })).result, 'ok');
assert.equal((await checkVideo('B', { fetchImpl: fake({ B: 404 }) })).result, 'gone');
assert.equal((await checkVideo('C', { fetchImpl: fake({ C: 401 }) })).result, 'restricted');
let calls = 0;
const flaky = async () => (++calls < 3 ? res(429) : res(200));
assert.equal((await checkVideo('D', { fetchImpl: flaky, pauseMs: 1 })).result, 'ok'); assert.equal(calls, 3);
assert.equal((await checkVideo('E', { fetchImpl: fake({ E: new Error('offline') }), retries: 1, pauseMs: 1 })).result, 'unknown');
calls = 0; await checkVideo('F', { fetchImpl: async () => { calls++; return res(404); }, pauseMs: 1 }); assert.equal(calls, 1, 'a 404 is never retried');

// a list, a few at a time, in order, with progress
const mkEdit = (id, o = {}) => ({ videoId: id, title: id, shortTitle: id, artist: 'x', group: 'jinx', status: 'ok', embedAllowed: true, tournaments: [], views: 1000, likes: 50, ...o });
const edits = [
    mkEdit('IN1', { tournaments: ['cup-1'], views: 9000, likes: 900 }), mkEdit('IN2', { tournaments: ['cup-1'], views: 5000, likes: 500 }),
    mkEdit('GONE1', { tournaments: ['cup-1', 'group-test-01'], views: 100, likes: 5 }),
    mkEdit('SPARE_A', { views: 4000, likes: 300 }), mkEdit('SPARE_B', { views: 8000, likes: 800 }), mkEdit('SPARE_OTHER', { group: 'vi', views: 99999, likes: 99999 }),
    mkEdit('SPARE_NOEMBED', { embedAllowed: false, views: 99999, likes: 99999 }), mkEdit('PRIV', { tournaments: ['cup-1'] }),
];
let progress = 0;
const results = await checkEdits(edits.filter(e => e.tournaments.length), { concurrency: 3, fetchImpl: fake({ GONE1: 404, PRIV: 401 }), onProgress: () => progress++ });
assert.equal(progress, 4);
assert.deepEqual(results.map(r => r.result), ['ok', 'ok', 'gone', 'restricted']);
assert.deepEqual(results.map(r => r.edit.videoId), ['IN1', 'IN2', 'GONE1', 'PRIV']);

// replacement: best-ranked spare of the same group, playable, not in a cup, not another gone edit
const gone = edits.find(e => e.videoId === 'GONE1');
assert.equal(suggestReplacement(edits, gone).videoId, 'SPARE_B');
assert.equal(suggestReplacement(edits, gone, new Set(['SPARE_B'])).videoId, 'SPARE_A');
assert.equal(suggestReplacement(edits.filter(e => !e.videoId.startsWith('SPARE')), gone), null);

// report: names the gone edit, the swap, and does not give two gone edits the same replacement
const two = [...edits, mkEdit('GONE2', { tournaments: ['cup-1'] })];
const r2 = await checkEdits(two.filter(e => e.tournaments.length), { fetchImpl: fake({ GONE1: 404, GONE2: 404 }) });
const text = formatReport(r2, two);
assert.match(text, /2 gone/); assert.match(text, /removedVideoId: 'GONE1', replacementVideoId: 'SPARE_B'/); assert.match(text, /removedVideoId: 'GONE2', replacementVideoId: 'SPARE_A'/);
assert.match(formatReport(await checkEdits([edits[0]], { fetchImpl: fake({}) }), edits), /Nothing to do/);
// a replacement that YouTube no longer has is skipped, and a replacement is never given to two gone edits
assert.deepEqual(replacementCandidates(edits, gone).map(e => e.videoId), ['SPARE_B', 'SPARE_A']);
const taken = new Set();
let pick = await pickLiveReplacement(replacementCandidates(edits, gone), taken, { fetchImpl: fake({ SPARE_B: 404 }) });
assert.equal(pick.rep.videoId, 'SPARE_A'); assert.deepEqual(pick.skipped.map(k => [k.edit.videoId, k.result]), [['SPARE_B', 'gone']]);
pick = await pickLiveReplacement(replacementCandidates(edits, gone), taken, { fetchImpl: fake({}) });
assert.equal(pick.rep.videoId, 'SPARE_B', 'a candidate skipped earlier is fine once YouTube has it');
pick = await pickLiveReplacement(replacementCandidates(edits, gone), taken, { fetchImpl: fake({}) });
assert.equal(pick.rep, null, 'both spares are used up');
const sug = new Map([['GONE1', { rep: edits.find(e => e.videoId === 'SPARE_A'), skipped: [{ edit: edits.find(e => e.videoId === 'SPARE_B'), result: 'gone' }] }]]);
const txt = formatReport(results, edits, sug);
assert.match(txt, /skipped SPARE_B: it is gone too/); assert.match(txt, /replacementVideoId: 'SPARE_A'/);
console.log('check-edits-alive: all checks passed');
