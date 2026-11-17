// Finding new edits: the matching rules, the "already have it" filter, the Shorts filter, the importer block.
//   node tools/test-discover.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DISCOVER_RULES, matchesRule, isoSeconds, usableShort, knownIds, buildCandidates, importerBlock, publishedAfter } from '../netlify/shared/discover-model.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message.split('\n')[0]); } };
const rule = id => DISCOVER_RULES.find(r => r.id === id);
const vid = (id, title, extra = {}) => ({ id, snippet: { title, description: '', channelTitle: 'C', channelId: 'UC1', publishedAt: '2026-11-10T10:00:00Z', tags: [], ...extra.snippet }, contentDetails: { duration: 'PT30S', ...extra.contentDetails }, statistics: { viewCount: '100' }, status: { embeddable: true, privacyStatus: 'public', ...extra.status } });

t('a name plus an edit word matches, in any form', () => {
    for (const title of ['Jinx Edit', 'jinx amv | arcane', '#jinxedit', 'JINXEDITS 🔥', 'edit - Jinx', 'Arcane Jinx (edit)']) assert.ok(matchesRule({ title }, rule('jinx')).match, title);
});
t('a name alone, or an edit word alone, does not match', () => {
    assert.ok(!matchesRule({ title: 'Jinx cosplay' }, rule('jinx')).match);
    assert.ok(!matchesRule({ title: 'Best edit ever' }, rule('jinx')).match);
});
t('the description and tags count too', () => {
    assert.ok(matchesRule({ title: 'cool clip', description: 'a Vi edit', tags: [] }, rule('vi')).match);
    assert.ok(matchesRule({ title: 'cool clip', description: '', tags: ['ekko', 'edit'] }, rule('ekko')).match);
});
t('"vi" does not match inside other words (video edit)', () => {
    assert.ok(!matchesRule({ title: 'video edit tutorial' }, rule('vi')).match);
    assert.ok(!matchesRule({ title: 'edit video' }, rule('vi')).match);
});
t('Powder counts as Jinx, Cait as Caitlyn', () => {
    assert.ok(matchesRule({ title: 'Powder edit' }, rule('jinx')).match);
    assert.ok(matchesRule({ title: 'cait amv' }, rule('caitlyn')).match);
});
t('an Arcane mention is flagged but not required', () => {
    assert.equal(matchesRule({ title: 'Jinx edit' }, rule('jinx')).arcane, false);
    assert.equal(matchesRule({ title: 'Jinx edit Arcane' }, rule('jinx')).arcane, true);
});
t('durations', () => { assert.equal(isoSeconds('PT45S'), 45); assert.equal(isoSeconds('PT1M5S'), 65); assert.equal(isoSeconds('P0D'), 0); assert.equal(isoSeconds('x'), null); });
t('only public, embeddable shorts of 3 minutes or less are usable', () => {
    assert.ok(usableShort(vid('a', 'x')));
    assert.ok(usableShort(vid('a', 'x', { contentDetails: { duration: 'PT3M' } })));
    assert.ok(!usableShort(vid('a', 'x', { contentDetails: { duration: 'PT3M1S' } })));
    assert.ok(!usableShort(vid('a', 'x', { status: { embeddable: false } })));
    assert.ok(!usableShort(vid('a', 'x', { status: { privacyStatus: 'unlisted' } })));
});
t('everything already in data/edits.json is known, removed edits included', () => {
    const k = knownIds([{ id: 'A', videoId: 'A' }, { id: 'B', videoId: 'B', status: 'removed' }, {}]);
    assert.ok(k.has('A') && k.has('B') && k.size === 2);
});
t('known videos never come back as candidates', () => {
    const out = buildCandidates([vid('A', 'Jinx edit'), vid('N', 'Jinx edit')], DISCOVER_RULES, new Set(['A']));
    assert.deepEqual(out.jinx.map(c => c.videoId), ['N']);
});
t('a video matching two champions is listed under both, once each', () => {
    const out = buildCandidates([vid('X', 'Jinx and Vi edit')], DISCOVER_RULES, new Set());
    assert.equal(out.jinx.length, 1); assert.equal(out.vi.length, 1); assert.equal(out.ekko.length, 0);
});
t('newest first; duplicates in the input collapse; unmatched and long videos are dropped', () => {
    const out = buildCandidates([
        vid('old', 'Jinx edit', { snippet: { publishedAt: '2026-11-01T00:00:00Z' } }),
        vid('new', 'Jinx edit', { snippet: { publishedAt: '2026-11-12T00:00:00Z' } }),
        vid('new', 'Jinx edit'), vid('no', 'Jinx cosplay'), vid('long', 'Jinx edit', { contentDetails: { duration: 'PT10M' } })
    ], DISCOVER_RULES, new Set());
    assert.deepEqual(out.jinx.map(c => c.videoId), ['new', 'old']);
});
t('the importer block is a heading plus links, ready for data/edit-urls.txt', () => {
    assert.equal(importerBlock('jinx', [{ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' }]), '#jinx\nhttps://www.youtube.com/watch?v=AAAAAAAAAAA\n');
    assert.equal(importerBlock('jinx', []), '');
    for (const r of DISCOVER_RULES) assert.match(`#${r.id}`, /^#[a-z]+$/);   // a valid heading for tools/edits-groups.js
});
t('all-time results are ordered by views', () => {
    const out = buildCandidates([vid('a', 'Jinx edit', { snippet: { publishedAt: '2026-11-12T00:00:00Z' } }), Object.assign(vid('b', 'Jinx edit', { snippet: { publishedAt: '2024-01-01T00:00:00Z' } }), { statistics: { viewCount: '9000' } })], DISCOVER_RULES, new Set(), {}, 'views');
    assert.deepEqual(out.jinx.map(c => c.videoId), ['b', 'a']);
});
t('days 0 means no date limit', () => { assert.equal(publishedAfter(0), null); assert.equal(publishedAfter('0'), null); });
t('the search window is clamped', () => {
    const now = Date.parse('2026-11-17T00:00:00Z');
    assert.equal(publishedAfter(7, now).slice(0, 10), '2026-11-10');
    assert.equal(publishedAfter('junk', now).slice(0, 10), '2026-11-03');
    assert.equal(publishedAfter(99999, now).slice(0, 10), '2025-11-17');
});
t('rules cost: queries per run stay within the daily quota', () => {
    const q = DISCOVER_RULES.reduce((n, r) => n + r.queries.length, 0);
    assert.ok(q * 100 <= 2000, `${q} queries = ${q * 100} units a run`);
});
t('the function checks admin sign-in and the pool; the rules keep the ignore list admin-only', () => {
    const fn = fs.readFileSync(new URL('../netlify/functions/discover-edits.js', import.meta.url), 'utf8');
    assert.match(fn, /Admin sign-in required/); assert.match(fn, /data\/edits\.json/);
    const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    assert.match(rules, /match \/discover-ignored\/\{[a-zA-Z]+\}\s*\{\s*allow read, write: if isAdmin\(\);/);
});
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
