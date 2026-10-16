// Tests netlify/edge-functions/firebase-cache.js: listing the matches of a cup must return ALL of them, however the Firestore REST API pages.
//   node tools/test-edge-matches.mjs [path-to-edge-function]      (the optional path lets you run the same scenarios on another version)
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = process.argv[2] ? path.resolve(process.argv[2]) : new URL('../netlify/edge-functions/firebase-cache.js', import.meta.url).pathname;
const handler = (await import(pathToFileURL(file).href)).default;
globalThis.Deno = { env: { get: n => (n === 'FIREBASE_WEB_API_KEY' ? 'test-key-123' : undefined) } };   // what Netlify provides
const quiet = () => { for (const k of ['log', 'warn', 'error', 'info']) console[k] = () => {}; };
quiet();

const str = v => ({ stringValue: String(v) }), int = v => ({ integerValue: String(v) });
const doc = (i) => ({
    name: `projects/arcane-moments/databases/(default)/documents/tournaments/arcane-test-01/matches/jinx-cup-1-group-${i}`,
    fields: {
        matchId: str(`m${i}`), stage: str('group'), group: str(`G${i}`), round: int(1), matchNumber: int(i), status: str('upcoming'),
        song1: { mapValue: { fields: { id: str(`a${i}`), votes: int(0) } } }, song2: { mapValue: { fields: { id: str(`b${i}`), votes: int(0) } } }
    }
});

// A fake Firestore REST server. `serverDefault` = how many documents it returns when pageSize is not asked for,
// `serverMax` = the most it will ever return in one page. Pages are chained with nextPageToken.
function fakeFirestore(total, { serverDefault = 20, serverMax = 300, failOnPage = null, rate429 = 0, votes = null, opened = 0, queryStatus = 200, aggregate = null } = {}) {
    const docs = Array.from({ length: total }, (_, i) => doc(i + 1)), log = [];
    docs.forEach((d, i) => { if (i < opened) d.fields.status = str('live'); });
    if (votes && docs[0]) { docs[0].fields.song1.mapValue.fields.votes = int(votes[0]); docs[0].fields.song2.mapValue.fields.votes = int(votes[1]); }
    let limited = rate429;
    globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url);
        log.push({ method: init.method || 'GET', path: u.pathname, search: u.search, body: init.body ? String(init.body) : '' });
        if (u.pathname.endsWith(':runAggregationQuery')) {
            if (aggregate === 'fail') return new Response('nope', { status: 400 });
            if (aggregate === '429') return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429, statusText: 'Too Many Requests' });
            return new Response(JSON.stringify([{ result: { aggregateFields: { n: { integerValue: String(aggregate ?? 7) } } } }]), { status: 200 });
        }
        if (u.pathname.endsWith(':runQuery')) {
            const q = init.body ? JSON.parse(init.body).structuredQuery : null;
            if (q?.from?.[0]?.collectionId === 'matches') {
                if (queryStatus !== 200) return new Response('bad query', { status: queryStatus });
                if (limited > 0) { limited--; return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429, statusText: 'Too Many Requests' }); }
                const op = q.where.fieldFilter.op;
                const pick = docs.filter(d => (op === 'NOT_EQUAL') === (d.fields.status.stringValue !== 'upcoming'));
                return new Response(JSON.stringify(pick.length ? pick.map(document => ({ document, readTime: 'x' })) : [{ readTime: 'x' }]), { status: 200 });
            }
            return new Response(JSON.stringify([{ readTime: 'x' }]), { status: 200 });   // no votes
        }
        if (u.pathname.endsWith('/matches')) {
            if (limited > 0) { limited--; return new Response('slow down', { status: 429, statusText: 'Too Many Requests' }); }
            const asked = Number(u.searchParams.get('pageSize')) || serverDefault;
            const size = Math.min(asked, serverMax), start = Number(u.searchParams.get('pageToken') || 0);
            const pageNo = Math.floor(start / size) + 1;
            if (failOnPage && pageNo === failOnPage) return new Response('boom', { status: 503, statusText: 'Service Unavailable' });
            const slice = docs.slice(start, start + size), next = start + size < total ? String(start + size) : null;
            return new Response(JSON.stringify({ documents: slice, ...(next ? { nextPageToken: next } : {}) }), { status: 200 });
        }
        if (u.pathname.includes('/matches/')) return new Response(JSON.stringify(docs[0]), { status: 200 });
        return new Response('{}', { status: 200 });
    };
    return log;
}
const call = async (qs = '') => handler(new Request(`https://example.test/api/matches?_refresh=1${qs}`), {});
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; process.stdout.write(`  ok  ${name}\n`); };

await test('a server that returns 20 per page: all 130 matches still come back', async () => {
    const log = fakeFirestore(130, { serverDefault: 20, serverMax: 20, queryStatus: 400 });
    const res = await call(), body = await res.json();
    assert.equal(res.status, 200); assert.equal(body.length, 130);
    assert.equal(new Set(body.map(m => m.matchId)).size, 130);
    assert.equal(log.filter(r => r.path.endsWith('/matches')).length, 7);                   // 130 / 20 = 7 pages
    assert.ok(body.every(m => m.stage === 'group' && m.song1.id.startsWith('a')));
});

await test('asks for the biggest page (300) so a normal cup is ONE request', async () => {
    const log = fakeFirestore(130, { serverDefault: 20, serverMax: 300, queryStatus: 400 });
    const body = await (await call()).json();
    const lists = log.filter(r => r.path.endsWith('/matches'));
    assert.equal(body.length, 130); assert.equal(lists.length, 1); assert.ok(lists[0].search.includes('pageSize=300'), lists[0].search);
});

await test('a very long list follows every page token (700 matches over 3 pages)', async () => {
    const log = fakeFirestore(700, { serverMax: 300, queryStatus: 400 });
    const body = await (await call()).json();
    assert.equal(body.length, 700); assert.equal(log.filter(r => r.path.endsWith('/matches')).length, 3);
    assert.equal(new Set(body.map(m => m.matchId)).size, 700);
});

await test('exactly one full page (300) does not loop or duplicate', async () => {
    fakeFirestore(300, { serverMax: 300, queryStatus: 400 });
    assert.equal((await (await call()).json()).length, 300);
});

await test('an empty cup returns an empty list', async () => {
    fakeFirestore(0, { queryStatus: 400 });
    const res = await call(); assert.equal(res.status, 200); assert.deepEqual(await res.json(), []);
});

await test('a failure on page 2 is an error, never a silently shortened list', async () => {
    fakeFirestore(130, { serverDefault: 20, serverMax: 20, failOnPage: 2, queryStatus: 400 });
    const res = await call('&tournament=no-cache-yet'); assert.equal(res.status, 500); assert.match((await res.json()).error, /Firebase error: 503/);
});

await test('a single match is fetched as before: one request, no paging parameters', async () => {
    const log = fakeFirestore(5);
    const res = await call('&matchId=jinx-cup-1-group-1'), body = await res.json();
    assert.equal(res.status, 200); assert.equal(body.matchId, 'm1');
    const gets = log.filter(r => r.method === 'GET'); assert.equal(gets.length, 1); assert.ok(!gets[0].search.includes('pageSize'), gets[0].search);
});

const votesQueries = log => log.filter(r => r.path.endsWith(':runQuery') && r.body.includes('"votes"')).length;

await test('the match list makes NO per-match votes queries and reads the stored counters', async () => {
    const log = fakeFirestore(50, { serverMax: 300, votes: [30, 10], opened: 5 });
    const body = await (await call('&tournament=counters-cup')).json();
    assert.equal(votesQueries(log), 0);
    assert.equal(body.length, 50);
    const m1 = body.find(m => m.matchId === 'm1');
    assert.equal(m1.totalVotes, 40); assert.equal(m1.song1.votes, 30); assert.equal(m1.song1.percentage, 75); assert.equal(m1.song2.percentage, 25);
    assert.equal(body.find(m => m.matchId === 'm2').totalVotes, 0);
});

await test('a 400-match cup with 10 opened: two queries, and a refresh re-reads only the opened ones', async () => {
    const log = fakeFirestore(400, { opened: 10 });
    const first = await (await call('&tournament=big-cup')).json();
    assert.equal(first.length, 400); assert.equal(first.filter(m => m.status === 'live').length, 10);
    const queries = () => log.filter(r => r.path.endsWith(':runQuery'));
    assert.equal(queries().length, 2);
    assert.ok(queries().some(r => r.body.includes('NOT_EQUAL')) && queries().some(r => r.body.includes('"EQUAL"')));
    await call('&tournament=big-cup');                                  // refresh: the upcoming list is cached
    assert.equal(queries().length, 3); assert.ok(queries()[2].body.includes('NOT_EQUAL'));
});

await test('a match opened after the upcoming list was cached shows as opened, once', async () => {
    fakeFirestore(5, { opened: 0 });
    assert.ok((await (await call('&tournament=open-later-cup')).json()).every(m => m.status === 'upcoming'));
    fakeFirestore(5, { opened: 2 });                                    // admin opened matches 1 and 2
    const body = await (await call('&tournament=open-later-cup')).json();
    assert.equal(body.length, 5); assert.equal(new Set(body.map(m => m.matchId)).size, 5);
    assert.deepEqual(body.filter(m => m.status === 'live').map(m => m.matchId).sort(), ['m1', 'm2']);
});

await test('if the cheap query is refused for a non-quota reason, the full list is used', async () => {
    fakeFirestore(8, { queryStatus: 400 });
    const res = await call('&tournament=fallback-cup'); assert.equal(res.status, 200); assert.equal((await res.json()).length, 8);
});

await test('one 429 is retried and the list still comes back', async () => {
    fakeFirestore(10, { rate429: 1, queryStatus: 400 });
    const res = await call('&tournament=retry-cup'); assert.equal(res.status, 200); assert.equal((await res.json()).length, 10);
});

await test('429 with a recent good copy: serves the stale copy instead of an error', async () => {
    fakeFirestore(10);
    assert.equal((await call('&tournament=stale-cup')).status, 200);       // fills the cache
    fakeFirestore(10, { rate429: 99 });
    const res = await call('&tournament=stale-cup');
    assert.equal(res.status, 200); assert.equal(res.headers.get('X-Cache'), 'STALE'); assert.equal((await res.json()).length, 10);
});

await test('429 with nothing cached is still an honest error', async () => {
    fakeFirestore(10, { rate429: 99 });
    const res = await call('&tournament=never-loaded'); assert.equal(res.status, 500); assert.match((await res.json()).error, /429/);
});

await test('every Firestore request carries the project key (anonymous calls were being throttled)', async () => {
    const log = fakeFirestore(5);
    await call('&tournament=key-cup');
    assert.ok(log.length > 0 && log.every(r => r.search.includes('key=test-key-123')), JSON.stringify(log));
});

await test('with no key configured, requests go out without one (as before)', async () => {
    const saved = globalThis.Deno; globalThis.Deno = { env: { get: () => undefined } };
    const log = fakeFirestore(5); const res = await call('&tournament=nokey-cup');
    globalThis.Deno = saved;
    assert.equal(res.status, 200); assert.ok(log.every(r => !r.search.includes('key=')), JSON.stringify(log));
});

await test('if the key is refused (403) the same request is repeated without it', async () => {
    const real = globalThis.fetch, seen = [];
    fakeFirestore(5);
    const inner = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push(String(url)); return String(url).includes('key=') ? new Response('blocked', { status: 403 }) : inner(url, init); };
    const res = await call('&tournament=blocked-key-cup');
    assert.equal(res.status, 200); assert.equal((await res.json()).length, 5);
    assert.ok(seen.some(u => u.includes('key=')) && seen.some(u => !u.includes('key=')));
    globalThis.fetch = real;
});

await test('a failed Firestore call says why in the error (first part of the response body)', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }), { status: 429, statusText: 'Too Many Requests' });
    const res = await call('&tournament=why-cup');
    assert.equal(res.status, 500); const msg = (await res.json()).error; assert.match(msg, /429/); assert.match(msg, /RESOURCE_EXHAUSTED/);
});

const freshHandler = async n => (await import(pathToFileURL(file).href + '?fresh=' + n)).default;
const totalVotes = async (h) => (await (await h(new Request('https://example.test/api/total-votes'), {})).json());

await test('total votes uses one COUNT aggregation, not a read of every vote', async () => {
    const log = fakeFirestore(1, { aggregate: 1234 });
    const out = await totalVotes(await freshHandler(1));
    assert.equal(out.totalVotes, 1234); assert.equal(out.milestoneReached, true);
    assert.equal(log.length, 1); assert.ok(log[0].path.endsWith(':runAggregationQuery')); assert.ok(log[0].body.includes('"tournament"'));
});

await test('total votes falls back to reading votes if the aggregation is unavailable', async () => {
    const log = fakeFirestore(1, { aggregate: 'fail' });
    const out = await totalVotes(await freshHandler(2));
    assert.equal(out.totalVotes, 0); assert.ok(log.some(r => r.path.endsWith(':runQuery')));
});

process.stdout.write(`\n${passed} tests passed\n`);
